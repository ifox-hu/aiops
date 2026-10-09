param([switch]$Build, [switch]$DatabaseOnly)
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path $PSScriptRoot -Parent
Set-Location $projectRoot
$env:DOCKER_VOLUME_DIRECTORY = 'D:/tools/superbizagent-data'
New-Item -ItemType Directory -Force $env:DOCKER_VOLUME_DIRECTORY, 'D:/tools/maven-repository' | Out-Null
docker compose -p superbizagent -f "$PSScriptRoot/compose.local.yml" up -d --wait --wait-timeout 240
if ($LASTEXITCODE -ne 0) { throw 'Database startup failed. Check docker compose logs.' }
if ($DatabaseOnly) { return }
if (-not $env:RELAY_API_KEY) {
    $env:RELAY_API_KEY = [Environment]::GetEnvironmentVariable('RELAY_API_KEY', 'User')
}
if (-not $env:RELAY_API_KEY -and (Test-Path 'D:\tools\superbizagent-config\apigoto-key.xml')) {
    $relaySecureKey = Import-Clixml 'D:\tools\superbizagent-config\apigoto-key.xml'
    $env:RELAY_API_KEY = [System.Net.NetworkCredential]::new('', $relaySecureKey).Password
}
if (-not $env:RELAY_API_KEY) {
    throw 'Set RELAY_API_KEY or configure the local encrypted relay key file.'
}
& "$PSScriptRoot/start-embedding.ps1"
$jar = Join-Path $projectRoot 'target/super-biz-agent-1.0-SNAPSHOT.jar'
if ($Build -or -not (Test-Path $jar)) {
    mvn -s "$PSScriptRoot/maven-settings.xml" -B -ntp package
    if ($LASTEXITCODE -ne 0) { throw 'Maven build failed.' }
}
if (Get-NetTCPConnection -State Listen -LocalPort 9900 -ErrorAction SilentlyContinue) {
    throw 'Port 9900 is already in use. Check the existing service before starting another instance.'
}
$javaCommand = (Get-Command java.exe).Source
$appProcess = Start-Process -FilePath $javaCommand -WindowStyle Hidden -WorkingDirectory $projectRoot -PassThru `
    -ArgumentList @('-Dfile.encoding=UTF-8', '-Djava.net.preferIPv4Stack=true', '-Djdk.tls.client.protocols=TLSv1.2', '-jar', $jar, '--spring.config.additional-location=optional:file:./deployment/application-local.yml') `
    -RedirectStandardOutput "$PSScriptRoot/app.stdout.log" -RedirectStandardError "$PSScriptRoot/app.stderr.log"
$appProcess.Id | Set-Content "$PSScriptRoot/app.pid"
for ($attempt = 0; $attempt -lt 60; $attempt++) {
    Start-Sleep -Seconds 2
    $appProcess.Refresh()
    if ($appProcess.HasExited) { throw 'Application exited. See deployment/app.stdout.log and app.stderr.log.' }
    try {
        $health = Invoke-RestMethod 'http://127.0.0.1:9900/milvus/health' -TimeoutSec 5
        if ($health.message -eq 'ok') {
            Write-Output 'Ready: http://localhost:9900 (relay chat + local bge-m3 embeddings; mock alerts/logs)'
            return
        }
    } catch { }
}
throw 'Application readiness timed out. Check deployment/app.stdout.log.'

