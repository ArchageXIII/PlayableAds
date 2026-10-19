# Stop this project's local playable lab, even when it used a fallback port.
. (Join-Path $PSScriptRoot 'tooling\server-control.ps1')
if ($args.Count -ne 0) { throw 'Run .\stop.ps1 without arguments.' }
$lock = Enter-PreviewLock
try {
    $state = Get-PreviewState
    $process = Get-PreviewProcess $state
    if ($null -eq $process) {
        Archive-PreviewState
        $state = Find-ProjectPreview (Get-PreviewListeners)
        $process = Get-PreviewProcess $state
    }
    if ($null -eq $process) {
        Write-Host 'The AdGames preview is already stopped. Unrelated port owners were left alone.'
        return
    }
    # Start-time and command-line checks prevent stale PID files killing other apps.
    $process | Stop-Process -Force
    if (-not $process.WaitForExit(5000)) { throw "Preview process $($process.Id) did not stop. Try again." }
    Archive-PreviewState
    $remaining = @(Get-NetTCPConnection -LocalPort ([int]$state.port) -State Listen -ErrorAction SilentlyContinue)
    Write-Host "Stopped the AdGames preview (PID $($process.Id), port $($state.port))."
    if ($remaining.Count -gt 0) { Write-Host "Port $($state.port) is now owned by another process; it was left alone." }
} finally { $lock.Dispose() }
