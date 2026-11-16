@echo off
title Smart Parking - Backend & Dashboard
cd /d "%~dp0"
echo ===================================================
echo Starting FastAPI Backend & Web Server on port 8000...
echo ===================================================
.\.venv\Scripts\python.exe -m uvicorn backend.app.main:app --host 0.0.0.0 --port 8000 --reload
pause
