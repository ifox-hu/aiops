$ErrorActionPreference = 'Stop'
$configDirectory = 'D:\tools\superbizagent-config'
$env:OLLAMA_HOST = '127.0.0.1:11435'
$env:OLLAMA_MODELS = 'D:\tools\ollama-models'
New-Item -ItemType Directory -Force $configDirectory, $env:OLLAMA_MODELS | Out-Null
try {
    Invoke-RestMethod 'http://127.0.0.1:11435/api/version' -TimeoutSec 2 | Out-Null
} catch {
    $serverProcess = Start-Process -FilePath 'D:\ollama\ollama.exe' -ArgumentList 'serve' -WindowStyle Hidden -PassThru `
        -RedirectStandardOutput "$configDirectory/ollama.stdout.log" -RedirectStandardError "$configDirectory/ollama.stderr.log"
    $serverProcess.Id | Set-Content "$configDirectory/ollama.pid"
    Start-Sleep -Seconds 3
}
$installedModels = Invoke-RestMethod 'http://127.0.0.1:11435/api/tags' -TimeoutSec 5
if (-not ($installedModels.models.name -contains 'bge-m3:latest')) {
    & 'D:\ollama\ollama.exe' pull bge-m3
    if ($LASTEXITCODE -ne 0) { throw 'Embedding model download failed.' }
}
