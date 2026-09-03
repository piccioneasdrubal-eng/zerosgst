# ZeroLegend — 90 funzioni nuove

Aggiunte tutte e tre le categorie richieste: 30 PvP + 30 Shop/Coins + 30 Admin/Bot, sopra alle 30 funzioni già presenti nel pacchetto precedente.

## PvP (30)
Kill streak, combo, PVP points, ELO, damage tracking, assist tracking, bounty, bounty collection, target mark, Hunter, Parry, Stun, Slow, Knockback, Trap, Mine, trigger trap, Lifesteal, Execution, Shield Break, Duel challenge, Duel accept, Duel cancel, Duel timeout, Arena enter, Arena leave, Spectator, PvP event automatico, Anti-camp, PvP leaderboard.

## Shop / Coins (30)
Catalog, wallet, add coins, spend coins, ownership, inventory add/remove, equip/unequip, buy/use, history, sale status, sale pricing, create sale, quest refresh/list/progress/claim, daily reward, match/kill/streak/team rewards, coin multiplier, coin boost, starter gift, refund, shop stats.

## Admin / Bot (30)
Kick, ban, unban, mute, unmute, freeze, unfreeze, set mass, set coins, teleport, heal, kill, respawn, team, color, broadcast, clear events, spawn/remove bots, bot mode/target/difficulty/team/name, toggle bots, pause/resume, reset match, player list/details, ADMIN_TOKEN authentication.

## Deploy
Impostare su Render:
- `ADMIN_TOKEN` = un token segreto forte
- `INITIAL_BOTS` = numero desiderato (default 12)

Il server Node serve i file dalla cartella `public/`; le copie `index.html`, `client.js`, `style.css` in root sono mantenute sincronizzate.
