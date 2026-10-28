@echo off
chcp 65001 > nul
title تعاونية أجبان الخير - Coopérative Ajban Al Khair

echo ======================================================================
echo           🥛 تعاونية أجبان الخير - Coopérative Ajban Al Khair 🧀
echo      نظام تسيير المداخيل والمصاريف (Gestion Recettes et Depenses)
echo ======================================================================
echo.

cd /d "%~dp0"

if exist "..\.venv\Scripts\python.exe" (
    set "PY_BIN=..\.venv\Scripts\python.exe"
) else (
    set "PY_BIN=python"
)

echo [*] Jari tchghil l-App f Port 5050...
echo.
echo  💻 رابط الحاسوب (PC):      http://localhost:5050
echo.

start "" /b cmd /c "timeout /t 2 /nobreak > nul && start http://localhost:5050"

%PY_BIN% app.py

pause
