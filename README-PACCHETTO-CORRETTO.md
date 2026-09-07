# ZeroLegend — pacchetto corretto completo

## Correzioni incluse
- Auth: HTTP 200 con `ok:false` non viene più trattato come un generico errore HTTP; viene mostrato il vero motivo restituito da `auth.php`.
- WebSocket: verifica token più robusta e messaggi di errore espliciti.
- Il server Node può servire direttamente i file dalla root del pacchetto se la cartella `public/` non esiste.
- Se `GAME_SERVER_URL` è vuoto, il client usa automaticamente l'origine della pagina. Se il backend Node è davanti allo stesso dominio/proxy, `Gioca` non richiede più l'inserimento manuale del server.
- Health check del menu usa lo stesso fallback.
- Shop/coins continuano a usare il token firmato e il database MySQL.
- Admin/owner continuano a essere autorizzati server-side.
- Sono stati mantenuti i test delle 100 funzioni e le modifiche W/feed già presenti.

## Importante per InfinityFree
InfinityFree può ospitare PHP/MySQL ma non esegue un processo Node.js/WebSocket persistente. Il backend `server.js` di questo pacchetto richiede quindi un ambiente che possa eseguire Node 18+ (VPS, PC/server sempre acceso, oppure un servizio compatibile). Il sito PHP/auth/shop può invece restare su InfinityFree.

Non mettere `API_SECRET` dentro file JavaScript pubblici.
`API_SECRET` deve essere identico tra `auth/db-config.php` e l'ambiente del backend Node.
