@echo off
title Smart Parking - MQTT Broker
cd /d "%~dp0"
echo ===================================================
echo Starting Local MQTT Broker on port 1883...
echo ===================================================
.\.venv\Scripts\python.exe backend\scripts\run_broker.py
pause
