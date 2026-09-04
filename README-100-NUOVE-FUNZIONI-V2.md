# ZeroLegend — 100 nuove funzionalità v2

Nuovo pacchetto additivo di 100 funzioni, distribuito su 5 categorie da 20. Non modifica la fisica di gioco, l'autenticazione (`auth/`) né i pagamenti (`payments/`) esistenti: tutto lo stato vive in memoria sul server Node (`features-v2.js`) e viene esposto tramite un unico tipo di messaggio WebSocket, `f2`.

## File aggiunti
- `features-v2.js` — stato + dispatcher `game.v2.handle(action, player, payload, ctx)`.
- `menu-v2.js` — nuova scheda "🆕 100 Funzioni v2" nel menu utente esistente, con sotto-tab per categoria.
- Modifiche minime: `server.js` (require del modulo + `case 'f2'`), `client.js` (`ZLGame.f2(action, payload)`), `game.html`/`index.html` (tag `<script>`).

## Gameplay (20)
Rampino, Varco teletrasporto, Nube velenosa, Vortice, Mimetizzazione, Adrenalina, Salvezza automatica, Overdrive, Colpo multiplo, Pozzo gravitazionale, Esplosione Nova, Fase attraversamento, Modalità Berserk, Aura rigenerante, Fulmine a catena, Scossa rallentante, Scudo a bolla, Scia di ghiaccio, Richiamo meteora, Clone avanzato.

Ogni abilità è server-authoritative: consuma massa dalla prima cellula, applica un cooldown di 10s e, dove previsto, un effetto a tempo (`v2Effects` sul player). `abilityStatus` restituisce cooldown/effetti attivi.

## PvP / Competitivo (20)
Coda ranked (entra/esci), storico partite, classifica stagionale, tornei (crea/entra/esci/avvia/tabellone a eliminazione diretta), classifica settimanale, premio MVP, rivincita (richiesta/accetta), vota-kick spettatori, marcatori replay, filtro kill feed, sistema nemesi, bonus vendetta, bonus serie vittorie, coda ranked di gruppo.

## Shop / Economia (20)
Regalo coins/oggetti, scambio tra giocatori (crea/accetta/annulla), crafting, potenziamento oggetti, loot box, Battle Pass (progressi/riscatto), codici invito (genera/riscatta con bonus reciproco), risparmi (deposita/preleva), mercato tra giocatori (vendi/compra), coupon, bundle, lista desideri, abbonamento VIP.

## Social (20)
Amicizie (richiesta/accetta/rifiuta/rimuovi/lista), blocco utenti, messaggi privati, clan (crea/invita/entra/lascia/chat/classifica), bio e stato profilo, party (crea/invita), emote.

## Admin / Moderazione (20)
Segnalazioni (invia/lista/risolvi — invio libero, gestione riservata agli admin), avvisi giocatore, shadow ban, registro azioni (audit log), annunci a tempo, modalità manutenzione, feature flag, disconnessione forzata, correzione coins con log, concessione VIP, storico ban, ricorsi (invia/valuta).

Le azioni admin (tutte tranne `reportSubmit` e `appealSubmit`) richiedono `ctx.isAdmin`, verificato lato server con lo stesso controllo già usato per `case 'admin'` (ruolo `admin`/`owner` sull'account).

## Come richiamare una funzione (client)
```js
const res = await window.ZLGame.f2('friendRequestSend', { target: 'PLAYER_ID' });
// res = { ok: true, data: ... } oppure { ok:false, error: '...' }
```

## Note
- Stato in memoria: al riavvio del processo Node, clan/amicizie/tornei/mercato ecc. vengono azzerati (nessuna scrittura su DB in questo pacchetto). Se serve persistenza, va aggiunta una tabella dedicata in `migrate.sql` e collegata in `features-v2.js`.
- Nessuna funzione qui tocca `payments/` o `auth/` reali: `giftCoins`, `savingsDeposit`, ecc. operano solo sul saldo `coins` in-memory del player di sessione (lo stesso campo già usato da PvP/Shop nel pacchetto precedente), non sull'IAP con soldi veri.
- `coinAuditAdjust` e le altre azioni admin scrivono nell'audit log in memoria (`game.v2.auditLog`), consultabile con `auditLogGet`.
