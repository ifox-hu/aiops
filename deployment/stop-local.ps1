$ErrorActionPreference = 'Stop'
$pidFile = Join-Path $PSScriptRoot 'app.pid'
if (Test-Path $pidFile) {
    $appProcessId = [int](Get-Content $pidFile)
    $appProcess = Get-CimInstance Win32_Process -Filter "ProcessId=$appProcessId"
    if ($appProcess -and $appProcess.Name -eq 'java.exe' -and $appProcess.CommandLine -like '*super-biz-agent-1.0-SNAPSHOT.jar*') {
        Stop-Process -Id $appProcessId
    }
    Remove-Item -LiteralPath $pidFile
}
$env:DOCKER_VOLUME_DIRECTORY = 'D:/tools/superbizagent-data'
docker compose -p superbizagent -f "$PSScriptRoot/compose.local.yml" stop
if ($LASTEXITCODE -ne 0) { throw 'Failed to stop project containers.' }
$embeddingPidFile = 'D:\tools\superbizagent-config\ollama.pid'
if (Test-Path $embeddingPidFile) {
    $embeddingProcessId = [int](Get-Content $embeddingPidFile)
    $embeddingProcess = Get-CimInstance Win32_Process -Filter "ProcessId=$embeddingProcessId"
    if ($embeddingProcess -and $embeddingProcess.Name -eq 'ollama.exe' -and $embeddingProcess.CommandLine -like '*serve*') {
        $embeddingListener = Get-NetTCPConnection -LocalPort 11435 -State Listen -ErrorAction SilentlyContinue
        if ($embeddingListener.OwningProcess -contains $embeddingProcessId) {
            Stop-Process -Id $embeddingProcessId
        }
    }
    Remove-Item -LiteralPath $embeddingPidFile
}
