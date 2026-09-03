# WebSocket / Room Full Fix

Questa versione corregge due cause frequenti del messaggio Chrome `WebSocket is closed before the connection is established` quando la room e' piena:

1. Il server non chiude piu' subito la connessione senza una risposta applicativa. Dopo l'handshake, se non ci sono slot, invia `room-full` e chiude in modo controllato.
2. Il client non tenta connessioni multiple mentre una connessione e' gia' in corso e non entra in un loop infinito quando la room e' piena.
3. Le riconnessioni dopo un problema reale usano un backoff limitato (massimo 5 tentativi).
4. I bot sono limitati al 35% della capacita' della room, lasciando spazio ai giocatori umani.
5. Il game tick e la generazione snapshot sono protetti da `try/catch` per impedire che un errore di un singolo tick abbatta il processo WebSocket.

## Render

- Runtime Node: 20 (gia' configurato in `render.yaml`).
- Build: `npm ci --omit=dev`
- Start: `npm start`
- Health: `/healthz`

Dopo il deploy controllare i log di Render. Deve comparire qualcosa come:

`agar-server listening on 0.0.0.0:PORT; bots=12`

Se il client mostra `Room piena (N/160)`, il server e' raggiungibile e la protezione sta funzionando.
