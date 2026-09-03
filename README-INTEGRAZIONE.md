# agar-server v3 — Integrazione login + bot premium + audio

## Cosa c'è di nuovo (v3)
1. **Login/Registrazione** tramite DB InfinityFree (backend PHP in `auth/`).
2. **Bot controllati** riservati a utenti **Premium** e **Admin** (farmin, follow, split, feed).
3. **Key bind personalizzabili** con auto-salvataggio (localStorage).
4. **Effetti sonori + musica di sottofondo** (Web Audio API) + upload file custom.

## Deploy in 2 parti

### Parte A — Auth backend su InfinityFree (gamer.gd)
1. Carica i file in `auth/` nella cartella `zero/auth/` del tuo sito (es. `https://zerothelegend.gamer.gd/zero/auth/`).
2. In phpMyAdmin esegui `auth/migrate.sql` (crea la tabella `auth_tokens`).
3. Modifica `auth/db-config.php` se le credenziali DB sono cambiate.

### Parte B — Game server su Render
1. Carica tutto il resto sul repo Git (game.js, server.js, public/, package.json, render.yaml).
2. Su Render imposta le env var:
   - `AUTH_API_URL` = `https://zerothelegend.gamer.gd/zero/auth/auth.php`
   - `API_SECRET` = `agar-zero-secret-2026` (uguale a db-config.php)

> Se non configuri `AUTH_API_URL`, il gioco funziona ma i bot restano bloccati per tutti.

## Come diventare Premium / Admin
- **Admin**: esegui `UPDATE users SET is_admin = 1 WHERE email = '...';`
- **Premium**: serve una licenza attiva in tabella `licenses` (i nuovi utenti hanno 7 giorni di trial).

## Key bind di default
- Spazio = split · W = feed · Q = virus · Shift = sprint
- J = spawn bot · F = farmin · G = follow · R = split bot · T = feed bot
