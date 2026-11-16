@echo off
title Smart Parking - Hardware Simulator
cd /d "%~dp0"
echo ===================================================
echo Starting Parking Simulator (Slot telemetry generator)...
echo ===================================================
.\.venv\Scripts\python.exe simulator\simulate.py --broker localhost --port 1883
pause
