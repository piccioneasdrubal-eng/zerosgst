@echo off
setlocal
cd /d %~dp0
where node >nul 2>nul
if errorlevel 1 (
  echo ERRORE: Node.js non trovato. Installa Node.js 18+.
  pause
  exit /b 1
)
if not exist node_modules\ws\package.json (
  echo Installazione dipendenze...
  call npm ci
  if errorlevel 1 (
    echo npm ci fallito, provo npm install...
    call npm install
    if errorlevel 1 pause & exit /b 1
  )
)
if exist .env (
  for /f "usebackq tokens=1,* delims==" %%A in (".env") do if not "%%A"=="" set "%%A=%%B"
)
if not defined PORT set PORT=3000
if not defined HOST set HOST=0.0.0.0
if not defined AUTH_REQUIRED set AUTH_REQUIRED=1
if not defined AUTH_VERIFY_URL set AUTH_VERIFY_URL=https://zerothelegend.gamer.gd/auth/auth.php
if not defined API_SECRET (
  echo ERRORE: API_SECRET mancante.
  pause
  exit /b 1
)
echo.
echo ===== ZeroLegend Backend =====
echo HTTP/WSS backend: %HOST%:%PORT%
echo Auth API: %AUTH_VERIFY_URL%
echo Premi CTRL+C per fermare il server.
echo.
node server.js
pause
