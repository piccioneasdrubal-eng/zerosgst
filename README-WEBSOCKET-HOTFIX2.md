# ZeroLegend WebSocket Hotfix 2

Correzione del loop `WebSocket connection to wss://zerothelegend.gamer.gd/ failed`.

## Cosa e' stato corretto
- Il dominio InfinityFree `zerothelegend.gamer.gd` non viene mai piu' accettato come backend WebSocket.
- Un vecchio `gameServerUrl` uguale all'origine del sito viene cancellato automaticamente.
- Cache-buster aggiornato a `client.js?v=20260904-ws-hotfix2`.
- `ALLOW_SAME_ORIGIN_WS` e' forzato a `false`.
- Se non e' configurato un backend Node/WebSocket reale, premendo Gioca non viene creato alcun WebSocket: compare invece un messaggio esplicito nel menu.

## Configurazione
Nel campo Server inserire l'URL del server Node che esegue `server.js`, ad esempio un proprio dominio/VPS o tunnel Cloudflare.

Non inserire `https://zerothelegend.gamer.gd/`.
