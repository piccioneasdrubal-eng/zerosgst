# Zero And Yassine Evolution — Setup account & login social

## 1. Registrazione/login classico
Funziona già, senza configurazione: username + password, salvati in
`data/users.json` sul server (creato automaticamente al primo avvio).

## 2. Login con i 5 social
Ogni pulsante (Google, Facebook, Apple, Discord, X) è già collegato al
server (`/auth/<provider>`), ma **ogni piattaforma richiede che tu crei
un'app sul suo pannello sviluppatori** per ottenere Client ID e Client
Secret — sono legati al tuo account/dominio, quindi non posso generarli
per te. Una volta ottenuti, avvia il server con queste variabili
d'ambiente (esempio Linux/Mac):

```bash
export SITE_URL="https://tuodominio.com"       # URL pubblico del tuo server
export GOOGLE_CLIENT_ID="..."
export GOOGLE_CLIENT_SECRET="..."
export FACEBOOK_CLIENT_ID="..."
export FACEBOOK_CLIENT_SECRET="..."
export DISCORD_CLIENT_ID="..."
export DISCORD_CLIENT_SECRET="..."
export TWITTER_CLIENT_ID="..."
export TWITTER_CLIENT_SECRET="..."
node server.js
```

Dove registrare l'app per ciascun provider:
- Google: console.cloud.google.com → "Credenziali OAuth 2.0"
- Facebook: developers.facebook.com → "I miei prodotti > Facebook Login"
- Discord: discord.com/developers/applications
- X (Twitter): developer.twitter.com → app con OAuth 2.0 abilitato

In ognuno, imposta come **Redirect URI**:
`https://tuodominio.com/auth/<provider>/callback`
(es. `https://tuodominio.com/auth/google/callback`)

Finché una chiave non è impostata, il relativo pulsante mostra un
messaggio di errore invece di rompersi silenziosamente.

### Apple Sign In (caso a parte)
Apple non usa il flusso OAuth standard: richiede un `client_secret`
firmato come JWT con una chiave privata `.p8` del tuo account Apple
Developer, e la risposta arriva via POST invece che redirect GET.
La struttura è pronta in `server.js` (`handleAppleAuthStart`) ma va
completata con la firma del JWT quando avrai le tue credenziali
(APPLE_TEAM_ID, APPLE_KEY_ID, APPLE_CLIENT_ID, APPLE_PRIVATE_KEY).

## 3. Skin GIF (una ogni 10 livelli, fino al livello 1000)
Il sistema di sblocco/inventario/equip è già completo e funzionante.
Per mostrare le vere immagini animate, crea la cartella
`public/skins/` e inserisci i file:

```
public/skins/skin_10.gif
public/skins/skin_20.gif
...
public/skins/skin_1000.gif
```

Finché un file non esiste, il gioco mostra automaticamente un
placeholder animato al suo posto (nessun errore per l'utente).

## 4. Ruoli: Admin, Moderatore, Vip user, User
Ogni account ha un ruolo (`user` di default). I ruoli superiori si
assegnano in due modi:

**A) Variabili d'ambiente (comodo per te, il proprietario del server)**
```bash
export ADMIN_USERNAMES="tuoUsername,altroAdmin"
export MODERATOR_USERNAMES="nomeModeratore1,nomeModeratore2"
node server.js
```

**B) A mano nel file `data/users.json`**, modificando il campo
`"role"` dell'utente in `"admin"`, `"moderator"` o `"vip"`
(riavvia il server dopo la modifica).

I giocatori Admin/Moderatore vedono un badge colorato accanto al nome
in chat e possono usare questi comandi (scrivendoli in chat):
- `/kick <nome>` — espelle un giocatore dalla partita
- `/mute <nome>` / `/unmute <nome>` — silenzia/riattiva la chat di un giocatore
- `/help` — elenco comandi disponibili

I Vip user hanno solo il badge colorato (nessun comando speciale).
Tutti i giocatori possono usare `/clear` (pulisce la chat solo sul
proprio schermo) e `/ignore <nome>` / `/unignore <nome>` (nasconde i
messaggi di un utente solo per te).

## Nota sulla ricompensa "0 monete" ogni 10 livelli
Come richiesto, ogni 10 livelli il giocatore riceve **0 monete** (di
fatto nessuna moneta) più la nuova skin. Se invece volevi che le
monete venissero effettivamente premiate, dimmi il valore e lo cambio
in un secondo (`coins += 0` in `index.html`, funzione
`ext_playerTriggerLevelUp`).
