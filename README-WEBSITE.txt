ZEROLEGEND WEBSITE

1) Carica tutto il contenuto della cartella website/ nella root pubblica del sito PHP/InfinityFree.
2) Modifica auth/db-config.php con i dati MySQL e API_SECRET.
3) Esegui auth/migrate.sql in phpMyAdmin.
4) In game-config.js imposta GAME_SERVER_URL con l'URL pubblico del backend Node.
5) Verifica: https://TUODOMINIO/auth/auth.php?health=1

Non inserire API_SECRET in game-config.js.
