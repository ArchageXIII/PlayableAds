# Shared implementation for the two parameter-free scripts in the project root.
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$script:PreviewRoot = [IO.Path]::GetFullPath((Split-Path -Parent $PSScriptRoot))
$script:PreviewCli = Join-Path $script:PreviewRoot 'tooling\cli.ts'
$script:PreviewCache = Join-Path $script:PreviewRoot '.cache\preview-server'
$script:PreviewState = Join-Path $script:PreviewCache 'state.json'
$script:PreviewPorts = 5173..5193

function Enter-PreviewLock {
    [void][IO.Directory]::CreateDirectory($script:PreviewCache)
    $deadline = [DateTime]::UtcNow.AddSeconds(15)
    do {
        try {
            return [IO.File]::Open((Join-Path $script:PreviewCache 'control.lock'), [IO.FileMode]::OpenOrCreate, [IO.FileAccess]::ReadWrite, [IO.FileShare]::None)
        } catch [IO.IOException] {
            if ([DateTime]::UtcNow -ge $deadline) { throw 'Another start/stop operation is still running. Try again shortly.' }
            Start-Sleep -Milliseconds 150
        }
    } while ($true)
}

function Get-PreviewState {
    if (-not (Test-Path -LiteralPath $script:PreviewState)) { return $null }
    try {
        $value = Get-Content -LiteralPath $script:PreviewState -Raw | ConvertFrom-Json
        if ($value.version -ne 1 -or $value.root -ne $script:PreviewRoot -or $value.port -notin $script:PreviewPorts) { return $null }
        return $value
    } catch { return $null }
}

function Get-PreviewProcess($State) {
    if ($null -eq $State) { return $null }
    try {
        $process = Get-Process -Id ([int]$State.processId) -ErrorAction Stop
        if ($process.ProcessName -ne 'node' -or [string]$process.StartTime.ToUniversalTime().Ticks -ne [string]$State.startTimeTicks) { return $null }
        $details = Get-CimInstance Win32_Process -Filter "ProcessId = $($process.Id)" -ErrorAction Stop
        if (-not $details.CommandLine) { return $null }
        $command = [Uri]::UnescapeDataString([string]$details.CommandLine).Replace('/', '\')
        $direct = $command.IndexOf($script:PreviewCli, [StringComparison]::OrdinalIgnoreCase) -ge 0
        $tsx = $command.IndexOf((Join-Path $script:PreviewRoot 'node_modules\tsx\'), [StringComparison]::OrdinalIgnoreCase) -ge 0 -and $command -match 'tooling\\cli\.ts["\s]+dev(?:\s|$)'
        if (-not ($direct -or $tsx) -or $command -notmatch '["\s]dev(?:\s|$)') { return $null }
        return $process
    } catch { return $null }
}

function Get-PreviewHealth([int]$Port) {
    try {
        $health = Invoke-RestMethod -Uri "http://127.0.0.1:$Port/api/health" -TimeoutSec 2 -MaximumRedirection 0 -ErrorAction Stop
        if ($health.service -ne 'adgames-preview' -or $health.version -ne 1 -or $health.projectRoot -ne $script:PreviewRoot) { return $null }
        $process = Get-Process -Id ([int]$health.processId) -ErrorAction Stop
        $state = [pscustomobject]@{
            version = 1; root = $script:PreviewRoot; port = $Port; processId = $process.Id
            startTimeTicks = [string]$process.StartTime.ToUniversalTime().Ticks
            url = "http://127.0.0.1:$Port/"
        }
        if ($null -eq (Get-PreviewProcess $state)) { return $null }
        $listener = @(Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue | Where-Object { $_.OwningProcess -eq $process.Id })
        if ($listener.Count -eq 0) { return $null }
        return $state
    } catch { return $null }
}

function Save-PreviewState($State) {
    $temporary = Join-Path $script:PreviewCache 'state.tmp'
    $State | ConvertTo-Json | Set-Content -LiteralPath $temporary -Encoding UTF8
    Move-Item -LiteralPath $temporary -Destination $script:PreviewState -Force
}

function Archive-PreviewState {
    if (Test-Path -LiteralPath $script:PreviewState) {
        Move-Item -LiteralPath $script:PreviewState -Destination (Join-Path $script:PreviewCache 'last-run.json') -Force
    }
}

function Get-PreviewListeners {
    return @(Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue | Where-Object { $_.LocalPort -in $script:PreviewPorts })
}

function Find-ProjectPreview($Listeners) {
    foreach ($port in @($Listeners | Select-Object -ExpandProperty LocalPort -Unique | Sort-Object)) {
        $state = Get-PreviewHealth $port
        if ($null -ne $state) { return $state }
    }
    return $null
}
