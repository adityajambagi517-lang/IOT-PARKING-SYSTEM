@echo off
title Smart Parking - Quick Demo Launcher
cd /d "%~dp0"
echo =========================================================
echo       SMART PARKING IoT SYSTEM - DEMO LAUNCHER           
echo =========================================================
echo.
echo [1/3] Launching MQTT Broker window...
start "Smart Parking - MQTT Broker" cmd /k ".\start_broker.bat"

echo [2/3] Waiting 2 seconds for broker to initialize...
timeout /t 2 /nobreak >nul

echo [3/3] Launching FastAPI Backend window...
start "Smart Parking - Backend" cmd /k ".\start_backend.bat"

echo.
echo Waiting 3 seconds for server to start, then opening browser...
timeout /t 3 /nobreak >nul

start http://localhost:8000

echo =========================================================
echo Dashboard is now running at: http://localhost:8000
echo Both the MQTT Broker and Backend are open in their own windows.
echo =========================================================
pause
