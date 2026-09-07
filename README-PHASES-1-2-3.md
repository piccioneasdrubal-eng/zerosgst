# ZeroLegend — Piano completamento 1 → 2 → 3

## 1 — PvP 1:1
Completato nel backend Java:
- abilità PvP principali
- duel/arena/spectator
- collisioni e kill server-side
- ELO e punti PvP runtime
- kill streak e killfeed
- parry, stun, slow, knockback
- trap/mine/lifesteal/execute/shieldbreak
- bot movement
- snapshot JSON compatibile con il client

## 2 — Shop/MySQL
Da collegare come fonte persistente:
- wallet Coins
- inventario
- acquisti atomici
- equip skin
- ledger
- ELO/statistiche PvP
- premi match/quest/daily

Il PHP esistente rimane il livello DB/API: il Java non contiene credenziali MySQL e non usa un driver JDBC esterno.

## 3 — Deploy
Da impostare sull'hosting Java:
- `PORT`
- `AUTH_VERIFY_URL`
- `ECONOMY_API_URL`
- `API_SECRET`
- reverse proxy HTTPS/WSS
- endpoint WebSocket automatico nel client
- reconnect/heartbeat
