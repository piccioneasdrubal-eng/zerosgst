# ZeroLegend — Fix registrazione DB

La registrazione usa direttamente la tabella `users` già presente nel database del progetto.

Non usare `localStorage` come database.

## Test

Apri:

`https://zerothelegend.gamer.gd/auth/auth.php?health=1`

Deve mostrare `database: ok` e `table: users`.

## Registrazione

POST JSON a `/auth/auth.php`:

```json
{"action":"register","email":"utente@example.com","name":"Nome","password":"password123"}
```

L'account viene inserito in `users` con:

- username generato automaticamente e univoco
- password hash
- provider = local
- role = user
- level = 1
- xp = 0
- coins = 1000
- skins = ["default"]
- equipped_skin = default

## Perché prima dava "Email già registrata"

Le versioni precedenti interrogavano `zl_users`, mentre il database mostrato nel progetto usa `users`. Questa versione usa prima `users` e confronta l'email normalizzata (`LOWER(TRIM(email))`).
