# ZeroLegend — Shop + W/Feed Fix

- Shop client now uses the same authenticated token verifier as the portal (`auth.php`) for wallet/catalog/purchase/equip.
- Purchases are atomic in MySQL and update `users.coins`, `zl_inventory`, `zl_coin_ledger`.
- Legacy shop buttons route through the unified user menu.
- W/Feed gets an immediate client-side visual prediction plus the authoritative server pellet.
- Server launch distance/speed and self-pickup grace are increased so the ejected pellet is clearly visible.
- Cache-busting updated to `20260904-shopfeedfix1`.
