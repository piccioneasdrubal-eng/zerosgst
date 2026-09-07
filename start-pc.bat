@echo off
setlocal
cd /d %~dp0

echo ==========================================
echo ZeroLegend - PC Server + Cloudflare
 echo ==========================================
where node >nul 2>nul
if errorlevel 1 (
  echo ERRORE: Node.js non trovato.
  echo Installa Node.js LTS e riapri CMD.
  pause
  exit /b 1
)
where cloudflared >nul 2>nul
if errorlevel 1 (
  echo ERRORE: cloudflared non trovato nel PATH.
  echo Avvia cloudflared manualmente oppure aggiungilo al PATH.
  pause
  exit /b 1
)
if not exist "backend\node_modules\ws" (
  echo Installazione dipendenze Node...
  pushd backend
  call npm install
  if errorlevel 1 (
    popd
    echo ERRORE npm install.
    pause
    exit /b 1
  )
  popd
)

echo Avvio server Node su http://localhost:3000 ...
start "ZeroLegend Node Server" cmd /k "cd /d %~dp0backend && node server.js"
timeout /t 3 /nobreak >nul

echo Avvio Cloudflare Quick Tunnel verso localhost:3000 ...
start "ZeroLegend Cloudflare Tunnel" cmd /k "cloudflared tunnel --url http://localhost:3000"

echo.
echo Server e tunnel avviati in due finestre separate.
echo NON chiudere le due finestre mentre giochi.
echo.
pause
