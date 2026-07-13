@echo off
setlocal
set "SCRIPT=%~dp0open-dev-firewall.ps1"

net session >nul 2>&1
if %errorlevel% neq 0 (
  echo Requesting Administrator permission...
  powershell -NoProfile -ExecutionPolicy Bypass -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
  exit /b
)

echo Running elevated firewall setup...
powershell -NoProfile -ExecutionPolicy Bypass -File "%SCRIPT%"
set "ERR=%ERRORLEVEL%"
echo.
if not "%ERR%"=="0" (
  echo FAILED with exit code %ERR%.
) else (
  echo SUCCESS.
)
pause
exit /b %ERR%
