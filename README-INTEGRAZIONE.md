# Integrazione sito + backend + auth

1. Carica la cartella `website/` sul tuo hosting PHP.
2. Configura `website/auth/db-config.php` con database e `API_SECRET`.
3. Esegui `website/auth/migrate.sql`.
4. Avvia il backend Node.
5. Sul backend imposta `AUTH_VERIFY_URL` all'URL di `auth/auth.php` e imposta lo stesso `API_SECRET`.
6. In `website/game-config.js` imposta `GAME_SERVER_URL` con l'hostname HTTPS del backend.

Il token auth viene inviato al WebSocket solo dopo login/registrazione e viene verificato server-side prima del join.
