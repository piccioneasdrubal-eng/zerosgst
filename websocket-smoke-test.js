const WebSocket = require('ws');
const url = process.argv[2] || 'ws://127.0.0.1:3000';
const ws = new WebSocket(url);
const timer = setTimeout(() => { console.error('TIMEOUT: backend non ha risposto'); process.exit(1); }, 5000);
ws.on('open', () => {
  ws.send(JSON.stringify({type:'join', name:'SmokeTest', color:'#00ffff', mode:'ffa', authToken:''}));
});
ws.on('message', raw => {
  let msg; try { msg = JSON.parse(raw); } catch { return; }
  if (msg.type === 'auth-error' || msg.type === 'welcome') {
    clearTimeout(timer);
    console.log(JSON.stringify(msg));
    ws.close();
    process.exit(msg.type === 'welcome' ? 0 : 2);
  }
});
ws.on('error', err => { clearTimeout(timer); console.error('WS ERROR:', err.message); process.exit(1); });
