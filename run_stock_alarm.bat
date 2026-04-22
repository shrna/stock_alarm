@echo off
REM === Stock Alarm — Daily Runner ===
cd /d "%~dp0"

REM Ensure reports directory exists
if not exist reports mkdir reports

REM Sync latest STOCKS.xlsx from OneDrive to repo and push to GitHub
set ONEDRIVE_FILE=%USERPROFILE%\OneDrive\StockAlarm\STOCKS.xlsx
if exist "%ONEDRIVE_FILE%" (
    echo [Sync] Copying latest STOCKS.xlsx from OneDrive...
    copy /Y "%ONEDRIVE_FILE%" STOCKS.xlsx >nul

    REM Push to GitHub so the cloud Action uses the latest file too
    git add STOCKS.xlsx >nul 2>&1
    git diff --cached --quiet STOCKS.xlsx 2>nul
    if errorlevel 1 (
        echo [Sync] Stocks file changed — pushing to GitHub...
        git commit -m "Update STOCKS.xlsx from OneDrive" >nul 2>&1
        git push origin main >nul 2>&1
    )
)

REM Run the stock alarm
echo [%date% %time%] === Starting Stock Alarm === >> reports\run.log
node index.js >> reports\run.log 2>&1
echo [%date% %time%] === Finished (exit code: %errorlevel%) === >> reports\run.log
