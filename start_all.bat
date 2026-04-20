@echo off
REM ============================================================
REM UnforgettableRides - Start All Services
REM ============================================================
REM This script starts all services in separate windows:
REM   1. Main API (Node.js/Express) - port 3000
REM   2. Admin Dashboard (Vite/React) - port 5173
REM   3. Customer Portal (Vite/React) - port 5174
REM   4. Mobile App (Expo) - port 8081
REM ============================================================

echo ============================================================
echo Starting UnforgettableRides Services...
echo ============================================================
echo.

REM Build metadata for local dev runtime
for /f %%i in ('powershell -NoProfile -Command "(Get-Date).ToString(\"yyyy-MM-dd\")"') do set "BUILD_DATE=%%i"
for /f %%i in ('powershell -NoProfile -Command "$repo = '%~dp0'; $sha = ''; if (Get-Command git -ErrorAction SilentlyContinue) { try { $sha = (git -C $repo rev-parse --short HEAD 2>$null).Trim() } catch {} }; if (-not $sha) { $sha = 'unknown' }; Write-Output $sha"') do set "GIT_SHA=%%i"
if not defined GIT_SHA set "GIT_SHA=unknown"
echo Build metadata: date=%BUILD_DATE% sha=%GIT_SHA%
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

REM Ensure Web ports are free
echo Ensuring Web ports 5173-5174 are free...
powershell -NoProfile -Command ^
  "$ports = @(5173, 5174); foreach ($port in $ports) { " ^
  "  $pids = Get-NetTCPConnection -State Listen -LocalPort $port -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique; " ^
  "  if (-not $pids) { Write-Output ('  [OK] Port ' + $port + ' is free') } " ^
  "  foreach ($ownerPid in $pids) { " ^
  "    $proc = Get-CimInstance Win32_Process -Filter ('ProcessId=' + $ownerPid) -ErrorAction SilentlyContinue; " ^
  "    if ($proc -and $proc.Name -ieq 'node.exe') { " ^
  "      Write-Output ('  [PORT ' + $port + '] Stopping stale Node PID ' + $ownerPid); " ^
  "      Start-Process -FilePath 'taskkill.exe' -ArgumentList '/F','/T','/PID',$ownerPid -WindowStyle Hidden -Wait | Out-Null " ^
  "    } " ^
  "  } " ^
  "}"

REM Ensure Expo dev ports are free
echo Ensuring Expo ports 8081-8095 are free...
powershell -NoProfile -Command ^
  "$ports = 8081..8095; " ^
  "$conns = Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue | Where-Object { $ports -contains $_.LocalPort }; " ^
  "$pids = $conns | Select-Object -ExpandProperty OwningProcess -Unique; " ^
  "if (-not $pids) { Write-Output '  [OK] Expo ports are free' } " ^
  "foreach ($ownerPid in $pids) { " ^
  "  $proc = Get-CimInstance Win32_Process -Filter ('ProcessId=' + $ownerPid) -ErrorAction SilentlyContinue; " ^
  "  if ($proc -and $proc.Name -ieq 'node.exe') { " ^
  "    Write-Output ('  [EXPO PORTS] Stopping stale Node PID ' + $ownerPid); " ^
  "    Start-Process -FilePath 'taskkill.exe' -ArgumentList '/F','/T','/PID',$ownerPid -WindowStyle Hidden -Wait | Out-Null " ^
  "  } " ^
  "}"

REM Start Main API
start "Rides API" cmd /k "title Rides API && set BUILD_DATE=%BUILD_DATE% && set GIT_SHA=%GIT_SHA% && cd /d %~dp0rides-api && npm run dev"

REM Wait a moment
timeout /t 2 /nobreak > nul

REM Start Admin Dashboard
start "Rides Admin" cmd /k "title Rides Admin Dashboard && set VITE_BUILD_DATE=%BUILD_DATE% && set VITE_GIT_SHA=%GIT_SHA% && cd /d %~dp0rides-admin && npm run dev"

REM Wait a moment
timeout /t 2 /nobreak > nul

REM Start Customer Portal
start "Rides Portal" cmd /k "title Rides Portal && cd /d %~dp0rides-portal && npm run dev -- --port 5174"

REM Wait a moment
timeout /t 2 /nobreak > nul

REM Start Mobile App
start "Rides App" cmd /k "title Rides App && set EXPO_PUBLIC_BUILD_DATE=%BUILD_DATE% && set EXPO_PUBLIC_GIT_SHA=%GIT_SHA% && cd /d %~dp0rides-app && powershell -NoProfile -ExecutionPolicy Bypass -Command ""$port = 8081; while (Get-NetTCPConnection -State Listen -LocalPort $port -ErrorAction SilentlyContinue) { $port++ }; Write-Host ('Using Expo port ' + $port); npx expo start --port $port --host lan"""

echo.
echo ============================================================
echo UnforgettableRides services starting!
echo ============================================================
echo.
echo   API:     http://localhost:3000/api/v1/health
echo   Admin:   http://localhost:5173
echo   Portal:  http://localhost:5174
echo   App:     http://localhost:8081
echo.
