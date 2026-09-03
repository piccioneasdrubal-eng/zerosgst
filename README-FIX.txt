AGAR FINAL — correzione completa

BUG BLOCCANTI
- La gestione dei tasti del portal non chiama più toLowerCase() su valori non stringa.
- Il vecchio doppio listener dei comandi non invia più due volte split/feed/virus.
- Il client viene inizializzato dopo che tutto il DOM è disponibile.
- Gestione WebSocket e JSON difensiva, con controlli sui dati ricevuti.

SERVER / PERFORMANCE
- Game loop fisico separato dal broadcast WebSocket: 30 tick/s e 20 snapshot/s.
- Target mouse limitato a 25 aggiornamenti/s lato server e inviato solo quando cambia.
- Chat limitata per evitare flood.
- Limite giocatori e bot.
- Collisioni tra cellule con broad-phase spaziale invece di confrontare sempre tutte le coppie.
- AI dei bot con decisioni temporizzate e griglia dei giocatori.
- Pellet indicizzati spazialmente.
- Tetto massimo ai pellet: il mondo non cresce all'infinito dopo ejection/zone/leave.
- Le zone bonus non generano più pellet a ogni tick senza limite.
- Salvataggio classifica differito: niente scritture sincrone su disco ad ogni kill/death.
- Proiettili virus con durata massima.
- Delta fisico limitato dopo eventuali rallentamenti del processo.

CLIENT
- Canvas DPR limitato a 2.
- Rendering interpolato delle cellule.
- HUD, minimappa, killfeed e leaderboard aggiornati a frequenza ridotta.
- Pellet disegnati in batch.
- Input mouse + pointer.
- Keybind caricati in modo sicuro anche con localStorage corrotto.
- Cache degli asset durante il debug impostata su no-cache per HTML/CSS/JS del server Node.

DEPLOY
Render:
- build: npm ci --omit=dev
- start: npm start
- health check: /healthz

Sito statico:
- usare index.html, client.js, style.css e .htaccess.
- public/ contiene gli stessi file del frontend per il test diretto su Render.

VERIFICA ESEGUITA
- node --check su server.js, game.js, client.js e gli script di test.
- php -l su auth.php e db-config.php.
- game-test con 80 bot + split/feed/snapshot: OK.
- benchmark locale del motore: circa 2.600–3.500 tick/s con 30–120 bot in test sintetico.

NOTA
Il benchmark misura il motore locale, non il tempo di rete di Render. Il piano Free di Render può inoltre causare una pausa al primo accesso dopo inattività.
