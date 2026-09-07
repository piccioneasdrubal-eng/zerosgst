# ZeroLegend — PvP Java porting phase 1

Questo pacchetto contiene il motore realtime Java aggiornato per il porting delle meccaniche PvP del motore Node esistente, mantenendo il protocollo JSON usato dal client.

## Comandi PvP supportati

`pvp.action`:
- mark
- hunter
- parry
- stun
- slow
- knockback
- trap
- mine
- lifesteal
- execute
- shieldbreak
- duel
- duelAccept
- duelCancel
- arenaIn
- arenaOut
- spectate

Comandi realtime mantenuti:
- target
- split
- eject
- shoot-virus
- godmode
- sprint
- dash
- blink
- shockwave
- freeze
- decoy
- mass-burst
- heal
- rage
- reveal
- autopilot
- chat
- ping

## PvP server-authoritative

Cooldown, costo massa, target, collisioni, eliminazioni, respawn, ELO/punti PvP, kill streak, stun/slow/parry, trappole e mine vengono valutati dal server Java.

Il client non deve essere modificato per inviare i comandi PvP: il formato rimane:

```json
{"type":"pvp","action":"stun","targetId":"PLAYER_ID","requestId":"..."}
```

## Test effettuati

- compilazione JDK 21 senza dipendenze esterne
- avvio del JAR
- `/health` risponde JSON
- handshake WebSocket RFC6455
- `join` riceve `welcome`
- snapshot `state` contiene i campi PvP
- room cap continua a rispondere con `room-full`

## Nota

Questa è la fase 1. La persistenza di ELO/statistiche nel MySQL e la sincronizzazione completa Shop/Economy sono la fase 2; il deploy WSS e l'URL automatico del client sono la fase 3.
