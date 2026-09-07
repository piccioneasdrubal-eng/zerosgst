# ZeroLegend Java PvP WebSocket backend

Backend realtime **Java puro, JDK 21, zero dipendenze esterne**. Implementa un listener HTTP/WebSocket RFC6455, room cap, autenticazione via `AUTH_VERIFY_URL`, movimento, target, split, eject/W, virus/Q, godmode/G admin, sprint, dash/blink/heal, chat, bot e snapshot JSON compatibili con il client ZeroLegend.

## Avvio

```bash
java -cp classes zerolegend.ZeroLegendServer
```

Variabili principali:

- `PORT=3000`
- `AUTH_REQUIRED=1`
- `AUTH_VERIFY_URL=https://zerothelegend.gamer.gd/auth/auth.php`
- `API_SECRET=<stesso secret del PHP>`
- `INITIAL_BOTS=8`
- `MAX_PLAYERS=160`

## Endpoint

- `GET /health`
- `GET /healthz`
- `GET /api/room`
- `GET /api/state`
- WebSocket sulla stessa porta, path `/`

## Note

InfinityFree continua a ospitare PHP/MySQL/auth/shop. Questo processo Java deve essere eseguito su un hosting/VPS che permetta processi Java e WebSocket. Il dominio pubblico del Java backend va poi impostato come `GAME_SERVER_URL` nel client.
