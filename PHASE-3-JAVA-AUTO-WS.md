# ZeroLegend — Fase 3: Java + WebSocket automatico

## Architettura
- `zerothelegend.gamer.gd` -> InfinityFree (PHP/MySQL/auth/shop)
- `ws.zerothelegend.gamer.gd` -> server Java JDK 21
- Caddy -> HTTPS/WSS automatico e reverse proxy verso `127.0.0.1:3000`
- `/auth/ws-config.php` -> restituisce automaticamente l'URL WSS al client

L'utente non deve più inserire manualmente il server.

## Deploy Java
1. Copiare `java-backend/zerolegend-java.jar` sul server Java.
2. Impostare `API_SECRET` uguale al secret usato dal PHP.
3. Avviare con `java -jar zerolegend-java.jar` oppure usare Docker.
4. Aprire la porta locale 3000 al reverse proxy, non necessariamente pubblicarla direttamente.
5. Configurare il DNS `ws.zerothelegend.gamer.gd` verso l'IP pubblico del server Java.
6. Installare Caddy e usare `java-backend/Caddyfile`.
7. Caricare `auth/ws-config.php` e `game-config.js` sul sito InfinityFree.

## Verifica
- `https://ws.zerothelegend.gamer.gd/health`
- `https://ws.zerothelegend.gamer.gd/healthz`
- `https://zerothelegend.gamer.gd/auth/ws-config.php`

Il secondo endpoint deve rispondere con JSON `ok:true`; il client usa automaticamente `wsUrl`.
