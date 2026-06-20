@echo off
setlocal

cd /d "%~dp0"

echo.
echo Bangumi Lens
echo =============
echo.

if not exist node_modules (
  echo Installing dependencies...
  call npm.cmd install
  if errorlevel 1 (
    echo.
    echo Dependency installation failed.
    pause
    exit /b %errorlevel%
  )
)

echo Checking port 3000...
powershell -NoProfile -ExecutionPolicy Bypass -Command "try { $r = Invoke-WebRequest -UseBasicParsing http://localhost:3000 -TimeoutSec 2; if ($r.StatusCode -ge 200 -and $r.StatusCode -lt 500) { exit 0 } else { exit 1 } } catch { exit 1 }"
if not errorlevel 1 (
  echo.
  echo Bangumi Lens is already running:
  echo http://localhost:3000
  echo.
  echo You can close this window. The existing server process is still running.
  pause
  exit /b 0
)

echo.
echo Starting Bangumi Lens...
echo URL: http://localhost:3000
echo Logs:
echo   %~dp0logs\dev-server.log
echo   %~dp0logs\dev-server.err.log
echo.
echo Keep this window open while using the app.
echo Press Ctrl+C to stop the server.
echo.

set "LOG_DIR=%~dp0logs"
set "STDOUT_LOG=%LOG_DIR%\dev-server.log"
set "STDERR_LOG=%LOG_DIR%\dev-server.err.log"
set "LOG_MAX_BYTES=1048576"

if not exist "%LOG_DIR%" mkdir "%LOG_DIR%"

call :trim_log "%STDOUT_LOG%"
call :trim_log "%STDERR_LOG%"

call npm.cmd run dev -- -p 3000 1>>"%STDOUT_LOG%" 2>>"%STDERR_LOG%"

echo.
echo Server stopped or failed to start.
pause
exit /b 0

:trim_log
if not exist "%~1" exit /b 0
for %%A in ("%~1") do if %%~zA GTR %LOG_MAX_BYTES% (
  >"%~1" echo [%date% %time%] Log exceeded %LOG_MAX_BYTES% bytes and was cleared before startup.
)
exit /b 0
