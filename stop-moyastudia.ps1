# Останавливает локальные API :8000 и Next :3000 этого проекта.
$ErrorActionPreference = "SilentlyContinue"
foreach ($port in 8000, 3000) {
    $conns = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
    foreach ($c in $conns) {
        $p = Get-Process -Id $c.OwningProcess -ErrorAction SilentlyContinue
        if ($p) {
            Write-Host "Стоп $($p.ProcessName) pid=$($p.Id) port=$port"
            Stop-Process -Id $p.Id -Force
        }
    }
}
Write-Host "Готово." -ForegroundColor Green
