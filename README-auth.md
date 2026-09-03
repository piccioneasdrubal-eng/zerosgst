# 🔐 Auth API per agar-server (v3)

Backend PHP da caricare su **InfinityFree (gamer.gd)** per gestire login,
registrazione e stato premium degli utenti del gioco.

## Architettura

```
Browser (client.js)          Game server (Render, Node.js)          InfinityFree (gamer.gd, PHP)
     │                                │                                      │
     │ POST /auth.php (login/register)│                                      │
     │──────────────────────────────────────────────────────────────────────▶│  (DB MySQL)
     │  riceve token ───────────────────────────────────────────────────────▶│
     │                                │                                      │
     │ connect WS + token ───────────▶│                                      │
     │                                │ POST /auth.php (verify, X-Api-Secret)│
     │                                │──────────────────────────────────────▶│
     │                                │◀── { premium, user } ────────────────│
     │◀── welcome (premium/admin) ────│                                      │
```

## Installazione

1. **Carica su gamer.gd**: copia `auth.php` e `db-config.php` in una cartella,
   es. `https://zerothelegend.gamer.gd/zero/auth/`.

2. **Crea la tabella**: apri phpMyAdmin → esegui `migrate.sql`
   (crea la tabella `auth_tokens`).

3. **Configura il segreto**: in `db-config.php` imposta `API_SECRET`
   (es. `agar-zero-secret-2026`). Deve combaciare con la variabile `API_SECRET`
   sul server Render.

## Endpoints

| Endpoint | Body | Risposta |
|---|---|---|
| `action=register` | `{ email, password, name }` | `{ ok, token, user, premium }` |
| `action=login` | `{ email, password }` | `{ ok, token, user, premium }` |
| `action=logout` | `{ token }` | `{ ok }` |
| `action=verify` | `{ token }` + header `X-Api-Secret` | `{ ok, user, premium, is_admin }` |

## Regola premium

- **Admin** (`is_admin = 1`) → sempre premium.
- **Utente con licenza attiva** (`licenses.status IN ('trial','active')` e non scaduta) → premium.
- Tutti gli altri → non possono usare i **bot**.

## Configurazione lato server (Render)

Imposta queste variabili d'ambiente:
- `AUTH_API_URL` = `https://zerothelegend.gamer.gd/zero/auth/auth.php`
- `API_SECRET` = lo stesso valore di `db-config.php`
