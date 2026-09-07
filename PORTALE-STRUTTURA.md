# ZeroLegend Portal

Struttura pensata per InfinityFree:

- `/` — portale iniziale
- `/login.html` — accesso
- `/register.html` — registrazione
- `/profile.html` — profilo/statistiche
- `/shop.html` — ZeroShop
- `/leaderboard.html` — classifica
- `/games/` — hub di tutti i giochi
- `/games/zerolegend/` — gioco multiplayer ZeroLegend

Il sito PHP/MySQL resta sull'origine principale. Il realtime usa automaticamente `wss://ws.zerothelegend.gamer.gd` tramite `/auth/ws-config.php`.

I vecchi URL Render salvati nel browser vengono ignorati e rimossi dal client.
