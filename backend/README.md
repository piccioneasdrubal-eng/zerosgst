# ZeroLegend — WebSocket + Room + Movimento/Comandi

Questa build contiene il backend realtime Node/WebSocket gia' collegato al client.

## Architettura

- InfinityFree: sito, PHP, auth, MySQL, shop.
- Node.js: `server.js`, room multiplayer e simulazione di gioco.
- Browser: `client.js`, input mouse/tastiera e rendering.

InfinityFree non esegue `server.js`: il backend Node deve essere avviato su un PC/VPS/hosting Node.

## Avvio locale

1. Installa Node.js 18+.
2. Apri questa cartella.
3. Copia `.env.example` in `.env`.
4. Imposta `API_SECRET` uguale al secret usato dall'auth PHP.
5. Esegui `npm ci`.
6. Esegui `npm start`.
7. Verifica `http://127.0.0.1:3000/health`.

Per test locale senza login puoi temporaneamente impostare `AUTH_REQUIRED=0`. Per produzione lascialo a `1`.

## Collegamento dal sito

Nel menu di gioco inserisci l'URL pubblico del backend, ad esempio `https://abc123.trycloudflare.com`, e premi **Salva server**. Il client lo converte automaticamente in `wss://...`.

Non inserire il dominio InfinityFree come WebSocket.

## Comandi

- Mouse/touch: movimento
- `W`: eject/feed
- `SPACE`: split
- `Q`: spara virus
- `G`: godmode se autorizzato
- `SHIFT`: sprint

Il server gestisce la room, il limite giocatori, il respawn, il movimento, split/eject/virus e la sincronizzazione dello stato.

## Endpoint di controllo

- `GET /health` — stato backend
- `GET /api/room` — giocatori/capacita' room

## Cloudflare Tunnel

`start-cloudflared.bat` pubblica la porta 3000. Per un URL stabile e' preferibile usare un tunnel Cloudflare nominato con un sottodominio dedicato al backend.
