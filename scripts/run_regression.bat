@echo off
setlocal
powershell -ExecutionPolicy Bypass -File "%~dp0run_regression.ps1" %*
if %ERRORLEVEL% neq 0 exit /b %ERRORLEVEL%
endlocal
