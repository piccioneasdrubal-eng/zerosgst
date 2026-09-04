# ZeroLegend Portal — setup

Carica tutti i file nella root `htdocs` del dominio.

1. Importa `auth/migrate.sql` in phpMyAdmin.
2. Verifica `https://TUODOMINIO/auth/auth.php?health=1`.
3. Verifica `https://TUODOMINIO/portal-api.php?action=health`.
4. Registrati dalla pagina `/`.
5. Shop, Coins e profilo usano MySQL tramite `auth/db-config.php`.

`game.html` è il gioco ZeroLegend esistente. I mini-giochi in `games/` sono client-side e non richiedono backend.
