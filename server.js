/**
 * server.js — HTTP static files + WebSocket game server.
 * Bounded inputs, rate-limited controls, heartbeat and per-player snapshots.
 */
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const { WebSocketServer, WebSocket } = require('ws');
const { GameServer, CONFIG } = require('./game');

const game = new GameServer();
const PUBLIC_DIR = path.join(__dirname, 'public');
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

function clampInt(v, lo, hi, dflt) {
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : dflt;
}

function sendJson(res, status, data, cache = 'no-store') {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': cache,
  });
  res.end(body);
}

const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    return res.end();
  }

  let url;
  try {
    url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
  } catch (_) {
    res.writeHead(400);
    return res.end('Bad Request');
  }

  if (req.method !== 'GET') {
    res.writeHead(405, { Allow: 'GET, OPTIONS' });
    return res.end('Method Not Allowed');
  }

  if (url.pathname === '/healthz') {
    return sendJson(res, 200, { ok: true, uptime: Math.round(process.uptime()) });
  }

  if (url.pathname === '/api/state') {
    return sendJson(res, 200, {
      ok: true,
      players: game.world.players.size,
      pellets: game.world.pellets.length,
      powerups: game.world.powerups.length,
      zones: game.world.zones.length,
      projectiles: game.world.virusProjectiles.length,
    });
  }

  if (url.pathname === '/api/leaderboard') {
    return sendJson(res, 200, game.leaderboard());
  }

  if (url.pathname === '/api/season') {
    return sendJson(res, 200, game.seasonLeaderboard(20));
  }

  if (url.pathname === '/api/pvp-leaderboard') {
    return sendJson(res, 200, game.pvpLeaderboard(20));
  }

  if (url.pathname === '/api/metrics') {
    return sendJson(res, 200, game.performanceStats());
  }

  if (url.pathname === '/api/team-scores') {
    return sendJson(res, 200, game.teamScores());
  }

  if (url.pathname === '/api/match') {
    return sendJson(res, 200, game.matchInfo());
  }

  if (url.pathname === '/api/spawn-bot') {
    const current = [...game.world.players.values()].filter((p) => p.isBot).length;
    const slots = Math.max(0, CONFIG.BOTS.MAX_COUNT - current);
    const count = Math.min(
      clampInt(url.searchParams.get('count'), 1, CONFIG.BOTS.MAX_COUNT, CONFIG.BOTS.DEFAULT_COUNT),
      slots,
      Math.max(0, CONFIG.SERVER.MAX_PLAYERS - game.world.players.size),
    );
    if (count <= 0) return sendJson(res, 409, { ok: false, error: 'Server/bot limit raggiunto.' });

    const mass = clampInt(url.searchParams.get('mass'), 5, 5000, CONFIG.BOTS.DEFAULT_MASS);
    const prefix = (url.searchParams.get('name') || 'BOT')
      .slice(0, 12)
      .replace(/[^\w\-]/g, '') || 'BOT';
    const teamRaw = Number.parseInt(url.searchParams.get('team'), 10);
    const team = Number.isInteger(teamRaw) && teamRaw >= 0 && teamRaw < CONFIG.TEAMS.COLORS.length ? teamRaw : null;

    for (let i = 0; i < count; i++) {
      const p = game.addPlayer(`${prefix}${i + 1}`, true, team);
      if (p.cells[0]) p.cells[0].mass = mass;
    }
    return sendJson(res, 200, { ok: true, spawned: count, mass });
  }

  let requested;
  try { requested = decodeURIComponent(url.pathname); } catch (_) {
    res.writeHead(400);
    return res.end('Bad Request');
  }
  const relative = requested === '/' ? '/index.html' : requested;
  const filePath = path.resolve(PUBLIC_DIR, `.${relative}`);
  if (!filePath.startsWith(PUBLIC_DIR + path.sep)) {
    res.writeHead(403);
    return res.end('Forbidden');
  }

  fs.stat(filePath, (statErr, stat) => {
    if (statErr || !stat.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' });
      return res.end('404 Not Found');
    }

    const ext = path.extname(filePath).toLowerCase();
    const cache = ['.html', '.js', '.css'].includes(ext) ? 'no-cache' : 'public, max-age=86400';
    res.setHeader('Content-Type', MIME[ext] || 'application/octet-stream');
    res.setHeader('Cache-Control', cache);
    fs.createReadStream(filePath)
      .on('error', () => {
        if (!res.headersSent) res.writeHead(500);
        res.end();
      })
      .pipe(res);
  });
});

const wss = new WebSocketServer({
  server,
  maxPayload: 2048,
  perMessageDeflate: false,
  clientTracking: true,
});
const socketPlayers = new Map();

function safeSend(ws, payload) {
  if (ws.readyState !== WebSocket.OPEN) return false;
  if (ws.bufferedAmount > CONFIG.NETWORK.MAX_BUFFERED_AMOUNT) return false;
  try {
    ws.send(payload);
    return true;
  } catch (_) {
    return false;
  }
}

wss.on('connection', (ws) => {
  if (wss.clients.size > CONFIG.SERVER.MAX_PLAYERS) {
    try { ws.close(1013, 'Server full'); } catch (_) {}
    return;
  }

  ws.isAlive = true;
  ws.joined = false;
  ws.lastTargetAt = 0;
  ws.lastChatAt = 0;
  ws.lastAbilityAt = 0;
  ws.on('pong', () => { ws.isAlive = true; });

  let player = null;
  socketPlayers.set(ws, null);

  ws.on('message', (raw) => {
    if (raw.length > CONFIG.SERVER.MAX_MESSAGE_LENGTH) return;

    let msg;
    try { msg = JSON.parse(raw.toString()); } catch (_) { return; }
    if (!msg || typeof msg.type !== 'string') return;

    if (!player) {
      if (msg.type !== 'join') return;
      if (ws.joined) return;
      const name = String(msg.name || 'Player').replace(/[<>]/g, '').trim().slice(0, 16) || 'Player';
      if (game.bannedNames.has(name.toLowerCase())) { try { ws.close(1008, 'Banned'); } catch (_) {} return; }
      const team = Number.isInteger(msg.team) && msg.team >= 0 && msg.team < CONFIG.TEAMS.COLORS.length ? msg.team : null;
      player = game.addPlayer(name, false, team);
      if (typeof msg.color === 'string' && /^#[0-9a-fA-F]{6}$/.test(msg.color)) player.color = msg.color;
      player.ws = ws;
      ws.joined = true;
      socketPlayers.set(ws, player);
      return safeSend(ws, JSON.stringify({ type: 'welcome', id: player.id, world: CONFIG.WORLD, teams: CONFIG.TEAMS }));
    }

    switch (msg.type) {
      case 'target': {
        const now = Date.now();
        if (now - ws.lastTargetAt < CONFIG.NETWORK.TARGET_MIN_INTERVAL) return;
        if (Number.isFinite(msg.x) && Number.isFinite(msg.y)) {
          ws.lastTargetAt = now;
          game.setTarget(player, msg.x, msg.y);
        }
        break;
      }
      case 'split': game.split(player); break;
      case 'eject': game.eject(player); break;
      case 'shoot-virus': game.shootVirus(player); break;
      case 'sprint': player.sprinting = Boolean(msg.on); break;
      case 'dash': game.dash(player); break;
      case 'blink': game.blink(player); break;
      case 'shockwave': game.shockwave(player); break;
      case 'freeze': game.freezeNearby(player); break;
      case 'decoy': game.createDecoy(player); break;
      case 'mass-burst': game.massBurst(player); break;
      case 'heal': game.heal(player); break;
      case 'rage': game.rage(player); break;
      case 'reveal': game.reveal(player); break;
      case 'autopilot': game.setAutoPilot(player, Boolean(msg.on)); break;
      case 'pvp': {
        if (Date.now() - ws.lastAbilityAt < CONFIG.NETWORK.ABILITY_MIN_INTERVAL) return;
        ws.lastAbilityAt = Date.now();
        const a = String(msg.action || '');
        const targetId = msg.targetId ? String(msg.targetId) : null;
        const map = {
          mark: () => game.markTarget(player, targetId), hunter: () => game.hunterMode(player), parry: () => game.parry(player),
          stun: () => game.stunTarget(player, targetId), slow: () => game.slowTarget(player, targetId), knockback: () => game.knockbackTarget(player, targetId),
          trap: () => game.createTrap(player), mine: () => game.createMine(player), lifesteal: () => game.lifesteal(player, targetId), execute: () => game.executeTarget(player, targetId),
          shieldbreak: () => game.shieldBreak(player, targetId), duel: () => game.duelChallenge(player, targetId), duelAccept: () => game.duelAccept(player, msg.duelId),
          duelCancel: () => game.duelCancel(player, msg.duelId), arenaIn: () => game.enterArena(player), arenaOut: () => game.leaveArena(player), spectate: () => game.spectate(player, targetId),
        };
        const ok = map[a] ? map[a]() : false;
        safeSend(ws, JSON.stringify({ type:'feature-result', category:'pvp', action:a, ok:!!ok, summary:game.playerSummary(player) }));
        break;
      }
      case 'shop': {
        const a = String(msg.action || '');
        let result = null, ok = true;
        if (a === 'wallet') result = game.getWallet(player);
        else if (a === 'catalog') result = game.getCatalog();
        else if (a === 'inventory') result = game.getInventory(player);
        else if (a === 'history') result = game.getPurchaseHistory(player);
        else if (a === 'quests') result = game.getQuests(player);
        else if (a === 'stats') result = game.shopStats(player);
        else if (a === 'daily') ok = game.claimDailyReward(player);
        else if (a === 'starter') ok = game.starterGift(player);
        else if (a === 'buy') ok = game.buyItem(player, String(msg.itemId || ''));
        else if (a === 'equip') ok = game.equipItem(player, String(msg.itemId || ''));
        else if (a === 'use') ok = game.useItem(player, String(msg.itemId || ''));
        else if (a === 'unequip') ok = game.unequipItem(player);
        else if (a === 'claimQuest') ok = game.claimQuest(player, String(msg.questId || ''));
        else if (a === 'boost') ok = game.activateCoinBoost(player, 2, 60000);
        else if (a === 'refund') ok = game.refundLastPurchase(player);
        else ok = false;
        safeSend(ws, JSON.stringify({ type:'feature-result', category:'shop', action:a, ok:!!ok, data:result, wallet:game.getWallet(player), quests:game.getQuests(player), shopStats:game.shopStats(player) }));
        break;
      }
      case 'admin': {
        if (!game.adminAuthenticate(msg.token)) { safeSend(ws, JSON.stringify({type:'feature-result',category:'admin',action:'auth',ok:false,error:'ADMIN_TOKEN non valido'})); break; }
        const a = String(msg.action || '');
        let result = null, ok = true;
        switch (a) {
          case 'list': result=game.adminListPlayers(); break;
          case 'get': result=game.adminGetPlayer(msg.target); break;
          case 'kick': { const p=game.adminKick(msg.target); ok=!!p; if(p?.ws){try{p.ws.close(1000,'Kicked by admin');}catch(_){}} break; }
          case 'ban': { const p=game.adminBan(msg.target); ok=!!p; if(p?.ws){try{p.ws.close(1008,'Banned by admin');}catch(_){}} break; }
          case 'unban': ok=game.adminUnban(msg.target); break;
          case 'mute': ok=game.adminMute(msg.target,msg.duration); break;
          case 'unmute': ok=game.adminUnmute(msg.target); break;
          case 'freeze': ok=game.adminFreeze(msg.target); break;
          case 'unfreeze': ok=game.adminUnfreeze(msg.target); break;
          case 'setMass': ok=game.adminSetMass(msg.target,msg.value); break;
          case 'setCoins': ok=game.adminSetCoins(msg.target,msg.value); break;
          case 'teleport': ok=game.adminTeleport(msg.target,msg.x,msg.y); break;
          case 'heal': ok=game.adminHeal(msg.target); break;
          case 'kill': ok=game.adminKill(msg.target,msg.killer); break;
          case 'respawn': ok=game.adminRespawn(msg.target); break;
          case 'setTeam': ok=game.adminSetTeam(msg.target,msg.value); break;
          case 'setColor': ok=game.adminSetColor(msg.target,msg.value); break;
          case 'broadcast': result=game.adminBroadcast(msg.value); break;
          case 'clearEvents': ok=game.adminClearEvents(); break;
          case 'spawnBots': result=game.adminSpawnBots(msg.value,msg.mass,msg.mode); ok=Number(result)>0; break;
          case 'removeBots': result=game.adminRemoveBots(msg.value); ok=Number(result)>0; break;
          case 'botMode': result=game.adminSetBotMode(msg.value); break;
          case 'botTarget': ok=game.adminSetBotTarget(msg.target,msg.value); break;
          case 'botDifficulty': result=game.adminSetBotDifficulty(msg.value); break;
          case 'botTeam': result=game.adminSetBotTeam(msg.value); break;
          case 'botName': ok=game.adminSetBotName(msg.target,msg.value); break;
          case 'toggleBots': result=game.adminToggleBots(Boolean(msg.value)); break;
          case 'pause': result=game.adminPause(); break;
          case 'resume': result=game.adminResume(); break;
          case 'resetMatch': result=game.adminResetMatch(); break;
          default: ok=false;
        }
        safeSend(ws, JSON.stringify({type:'feature-result',category:'admin',action:a,ok:!!ok,data:result}));
        break;
      }
      case 'ping': safeSend(ws, JSON.stringify({ type: 'pong', t: Number(msg.t) || Date.now() })); break;
      case 'chat': {
        const now = Date.now();
        if (now - ws.lastChatAt < CONFIG.NETWORK.CHAT_MIN_INTERVAL) return;
        if (typeof msg.text !== 'string') return;
        const text = msg.text.replace(/[\u0000-\u001F\u007F]/g, '').trim().slice(0, 120);
        if (!text) return;
        if (player.mutedUntil > now || game.mutedNames.has(player.name.toLowerCase())) return;
        ws.lastChatAt = now;
        const out = JSON.stringify({ type: 'chat', name: player.name, id: player.id, isBot: player.isBot, team: player.team, text });
        for (const c of wss.clients) safeSend(c, out);
        break;
      }
      default:
        break;
    }
  });

  ws.on('close', () => {
    if (player) game.removePlayer(player.id);
    socketPlayers.delete(ws);
  });
  ws.on('error', () => {});
});

const gameTimer = setInterval(() => game.tick(), CONFIG.TICK);
const broadcastTimer = setInterval(() => {
  const leaderboard = game.leaderboard();
  for (const ws of wss.clients) {
    if (ws.readyState !== WebSocket.OPEN || ws.bufferedAmount > CONFIG.NETWORK.MAX_BUFFERED_AMOUNT) continue;
    const player = socketPlayers.get(ws);
    if (!player) continue;
    const snap = game.snapshotFor(player);
    safeSend(ws, JSON.stringify({ type: 'state', ...snap, leaderboard }));
  }
}, CONFIG.NET_TICK);

const heartbeat = setInterval(() => {
  for (const ws of wss.clients) {
    if (ws.isAlive === false) {
      try { ws.terminate(); } catch (_) {}
      continue;
    }
    ws.isAlive = false;
    try { ws.ping(); } catch (_) {}
  }
}, 30000);

const flushAndClose = () => {
  clearInterval(gameTimer);
  clearInterval(broadcastTimer);
  clearInterval(heartbeat);
  game.flushSeason(true);
};
process.once('SIGINT', flushAndClose);
process.once('SIGTERM', flushAndClose);

const HOST = process.env.HOST || '0.0.0.0';
server.listen(CONFIG.PORT, HOST, () => {
  const initial = clampInt(process.env.INITIAL_BOTS, 0, CONFIG.BOTS.MAX_COUNT, CONFIG.BOTS.DEFAULT_COUNT);
  const allowed = Math.min(initial, CONFIG.BOTS.MAX_COUNT, Math.max(0, CONFIG.SERVER.MAX_PLAYERS - game.world.players.size));
  for (let i = 0; i < allowed; i++) {
    const p = game.addPlayer(`Bot${i + 1}`, true);
    if (p.cells[0]) p.cells[0].mass = CONFIG.BOTS.DEFAULT_MASS;
  }
  console.log(`agar-server listening on ${HOST}:${CONFIG.PORT}; bots=${allowed}`);
});
