# ZeroLegend Shop + Admin + Skin Fix

Questo aggiornamento rende il Menu Utente indipendente dal WebSocket per Shop e Admin.

## Shop
- wallet/catalog/inventory/history via `/auth/economy.php`
- acquisto con scalatura atomica dei Coins su MySQL
- equip/unequip via MySQL

## Admin
- `/api/admin` POST sul backend Node
- autenticazione con il token della sessione `ZLAuth`
- account `admin` / `owner` autorizzati senza ADMIN_TOKEN
- funziona anche prima di entrare in una partita, purché il backend Node sia online

## Skin
- upload a chunk fino a 50 MB
- JPG/JPEG/PNG/GIF/WebP/AVIF/BMP
- lista `Le mie skin` nel Profilo
- pulsante `USA SKIN`
- equip salvato nel database

## Cache
Dopo il deploy usare Ctrl+Shift+R.
