@echo off
REM ============================================================
REM UnforgettableRides - Start Backend Services Only
REM ============================================================
REM Starts only the API (no frontend apps):
REM   1. Main API (Node.js/Express) - port 3000
REM ============================================================

echo ============================================================
echo Starting UnforgettableRides Backend Services...
echo ============================================================
echo.

REM Ensure API port is free
echo Ensuring API port 3000 is free...
powershell -NoProfile -Command ^
  "$pids = Get-NetTCPConnection -State Listen -LocalPort 3000 -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique; " ^
  "if (-not $pids) { Write-Output '  [OK] Port 3000 is free' } " ^
  "foreach ($ownerPid in $pids) { " ^
  "  $proc = Get-CimInstance Win32_Process -Filter ('ProcessId=' + $ownerPid) -ErrorAction SilentlyContinue; " ^
  "  if (-not $proc) { continue } " ^
  "  if ($proc.Name -ieq 'node.exe') { " ^
  "    Write-Output ('  [PORT 3000] Stopping stale Node PID ' + $ownerPid); " ^
  "    Start-Process -FilePath 'taskkill.exe' -ArgumentList '/F','/T','/PID',$ownerPid -WindowStyle Hidden -Wait | Out-Null " ^
  "  } else { " ^
  "    Write-Output ('  [PORT 3000] PID ' + $ownerPid + ' skipped - ' + $proc.Name + ' is not node.exe') " ^
  "  } " ^
  "}"

REM Start Main API
echo Starting Main API (port 3000)...
start "Rides API" cmd /k "cd /d %~dp0rides-api && npm run dev"

echo.
echo ============================================================
echo Backend service starting!
echo ============================================================
echo.
echo Health check:
echo   Main API:  http://localhost:3000/api/v1/health
echo.
echo To start frontend apps separately:
echo   start_portal.bat        (customer portal)
echo   cd rides-admin ^&^& npm run dev   (admin dashboard)
echo   cd rides-app ^&^& npx expo start  (mobile app)
echo.
pause
