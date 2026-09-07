# ZeroLegend — Server PC Windows 10 + Cloudflare Quick Tunnel

## Stato del pacchetto

Il client è già configurato per il Quick Tunnel attualmente mostrato nel tuo CMD:

`wss://cheats-rebecca-inexpensive-seasonal.trycloudflare.com`

Il WebSocket usa:

`wss://cheats-rebecca-inexpensive-seasonal.trycloudflare.com`

## Avvio

1. Apri un CMD nella cartella `backend` e lancia `npm install` una sola volta.
2. Avvia `start-pc.bat` dalla cartella principale.
3. Il backend Node ascolta su `0.0.0.0:3000`.
4. Cloudflared pubblica `http://localhost:3000`.

## ATTENZIONE

Il Quick Tunnel è temporaneo. Se chiudi e riapri cloudflared, l'indirizzo `trycloudflare.com` può cambiare. In quel caso bisogna aggiornare `game-config.js` e `auth/ws-config.php` con il nuovo hostname e ricaricare i file sul sito.

Per il test attuale, lascia aperta la finestra Cloudflared.

## InfinityFree

Carica sul sito InfinityFree solo i file web/PHP. Non è necessario eseguire Node.js su InfinityFree.

## Server Node

Il server richiede il secret API uguale a quello PHP: `agar-zero-secret-2026`. Non pubblicare il file `.env` su repository pubblici.
