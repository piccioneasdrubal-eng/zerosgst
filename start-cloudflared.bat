@echo off
setlocal
cd /d %~dp0
where cloudflared >nul 2>nul
if errorlevel 1 (
  echo ERRORE: cloudflared.exe non trovato nel PATH.
  echo Scaricalo da https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/
  pause
  exit /b 1
)
echo Pubblico http://localhost:3000 con Cloudflare Quick Tunnel...
cloudflared tunnel --url http://localhost:3000
pause
