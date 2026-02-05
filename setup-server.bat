@echo off
echo ========================================
echo CSVStudyApp MongoDB Server Setup
echo ========================================
echo.

echo Installing server dependencies...
cd server
call npm install

echo.
echo ========================================
echo Setup Complete!
echo ========================================
echo.
echo To start the server:
echo   cd server
echo   npm start
echo.
echo Web Dashboard will be available at:
echo   http://localhost:3000
echo.
echo Next steps:
echo 1. Install app dependencies: npm install
echo 2. Update API_URL in utils/SyncService.ts with your IP
echo 3. Run: npm start
echo.
pause
