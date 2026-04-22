@echo off
REM === Stock Alarm — Daily Runner ===
cd /d "%~dp0"
node index.js >> reports\run.log 2>&1
