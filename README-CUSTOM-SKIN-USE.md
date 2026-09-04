# ZeroLegend — Skin personalizzata nel Menu Utente

Le skin caricate sono ora elencate direttamente nella scheda Profilo del Menu Utente. Ogni skin mostra anteprima, formato, dimensione e stato.

- **Usa skin** salva `equipped_skin` nel database `users` e riavvia il gioco per caricare la skin.
- **Default** rimuove la skin personalizzata e torna alla skin predefinita.
- La sessione Auth espone `custom_skins`, `custom_skin_url`, `custom_skin_mime` e `custom_skin_title`.
- Il multiplayer include `customSkinUrl` nello snapshot e il client la disegna ritagliata sulla cellula.
- Le GIF animate continuano a essere renderizzate dal browser; JPG/PNG/WebP/AVIF/BMP usano lo stesso percorso.

## FTP
Sostituire almeno `index.html`, `user-menu.js`, `client.js`, `game.js`, `auth/auth.php`, `auth/skins.php`, `style.css`.
