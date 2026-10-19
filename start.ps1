# Start the local playable lab in the background. No arguments required.
. (Join-Path $PSScriptRoot 'tooling\server-control.ps1')
if ($args.Count -ne 0) { throw 'Run .\start.ps1 without arguments.' }
$lock = Enter-PreviewLock
try {
    $existing = Get-PreviewState
    if ($null -ne $existing) {
        $health = Get-PreviewHealth ([int]$existing.port)
        if ($null -ne $health) {
            Save-PreviewState $health
            Write-Host "Already running: $($health.url) (PID $($health.processId))"
            return
        }
        if ($null -ne (Get-PreviewProcess $existing)) { throw 'The saved preview process is still running but is not healthy. Run .\stop.ps1, then .\start.ps1.' }
        Archive-PreviewState
    }
    $listeners = Get-PreviewListeners
    $existing = Find-ProjectPreview $listeners
    if ($null -ne $existing) {
        Save-PreviewState $existing
        Write-Host "Already running: $($existing.url) (PID $($existing.processId))"
        return
    }
    $node = Get-Command node.exe -ErrorAction SilentlyContinue
    if ($null -eq $node) { throw 'Install Node.js 22.14 or newer, then run .\start.ps1 again.' }
    $versionText = & $node.Source --version
    if ($LASTEXITCODE -ne 0 -or [version]($versionText.TrimStart('v')) -lt [version]'22.14.0') { throw 'Node.js 22.14 or newer is required.' }
    if (-not (Test-Path -LiteralPath (Join-Path $script:PreviewRoot 'node_modules\tsx\package.json')) -or -not (Test-Path -LiteralPath (Join-Path $script:PreviewRoot 'node_modules\vite\package.json'))) {
        throw 'Dependencies are missing. Run npm.cmd ci in this folder once, then .\start.ps1.'
    }
    foreach ($port in $script:PreviewPorts) {
        if (@($listeners | Where-Object { $_.LocalPort -eq $port }).Count -gt 0) {
            Write-Host "Port $port is occupied; leaving its process alone."
            continue
        }
        $stdout = Join-Path $script:PreviewCache 'stdout.log'
        $stderr = Join-Path $script:PreviewCache 'stderr.log'
        $process = Start-Process -FilePath $node.Source -ArgumentList @('--import', 'tsx', ('"' + $script:PreviewCli + '"'), 'dev', '--port', [string]$port) -WorkingDirectory $script:PreviewRoot -WindowStyle Hidden -RedirectStandardOutput $stdout -RedirectStandardError $stderr -PassThru
        $state = [pscustomobject]@{
            version = 1; root = $script:PreviewRoot; port = $port; processId = $process.Id
            startTimeTicks = [string]$process.StartTime.ToUniversalTime().Ticks
            url = "http://127.0.0.1:$port/"
        }
        Save-PreviewState $state
        $deadline = [DateTime]::UtcNow.AddSeconds(25)
        do {
            $health = Get-PreviewHealth $port
            if ($null -ne $health -and $health.processId -eq $state.processId) {
                Write-Host "Started: $($health.url) (PID $($health.processId))"
                Write-Host "Logs: $script:PreviewCache"
                return
            }
            $process.Refresh()
            if ($process.HasExited) { break }
            Start-Sleep -Milliseconds 200
        } while ([DateTime]::UtcNow -lt $deadline)
        $owned = Get-PreviewProcess $state
        if ($null -ne $owned) { $owned | Stop-Process -Force; [void]$owned.WaitForExit(5000) }
        Archive-PreviewState
        $failure = if (Test-Path -LiteralPath $stderr) { Get-Content -LiteralPath $stderr -Raw } else { '' }
        # Handle a port being claimed between the listener check and Node binding.
        if ($failure -match 'EADDRINUSE|Port \d+ is already in use') {
            Write-Host "Port $port was claimed during startup; trying the next port."
            continue
        }
        throw "Preview failed to start. See $stderr`n$failure"
    }
    throw 'All preview ports (5173-5193) are occupied. Free one and run .\start.ps1 again.'
} finally { $lock.Dispose() }
