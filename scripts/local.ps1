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
    $modelBytes = New-Object byte[] 32
    $modelSource = [Security.Cryptography.RandomNumberGenerator]::Create()
    try { $modelSource.GetBytes($modelBytes) } finally { $modelSource.Dispose() }
    $modelKey = [Convert]::ToBase64String($modelBytes).TrimEnd('=').Replace('+', '-').Replace('/', '_')
    $contents = "# Local-only settings. Never commit this file.`nPOSTGRES_PASSWORD=$localPassword`nPOSTGRES_PORT=15432`nREDIS_PORT=16379`nAPI_PORT=3001`nFRONTEND_PORT=4173`nAGENT_DEBUG=false`n# Set both values to enable creator login.`nPRIVY_APP_ID=`nPRIVY_APP_SECRET=`n# Server-only keyring for durable Model Service credentials.`nMODEL_CREDENTIAL_KEYRING={`"local-v1`":`"$modelKey`"}`nMODEL_CREDENTIAL_ACTIVE_KEY_ID=local-v1`n# The Graph source discovery and data gateway environment.`nGRAPH_GATEWAY_ENVIRONMENT=mainnet`n# Hedera testnet settlement profile.`nHEDERA_NETWORK=hedera:testnet`nHEDERA_MIRROR_NODE_URL=https://testnet.mirrornode.hedera.com`nHEDERA_PORTAL_PAT=`nHEDERA_FAUCET_URL=https://portal.hedera.com/api/disbursement/cli`nHEDERA_FAUCET_AMOUNT_HBAR=1`nBLOCKY402_FACILITATOR_URL=https://api.testnet.blocky402.com`n"
    # CreateNew prevents an initialization race from overwriting existing credentials.
    $stream = [IO.File]::Open($localEnvPath, [IO.FileMode]::CreateNew, [IO.FileAccess]::Write)
    $writer = New-Object IO.StreamWriter($stream, (New-Object Text.UTF8Encoding($false)))
    try { $writer.Write($contents) } finally { $writer.Dispose() }
    Write-Output 'Created ignored .env.local with a random local database password.'
    exit 0
}

if (-not (Test-Path -LiteralPath $localEnvPath)) { throw 'Run scripts/local.ps1 init first.' }
$settings = @{}
$allowedKeys = @('POSTGRES_PASSWORD', 'POSTGRES_PORT', 'REDIS_PORT', 'API_PORT', 'FRONTEND_PORT', 'PRIVY_APP_ID', 'PRIVY_APP_SECRET', 'MODEL_CREDENTIAL_KEYRING', 'MODEL_CREDENTIAL_ACTIVE_KEY_ID', 'AGENT_TIMEOUT_MS', 'AGENT_DEBUG', 'GRAPH_GATEWAY_ENVIRONMENT', 'HEDERA_NETWORK', 'HEDERA_MIRROR_NODE_URL', 'HEDERA_PORTAL_PAT', 'HEDERA_FAUCET_URL', 'HEDERA_FAUCET_AMOUNT_HBAR', 'BLOCKY402_FACILITATOR_URL')
foreach ($line in [IO.File]::ReadAllLines($localEnvPath)) {
    if ($line.Trim() -eq '' -or $line.Trim().StartsWith('#')) { continue }
    if ($line -notmatch '^([A-Z_]+)=([^\s]*)$' -or $allowedKeys -notcontains $Matches[1]) {
        throw 'Invalid local configuration. Only the documented local keys are supported.'
    }
    if ($settings.ContainsKey($Matches[1])) { throw 'Duplicate local configuration key.' }
    $settings[$Matches[1]] = $Matches[2]
}
$settings['REDIS_PORT'] = if ($settings.ContainsKey('REDIS_PORT')) { $settings['REDIS_PORT'] } else { '16379' }
$requiredKeys = @('POSTGRES_PASSWORD', 'POSTGRES_PORT', 'REDIS_PORT', 'API_PORT', 'FRONTEND_PORT')
if (@($requiredKeys | Where-Object { -not $settings.ContainsKey($_) }).Count -ne 0 -or $settings['POSTGRES_PASSWORD'] -notmatch '^[a-fA-F0-9]{64}$') {
    throw 'Local configuration needs the required service settings and a 64-character hex database password.'
}
if ($settings.ContainsKey('AGENT_TIMEOUT_MS') -and ($settings['AGENT_TIMEOUT_MS'] -notmatch '^\d+$' -or [int]$settings['AGENT_TIMEOUT_MS'] -lt 250 -or [int]$settings['AGENT_TIMEOUT_MS'] -gt 120000)) {
    throw 'AGENT_TIMEOUT_MS must be an integer from 250 through 120000.'
}
if ($settings.ContainsKey('AGENT_DEBUG') -and $settings['AGENT_DEBUG'] -notmatch '^(true|false)$') {
    throw 'AGENT_DEBUG must be true or false.'
}
$privyAppId = if ($settings.ContainsKey('PRIVY_APP_ID')) { $settings['PRIVY_APP_ID'] } else { '' }
$privyAppSecret = if ($settings.ContainsKey('PRIVY_APP_SECRET')) { $settings['PRIVY_APP_SECRET'] } else { '' }
if ([string]::IsNullOrEmpty($privyAppId) -ne [string]::IsNullOrEmpty($privyAppSecret)) {
    throw 'PRIVY_APP_ID and PRIVY_APP_SECRET must be configured together.'
}
$modelKeyring = if ($settings.ContainsKey('MODEL_CREDENTIAL_KEYRING')) { $settings['MODEL_CREDENTIAL_KEYRING'] } else { '' }
$modelActiveKey = if ($settings.ContainsKey('MODEL_CREDENTIAL_ACTIVE_KEY_ID')) { $settings['MODEL_CREDENTIAL_ACTIVE_KEY_ID'] } else { '' }
if ([string]::IsNullOrEmpty($modelKeyring) -ne [string]::IsNullOrEmpty($modelActiveKey)) {
    throw 'MODEL_CREDENTIAL_KEYRING and MODEL_CREDENTIAL_ACTIVE_KEY_ID must be configured together.'
}
if (-not [string]::IsNullOrEmpty($modelKeyring)) {
    try { $parsedKeyring = $modelKeyring | ConvertFrom-Json } catch { throw 'MODEL_CREDENTIAL_KEYRING must be a JSON object.' }
    $activeProperty = $parsedKeyring.PSObject.Properties[$modelActiveKey]
    if ($modelActiveKey -notmatch '^[A-Za-z0-9._-]{1,64}$' -or $null -eq $activeProperty -or $activeProperty.Value -notmatch '^[A-Za-z0-9_-]{43}$') {
        throw 'The active model credential key must be a 32-byte base64url value in MODEL_CREDENTIAL_KEYRING.'
    }
}
$graphGatewayEnvironment = if ($settings.ContainsKey('GRAPH_GATEWAY_ENVIRONMENT')) { $settings['GRAPH_GATEWAY_ENVIRONMENT'] } else { 'mainnet' }
if ($graphGatewayEnvironment -ne 'mainnet') {
    throw 'GRAPH_GATEWAY_ENVIRONMENT must be mainnet in the current build.'
}
$hederaNetwork = if ($settings.ContainsKey('HEDERA_NETWORK')) { $settings['HEDERA_NETWORK'] } else { 'hedera:testnet' }
if ($hederaNetwork -ne 'hedera:testnet') {
    throw 'HEDERA_NETWORK must be hedera:testnet in the current build.'
}
$hederaFaucetUrl = if ($settings.ContainsKey('HEDERA_FAUCET_URL')) { $settings['HEDERA_FAUCET_URL'] } else { 'https://portal.hedera.com/api/disbursement/cli' }
if ($hederaFaucetUrl -ne 'https://portal.hedera.com/api/disbursement/cli') {
    throw 'HEDERA_FAUCET_URL must use the reviewed Hedera Portal testnet endpoint.'
}
$hederaFaucetAmount = if ($settings.ContainsKey('HEDERA_FAUCET_AMOUNT_HBAR')) { $settings['HEDERA_FAUCET_AMOUNT_HBAR'] } else { '1' }
$parsedFaucetAmount = 0
if (-not [int]::TryParse($hederaFaucetAmount, [ref]$parsedFaucetAmount) -or $parsedFaucetAmount -lt 1 -or $parsedFaucetAmount -gt 100) {
    throw 'HEDERA_FAUCET_AMOUNT_HBAR must be an integer from 1 to 100.'
}
foreach ($key in @('POSTGRES_PORT', 'REDIS_PORT', 'API_PORT', 'FRONTEND_PORT')) {
    $parsedPort = 0
    if (-not [int]::TryParse($settings[$key], [ref]$parsedPort) -or $parsedPort -lt 1024 -or $parsedPort -gt 65535) {
        throw "Invalid local port: $key. Use 1024-65535."
    }
}
if (@(@('POSTGRES_PORT', 'REDIS_PORT', 'API_PORT', 'FRONTEND_PORT') | ForEach-Object { [int]$settings[$_] } | Select-Object -Unique).Count -ne 4) {
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
    Invoke-Compose -Arguments @('exec', '-T', 'redis', 'redis-cli', 'ping')
    & docker @composeBase exec -T frontend sh -c "grep -R -q -- 'agent-sessions' /usr/share/nginx/html/assets"
    if ($LASTEXITCODE -ne 0) {
        throw 'The served frontend image is stale and does not include the live Agent client. Run scripts/local.ps1 up to rebuild it.'
    }
    Write-Output "Local framework ready: $consoleUrl (Dashboard, Wallet, Model Service, and Agent Planner use live authenticated data; Build, API, and Monetize remain on the identified demo runtime)."
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
        'db' { Invoke-Compose -Arguments @('up', '--detach', '--wait', '--wait-timeout', '120', 'postgres', 'redis') }
        'up' {
            Invoke-Compose -Arguments @('build', 'api', 'frontend')
            Invoke-Compose -Arguments @('up', '--detach', '--wait', '--wait-timeout', '120', 'postgres', 'redis')
            Write-Output 'Applying pending migrations to the local sprue-local database as an explicit one-off step.'
            Invoke-Compose -Arguments @('--profile', 'tools', 'run', '--rm', '--no-deps', 'migrate')
            Write-Output 'Loading idempotent public network and asset reference metadata.'
            Invoke-Compose -Arguments @('--profile', 'tools', 'run', '--rm', '--no-deps', 'seed')
            Invoke-Compose -Arguments @('up', '--detach', '--wait', '--wait-timeout', '120', 'api', 'worker', 'frontend')
            Test-LocalStack
        }
        'stop' { Invoke-Compose -Arguments @('stop'); Write-Output 'Stopped local services. Database volume and credentials were preserved.' }
        'check' { Test-LocalStack }
        'logs' { Invoke-Compose -Arguments @('logs', '--tail', '80', 'api', 'worker', 'frontend', 'redis') }
    }
} finally {
    foreach ($key in $previousValues.Keys) { [Environment]::SetEnvironmentVariable($key, $previousValues[$key], 'Process') }
}
