# Room Full Performance Fix

This build is tuned for crowded rooms.

- Adaptive network snapshots: 8-20 Hz depending on load.
- Compact per-player snapshots and hard limits for visible entities.
- Max 12 cells per human, 6/5/4 for bots depending on load.
- Max physical cell mass 5000; max player mass 30000.
- Bot-vs-bot snowballing disabled for balanced/farmer/passive bots.
- Collision candidate deduplication without per-cell Set allocations.
- Heavy trap/mine/duel/anti-camp systems throttled in crowded rooms.
- Client automatically lowers render rate and hides most bot names when crowded.
- Root and public web files are synchronized.

Render: npm ci --omit=dev && npm start.
InfinityFree/static: upload index.html, client.js, style.css and .htaccess.
