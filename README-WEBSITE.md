# Pubblicare il gioco su zerothelegend.gamer.gd

Il backend multiplayer è già online su:
https://agar-server-bruo.onrender.com

## 1. Frontend
Carica nella cartella pubblica del tuo sito questi 3 file:
- `index.html`
- `client.js`
- `style.css`

Usa i file nella cartella `public/` di questo progetto.

Puoi metterli nella root del dominio oppure in una sottocartella, per esempio `/agar/`.

## 2. Collegamento al server
`client.js` è già configurato con:
`https://agar-server-bruo.onrender.com`

Il browser userà automaticamente WebSocket sicuro (`wss://agar-server-bruo.onrender.com`).

## 3. URL finale
Se carichi i file nella root:
`https://zerothelegend.gamer.gd/`

Se li carichi in `/agar/`:
`https://zerothelegend.gamer.gd/agar/`

Non devi caricare `server.js` sul normale spazio web: il backend gira già su Render.

## 4. Test
Apri il sito, inserisci un nickname e premi Play. Il gioco deve collegarsi al server Render e mostrare i bot/giocatori.

Se il browser mostra un errore WebSocket, controlla che il servizio Render sia attivo e che l'URL sia esattamente `https://agar-server-bruo.onrender.com`.
