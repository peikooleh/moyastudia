# MoyaStudia local launcher
# API  http://127.0.0.1:8000
# Web  http://localhost:3000
$ErrorActionPreference = "Stop"

$Root = "D:\GITHUB\moyastudia"
$ApiDir = Join-Path $Root "apps\api"
$WebDir = Join-Path $Root "apps\web"
$Py = Join-Path $ApiDir ".venv\Scripts\python.exe"

function Fail($msg) {
    Write-Host ""
    Write-Host $msg -ForegroundColor Red
    Write-Host ""
    Read-Host "Enter, чтобы закрыть"
    exit 1
}

if (-not (Test-Path $ApiDir)) { Fail "Нет папки API: $ApiDir" }
if (-not (Test-Path $WebDir)) { Fail "Нет папки web: $WebDir" }
if (-not (Test-Path $Py)) {
    Fail "Нет venv: $Py`nСначала из apps\api: python -m venv .venv; .\.venv\Scripts\Activate.ps1; pip install -r requirements.txt"
}
if (-not (Test-Path (Join-Path $WebDir "node_modules"))) {
    Write-Host "node_modules нет. Запускаю npm ci в apps\web..." -ForegroundColor Yellow
    Push-Location $WebDir
    npm ci
    if ($LASTEXITCODE -ne 0) { Pop-Location; Fail "npm ci завершился с ошибкой" }
    Pop-Location
}

# Не плодим вторую пару, если порты уже заняты.
$apiBusy = Get-NetTCPConnection -LocalPort 8000 -State Listen -ErrorAction SilentlyContinue
$webBusy = Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue
if ($apiBusy -and $webBusy) {
    Write-Host "API :8000 и web :3000 уже слушают. Открываю кабинет." -ForegroundColor Green
    Start-Process "http://localhost:3000"
    exit 0
}

$apiCmd = @"
`$Host.UI.RawUI.WindowTitle = 'MoyaStudia API :8000'
Set-Location '$ApiDir'
Write-Host 'API  -> http://127.0.0.1:8000/health' -ForegroundColor Cyan
Write-Host 'Стоп: Ctrl+C' -ForegroundColor DarkGray
& '$Py' -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
Write-Host ''
Write-Host 'API остановился.' -ForegroundColor Yellow
Read-Host 'Enter, чтобы закрыть окно'
"@

$webCmd = @"
`$Host.UI.RawUI.WindowTitle = 'MoyaStudia Web :3000'
Set-Location '$WebDir'
Write-Host 'Web  -> http://localhost:3000' -ForegroundColor Cyan
Write-Host 'Стоп: Ctrl+C' -ForegroundColor DarkGray
npm run dev
Write-Host ''
Write-Host 'Web остановился.' -ForegroundColor Yellow
Read-Host 'Enter, чтобы закрыть окно'
"@

if (-not $apiBusy) {
    Start-Process -FilePath "powershell.exe" -ArgumentList @(
        "-NoExit", "-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", $apiCmd
    ) | Out-Null
    Write-Host "Окно API запущено." -ForegroundColor Green
} else {
    Write-Host "Порт 8000 уже занят, API не перезапускаю." -ForegroundColor Yellow
}

if (-not $webBusy) {
    Start-Process -FilePath "powershell.exe" -ArgumentList @(
        "-NoExit", "-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", $webCmd
    ) | Out-Null
    Write-Host "Окно Web запущено." -ForegroundColor Green
} else {
    Write-Host "Порт 3000 уже занят, web не перезапускаю." -ForegroundColor Yellow
}

Write-Host "Жду health API (до 25 с)..." -ForegroundColor DarkGray
$ok = $false
for ($i = 0; $i -lt 25; $i++) {
    try {
        $r = Invoke-WebRequest -Uri "http://127.0.0.1:8000/health" -UseBasicParsing -TimeoutSec 2
        if ($r.StatusCode -eq 200) { $ok = $true; break }
    } catch {}
    Start-Sleep -Seconds 1
}
if ($ok) {
    Write-Host "API отвечает." -ForegroundColor Green
} else {
    Write-Host "API ещё не ответил. Смотри окно API: DATABASE_URL, venv, alembic." -ForegroundColor Yellow
}

Start-Process "http://localhost:3000"
Write-Host "Браузер: http://localhost:3000" -ForegroundColor Green
Write-Host "Окна серверов не закрывать. Стоп: Ctrl+C в каждом." -ForegroundColor DarkGray
