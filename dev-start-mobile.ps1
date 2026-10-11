param([int]$ReadinessTimeoutSeconds = 60)
$ErrorActionPreference = 'Stop'
$repoRoot = $PSScriptRoot
$adapter = Get-NetIPConfiguration -ErrorAction SilentlyContinue | Where-Object { $_.IPv4DefaultGateway -and $_.IPv4Address -and $_.NetAdapter.Status -eq 'Up' } | Select-Object -First 1
if (-not $adapter) { Write-Error 'Could not determine the active LAN IPv4 address.'; exit 1 }
$lanIp = $adapter.IPv4Address.IPAddress
$frontendUrl = "http://${lanIp}:3000"
$backendUrl = "http://${lanIp}:8000"
$runtimeDir = Join-Path $repoRoot '.dev-runtime'
foreach ($port in @(3000,8000)) { if (@(Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue).Count -gt 0) { Write-Error "Port $port is already in use. Run .\dev-stop.ps1 first."; exit 1 } }
New-Item -ItemType Directory -Path $runtimeDir -Force | Out-Null
$npm = Get-Command 'npm.cmd' -ErrorAction SilentlyContinue
$pythonPath = Join-Path $repoRoot 'apps\api\.venv\Scripts\python.exe'
if (-not $npm) { Write-Error 'npm.cmd was not found.'; exit 1 }
if (-not (Test-Path $pythonPath)) { Write-Error "Backend Python not found: $pythonPath"; exit 1 }
$webDir = Join-Path $repoRoot 'apps\web'
$apiDir = Join-Path $repoRoot 'apps\api'
$env:NEXT_PUBLIC_API_URL = $backendUrl
$frontend = Start-Process 'cmd.exe' -ArgumentList "/d /s /c call npm.cmd run dev -- --hostname 0.0.0.0" -WorkingDirectory $webDir -WindowStyle Hidden -RedirectStandardOutput (Join-Path $runtimeDir 'mobile-frontend.stdout.log') -RedirectStandardError (Join-Path $runtimeDir 'mobile-frontend.stderr.log') -PassThru
$env:NEXT_PUBLIC_API_URL = $null
$env:FRONTEND_ORIGIN = $frontendUrl
$backend = Start-Process $pythonPath -ArgumentList '-m uvicorn app.main:app --host 0.0.0.0 --port 8000' -WorkingDirectory $apiDir -WindowStyle Hidden -RedirectStandardOutput (Join-Path $runtimeDir 'mobile-backend.stdout.log') -RedirectStandardError (Join-Path $runtimeDir 'mobile-backend.stderr.log') -PassThru
$env:FRONTEND_ORIGIN = $null
function Test-Ready($Url) { try { return (Invoke-WebRequest $Url -UseBasicParsing -TimeoutSec 3).StatusCode -eq 200 } catch { return $false } }
$deadline = (Get-Date).AddSeconds($ReadinessTimeoutSeconds)
do { if ((Test-Ready "$backendUrl/health") -and (Test-Ready $frontendUrl)) { break }; Start-Sleep -Milliseconds 500 } while ((Get-Date) -lt $deadline)
if (-not (Test-Ready "$backendUrl/health") -or -not (Test-Ready $frontendUrl)) { Write-Error 'Mobile services did not become ready. Check .dev-runtime mobile logs.'; exit 1 }
Write-Host ''
Write-Host 'MoyaStudia mobile development is ready.'
Write-Host "Frontend: $frontendUrl"
Write-Host "Backend:  $backendUrl"
Write-Host 'Open the Frontend URL on a phone connected to the same network.'
Write-Warning 'Google OAuth callbacks configured for localhost require separate redirect setup when used from the LAN URL.'
