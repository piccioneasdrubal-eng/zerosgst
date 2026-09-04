/**
 * ZeroLegend unified backend — HTTP static files + WebSocket game server.
 * Authenticated multiplayer: PHP auth API validates the session token on join.
 * Bounded inputs, rate limits, heartbeat and per-player snapshots.
 */
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const { WebSocketServer, WebSocket } = require('ws');

// Carica automaticamente backend/.env senza richiedere la dipendenza dotenv.
// Le variabili già presenti nell'ambiente hanno priorità.
function loadLocalEnv(file) {
  try {
    const raw = fs.readFileSync(file, 'utf8');
    for (const line of raw.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eq = trimmed.indexOf('=');
      if (eq < 1) continue;
      const key = trimmed.slice(0, eq).trim();
      let value = trimmed.slice(eq + 1).trim();
      if ((value.startsWith('\"') && value.endsWith('\"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      if (!(key in process.env)) process.env[key] = value;
    }
  } catch (_) {}
}
loadLocalEnv(path.join(__dirname, '.env'));
const { GameServer, CONFIG } = require('./game');
const { attachFeaturesV2 } = require('./features-v2');

const game = new GameServer();
attachFeaturesV2(game, CONFIG);
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

const MAX_BOT_ROOM_SLOTS = Math.min(
  CONFIG.BOTS.MAX_COUNT,
  Math.max(0, Math.floor(CONFIG.SERVER.MAX_PLAYERS * 0.35)),
);

function activeBotCount() {
  let n = 0;
  for (const p of game.world.players.values()) if (p.isBot) n += 1;
  return n;
}

function roomHasHumanSlot() {
  return game.world.players.size < CONFIG.SERVER.MAX_PLAYERS;
}

function sendJson(res, status, data, cache = 'no-store') {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': cache,
  });
  res.end(body);
}

const AUTH_REQUIRED = process.env.AUTH_REQUIRED !== '0';
const AUTH_VERIFY_URL = String(process.env.AUTH_VERIFY_URL || 'https://zerothelegend.gamer.gd/auth/auth.php').trim();
const API_SECRET = String(process.env.API_SECRET || 'agar-zero-secret-2026').trim();
const ECONOMY_API_URL = String(process.env.ECONOMY_API_URL || 'https://zerothelegend.gamer.gd/auth/economy.php').trim();
const ECONOMY_INTERNAL_SECRET = String(process.env.ECONOMY_INTERNAL_SECRET || API_SECRET).trim();

function readRequestJson(req) {
  return new Promise((resolve) => {
    let raw = '', tooLarge = false;
    req.on('data', chunk => { raw += chunk.toString('utf8'); if (raw.length > 256 * 1024) tooLarge = true; });
    req.on('end', () => {
      if (tooLarge) return resolve(null);
      try { const data = JSON.parse(raw || '{}'); resolve(data && typeof data === 'object' ? data : {}); }
      catch (_) { resolve(null); }
    });
    req.on('error', () => resolve(null));
  });
}

async function economyRequest(action, payload = {}) {
  if (!ECONOMY_API_URL || !ECONOMY_INTERNAL_SECRET) return { ok:false, error:'Economy API non configurata.' };
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 7000);
  try {
    const response = await fetch(ECONOMY_API_URL, {
      method: 'POST',
      headers: { 'Content-Type':'application/json', 'Accept':'application/json', 'X-Api-Secret':ECONOMY_INTERNAL_SECRET },
      body: JSON.stringify({ action, ...payload }),
      signal: controller.signal,
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) return { ok:false, error:String(data.error || `Economy HTTP ${response.status}`) };
    return data;
  } catch (err) {
    return { ok:false, error:err?.name === 'AbortError' ? 'Economy timeout.' : 'Economy non raggiungibile.' };
  } finally { clearTimeout(timeout); }
}

async function verifyAuthToken(token) {
  if (!AUTH_REQUIRED) return { ok: true, user: null, premium: false };
  if (!token) return { ok: false, error: 'Sessione mancante. Effettua il login.' };
  if (!AUTH_VERIFY_URL || !API_SECRET) {
    return { ok: false, error: 'Backend auth non configurato: imposta AUTH_VERIFY_URL e API_SECRET.' };
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  try {
    const response = await fetch(AUTH_VERIFY_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Api-Secret': API_SECRET,
      },
      body: JSON.stringify({ action: 'verify', token }),
      signal: controller.signal,
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.ok || !data.user) {
      return { ok: false, error: String(data.error || `Auth HTTP ${response.status}`) };
    }
    return { ok: true, user: data.user, premium: Boolean(data.premium) };
  } catch (err) {
    return { ok: false, error: err && err.name === 'AbortError' ? 'Auth timeout.' : 'Impossibile contattare il servizio auth.' };
  } finally {
    clearTimeout(timeout);
  }
}

const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Admin-Token');

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

  if (req.method === 'POST' && url.pathname === '/api/admin') {
    void (async () => {
      const body = await readRequestJson(req);
      if (!body) return sendJson(res, 400, { ok:false, error:'JSON non valido.' });
      const auth = await verifyAuthToken(String(body.token || '').trim());
      const user = auth.ok ? (auth.user || {}) : null;
      const isAdmin = !!user && (Number(user.is_admin) === 1 || ['admin','owner'].includes(String(user.role || '').toLowerCase()));
      if (!auth.ok || !isAdmin) return sendJson(res, 403, { ok:false, error:'Account non autorizzato.' });
      const action = String(body.action || '');
      const target = String(body.target || '');
      const value = body.value == null ? '' : body.value;
      const x = Number(body.x), y = Number(body.y);
      let ok = true, data = null, error = '';
      try {
        switch (action) {
          case 'list': data = game.adminListPlayers(); break;
          case 'get': data = game.adminGetPlayer(target); ok = !!data; break;
          case 'kick': { const q=game.adminKick(target); ok=!!q; if(q?.ws){try{q.ws.close(1000,'Kicked by admin');}catch(_){}} break; }
          case 'ban': { const q=game.adminBan(target); ok=!!q; if(q?.ws){try{q.ws.close(1008,'Banned by admin');}catch(_){}} break; }
          case 'unban': ok=!!game.adminUnban(target); break;
          case 'mute': ok=!!game.adminMute(target, Number(body.duration || 60000)); break;
          case 'unmute': ok=!!game.adminUnmute(target); break;
          case 'freeze': ok=!!game.adminFreeze(target); break;
          case 'unfreeze': ok=!!game.adminUnfreeze(target); break;
          case 'setMass': ok=!!game.adminSetMass(target, Number(value)); break;
          case 'setCoins': ok=!!game.adminSetCoins(target, Number(value)); break;
          case 'teleport': ok=!!game.adminTeleport(target, x, y); break;
          case 'heal': ok=!!game.adminHeal(target); break;
          case 'kill': ok=!!game.adminKill(target, String(body.killer || user.username || 'Admin')); break;
          case 'respawn': ok=!!game.adminRespawn(target); break;
          case 'setTeam': ok=!!game.adminSetTeam(target, Number(value)); break;
          case 'setColor': ok=!!game.adminSetColor(target, String(value)); break;
          case 'broadcast': data=game.adminBroadcast(String(value)); break;
          case 'clearEvents': ok=!!game.adminClearEvents(); break;
          case 'spawnBots': data=game.adminSpawnBots(Number(value)||1, Number(body.mass)||30, String(body.mode||'balanced')); ok=Number(data)>0; break;
          case 'removeBots': data=game.adminRemoveBots(Number(value)||1); ok=Number(data)>0; break;
          case 'pause': data=game.adminPause(); break;
          case 'resume': data=game.adminResume(); break;
          case 'resetMatch': data=game.adminResetMatch(); break;
          default: ok=false; error='Azione Admin non supportata.';
        }
      } catch (e) { ok=false; error=e?.message || 'Errore Admin.'; }
      return sendJson(res, ok ? 200 : 400, {ok, action, data, error});
    })();
    return;
  }

  if (req.method !== 'GET') {
    res.writeHead(405, { Allow: 'GET, POST, OPTIONS' });
    return res.end('Method Not Allowed');
  }

  if (url.pathname === '/healthz') {
    return sendJson(res, 200, { ok: true, uptime: Math.round(process.uptime()) });
  }

  if (url.pathname === '/api/config') {
    return sendJson(res, 200, { ok: true, authRequired: AUTH_REQUIRED, maxPlayers: CONFIG.SERVER.MAX_PLAYERS, websocket: true });
  }

  if (url.pathname === '/api/state') {
    return sendJson(res, 200, {
      ok: true,
      players: game.world.players.size,
      pellets: game.world.pellets.length,
      powerups: game.world.powerups.length,
      zones: game.world.zones.length,
      projectiles: game.world.virusProjectiles.length,
      maxPlayers: CONFIG.SERVER.MAX_PLAYERS,
      bots: activeBotCount(),
      maxBots: MAX_BOT_ROOM_SLOTS,
      paused: game.paused,
      tickMs: game.lastTickDuration,
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
    if (process.env.ALLOW_PUBLIC_BOT_API !== '1') {
      return sendJson(res, 403, { ok: false, error: 'Endpoint bot pubblico disabilitato. Usa il pannello Admin/WebSocket.' });
    }
    const current = activeBotCount();
    const botSlots = Math.max(0, MAX_BOT_ROOM_SLOTS - current);
    const roomSlots = Math.max(0, CONFIG.SERVER.MAX_PLAYERS - game.world.players.size);
    const requested = clampInt(url.searchParams.get('count'), 1, CONFIG.BOTS.MAX_COUNT, CONFIG.BOTS.DEFAULT_COUNT);
    const count = Math.min(requested, botSlots, roomSlots);
    if (count <= 0) {
      return sendJson(res, 409, {
        ok: false,
        error: 'Nessuno slot bot disponibile: i posti giocatore vengono riservati agli utenti.',
        bots: current,
        maxBots: MAX_BOT_ROOM_SLOTS,
        players: game.world.players.size,
        maxPlayers: CONFIG.SERVER.MAX_PLAYERS,
      });
    }

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

wss.on('connection', (ws, req) => {
  ws.isAlive = true;
  ws.joined = false;
  ws.joinPending = false;
  ws.fullNoticeSent = false;
  ws.closedByServer = false;
  ws.requestIp = req?.headers?.['x-forwarded-for'] || req?.socket?.remoteAddress || '';
  ws.lastTargetAt = 0;
  ws.lastChatAt = 0;
  ws.lastAbilityAt = 0;
  ws.on('pong', () => { ws.isAlive = true; });

  let player = null;
  socketPlayers.set(ws, null);

  ws.on('message', async (raw) => {
    if (raw.length > CONFIG.SERVER.MAX_MESSAGE_LENGTH) return;

    let msg;
    try { msg = JSON.parse(raw.toString()); } catch (_) { return; }
    if (!msg || typeof msg.type !== 'string') return;

    if (!player) {
      if (msg.type !== 'join') return;
      if (ws.joined || ws.joinPending) return;
      ws.joinPending = true;
      void (async () => {
        const auth = await verifyAuthToken(String(msg.authToken || '').trim());
        if (!auth.ok) {
          ws.joinPending = false;
          safeSend(ws, JSON.stringify({ type: 'auth-error', error: auth.error || 'Autenticazione rifiutata' }));
          try { ws.close(1008, 'Authentication required'); } catch (_) {}
          return;
        }

        // Ricontrollo dopo la verifica auth per evitare overbooking della room.
        if (!roomHasHumanSlot()) {
          ws.joinPending = false;
          ws.fullNoticeSent = true;
          safeSend(ws, JSON.stringify({ type: 'room-full', players: game.world.players.size, maxPlayers: CONFIG.SERVER.MAX_PLAYERS, retryAfter: 5000 }));
          setTimeout(() => {
            if (ws.readyState === WebSocket.OPEN) {
              ws.closedByServer = true;
              try { ws.close(1013, 'Room full'); } catch (_) {}
            }
          }, 150);
          return;
        }

        const requestedName = String(msg.name || '').replace(/[<>]/g, '').trim().slice(0, 16);
        const verifiedName = auth.user && auth.user.name ? String(auth.user.name).replace(/[<>]/g, '').trim().slice(0, 16) : '';
        const name = requestedName || verifiedName || 'Player';
        if (game.bannedNames.has(name.toLowerCase())) {
          ws.joinPending = false;
          try { ws.close(1008, 'Banned'); } catch (_) {}
          return;
        }
        const requestedMode = String(msg.mode || 'ffa').toLowerCase();
        const mode = requestedMode === 'teams' ? 'teams' : 'ffa';
        let team = Number.isInteger(msg.team) && msg.team >= 0 && msg.team < CONFIG.TEAMS.COLORS.length ? msg.team : null;
        if (mode === 'ffa') team = null;
        if (mode === 'teams' && team === null) {
          const counts = Array(CONFIG.TEAMS.COLORS.length).fill(0);
          for (const p of game.world.players.values()) if (!p.isBot && Number.isInteger(p.team)) counts[p.team] += 1;
          let bestTeam = 0;
          for (let i = 1; i < counts.length; i++) if (counts[i] < counts[bestTeam]) bestTeam = i;
          team = bestTeam;
        }
        player = game.addPlayer(name, false, team, auth.user ? { ...auth.user, premium: auth.premium } : null);
        player.gameMode = mode;
        if (typeof msg.color === 'string' && /^#[0-9a-fA-F]{6}$/.test(msg.color)) player.color = msg.color;
        player.ws = ws;
        ws.joined = true;
        ws.joinPending = false;
        socketPlayers.set(ws, player);
        return safeSend(ws, JSON.stringify({
          type: 'welcome',
          id: player.id,
          world: CONFIG.WORLD,
          teams: CONFIG.TEAMS,
          auth: { user: auth.user || null, premium: Boolean(auth.premium), is_admin: Boolean(auth.user?.is_admin), team: player.team, mode: player.gameMode },
          room: { players: game.world.players.size, maxPlayers: CONFIG.SERVER.MAX_PLAYERS, bots: activeBotCount(), maxBots: MAX_BOT_ROOM_SLOTS },
        }));
      })().catch((err) => {
        ws.joinPending = false;
        console.error('[JOIN ERROR]', err && err.stack ? err.stack : err);
        safeSend(ws, JSON.stringify({ type: 'auth-error', error: 'Errore durante l autenticazione.' }));
        try { ws.close(1011, 'Join error'); } catch (_) {}
      });
      return;
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
      case 'split': { const ok = game.split(player); safeSend(ws, JSON.stringify({type:'action-result',action:'split',ok:!!ok})); break; }
      case 'eject': { const ok = game.eject(player); safeSend(ws, JSON.stringify({type:'action-result',action:'eject',ok:!!ok})); break; }
      case 'shoot-virus': { const ok = game.shootVirus(player); safeSend(ws, JSON.stringify({type:'action-result',action:'shoot-virus',ok:!!ok})); break; }
      case 'godmode': { const ok = game.godMode(player); safeSend(ws, JSON.stringify({type:'action-result',action:'godmode',ok:!!ok,durationMs:CONFIG.PHYSICS.GOD_MODE_DURATION,cooldownMs:CONFIG.PHYSICS.GOD_MODE_COOLDOWN})); break; }
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
        safeSend(ws, JSON.stringify({ type:'feature-result', requestId: msg.requestId || null, category:'pvp', action:a, ok:!!ok, summary:game.playerSummary(player) }));
        break;
      }
      case 'shop': {
        const a = String(msg.action || '');
        let result = null, ok = true, error = '';
        if (a === 'wallet') result = game.getWallet(player);
        else if (a === 'catalog') result = game.getCatalog();
        else if (a === 'inventory') result = game.getInventory(player);
        else if (a === 'history') result = game.getPurchaseHistory(player);
        else if (a === 'quests') result = game.getQuests(player);
        else if (a === 'stats') result = game.shopStats(player);
        else if (a === 'daily') ok = game.claimDailyReward(player);
        else if (a === 'starter') ok = game.starterGift(player);
        else if (a === 'buy') {
          const itemId = String(msg.itemId || '');
          if (player.accountId && ECONOMY_API_URL) {
            const db = await economyRequest('purchase_item', { user_id: Number(player.accountId), item_id:itemId });
            ok = Boolean(db.ok); error = String(db.error || '');
            if (ok) {
              game.grantPurchasedItem(player, itemId, db.wallet || db);
              result = db.item || null;
            }
          } else {
            ok = game.buyItem(player, itemId);
          }
        }
        else if (a === 'equip') ok = game.equipItem(player, String(msg.itemId || ''));
        else if (a === 'use') ok = game.useItem(player, String(msg.itemId || ''));
        else if (a === 'unequip') ok = game.unequipItem(player);
        else if (a === 'claimQuest') ok = game.claimQuest(player, String(msg.questId || ''));
        else if (a === 'boost') ok = game.activateCoinBoost(player, 2, 60000);
        else if (a === 'refund') ok = game.refundLastPurchase(player);
        else ok = false;
        safeSend(ws, JSON.stringify({ type:'feature-result', requestId: msg.requestId || null, category:'shop', action:a, ok:!!ok, error, data:result, wallet:game.getWallet(player), quests:game.getQuests(player), shopStats:game.shopStats(player) }));
        break;
      }
      case 'refresh-skin': {
        const authToken = String(msg.authToken || '').trim();
        if (!player.accountId || !authToken) {
          safeSend(ws, JSON.stringify({type:'feature-result', requestId: msg.requestId || null, category:'skin', action:'refresh-skin', ok:false, error:'Sessione mancante.'}));
          break;
        }
        const fresh = await verifyAuthToken(authToken);
        if (!fresh.ok || !fresh.user || Number(fresh.user.id) !== Number(player.accountId)) {
          safeSend(ws, JSON.stringify({type:'feature-result', requestId: msg.requestId || null, category:'skin', action:'refresh-skin', ok:false, error:'Sessione non valida.'}));
          break;
        }
        const u = fresh.user;
        player.equippedSkin = String(u.equipped_skin || 'default').slice(0, 100);
        player.customSkinUrl = String(u.custom_skin_url || '').slice(0, 500);
        player.customSkinMime = String(u.custom_skin_mime || '').slice(0, 80);
        player.customSkinTitle = String(u.custom_skin_title || '').slice(0, 80);
        game.markSeasonDirty();
        safeSend(ws, JSON.stringify({type:'feature-result',requestId: msg.requestId || null,category:'skin',action:'refresh-skin',ok:true,skin:{url:player.customSkinUrl,mime:player.customSkinMime,title:player.customSkinTitle,equippedSkin:player.equippedSkin}}));
        break;
      }
      case 'wallet-sync': {
        if (!player.accountId) break;
        const db = await economyRequest('wallet', { user_id:Number(player.accountId) });
        if (db.ok && db.wallet) {
          player.coins = Math.max(0, Number(db.wallet.coins) || 0);
          if (Array.isArray(db.wallet.inventory)) player.inventory = new Set(db.wallet.inventory.map(String).slice(0,100));
          if (db.wallet.equippedSkin) player.equippedSkin = String(db.wallet.equippedSkin);
          game.markSeasonDirty();
          safeSend(ws, JSON.stringify({type:'wallet-update', wallet:game.getWallet(player)}));
        }
        break;
      }
      case 'admin': {
        const authenticatedAdmin = !!player && (player.isAdmin === true || ['admin','owner'].includes(String(player.role || '').toLowerCase()));
        if (!authenticatedAdmin && !game.adminAuthenticate(msg.token)) { safeSend(ws, JSON.stringify({type:'feature-result',requestId: msg.requestId || null,category:'admin',action:'auth',ok:false,error:'Account non autorizzato o ADMIN_TOKEN non valido'})); break; }
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
          default: ok=false; break;
        }
        safeSend(ws, JSON.stringify({type:'feature-result',requestId: msg.requestId || null,category:'admin',action:a,ok:!!ok,data:result}));
        break;
      }
      case 'f2': {
        const isAdmin = !!player && (player.isAdmin === true || ['admin', 'owner'].includes(String(player.role || '').toLowerCase()));
        const result = game.v2.handle(String(msg.action || ''), player, msg.payload || {}, { isAdmin });
        safeSend(ws, JSON.stringify({ type: 'feature-result', requestId: msg.requestId || null, category: 'f2', action: msg.action, ok: result.ok, data: result.data, error: result.error }));
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

let lastTickErrorAt = 0;
function safeGameTick() {
  try {
    game.tick();
  } catch (err) {
    const now = Date.now();
    if (now - lastTickErrorAt > 2000) {
      lastTickErrorAt = now;
      console.error('[GAME TICK ERROR]', err && err.stack ? err.stack : err);
    }
    game.lastTickError = String(err?.message || err || 'unknown');
  }
}
const gameTimer = setInterval(safeGameTick, CONFIG.TICK);
let leaderboardCache = [];
let leaderboardCacheAt = 0;
const broadcastTimer = setInterval(() => {
  const now = Date.now();
  if (now - leaderboardCacheAt >= 500) { leaderboardCache = game.leaderboard(); leaderboardCacheAt = now; }
  for (const ws of wss.clients) {
    if (ws.readyState !== WebSocket.OPEN) continue;
    const player = socketPlayers.get(ws);
    if (!player) continue;
    if (ws.nextStateAt && now < ws.nextStateAt) continue;
    const wait = game.networkInterval();
    ws.nextStateAt = now + wait;
    if (ws.bufferedAmount > CONFIG.NETWORK.MAX_BUFFERED_AMOUNT) {
      ws.nextStateAt = now + Math.max(wait, 500);
      continue;
    }
    let payload;
    try {
      const snap = game.snapshotFor(player);
      payload = JSON.stringify({ type: 'state', ...snap, leaderboard: leaderboardCache });
    } catch (err) {
      console.error('[SNAPSHOT ERROR]', err && err.stack ? err.stack : err);
      return;
    }
    safeSend(ws, payload);
  }
}, 25);

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

server.on('error', (err) => {
  console.error('[HTTP SERVER ERROR]', err && err.stack ? err.stack : err);
});
wss.on('error', (err) => {
  console.error('[WEBSOCKET SERVER ERROR]', err && err.stack ? err.stack : err);
});

const HOST = process.env.HOST || '0.0.0.0';
server.listen(CONFIG.PORT, HOST, () => {
  const initial = clampInt(process.env.INITIAL_BOTS, 0, CONFIG.BOTS.MAX_COUNT, CONFIG.BOTS.DEFAULT_COUNT);
  const allowed = Math.min(initial, MAX_BOT_ROOM_SLOTS, Math.max(0, CONFIG.SERVER.MAX_PLAYERS - game.world.players.size));
  for (let i = 0; i < allowed; i++) {
    const p = game.addPlayer(`Bot${i + 1}`, true);
    if (p.cells[0]) p.cells[0].mass = CONFIG.BOTS.DEFAULT_MASS;
  }
  console.log(`agar-server listening on ${HOST}:${CONFIG.PORT}; bots=${allowed}; authRequired=${AUTH_REQUIRED}`);
  if (AUTH_REQUIRED) console.log(`Auth verify URL configured=${Boolean(AUTH_VERIFY_URL)}; secret configured=${Boolean(API_SECRET)}`);
});
