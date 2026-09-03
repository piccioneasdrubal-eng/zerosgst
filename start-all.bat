@echo off
REM ============================================================
REM  Avvia agar-server (Node.js) + tunnel Cloudflare in un colpo solo
REM ============================================================
set CLOUDFLARED=C:\Tools\cloudflared\cloudflared.exe
set GAME_PORT=3000

echo ============================================================
echo   Avvio agar-server su porta %GAME_PORT%
echo ============================================================

REM Avvia il server in una nuova finestra
start "agar-server" cmd /k "node server.js"

REM Piccola attesa per far partire il server
timeout /t 2 /nobreak >nul

if not exist "%CLOUDFLARED%" (
  echo.
  echo [AVVISO] cloudflared.exe non trovato in %CLOUDFLARED%
  echo Scaricalo da: https://github.com/cloudflare/cloudflared/releases/latest
  echo Il server e' comunque avviato in locale su http://localhost:%GAME_PORT%
  pause
  exit /b 0
)

echo.
echo Avvio il tunnel Cloudflare nella stessa finestra...
echo (l'URL pubblico comparira' qui sotto)
echo.
"%CLOUDFLARED%" tunnel --url http://localhost:%GAME_PORT%

pause
