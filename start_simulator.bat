@echo off
title Smart Parking - Hardware Simulator
cd /d "%~dp0"

echo ======================================================================
echo           PARKPULSE IoT - PARKING SENSOR SIMULATOR                   
echo ======================================================================
echo.
echo Connecting to MQTT broker at localhost:1883...
echo Generating realistic vehicle arrival and departure events across 4 bays...
echo.

if exist ".\.venv\Scripts\python.exe" (
    .\.venv\Scripts\python.exe simulator\simulate.py --broker localhost --port 1883
) else (
    python simulator\simulate.py --broker localhost --port 1883
)

if %errorlevel% neq 0 (
    echo [ERROR] Simulator exited with error code %errorlevel%.
    echo Make sure the MQTT Broker is running first (via start_demo.bat or start_broker.bat).
)
pause
