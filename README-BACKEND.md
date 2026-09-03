# Backend multiplayer ZeroLegend

Questo progetto ora include un backend Node.js/WebSocket reale. Il vecchio indirizzo Render non viene piu usato.

## Avvio locale Windows
1. Installa Node.js 20+.
2. Apri questa cartella.
3. Esegui `start-backend.bat`.
4. Il backend parte su `http://localhost:3000`.
5. Nel browser, apri `http://localhost:3000` oppure inserisci l'URL del backend nel campo Server multiplayer.

## Multiplayer da Internet
Il backend deve essere eseguito su una macchina raggiungibile da Internet. Il tuo hosting PHP/statico non esegue `server.js`.

Sono possibili: VPS Linux/Windows, un PC sempre acceso con port forwarding, oppure un tunnel HTTPS/WSS.

Se il sito principale resta su `zerothelegend.gamer.gd`, nel campo `Server multiplayer` inserisci l'URL pubblico del backend.

## HTTPS/WSS
Se il sito e aperto in HTTPS, il backend pubblico deve essere raggiungibile in WSS/HTTPS; `ws://` da una pagina HTTPS viene bloccato dal browser.

## Porta
Default: 3000. Puoi cambiarla con la variabile `PORT`.

## API utili
- `/healthz`
- `/api/state`
- `/api/leaderboard`
- `/api/season`
- `/api/pvp-leaderboard`
- `/api/metrics`
- `/api/team-scores`
- `/api/match`

## Importante
Il server Node e il browser sono due componenti distinti: il file `server.js` deve essere realmente in esecuzione per avere il multiplayer.
