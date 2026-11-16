@echo off
setlocal enabledelayedexpansion
title Smart Parking IoT - Demo Launcher
cd /d "%~dp0"

echo ======================================================================
echo           PARKPULSE IoT - SMART PARKING SYSTEM LAUNCHER               
echo ======================================================================
echo.

:: 1. Check Python virtual environment
echo [1/5] Checking Python Virtual Environment...
if not exist ".\.venv\Scripts\python.exe" (
    echo Virtual environment not found. Attempting to create .venv...
    where python >nul 2>&1
    if %errorlevel% neq 0 (
        echo [ERROR] Python is not installed or not in PATH! Please install Python 3.10+.
        pause
        exit /b 1
    )
    python -m venv .venv --system-site-packages
    if not exist ".\.venv\Scripts\python.exe" (
        echo [ERROR] Failed to create virtual environment!
        pause
        exit /b 1
    )
    echo Installing backend dependencies...
    .\.venv\Scripts\python.exe -m pip install -r backend\requirements.txt
)
echo Python environment verified.
echo.

:: 2. Check React Frontend Production Build
echo [2/5] Checking React Dashboard Production Build...
if not exist ".\frontend\dist\index.html" (
    echo Building React Dashboard...
    where npm >nul 2>&1
    if %errorlevel% neq 0 (
        echo [ERROR] npm is not found! Please install Node.js to build the frontend.
        pause
        exit /b 1
    )
    pushd frontend
    call npm install
    call npm run build
    popd
)
if exist ".\frontend\dist\index.html" (
    echo React production build verified (frontend\dist\index.html).
) else (
    echo [WARNING] frontend\dist\index.html missing. Falling back to development/static.
)
echo.

:: 3. Check Docker or Launch Standalone MQTT Broker
echo [3/5] Checking MQTT Broker...
set DOCKER_AVAILABLE=0
where docker >nul 2>&1
if %errorlevel% equ 0 (
    docker info >nul 2>&1
    if %errorlevel% equ 0 (
        set DOCKER_AVAILABLE=1
    )
)

if "!DOCKER_AVAILABLE!"=="1" (
    echo Docker detected. Starting Mosquitto MQTT container...
    docker compose up -d mosquitto
    if %errorlevel% equ 0 (
        echo Mosquitto MQTT running via Docker on port 1883.
    ) else (
        echo Docker compose failed. Falling back to built-in async MQTT broker...
        start "Smart Parking - MQTT Broker (amqtt)" cmd /k "cd /d \"%~dp0\" && .\.venv\Scripts\python.exe backend\scripts\run_broker.py"
    )
) else (
    echo Docker not running. Starting high-performance built-in MQTT broker on port 1883...
    start "Smart Parking - MQTT Broker (amqtt)" cmd /k "cd /d \"%~dp0\" && .\.venv\Scripts\python.exe backend\scripts\run_broker.py"
)
echo.

:: 4. Start FastAPI Backend & Web Server
echo [4/5] Launching FastAPI Backend on http://0.0.0.0:8000 ...
timeout /t 2 /nobreak >nul
start "Smart Parking - FastAPI Backend" cmd /k "cd /d \"%~dp0\" && .\.venv\Scripts\python.exe -m uvicorn backend.app.main:app --host 0.0.0.0 --port 8000 --reload"
echo.

:: 5. Open Web Browser
echo [5/5] Waiting for server initialization...
timeout /t 3 /nobreak >nul
echo Opening Dashboard at http://localhost:8000 ...
start http://localhost:8000

echo.
echo ======================================================================
echo SYSTEM IS LIVE!
echo - Web Dashboard:  http://localhost:8000
echo - Swagger API:    http://localhost:8000/docs
echo - MQTT Broker:    Port 1883 (TCP)
echo.
echo TIP: If ESP32 is not yet connected to Wi-Fi, run 'start_simulator.bat'
echo to inject live car parking simulation events.
echo ======================================================================
pause
