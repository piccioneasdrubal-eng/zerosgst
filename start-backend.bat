@echo off
setlocal
cd /d "%~dp0"
echo ==============================================
echo ZeroLegend Multiplayer Backend
 echo Porta: 3000
 echo ==============================================
where node >nul 2>nul
if errorlevel 1 (
  echo [ERRORE] Node.js non installato.
  echo Installa Node.js 20+ e poi riesegui questo file.
  pause
  exit /b 1
)
if not exist node_modules\ws\package.json (
  echo Installazione dipendenza ws...
  call npm install
  if errorlevel 1 (
    echo [ERRORE] npm install fallito.
    pause
    exit /b 1
  )
)
set PORT=3000
set HOST=0.0.0.0
node server.js
pause
