# ZeroLegend — Fase 2: Shop + MySQL sincronizzati

La fase 2 rende MySQL la fonte persistente per:

- ZeroCoins e skin equipaggiata: il Java realtime legge `auth/economy.php` all'ingresso e dopo le operazioni shop.
- Acquisti/equip/unequip: passano dall'API PHP transazionale e non restano solo in RAM.
- Statistiche PvP: Java carica `zl_player_stats` al login e sincronizza kills, deaths, matches, best mass, ELO e kill streak.
- Admin `setCoins`: il comando Java usa `auth.php?action=admin_set_coins`; PHP verifica realmente il ruolo `admin`/`owner` e salva anche il movimento nel ledger.

## Configurazione Java

Impostare:

- `AUTH_VERIFY_URL=https://zerothelegend.gamer.gd/auth/auth.php`
- `ECONOMY_API_URL=https://zerothelegend.gamer.gd/auth/economy.php`
- `API_SECRET=<stesso API_SECRET del PHP>`
- `AUTH_REQUIRED=1`

Non mettere `API_SECRET` nel client/browser.

## MySQL

`auth.php` crea automaticamente `zl_player_stats`. È presente anche `auth/pvp-sync.sql` per riferimento/import manuale.
