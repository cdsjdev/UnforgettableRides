@echo off
setlocal enabledelayedexpansion
cd /d "%~dp0"

echo ========================================
echo UnforgettableRides Project Setup
echo ========================================
echo.

REM ---- Step 1: API ----
echo [1/4] Setting up API...
cd /d "%~dp0rides-api"
if not exist ".env" (
    echo Creating .env file...
    copy .env.example .env
)
echo Installing API dependencies...
call npm install
if %errorlevel% neq 0 (
    echo ERROR: API installation failed!
    exit /b 1
)
echo API setup complete!
echo.

REM ---- Step 2: Mobile App ----
echo [2/4] Setting up Mobile App...
cd /d "%~dp0rides-app"
if not exist ".env" (
    echo Creating .env file...
    copy .env.example .env
)
echo Installing App dependencies...
call npm install
if %errorlevel% neq 0 (
    echo ERROR: App installation failed!
    exit /b 1
)
echo App setup complete!
echo.

REM ---- Step 3: Python venv ----
echo [3/4] Setting up Python virtual environment...
cd /d "%~dp0"

set VENV_OK=1

REM Check if venv exists
if not exist "venv\Scripts\python.exe" (
    echo No venv found.
    set VENV_OK=0
)

REM Check if venv path matches current location (detects moved projects)
if !VENV_OK!==1 (
    findstr /C:"%~dp0venv" "venv\pyvenv.cfg" >nul 2>&1
    if errorlevel 1 (
        echo Venv was created for a different path - needs recreation.
        set VENV_OK=0
    )
)

REM Check if venv python actually runs
if !VENV_OK!==1 (
    "venv\Scripts\python.exe" -c "import sys; sys.exit(0)" >nul 2>&1
    if errorlevel 1 (
        echo Venv python is broken - needs recreation.
        set VENV_OK=0
    )
)

if !VENV_OK!==0 (
    echo Removing old venv...
    if exist "venv" rmdir /s /q "venv"

    echo Creating new venv...
    python -m venv venv
    if %errorlevel% neq 0 (
        echo ERROR: Failed to create virtual environment!
        echo Make sure Python 3.11.x is installed.
        exit /b 1
    )
    echo Venv created successfully.
) else (
    echo Venv OK.
)
echo.

REM ---- Step 4: ML dependencies ----
echo [4/4] Installing ML dependencies...
cd /d "%~dp0"
call venv\Scripts\activate.bat

REM Check if key packages are already installed
python -c "import torch, transformers, fastapi" >nul 2>&1
if %errorlevel%==0 (
    echo ML packages already installed.
    goto :ml_done
)

echo Installing ML packages (this may take a few minutes)...

REM Detect CUDA availability
nvidia-smi >nul 2>&1
if %errorlevel%==0 (
    echo Detected NVIDIA GPU - installing GPU profile...
    pip install -r ml-models\requirements-gpu.txt
) else (
    echo No NVIDIA GPU detected - installing CPU profile...
    pip install -r ml-models\requirements-cpu.txt
)

if %errorlevel% neq 0 (
    echo ERROR: ML dependency installation failed!
    exit /b 1
)

:ml_done
echo ML setup complete!
echo.

echo ========================================
echo Setup Complete!
echo ========================================
echo.
echo Next steps:
echo   Run start_all.bat to start all services
echo   Or run start_backends.bat for ML + API only
echo ========================================

cd /d "%~dp0"
endlocal
pause
