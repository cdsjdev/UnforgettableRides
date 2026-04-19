@echo off
setlocal
REM ============================================================
REM UnforgettableRides - Stop All Services
REM ============================================================

echo ============================================================
echo Stopping UnforgettableRides Services...
echo ============================================================
echo.

REM Close terminal windows by title (matches titles set in start_all.bat)
echo Closing terminal windows...
taskkill /F /FI "WINDOWTITLE eq Rides API*" 2>nul
taskkill /F /FI "WINDOWTITLE eq Rides Admin*" 2>nul
taskkill /F /FI "WINDOWTITLE eq Rides Portal*" 2>nul
taskkill /F /FI "WINDOWTITLE eq Rides App*" 2>nul
taskkill /F /FI "WINDOWTITLE eq UnforgettableRides*" 2>nul

REM Also kill any cmd.exe whose command line references the rides-* subdirectories
powershell -NoProfile -Command ^
  "$scriptDir = '%~dp0' -replace '\\$',''; $escaped = [regex]::Escape($scriptDir); " ^
  "$cmds = Get-CimInstance Win32_Process -Filter \"Name='cmd.exe'\" -ErrorAction SilentlyContinue | Where-Object { " ^
  "  $_.CommandLine -match ($escaped + '\\\\rides-api') -or " ^
  "  $_.CommandLine -match ($escaped + '\\\\rides-admin') -or " ^
  "  $_.CommandLine -match ($escaped + '\\\\rides-portal') -or " ^
  "  $_.CommandLine -match ($escaped + '\\\\rides-app') -or " ^
  "  $_.CommandLine -match 'Rides API' -or " ^
  "  $_.CommandLine -match 'Rides Admin' -or " ^
  "  $_.CommandLine -match 'Rides Portal' -or " ^
  "  $_.CommandLine -match 'Rides App' " ^
  "}; " ^
  "foreach ($c in $cmds) { " ^
  "  Write-Output ('  Killing cmd PID ' + $c.ProcessId); " ^
  "  Start-Process -FilePath 'taskkill.exe' -ArgumentList '/F','/T','/PID',$c.ProcessId -WindowStyle Hidden -Wait | Out-Null " ^
  "}"
echo   [OK] Terminal windows closed

REM Kill service ports as fallback
echo Stopping service ports (3000, 5173, 5174, 8081, 19000, 19001)...
powershell -NoProfile -Command ^
  "$scriptDir = '%~dp0' -replace '\\$',''; $escaped = [regex]::Escape($scriptDir); " ^
  "$ports = @(3000, 5173, 5174, 8081, 8082, 8083, 19000, 19001); $stopped = 0; " ^
  "foreach ($port in $ports) { " ^
  "  $pids = Get-NetTCPConnection -State Listen -LocalPort $port -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique; " ^
  "  foreach ($ownerPid in $pids) { " ^
  "    $proc = Get-CimInstance Win32_Process -Filter ('ProcessId=' + $ownerPid) -ErrorAction SilentlyContinue; " ^
  "    if (-not $proc) { continue } " ^
  "    $cmdline = [string]$proc.CommandLine; " ^
  "    $isRides = ($proc.Name -ieq 'node.exe') -and ( " ^
  "      $cmdline -match ($escaped + '\\\\rides-api') -or " ^
  "      $cmdline -match ($escaped + '\\\\rides-admin') -or " ^
  "      $cmdline -match ($escaped + '\\\\rides-portal') -or " ^
  "      $cmdline -match ($escaped + '\\\\rides-app') -or " ^
  "      $cmdline -match 'src/index\.js' -or " ^
  "      $cmdline -match 'vite' -or " ^
  "      $cmdline -match 'expo' " ^
  "    ); " ^
  "    if ($isRides) { " ^
  "      $stopped++; " ^
  "      Write-Output ('  [PORT ' + $port + '] Stopping node PID ' + $ownerPid); " ^
  "      Start-Process -FilePath 'taskkill.exe' -ArgumentList '/F','/T','/PID',$ownerPid -WindowStyle Hidden -Wait | Out-Null " ^
  "    } else { " ^
  "      Write-Output ('  [PORT ' + $port + '] Skipping PID ' + $ownerPid + ' (' + $proc.Name + ') - not a Rides process') " ^
  "    } " ^
  "  } " ^
  "} " ^
  "if ($stopped -eq 0) { Write-Output '  [--] No Rides service ports were in use' } else { Write-Output ('  [OK] Stopped ' + $stopped + ' process(es)') }"

echo.
echo ============================================================
echo All UnforgettableRides services stopped
echo ============================================================
endlocal
