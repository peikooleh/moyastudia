@echo off
chcp 65001 >nul
title MoyaStudia
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0start-moyastudia.ps1"
