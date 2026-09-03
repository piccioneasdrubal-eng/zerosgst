# ZeroLegend — 30 nuove funzioni

## Abilità gameplay (tasti 1–9, 0)
1. Dash — scatto rapido con costo massa.
2. Blink — teletrasporto nella direzione del mouse.
3. Onda d’urto — spinge via i nemici vicini.
4. Freeze — blocca i nemici nel raggio.
5. Decoy — crea un’esca temporanea.
6. Mass Burst — espelle 4 pellet in cono.
7. Cura — recupera massa.
8. Rage — aumenta temporaneamente la velocità.
9. Reveal — permette di vedere gli invisibili.
0. AutoPilot — IA locale lato server che cerca cibo e minacce.

## Visuale e performance
11. Fullscreen
12. Zoom +
13. Zoom -
14. Reset zoom
15. Minimappa on/off
16. Griglia on/off
17. Nomi on/off
18. Massa on/off
19. Low Graphics
20. Screenshot PNG

## Funzioni server/diagnostica
21. Event queue per notifiche server
22. Safe spawn con ricerca della posizione più distante
23. Respawn shield
24. Aggiornamento automatico degli effetti temporizzati
25. Pulizia automatica dei decoy scaduti
26. Team scoreboard
27. Match info
28. Performance metrics
29. Player summary
30. Radar delle minacce vicine

### API
- `GET /api/metrics`
- `GET /api/team-scores`
- `GET /api/match`

### Note
Le abilità sono server-authoritative: il client invia solo il comando e il server valida massa, cooldown, stato e posizione.
