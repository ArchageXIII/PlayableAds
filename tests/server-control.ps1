# Windows integration check: start/stop, port fallback and stale PID protection.
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$project = Split-Path -Parent $PSScriptRoot
$start = Join-Path $project 'start.ps1'
$stop = Join-Path $project 'stop.ps1'
$cache = Join-Path $project '.cache\preview-server'
$stateFile = Join-Path $cache 'state.json'
$fixture = Join-Path $cache 'collision-fixture.cjs'
$dummy = $null

function Assert-Condition([bool]$Value, [string]$Message) { if (-not $Value) { throw $Message } }

try {
    & $stop
    $busy = @(Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue | Where-Object { $_.LocalPort -in @(5173, 5174) })
    Assert-Condition ($busy.Count -eq 0) 'The integration test needs ports 5173 and 5174 free; unrelated owners were left alone.'
    & $start
    $first = Get-Content -LiteralPath $stateFile -Raw | ConvertFrom-Json
    Assert-Condition ($first.port -eq 5173) 'The initial start did not select the default port.'
    & $start
    $second = Get-Content -LiteralPath $stateFile -Raw | ConvertFrom-Json
    Assert-Condition ($first.processId -eq $second.processId) 'Repeated start launched another process.'
    & $stop
    Assert-Condition (@(Get-NetTCPConnection -LocalPort 5173 -State Listen -ErrorAction SilentlyContinue).Count -eq 0) 'Stop left its port listening.'
    & $stop

    "require('node:http').createServer((req,res)=>{res.setHeader('Content-Type','application/json');res.end(JSON.stringify({service:'collision-fixture'}));}).listen(5173,'127.0.0.1');" | Set-Content -LiteralPath $fixture -Encoding ASCII
    $dummy = Start-Process -FilePath (Get-Command node.exe).Source -ArgumentList ('"' + $fixture + '"') -WorkingDirectory $project -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $cache 'collision.stdout.log') -RedirectStandardError (Join-Path $cache 'collision.stderr.log')
    $deadline = [DateTime]::UtcNow.AddSeconds(10)
    $listening = $false
    do {
        try { $reply = Invoke-RestMethod 'http://127.0.0.1:5173/' -TimeoutSec 1 -MaximumRedirection 0; $listening = $reply.service -eq 'collision-fixture' } catch {}
        if (-not $listening) { Start-Sleep -Milliseconds 100 }
    } while (-not $listening -and [DateTime]::UtcNow -lt $deadline)
    Assert-Condition $listening 'Collision fixture failed to listen.'
    & $start
    $fallback = Get-Content -LiteralPath $stateFile -Raw | ConvertFrom-Json
    Assert-Condition ($fallback.port -eq 5174) 'Start did not skip the unrelated port owner.'
    & $start
    $repeat = Get-Content -LiteralPath $stateFile -Raw | ConvertFrom-Json
    Assert-Condition ($repeat.processId -eq $fallback.processId) 'Repeated fallback start launched a duplicate.'
    & $stop
    $dummy.Refresh()
    Assert-Condition (-not $dummy.HasExited) 'Stop killed the unrelated port owner.'

    [pscustomobject]@{
        version = 1; root = $project; port = 5173; processId = $dummy.Id
        startTimeTicks = [string]$dummy.StartTime.ToUniversalTime().Ticks; url = 'http://127.0.0.1:5173/'
    } | ConvertTo-Json | Set-Content -LiteralPath $stateFile -Encoding UTF8
    & $stop
    $dummy.Refresh()
    Assert-Condition (-not $dummy.HasExited) 'A stale state file allowed an unrelated process to be killed.'
    Write-Host 'PASS: default start, repeated start/stop, collision fallback, and stale PID protection.'
} finally {
    # Stop only a positively identified project preview and the fixture we created.
    & $stop
    if ($null -ne $dummy) {
        $dummy.Refresh()
        if (-not $dummy.HasExited) { $dummy | Stop-Process -Force; [void]$dummy.WaitForExit(5000) }
    }
}
