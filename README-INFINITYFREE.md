# ZeroLegend InfinityFree Edition

Questa build usa **PHP + MySQL + polling HTTP**: non usa Node.js, Render o WebSocket.

## Upload FTP
Carica tutto il contenuto di `website/` direttamente nella root `htdocs/`.

## Database
1. Controlla `website/auth/db-config.php`.
2. Importa `website/auth/migrate.sql` in phpMyAdmin.
3. Importa `website/game/migrate.sql` in phpMyAdmin.

`game.php` può anche creare le tabelle automaticamente al primo accesso, ma l'import manuale è consigliato.

## Test
Apri:
- `/auth/auth.php?health=1`
- `/game/game.php?action=health`
- `/healthz`

## Nota tecnica
Sul piano gratuito InfinityFree non viene eseguito un processo Node.js/WebSocket. Questa versione usa PHP/MySQL sullo stesso hosting. Per questo il multiplayer è volutamente a bassa frequenza (polling) e il limite room è 24 giocatori per evitare di sovraccaricare l'hosting.
