# Deploy rapido

## Render

1. Carica il progetto su GitHub.
2. Crea un Web Service Render oppure usa `render.yaml`.
3. Il progetto usa `npm ci --omit=dev` e `npm start`.
4. Verifica `https://TUO-SERVER.onrender.com/healthz` e `https://TUO-SERVER.onrender.com/api/state`.

## Sito statico / InfinityFree

Carica nella stessa cartella:

- `index.html`
- `client.js`
- `style.css`
- `.htaccess`

Non caricare `server.js`, `game.js`, `package.json` o `node_modules` sul normale spazio PHP/statico.

## Cache

L'HTML/CSS/JS del server Node usa `Cache-Control: no-cache`, così le correzioni del client non restano bloccate dalla vecchia cache del browser durante il debug.
