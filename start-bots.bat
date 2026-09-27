@echo off
title OmarBot + KennyBot
cd /d "C:\Repos\omar-bot"
if errorlevel 1 (
  echo Fant ikke prosjektmappen C:\Repos\omar-bot
  pause
  exit /b 1
)
echo Starter botene... (la dette vinduet staa aapent)
echo.
npm start
echo.
echo Botene er stoppet. Trykk en tast for aa lukke.
pause >nul
