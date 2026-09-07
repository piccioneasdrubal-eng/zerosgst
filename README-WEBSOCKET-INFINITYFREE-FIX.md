# ZeroLegend — WebSocket fix per InfinityFree

## Perché compariva

Il browser stava tentando:

`wss://zerothelegend.gamer.gd/`

Questo indirizzo è il sito PHP/HTTPS su InfinityFree, non un processo Node.js con un listener WebSocket. Per questo Chrome mostra `WebSocket connection ... failed`.

## Correzione inclusa

Questa build non usa più automaticamente `location.origin` come server WebSocket.

- Se non è configurato un backend realtime, il gioco mostra un messaggio chiaro e non entra in un loop di tentativi.
- Un vecchio URL `onrender.com` salvato nel browser viene rimosso.
- Il campo "Salva server" accetta l'URL del backend Node/WebSocket reale.
- Auth, Shop, Coins e API PHP continuano a usare il sito InfinityFree.

## Architettura consigliata

- `https://zerothelegend.gamer.gd` → InfinityFree: sito + PHP + MySQL + Auth + Shop
- `wss://<backend-websocket>` → macchina/server che esegue `server.js`

Il backend può essere un PC/server sempre acceso, VPS o altro hosting con Node.js/WebSocket. Non è obbligatorio usare Render.

## Avvio del backend

Nella cartella del backend:

```text
npm ci
npm start
```

Il processo ascolta sulla porta configurata da `PORT` (default 3000).

Per pubblicarlo tramite Cloudflare Tunnel è disponibile `start-cloudflared.bat`; dopo l'avvio del tunnel inserisci nel gioco l'URL `https://...trycloudflare.com` ottenuto dal comando.

## Importante

Non inserire `https://zerothelegend.gamer.gd` nel campo server se il dominio continua a essere ospitato solo da InfinityFree. Quel dominio serve le pagine PHP/HTTP, ma non è il listener WebSocket.
