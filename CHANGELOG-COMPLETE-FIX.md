# ZeroLegend Complete Fix — 2026-09-04

## Auth / login
- Preserva il portale dopo registrazione e richiede il login.
- Mantiene il token `zl_auth_token` e aggiorna il profilo con `/auth/auth.php`.
- Distingue correttamente HTTP 200 da `ok:false`: non mostra più il fuorviante `Auth HTTP 200` come se fosse un errore HTTP.
- Il WebSocket verifica il token server-side con lo stesso `API_SECRET` del PHP.

## Game / WebSocket
- Se `public/` non esiste, `server.js` serve i file dalla root del pacchetto.
- Se non viene configurato un server nel menu, il client usa l'origine della pagina come fallback.
- Room full, autenticazione rifiutata e timeout producono stati distinti.
- Restano attivi i fix di W/feed, pellet visibili, room piena e heartbeat.

## Shop / Coins
- Shop e wallet usano il token autenticato direttamente su `auth/economy.php`.
- Gli acquisti vengono eseguiti in transazione e scalano i coins dal database.
- Inventario/equipaggiamento sono persistenti.

## Ruoli
- `owner` e `admin`: accesso alle funzioni Admin protette.
- `mod`: resta un ruolo distinto e non riceve automaticamente privilegi admin.
- `vip`: viene gestito come stato premium separato, non come sostituto del ruolo admin.
- `user`: accesso standard.

## Test eseguiti
- PHP syntax check: OK su tutti i PHP del pacchetto.
- Node syntax check: OK su server/client/auth/user-menu.
- `npm test`: GAME TEST OK + ABILITY SMOKE TEST OK + 90 FEATURE TEST OK.

## Nota hosting
InfinityFree supporta PHP/MySQL ma non mantiene processi Node.js/WebSocket persistenti. Per il multiplayer WebSocket il `server.js` deve girare su un ambiente che supporta Node 18+ e deve essere raggiungibile dal browser. Il sito/auth/shop possono rimanere su InfinityFree.

## Complete Auth/Server hotfix — 2026-09-04
- Eliminata la persistenza automatica di vecchi URL Render (`onrender.com`) nel client.
- Diagnostica Auth HTTP migliorata: HTTP 200 non viene più riportato come errore HTTP; viene analizzato il JSON `ok/user`.
- Risposte auth non JSON e codici HTTP non 2xx vengono riportati distintamente.
