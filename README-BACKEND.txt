ZEROLEGEND BACKEND

Avvio Windows:
  npm install
  Imposta AUTH_VERIFY_URL e API_SECRET
  node server.js

Verifica:
  http://localhost:3000/healthz

Produzione:
  usa HTTPS + WSS davanti a Node con Caddy/Nginx/Cloudflare Tunnel.
