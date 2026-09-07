# ZeroLegend — integrazione backend Java

La cartella `java-backend/` contiene un server realtime Java puro (JDK 21, zero librerie esterne).

### Cosa implementa
- WebSocket RFC6455 sulla porta `PORT` (default 3000)
- room cap 160 giocatori configurabile
- join + auth token verso `AUTH_VERIFY_URL`
- snapshot JSON nel formato usato da `client.js`
- movimento/target
- SPACE split
- W eject/feed
- Q shoot-virus
- G godmode per account admin/owner
- SHIFT sprint
- dash, blink, heal
- chat
- bot iniziali
- respawn e collisioni base
- `/health`, `/healthz`, `/api/room`, `/api/state`

### PHP/InfinityFree
Il PHP/MySQL resta sull'hosting del sito. Il Java realtime deve stare su un hosting che consenta processi Java e WebSocket. Imposta `API_SECRET` uguale al secret dell'auth PHP.

### Importante
Questo porting Java è il motore realtime stanza/comandi, non una copia 1:1 di tutte le feature avanzate del `game.js` originale. Shop/economy persistenti e le feature PvP avanzate restano da collegare alle API PHP se vuoi la parità completa.
