# ZeroLegend — Shop + Custom Skin Fix 2

Correzioni incluse:
- Shop HTTP diretto verso auth/economy.php con normalizzazione itemId -> item_id.
- economy.php accetta sia item_id sia itemId.
- acquisto atomico su users.coins + zl_inventory + zl_coin_ledger.
- Equip skin custom aggiornamento immediato del player in gioco.
- Nuovo comando WebSocket refresh-skin con verifica server-side del token.
- Il client applica subito la skin locale e poi sincronizza con il backend.
- Al reconnect la skin resta caricata da auth.php tramite custom_skin_url.
