# ZeroLegend / agar-server

Gioco multiplayer .io-like con Node.js, WebSocket (`ws`), Canvas e bot IA.
Questa versione è stata ripulita per evitare crash client, spam WebSocket e crescita infinita dei pellet.

## Avvio locale

```bash
npm ci
npm start
```

Apri `http://localhost:3000/`.

## Test automatico

```bash
npm test
```

Il test esercita il motore con molti bot, split/feed e snapshot. Prima del deploy il codice viene anche controllato con `node --check`.

## Deploy Render

Il server HTTP e WebSocket viene avviato da `server.js` sulla porta `PORT` fornita da Render. L'health check è `/healthz`.

Impostazioni consigliate:

- Build: `npm ci --omit=dev`
- Start: `npm start`
- Node: 20
- `INITIAL_BOTS`: 12

## Frontend sul sito gamer.gd

Puoi usare gli stessi file presenti nella root oppure dentro `public/`:

- `index.html`
- `client.js`
- `style.css`
- `.htaccess` su hosting Apache/InfinityFree

`client.js` usa di default `https://agar-server-bruo.onrender.com`; puoi sovrascriverlo con `?server=https://tuo-server.example`.

## Controlli

Mouse/pointer = movimento · Spazio = split · W = feed · Q = virus · Shift = sprint · Invio = chat.

## Limiti e stabilità

Il server limita i bot, il numero di giocatori, la dimensione dei messaggi e la frequenza dei target/chat. I pellet hanno un tetto massimo e la classifica stagionale viene salvata in modo differito per non bloccare il game loop con scritture su disco ad ogni kill.
