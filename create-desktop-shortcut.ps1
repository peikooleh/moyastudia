# Кладёт ярлык «MoyaStudia» на рабочий стол.
# Запуск: правый клик -> Выполнить с PowerShell, либо:
#   powershell -ExecutionPolicy Bypass -File D:\GITHUB\moyastudia\create-desktop-shortcut.ps1
$ErrorActionPreference = "Stop"
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$target = Join-Path $here "start-moyastudia.bat"
if (-not (Test-Path $target)) {
    Write-Host "Рядом нет start-moyastudia.bat: $target" -ForegroundColor Red
    exit 1
}
$desktop = [Environment]::GetFolderPath("Desktop")
$lnkPath = Join-Path $desktop "MoyaStudia.lnk"
$shell = New-Object -ComObject WScript.Shell
$lnk = $shell.CreateShortcut($lnkPath)
$lnk.TargetPath = $target
$lnk.WorkingDirectory = $here
$lnk.WindowStyle = 7
$lnk.Description = "MoyaStudia: API :8000 + кабинет :3000"
$lnk.Save()
Write-Host "Ярлык создан: $lnkPath" -ForegroundColor Green
