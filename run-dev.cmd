@echo off
setlocal

cd /d "%~dp0"

set "ACTION=%~1"

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

for /f "usebackq delims=" %%P in (`node scripts\dev-server.mjs print-port 2^>nul`) do set "APP_PORT=%%P"
if not defined APP_PORT (
  echo Failed to read dev server port from config\app.json.
  pause
  exit /b 1
)

if /i "%ACTION%"=="restart" (
  call :stop_server
  if errorlevel 1 exit /b %errorlevel%
) else if not "%ACTION%"=="" (
  echo Unknown command: %ACTION%
  echo Usage:
  echo   run-dev.cmd
  echo   run-dev.cmd restart
  pause
  exit /b 1
)

echo Checking port %APP_PORT%...
powershell -NoProfile -ExecutionPolicy Bypass -Command "try { $r = Invoke-WebRequest -UseBasicParsing http://localhost:%APP_PORT% -TimeoutSec 2; if ($r.StatusCode -ge 200 -and $r.StatusCode -lt 500) { exit 0 } else { exit 1 } } catch { exit 1 }"
if not errorlevel 1 (
  echo.
  echo Bangumi Lens is already running:
  echo http://localhost:%APP_PORT%
  echo.
  choice /C RE /N /M "Press R to restart, or E to exit: "
  if errorlevel 2 (
    echo.
    echo You can close this window. The existing server process is still running.
    pause
    exit /b 0
  )
  call :stop_server
  if errorlevel 1 exit /b %errorlevel%
  goto start_server
)

:start_server
echo.
echo Starting Bangumi Lens...
echo URL: http://localhost:%APP_PORT%
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

call npm.cmd run dev 1>>"%STDOUT_LOG%" 2>>"%STDERR_LOG%"

echo.
echo Server stopped or failed to start.
pause
exit /b 0

:stop_server
echo.
echo Stopping Bangumi Lens on port %APP_PORT%...
powershell -NoProfile -ExecutionPolicy Bypass -Command "$ErrorActionPreference = 'Stop'; $root = (Resolve-Path '%~dp0').Path.TrimEnd('\'); $connections = Get-NetTCPConnection -LocalPort %APP_PORT% -State Listen -ErrorAction SilentlyContinue; $pids = @($connections | Select-Object -ExpandProperty OwningProcess -Unique); if (-not $pids) { Write-Host 'No listening process found.'; exit 0 }; $stopped = 0; foreach ($processId in $pids) { $process = Get-CimInstance Win32_Process -Filter \"ProcessId=$processId\"; if ($process.CommandLine -like \"*$root*\" -or $process.CommandLine -like '*scripts\dev-server.mjs*') { Stop-Process -Id $processId -Force; Write-Host \"Stopped process $processId.\"; $stopped++ } else { Write-Host \"Skipping process $processId because it does not look like this project.\" } }; if ($stopped -eq 0) { exit 2 }"
if errorlevel 2 (
  pause
  exit /b 1
)
if errorlevel 1 (
  echo Failed to stop the server.
  pause
  exit /b 1
)
timeout /t 2 /nobreak >nul
exit /b 0

:trim_log
if not exist "%~1" exit /b 0
for %%A in ("%~1") do if %%~zA GTR %LOG_MAX_BYTES% (
  >"%~1" echo [%date% %time%] Log exceeded %LOG_MAX_BYTES% bytes and was cleared before startup.
)
exit /b 0
