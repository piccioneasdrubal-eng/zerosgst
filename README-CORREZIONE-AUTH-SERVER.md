# ZeroLegend — correzione Auth + server multiplayer

## Cosa è stato corretto

- Rimossi automaticamente dal browser i vecchi URL `*.onrender.com` salvati in `localStorage`.
- Il menu non interpreta più una risposta HTTP 200 come un errore HTTP: HTTP 200 viene considerato successo di trasporto e la risposta JSON viene controllata separatamente.
- Se `auth.php` risponde `200` ma `ok:false` o senza `user`, il backend mostra il vero motivo restituito dall'Auth API.
- `API_SECRET` resta esclusivamente lato server e deve essere identico tra `auth/db-config.php` e `.env` del backend Node.

## Configurazione

1. Carica i file PHP nella cartella `auth/` del sito.
2. In `auth/db-config.php` configura database e `API_SECRET`.
3. Nel backend Node imposta lo stesso valore in `.env`:
   `API_SECRET=LO_STESSO_SECRET_DEL_PHP`
4. Imposta `AUTH_VERIFY_URL` sull'URL pubblico di `auth/auth.php`.
5. Il browser deve usare l'URL HTTPS del backend WebSocket; non usare un vecchio `onrender.com` rimasto nel localStorage.

## Nota InfinityFree

InfinityFree può ospitare PHP/MySQL e il sito, ma non esegue un processo Node.js/WebSocket persistente. Per il multiplayer WebSocket serve quindi un runtime Node/WebSocket esterno oppure una soluzione realtime compatibile con l'hosting. Il pacchetto non dipende da Render.
