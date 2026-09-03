@echo off
REM ============================================================
REM  Avvia il tunnel Cloudflare per esporre l'agar-server online
REM ============================================================
REM  Prerequisiti:
REM   1) cloudflared.exe scaricato da https://github.com/cloudflare/cloudflared/releases
REM      rinominato e messo in C:\Tools\cloudflared\cloudflared.exe
REM   2) agar-server in esecuzione con:  node server.js
REM      (porta default 3000, oppure imposta PORT=80 se preferisci)
REM ============================================================

set CLOUDFLARED=C:\Tools\cloudflared\cloudflared.exe

REM Porta su cui gira il tuo agar-server (3000 e' il default di game.js)
set GAME_PORT=3000

if not exist "%CLOUDFLARED%" (
  echo [ERRORE] cloudflared.exe non trovato in %CLOUDFLARED%
  echo Scaricalo da: https://github.com/cloudflare/cloudflared/releases/latest
  echo (file: cloudflared-windows-amd64.exe -> rinomina in cloudflared.exe)
  pause
  exit /b 1
)

echo Avvio tunnel verso http://localhost:%GAME_PORT% ...
echo.
echo Quando vedi l'URL  https://xxxx.trycloudflare.com
echo condividilo con gli amici e aprilo nel browser:
echo    https://xxxx.trycloudflare.com
echo.
echo Per puntare il gioco a un server diverso via query string:
echo    https://xxxx.trycloudflare.com/?server=https://xxxx.trycloudflare.com
echo.
echo Premi Ctrl+C per fermare.
echo.

"%CLOUDFLARED%" tunnel --url http://localhost:%GAME_PORT%

pause
