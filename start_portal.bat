@echo off
REM ============================================================
REM UnforgettableRides - Start Customer Web Portal
REM ============================================================
REM Starts rides-portal (Vite/React) on port 5174
REM ============================================================

echo ============================================================
echo Starting UnforgettableRides Customer Portal...
echo ============================================================
echo.

start "Rides Portal" cmd /k "title UnforgettableRides Portal && cd /d %~dp0rides-portal && npm run dev -- --port 5174"

echo Portal started in a new window.
echo URL: http://localhost:5174
