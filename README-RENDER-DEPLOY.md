# ZeroLegend — Render WebSocket

Backend realtime configurato per:

`wss://ws.zerothelegend.gamer.gd`

## Render

Deploya la cartella principale come Web Service Node.

- Build Command: `npm ci`
- Start Command: `npm start`
- Health Check: `/health`
- Node: 18+ (20 consigliato)

Imposta su Render queste variabili:

- `PORT=3000`
- `HOST=0.0.0.0`
- `AUTH_REQUIRED=1`
- `AUTH_VERIFY_URL=https://zerothelegend.gamer.gd/auth/auth.php`
- `ECONOMY_API_URL=https://zerothelegend.gamer.gd/auth/economy.php`
- `API_SECRET` = lo stesso secret configurato per l'auth PHP
- `ECONOMY_INTERNAL_SECRET` = lo stesso secret usato dall'economy API

## Sito InfinityFree

`game-config.js` usa già:

`wss://ws.zerothelegend.gamer.gd`

Il client lo converte automaticamente in `wss://ws.zerothelegend.gamer.gd` per WebSocket.

Non usare `localhost` nel sito online.
