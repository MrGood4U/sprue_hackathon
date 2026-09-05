param(
    [Parameter(Position = 0)]
    [ValidateSet('init', 'up', 'stop', 'check', 'logs', 'config', 'db')]
    [string]$Action = 'check'
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$repoRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$localEnvPath = Join-Path $repoRoot '.env.local'

if ($Action -eq 'init') {
    if (Test-Path -LiteralPath $localEnvPath) {
        Write-Output 'Existing .env.local preserved. Initialization did not change credentials.'
        exit 0
    }
    $randomBytes = New-Object byte[] 32
    $randomSource = [Security.Cryptography.RandomNumberGenerator]::Create()
    try { $randomSource.GetBytes($randomBytes) } finally { $randomSource.Dispose() }
    $localPassword = [BitConverter]::ToString($randomBytes).Replace('-', '').ToLowerInvariant()
    $contents = "# Local-only settings. Never commit this file.`nPOSTGRES_PASSWORD=$localPassword`nPOSTGRES_PORT=15432`nAPI_PORT=3001`nFRONTEND_PORT=4173`n"
    # CreateNew prevents an initialization race from overwriting existing credentials.
    $stream = [IO.File]::Open($localEnvPath, [IO.FileMode]::CreateNew, [IO.FileAccess]::Write)
    $writer = New-Object IO.StreamWriter($stream, (New-Object Text.UTF8Encoding($false)))
    try { $writer.Write($contents) } finally { $writer.Dispose() }
    Write-Output 'Created ignored .env.local with a random local database password.'
    exit 0
}

if (-not (Test-Path -LiteralPath $localEnvPath)) { throw 'Run scripts/local.ps1 init first.' }
$settings = @{}
foreach ($line in [IO.File]::ReadAllLines($localEnvPath)) {
    if ($line.Trim() -eq '' -or $line.Trim().StartsWith('#')) { continue }
    if ($line -notmatch '^(POSTGRES_PASSWORD|POSTGRES_PORT|API_PORT|FRONTEND_PORT)=([^\s]+)$') {
        throw 'Invalid local configuration. Only the four documented local keys are supported.'
    }
    if ($settings.ContainsKey($Matches[1])) { throw 'Duplicate local configuration key.' }
    $settings[$Matches[1]] = $Matches[2]
}
if ($settings.Count -ne 4 -or $settings['POSTGRES_PASSWORD'] -notmatch '^[a-fA-F0-9]{64}$') {
    throw 'Local configuration needs four keys and a 64-character hex database password.'
}
foreach ($key in @('POSTGRES_PORT', 'API_PORT', 'FRONTEND_PORT')) {
    $parsedPort = 0
    if (-not [int]::TryParse($settings[$key], [ref]$parsedPort) -or $parsedPort -lt 1024 -or $parsedPort -gt 65535) {
        throw "Invalid local port: $key. Use 1024-65535."
    }
}
if (@(@('POSTGRES_PORT', 'API_PORT', 'FRONTEND_PORT') | ForEach-Object { [int]$settings[$_] } | Select-Object -Unique).Count -ne 3) {
    throw 'Local service ports must be distinct.'
}

Get-Command docker -ErrorAction Stop | Out-Null
$dockerEndpoint = if ($env:DOCKER_HOST) { $env:DOCKER_HOST } else {
    (& docker context inspect --format '{{.Endpoints.docker.Host}}' | Out-String).Trim()
}
if ($dockerEndpoint -notmatch '^(npipe|unix)://') { throw 'This helper requires a local Docker engine, not a remote Docker endpoint.' }

$composeBase = @('compose', '--project-name', 'sprue-local', '--env-file', $localEnvPath, '-f', (Join-Path $repoRoot 'compose.yaml'))
function Invoke-Compose {
    param([string[]]$Arguments)
    & docker @composeBase @Arguments
    if ($LASTEXITCODE -ne 0) { throw 'Local Docker operation failed. Check Docker Desktop, service status, and logs.' }
}
function Test-LocalStack {
    $consoleUrl = "http://127.0.0.1:$($settings['FRONTEND_PORT'])"
    $apiUrl = "http://127.0.0.1:$($settings['API_PORT'])"
    foreach ($url in @("$consoleUrl/", "$consoleUrl/app", "$apiUrl/healthz", "$apiUrl/readyz")) {
        $result = Invoke-WebRequest -UseBasicParsing -Uri $url -TimeoutSec 10
        if ($result.StatusCode -ne 200) { throw 'A local service probe failed.' }
    }
    $config = Invoke-WebRequest -UseBasicParsing -Uri "$apiUrl/api/v1/app-config" -Headers @{ Origin = $consoleUrl } -TimeoutSec 10
    $body = $config.Content | ConvertFrom-Json
    if ($config.Headers['Access-Control-Allow-Origin'] -ne $consoleUrl -or $body.data.apiVersion -ne '1' -or $body.meta.dataSource -ne 'live') {
        throw 'Public configuration or CORS validation failed.'
    }
    Invoke-Compose -Arguments @('exec', '-T', 'worker', 'node', '-e', "fetch('http://127.0.0.1:3002/readyz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))")
    Write-Output "Local framework ready: $consoleUrl (business pages use the backend demo runtime)."
}

# Prevent inherited shell values from silently overriding the reviewed local file.
$previousValues = @{}
foreach ($key in $settings.Keys) {
    $previousValues[$key] = [Environment]::GetEnvironmentVariable($key, 'Process')
    [Environment]::SetEnvironmentVariable($key, $settings[$key], 'Process')
}
try {
    Invoke-Compose -Arguments @('config', '--quiet')
    switch ($Action) {
        'config' { Write-Output 'Local Compose configuration is valid; secret values were not printed.' }
        'db' { Invoke-Compose -Arguments @('up', '--detach', '--wait', '--wait-timeout', '120', 'postgres') }
        'up' {
            Invoke-Compose -Arguments @('build', 'api', 'frontend')
            Invoke-Compose -Arguments @('up', '--detach', '--wait', '--wait-timeout', '120', 'postgres')
            Write-Output 'Applying pending migrations to the local sprue-local database as an explicit one-off step.'
            Invoke-Compose -Arguments @('--profile', 'tools', 'run', '--rm', '--no-deps', 'migrate')
            Invoke-Compose -Arguments @('up', '--detach', '--wait', '--wait-timeout', '120', 'api', 'worker', 'frontend')
            Test-LocalStack
        }
        'stop' { Invoke-Compose -Arguments @('stop'); Write-Output 'Stopped local services. Database volume and credentials were preserved.' }
        'check' { Test-LocalStack }
        'logs' { Invoke-Compose -Arguments @('logs', '--tail', '80', 'api', 'worker', 'frontend') }
    }
} finally {
    foreach ($key in $previousValues.Keys) { [Environment]::SetEnvironmentVariable($key, $previousValues[$key], 'Process') }
}
