@echo off
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
 echo Install Node.js 22 or newer LTS, then reopen this file.
 pause
 exit /b 1
)
if not exist node_modules (
 call npm.cmd ci
 if errorlevel 1 goto fail
)
call npm.cmd run build
if errorlevel 1 goto fail
echo.
echo Open http://localhost:2567 in your browser.
echo Phone on the same Wi-Fi: http://YOUR_PC_IP:2567
call npm.cmd start
:fail
pause
