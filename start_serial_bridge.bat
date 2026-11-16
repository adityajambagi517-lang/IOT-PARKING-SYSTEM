@echo off
title PARKPULSE IoT - USB Serial Bridge (COM15 -> MQTT 1883)
cd /d "%~dp0"

echo ======================================================================
echo           PARKPULSE IoT - USB SERIAL TO MQTT BRIDGE                  
echo ======================================================================
echo.
echo Target Serial Port: COM15
echo Baud Rate:          115200
echo MQTT Broker:        localhost:1883
echo.
echo NOTE: If you get 'Access is denied', close the Serial Monitor in Arduino IDE!
echo ======================================================================
echo.

if exist ".\.venv\Scripts\python.exe" (
    .\.venv\Scripts\python.exe backend\scripts\serial_bridge.py --port COM15 --baud 115200
) else (
    python backend\scripts\serial_bridge.py --port COM15 --baud 115200
)

pause
