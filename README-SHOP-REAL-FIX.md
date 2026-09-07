# ZeroLegend Shop REAL FIX

Shop v3 usa direttamente /auth/economy.php con il token dell’utente, non il WebSocket feature server.

- wallet/catalog/inventory/history/buy/equip/unequip -> economy.php
- timeout HTTP 12s con messaggio reale
- compatibilità itemId/item_id
- aggiornamento coins del profilo dopo acquisto
- client legacy ZLGame.shop() instradato a economy.php
- cache busting shopfix3

Importante: dopo l’upload fai hard refresh.
