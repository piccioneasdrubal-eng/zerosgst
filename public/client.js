/**
 * client.js — browser client for agar-server.
 * Optimized rendering/network, safe keyboard handling and smooth local rendering.
 */
(() => {
  'use strict';

  function boot() {
    const qs = new URLSearchParams(location.search);
    const configuredDefault = (typeof window.GAME_SERVER_URL === 'string' ? window.GAME_SERVER_URL : '').trim();

    function cleanServerUrl(value) {
      return String(value || '').trim().replace(/\/$/, '');
    }
    function getConfiguredServer() {
      const fromQuery = cleanServerUrl(qs.get('server'));
      const fromStorage = cleanServerUrl(localStorage.getItem('gameServerUrl'));
      const fromConfig = cleanServerUrl(configuredDefault);
      return fromQuery || fromStorage || fromConfig;
    }
    function wsUrl(value) {
      if (/^wss?:\/\//i.test(value)) return value;
      if (/^https?:\/\//i.test(value)) return value.replace(/^http/i, 'ws');
      if (value.startsWith('localhost') || value.startsWith('127.0.0.1')) return 'ws://' + value;
      return 'wss://' + value;
    }
    function httpUrl(value) {
      if (/^https?:\/\//i.test(value)) return value;
      if (value.startsWith('localhost') || value.startsWith('127.0.0.1')) return 'http://' + value;
      return 'https://' + value;
    }

    function currentServerUrl() { return cleanServerUrl((ui.serverUrl && ui.serverUrl.value) || getConfiguredServer()); }
    function currentWsRoot() { const value = currentServerUrl(); return value ? wsUrl(value) : ''; }
    function currentApiRoot() { const value = currentServerUrl(); return value ? httpUrl(value) : ''; }

    const canvas = document.getElementById('game');
    const mmCanvas = document.getElementById('minimap-canvas');
    if (!canvas || !mmCanvas) {
      console.error('Game canvas mancante.');
      return;
    }
    const ctx = canvas.getContext('2d', { alpha: false });
    const mmCtx = mmCanvas.getContext('2d');
    if (!ctx || !mmCtx) return;

    const el = (id) => document.getElementById(id);
    const ui = {
      menu: el('menu'),
      play: el('play'),
      name: el('name'),
      serverUrl: el('server-url'),
      team: el('team-select'),
      mass: el('mass'),
      respawn: el('respawn'),
      respawnCount: el('respawn-count'),
      killfeed: el('killfeed'),
      lb: el('lb-list'),
      stats: el('stats'),
      chat: el('chat-input'),
      chatBox: el('chat-box'),
      seasonBtn: el('btn-season'),
      seasonPanel: el('season-panel'),
      seasonList: el('season-list'),
      seasonClose: el('season-close'),
      botForm: el('bot-form'),
      botCount: el('bot-count'),
      botMass: el('bot-mass'),
      botName: el('bot-name'),
      botStatus: el('bot-status'),
      skinBtn: el('skin-btn'),
      skinPanel: el('skin-panel'),
      skinClose: el('skin-close'),
      skinColors: el('skin-colors'),
      skinPresets: el('skin-presets'),
      skinFile: el('skin-file'),
      skinTitleInput: el('skin-title-input'),
      skinUploadBtn: el('skin-upload-btn'),
      skinRemoveBtn: el('skin-remove-btn'),
      skinUploadStatus: el('skin-upload-status'),
      btnSplit: el('btn-split'),
      btnFeed: el('btn-feed'),
      btnVirus: el('btn-virus'),
      featurePanel: el('feature-panel'),
      featureStatus: el('feature-status'),
      adminToken: el('admin-token'),
      adminTarget: el('admin-target'),
    };

    let dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    let viewW = window.innerWidth;
    let viewH = window.innerHeight;
    function resize() {
      dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      viewW = window.innerWidth;
      viewH = window.innerHeight;
      canvas.width = Math.max(1, Math.floor(viewW * dpr));
      canvas.height = Math.max(1, Math.floor(viewH * dpr));
      canvas.style.width = `${viewW}px`;
      canvas.style.height = `${viewH}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    window.addEventListener('resize', resize, { passive: true });
    resize();

    let ws = null;
    let myId = null;
    let myTeam = null;
    let myColor = localStorage.getItem('skin-color') || null;
    let world = { width: 5000, height: 5000 };
    let state = { players: [], pellets: [], powerups: [], virusProjectiles: [], zones: [], killfeed: [], leaderboard: [], decoys: [], traps: [], mines: [], pvpLeaderboard: [], announcements: [], events: [] };
    let camera = { x: world.width / 2, y: world.height / 2, zoom: 1 };
    // 3D orbit camera: 360° yaw + gentle pitch. Rendering stays lightweight on Canvas.
    const cameraOrbit360 = { yaw: 0, pitch: 8, dragging: false, lastX: 0, lastY: 0 };
    const mouse = { x: viewW / 2, y: viewH / 2 };
    const target = { x: camera.x, y: camera.y };
    let lastSentTarget = { x: NaN, y: NaN };
    let connected = false;
    let connecting = false;
    let manualDisconnect = false;
    let roomFull = false;
    let reconnectTimer = 0;
    let reconnectAttempts = 0;
    let stateAt = 0;
    let stats = { startedAt: 0, maxMass: 0 };
    let myStats = { kills: 0, deaths: 0 };
    let teams = { NAMES: [], COLORS: [] };
    let renderCells = new Map();
    let lastHudAt = 0;
    let lastMinimapAt = 0;
    let lastLeaderboardAt = 0;
    let lastKillfeedSignature = '';
    let lastLeaderboardSignature = '';
    let lastFrameDrawAt = 0;
    let currentDt = 1 / 60;
    let renderPellets = new Map();
    let renderProjectiles = new Map();
    let lastJoinName = '';
    let lastJoinTeam = null;

    // Frame-rate independent smoothing rates (per second). Higher = snappier / less lag.
    const SMOOTH_POS = 26;   // cell position catch-up speed
    const SMOOTH_RADIUS = 15; // cell radius (mass) catch-up speed — avoids size "pop"
    const SMOOTH_CAM_POS = 15.5;
    const SMOOTH_CAM_ZOOM = 6.6;
    const SPAWN_POP_MS = 240; // little elastic "pop" when a cell first appears (join/split/eat-split)
    function smoothFactor(rate, dt) { return 1 - Math.exp(-rate * dt); }
    function easeOutBack(t) {
      const c1 = 1.70158, c3 = c1 + 1;
      t = clamp(t, 0, 1);
      return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
    }
    // Generic smoothing for anything that just moves (ejected mass pellets, virus
    // projectiles): keeps a running rendered position that eases toward the latest
    // server position instead of teleporting every network tick.
    function renderMovingPoint(map, id, x, y, dt, rate) {
      let r = map.get(id);
      if (!r) { r = { x, y }; map.set(id, r); }
      else {
        const k = smoothFactor(rate, dt);
        r.x += (x - r.x) * k;
        r.y += (y - r.y) * k;
      }
      return r;
    }
    const SMOOTH_PELLET = 22; // slightly snappier than cells since ejected mass moves fast

    const DEFAULT_KEYS = { split: ' ', feed: 'w', virus: 'q' };
    let keybinds = { ...DEFAULT_KEYS };

    function normalizeKey(k) {
      if (typeof k !== 'string') return '';
      if (k === 'Space' || k === 'Spacebar') return ' ';
      return k.toLowerCase();
    }
    function loadKeybinds() {
      keybinds = { ...DEFAULT_KEYS };
      try {
        const saved = JSON.parse(localStorage.getItem('agarServerConfig') || '');
        if (saved && saved.keybinds) {
          for (const name of ['split', 'feed', 'virus']) {
            if (typeof saved.keybinds[name] === 'string' && saved.keybinds[name]) keybinds[name] = saved.keybinds[name];
          }
        }
      } catch (_) {}
    }
    loadKeybinds();
    window.addEventListener('keybinds-changed', loadKeybinds);

    function savedName() { return localStorage.getItem('nickname') || ''; }
    function escapeHtml(s) {
      return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    }
    function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

    function send(obj) {
      if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(obj));
    }

    function setConnectionStatus(text) {
      if (ui.botStatus) ui.botStatus.textContent = text || '';
    }

    function scheduleReconnect(name, team) {
      if (manualDisconnect || roomFull || connecting || connected) return;
      if (reconnectAttempts >= 5) {
        setConnectionStatus('❌ Server non raggiungibile. Premi Gioca per riprovare.');
        return;
      }
      reconnectAttempts += 1;
      const delay = Math.min(12000, 1000 * Math.pow(2, reconnectAttempts - 1));
      clearTimeout(reconnectTimer);
      setConnectionStatus(`🔄 Riconnessione tra ${Math.ceil(delay / 1000)}s...`);
      reconnectTimer = setTimeout(() => connect(name, team, true), delay);
    }

    function setMouseTarget() {
      const rectCx = viewW * 0.5;
      const rectCy = viewH * 0.5;
      target.x = clamp((mouse.x - rectCx) / camera.zoom + camera.x, 0, world.width);
      target.y = clamp((mouse.y - rectCy) / camera.zoom + camera.y, 0, world.height);
    }

    canvas.addEventListener('pointermove', (e) => {
      mouse.x = e.clientX;
      mouse.y = e.clientY;
    }, { passive: true });

    function isFormElement(node) {
      return node && /^(INPUT|SELECT|TEXTAREA|BUTTON)$/.test(node.tagName);
    }

    window.addEventListener('keydown', (e) => {
      if (isFormElement(document.activeElement)) return;
      const raw = typeof e.key === 'string' ? e.key : '';
      const k = normalizeKey(raw);
      if (!k) return;
      if (e.repeat && k !== 'shift') return;

      if (k === normalizeKey(keybinds.split) || (normalizeKey(keybinds.split) === ' ' && raw === ' ')) {
        e.preventDefault();
        send({ type: 'split' });
        return;
      }
      if (k === normalizeKey(keybinds.feed)) {
        send({ type: 'eject' });
        return;
      }
      if (k === normalizeKey(keybinds.virus)) {
        send({ type: 'shoot-virus' });
        return;
      }
      if (k === 'shift') send({ type: 'sprint', on: true });
    });

    window.addEventListener('keyup', (e) => {
      const raw = typeof e.key === 'string' ? e.key : '';
      if (normalizeKey(raw) === 'shift') send({ type: 'sprint', on: false });
    });

    for (const [button, action] of [[ui.btnSplit, 'split'], [ui.btnFeed, 'eject'], [ui.btnVirus, 'shoot-virus']]) {
      if (button) button.addEventListener('click', () => send({ type: action }));
    }

    async function connect(name, team, fromRetry = false) {
      if (connecting || connected) return;
      lastJoinName = name;
      lastJoinTeam = team;
      if (!fromRetry) {
        manualDisconnect = false;
        roomFull = false;
        reconnectAttempts = 0;
        clearTimeout(reconnectTimer);
      }
      connecting = true;
      if (ws && ws.readyState !== WebSocket.CLOSED) {
        try { ws.close(1000, 'reconnect'); } catch (_) {}
      }
      myId = null;
      setConnectionStatus(fromRetry ? '🔄 Connessione al server...' : '⏳ Connessione al server...');

      let sock;
      try {
        const endpoint = currentWsRoot();
        if (!endpoint) {
          connecting = false;
          setConnectionStatus("⚠️ Server di gioco non configurato. Inserisci l'URL del backend.");
          return;
        }
        if (ui.serverUrl) {
          ui.serverUrl.value = endpoint.replace(/^ws/i, 'http');
          localStorage.setItem('gameServerUrl', ui.serverUrl.value.trim());
        }
        sock = new WebSocket(endpoint);
        ws = sock;
      } catch (_) {
        connecting = false;
        scheduleReconnect(name, team);
        return;
      }

      const connectTimeout = setTimeout(() => {
        if (sock.readyState === WebSocket.CONNECTING) {
          try { sock.close(); } catch (_) {}
        }
      }, 10000);

      sock.onopen = () => {
        clearTimeout(connectTimeout);
        connecting = false;
        connected = true;
        roomFull = false;
        reconnectAttempts = 0;
        setConnectionStatus('');
        send({ type: 'join', name, color: myColor, team, token: localStorage.getItem('authToken') || '' });
      };
      sock.onmessage = (ev) => {
        let msg;
        try { msg = JSON.parse(ev.data); } catch (_) { return; }
        if (!msg || typeof msg.type !== 'string') return;
        if (msg.type === 'room-full') {
          roomFull = true;
          connecting = false;
          connected = false;
          const current = Number(msg.players) || 0;
          const max = Number(msg.maxPlayers) || 0;
          setConnectionStatus(`🚫 Room piena (${current}/${max}). Riprova tra qualche secondo.`);
          return;
        }
        if (msg.type === 'welcome') {
          myId = msg.id;
          world = msg.world || world;
          teams = msg.teams || teams;
          myTeam = team ?? null;
          stats.startedAt = performance.now();
          stats.maxMass = 0;
          if (ui.menu) ui.menu.style.display = 'none';
          addChatMsg('ℹ️', 'Benvenuto! Shift=scatto, Q=virus, Spazio=split, W=feed.', '#6ee7ff');
        } else if (msg.type === 'state') {
          const old = state;
          state = {
            players: Array.isArray(msg.players) ? msg.players : [],
            pellets: Array.isArray(msg.pellets) ? msg.pellets : [],
            powerups: Array.isArray(msg.powerups) ? msg.powerups : [],
            virusProjectiles: Array.isArray(msg.virusProjectiles) ? msg.virusProjectiles : [],
            zones: Array.isArray(msg.zones) ? msg.zones : [],
            killfeed: Array.isArray(msg.killfeed) ? msg.killfeed : [],
            leaderboard: Array.isArray(msg.leaderboard) ? msg.leaderboard : [],
            decoys: Array.isArray(msg.decoys) ? msg.decoys : [],
            traps: Array.isArray(msg.traps) ? msg.traps : [],
            mines: Array.isArray(msg.mines) ? msg.mines : [],
            pvpLeaderboard: Array.isArray(msg.pvpLeaderboard) ? msg.pvpLeaderboard : [],
            announcements: Array.isArray(msg.announcements) ? msg.announcements : [],
            events: Array.isArray(msg.events) ? msg.events : [],
          };
          world = msg.world || world;
          stateAt = performance.now();
          const m = state.players.find((p) => p.id === myId);
          if (m) {
            myStats = { kills: Number(m.kills) || 0, deaths: Number(m.deaths) || 0 };
            stats.maxMass = Math.max(stats.maxMass, Number(m.mass) || 0);
          }
          if (old && old.players) {
            const active = new Set();
            for (const p of state.players) for (const c of p.cells || []) active.add(c.id);
            for (const id of renderCells.keys()) if (!active.has(id)) renderCells.delete(id);
          }
          const activePellets = new Set(state.pellets.map((p) => p.id));
          for (const id of renderPellets.keys()) if (!activePellets.has(id)) renderPellets.delete(id);
          const activeProjectiles = new Set(state.virusProjectiles.map((v) => v.id));
          for (const id of renderProjectiles.keys()) if (!activeProjectiles.has(id)) renderProjectiles.delete(id);
          updateKillfeed(state.killfeed);
        } else if (msg.type === 'feature-result') {
          if (ui.featureStatus) {
            const text = msg.ok ? `✅ ${msg.category || ''} ${msg.action || ''}` : `❌ ${msg.error || (msg.category || '') + ' ' + (msg.action || '')}`;
            ui.featureStatus.textContent = text;
            setTimeout(() => { if (ui.featureStatus && ui.featureStatus.textContent === text) ui.featureStatus.textContent = 'Pronto'; }, 1800);
          }
        } else if (msg.type === 'chat') {
          const teamTag = msg.team !== null && msg.team !== undefined ? `[${teams.NAMES[msg.team] || ''}] ` : '';
          addChatMsg(msg.name, teamTag + msg.text, msg.id === myId ? '#6ee7ff' : '#fff');
        }
      };
      sock.onclose = () => {
        clearTimeout(connectTimeout);
        const wasConnected = connected;
        connected = false;
        connecting = false;
        if (ui.menu) ui.menu.style.display = 'flex';
        if (roomFull) {
          setConnectionStatus('🚫 Room piena. Attendi e riprova con Gioca.');
          return;
        }
        if (manualDisconnect) {
          setConnectionStatus('');
          return;
        }
        if (wasConnected || reconnectAttempts < 5) scheduleReconnect(name, team);
      };
      sock.onerror = () => {
        // Chrome logs the network failure itself; don't spam the console with duplicate retries.
        connected = false;
      };
    }

    function getMe() { return state.players.find((p) => p.id === myId) || null; }

    function updateCamera(dt) {
      const m = getMe();
      if (!m || !m.cells || !m.cells.length) return;
      let mx = 0, my = 0, mass = 0;
      for (const c of m.cells) {
        const cm = Math.max(0, Number(c.mass) || 0);
        mx += c.x * cm;
        my += c.y * cm;
        mass += cm;
      }
      if (mass > 0) { mx /= mass; my /= mass; }
      if (!Number.isFinite(camera.x)) camera.x = mx;
      if (!Number.isFinite(camera.y)) camera.y = my;
      const posK = smoothFactor(SMOOTH_CAM_POS, dt);
      const zoomK = smoothFactor(SMOOTH_CAM_ZOOM, dt);
      camera.x += (mx - camera.x) * posK;
      camera.y += (my - camera.y) * posK;
      const targetZoom = clamp(Math.pow(Math.min(Math.max(mass, 1), 20000), 0.4) / 6, 0.4, 2.2);
      camera.zoom += (targetZoom - camera.zoom) * zoomK;
      setMouseTarget();
    }

    // Smoothly interpolates a cell's rendered x/y/radius toward the latest server
    // values (frame-rate independent), and gives newly-spawned cells (join, split,
    // eating a virus, etc.) a quick elastic "pop" like agar.io instead of appearing
    // instantly at full size.
    function renderCellPosition(c, dt) {
      const targetR = Math.max(1, 10 * Math.sqrt(Math.max(1, Number(c.mass) || 1)));
      const now = performance.now();
      const splitUntil = Number(c.splitUntil) || 0;
      const splitRemain = Math.max(0, splitUntil - Date.now());
      const inSplitLaunch = splitRemain > 0;
      const svx = Number(c.splitVx) || 0;
      const svy = Number(c.splitVy) || 0;
      let r = renderCells.get(c.id);
      if (!r) {
        const len = Math.hypot(svx, svy);
        const nx = len > 0.001 ? svx / len : 0;
        const ny = len > 0.001 ? svy / len : 0;
        const back = inSplitLaunch ? Math.min(70, len * 0.055) : 0;
        r = { x: c.x - nx * back, y: c.y - ny * back, r: targetR, spawnAt: now };
        renderCells.set(c.id, r);
      } else {
        const posK = smoothFactor(inSplitLaunch ? 8.5 : SMOOTH_POS, dt);
        const radK = smoothFactor(SMOOTH_RADIUS, dt);
        r.x += (c.x - r.x) * posK;
        r.y += (c.y - r.y) * posK;
        if (inSplitLaunch) {
          r.x += svx * dt * 0.20;
          r.y += svy * dt * 0.20;
        }
        r.r += (targetR - r.r) * radK;
      }
      const age = now - r.spawnAt;
      const pop = age >= SPAWN_POP_MS ? 1 : 0.4 + 0.6 * easeOutBack(age / SPAWN_POP_MS);
      return { x: r.x, y: r.y, r: r.r, scale: pop };
    }

    function drawGrid() {
      const step = 100;
      const x0 = Math.floor((camera.x - viewW / 2 / camera.zoom) / step) * step;
      const x1 = camera.x + viewW / 2 / camera.zoom;
      const y0 = Math.floor((camera.y - viewH / 2 / camera.zoom) / step) * step;
      const y1 = camera.y + viewH / 2 / camera.zoom;
      ctx.strokeStyle = 'rgba(255,255,255,.03)';
      ctx.lineWidth = 1 / camera.zoom;
      ctx.beginPath();
      for (let x = x0; x <= x1; x += step) { ctx.moveTo(x, y0); ctx.lineTo(x, y1); }
      for (let y = y0; y <= y1; y += step) { ctx.moveTo(x0, y); ctx.lineTo(x1, y); }
      ctx.stroke();
      ctx.strokeStyle = '#ff4d4d';
      ctx.lineWidth = 4 / camera.zoom;
      ctx.strokeRect(0, 0, world.width, world.height);
    }

    function drawZones() {
      for (const z of state.zones) {
        if (Math.abs(z.x - camera.x) > 2500 || Math.abs(z.y - camera.y) > 2500) continue;
        const grad = ctx.createRadialGradient(z.x, z.y, 0, z.x, z.y, z.r);
        grad.addColorStop(0, z.kind === 'bonus' ? 'rgba(126,242,154,.28)' : 'rgba(255,77,77,.28)');
        grad.addColorStop(1, z.kind === 'bonus' ? 'rgba(126,242,154,0)' : 'rgba(255,77,77,0)');
        ctx.fillStyle = grad;
        ctx.beginPath(); ctx.arc(z.x, z.y, z.r, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = z.kind === 'bonus' ? 'rgba(126,242,154,.7)' : 'rgba(255,77,77,.7)';
        ctx.lineWidth = 2 / camera.zoom;
        ctx.stroke();
      }
    }

    function drawPellets() {
      const maxX = viewW / 2 / camera.zoom + 30;
      const maxY = viewH / 2 / camera.zoom + 30;
      ctx.fillStyle = '#7d8590';
      ctx.beginPath();
      for (const p of state.pellets) {
        const pos = renderMovingPoint(renderPellets, p.id, p.x, p.y, currentDt, SMOOTH_PELLET);
        if (Math.abs(pos.x - camera.x) > maxX || Math.abs(pos.y - camera.y) > maxY) continue;
        const r = 4 + Math.min(4, Number(p.mass) || 0);
        ctx.moveTo(pos.x + r, pos.y);
        ctx.arc(pos.x, pos.y, r, 0, Math.PI * 2);
      }
      ctx.fill();
    }

    function drawPowerups() {
      const colors = { virus: '#ff5c8a', speed: '#ffd54d', mass: '#7ef29a', invisible: '#b48cff', magnet: '#4dd0ff', shield: '#4de8ff' };
      for (const pu of state.powerups) {
        if (Math.abs(pu.x - camera.x) > viewW / 2 / camera.zoom + 100 || Math.abs(pu.y - camera.y) > viewH / 2 / camera.zoom + 100) continue;
        const r = 6 * Math.cbrt(Math.max(1, pu.mass || 1));
        ctx.fillStyle = colors[pu.type] || '#fff';
        ctx.beginPath(); ctx.arc(pu.x, pu.y, r, 0, Math.PI * 2); ctx.fill();
      }
    }

    function drawProjectiles() {
      ctx.fillStyle = '#ff5c8a';
      ctx.beginPath();
      for (const v of state.virusProjectiles) {
        const pos = renderMovingPoint(renderProjectiles, v.id, v.x, v.y, currentDt, SMOOTH_PELLET);
        if (Math.abs(pos.x - camera.x) > viewW / 2 / camera.zoom + 100 || Math.abs(pos.y - camera.y) > viewH / 2 / camera.zoom + 100) continue;
        const r = 4 + 2 * Math.sqrt(Math.max(1, v.mass || 1));
        ctx.moveTo(pos.x + r, pos.y);
        ctx.arc(pos.x, pos.y, r, 0, Math.PI * 2);
      }
      ctx.fill();
    }

    function drawHazards() {
      for (const t of state.traps || []) {
        ctx.strokeStyle = 'rgba(255,180,70,.9)'; ctx.lineWidth = 3 / camera.zoom;
        ctx.beginPath(); ctx.arc(t.x,t.y,t.r,0,Math.PI*2); ctx.stroke();
      }
      for (const m of state.mines || []) {
        ctx.fillStyle = 'rgba(255,80,130,.85)'; ctx.beginPath(); ctx.arc(m.x,m.y,10,0,Math.PI*2); ctx.fill();
        ctx.strokeStyle = 'rgba(255,180,220,.85)'; ctx.stroke();
      }
    }

    // Custom skin images (uploaded PNG/JPG/GIF/WebP/AVIF/BMP). A plain <img> is used
    // even for GIFs: the browser decodes/animates the GIF internally and drawImage()
    // picks up whatever frame is currently showing, so animated skins "just work" as
    // long as we keep redrawing every frame (which the game loop already does).
    let skinImages = new Map();
    function getSkinImage(url) {
      if (!url) return null;
      let entry = skinImages.get(url);
      if (!entry) {
        const img = new Image();
        entry = { img, ready: false, failed: false };
        img.crossOrigin = 'anonymous';
        img.onload = () => { entry.ready = true; };
        img.onerror = () => { entry.failed = true; };
        img.src = url;
        // Keep the image attached (hidden) to the DOM so browsers continue
        // decoding/advancing animated GIF/APNG/WebP frames. Detached <img>
        // elements are frequently frozen on frame 0 by the browser.
        img.style.cssText = 'position:fixed;left:-9999px;top:-9999px;width:1px;height:1px;opacity:0;pointer-events:none;';
        img.setAttribute('aria-hidden', 'true');
        document.body.appendChild(img);
        skinImages.set(url, entry);
      }
      return entry;
    }

    function drawCells() {
      const crowded = state.players.length >= 28;
      const veryCrowded = state.players.length >= 38;
      const maxRadius = veryCrowded ? 240 : (crowded ? 320 : 480);
      const showNamesForBots = !crowded;
      for (const p of state.players) {
        const cells = Array.isArray(p.cells) ? p.cells : [];
        for (const cell of cells) {
          const pos = renderCellPosition(cell, currentDt);
          const rawRadius = pos.r * pos.scale;
          const r = Math.min(rawRadius, maxRadius);
          if (Math.abs(pos.x - camera.x) > viewW / 2 / camera.zoom + r || Math.abs(pos.y - camera.y) > viewH / 2 / camera.zoom + r) continue;
          ctx.globalAlpha = p.invisible && p.id !== myId ? 0.10 : 1;
          const skin = p.customSkinUrl ? getSkinImage(resolveSkinUrl(p.customSkinUrl)) : null;
          ctx.fillStyle = p.color || '#fff';
          ctx.beginPath();
          ctx.arc(pos.x, pos.y, r, 0, Math.PI * 2);
          ctx.fill();
          if (skin && skin.ready && !skin.failed) {
            const iw = skin.img.naturalWidth, ih = skin.img.naturalHeight;
            if (iw > 0 && ih > 0) {
              ctx.save();
              ctx.beginPath();
              ctx.arc(pos.x, pos.y, r, 0, Math.PI * 2);
              ctx.clip();
              const scale = Math.max((r * 2) / iw, (r * 2) / ih);
              const dw = iw * scale, dh = ih * scale;
              ctx.drawImage(skin.img, pos.x - dw / 2, pos.y - dh / 2, dw, dh);
              ctx.restore();
            }
          }
          ctx.globalAlpha = 1;
          ctx.strokeStyle = p.shield ? '#4de8ff' : 'rgba(0,0,0,.35)';
          ctx.lineWidth = Math.max(1, Math.min(18, r * (p.shield ? 0.10 : 0.045)));
          ctx.stroke();

          const showName = p.id === myId || (!p.isBot && !veryCrowded) || (!p.isBot && r > 46 && crowded) || (showNamesForBots && r > 70);
          if (showName) {
            ctx.fillStyle = '#fff';
            ctx.font = `bold ${Math.min(28, Math.max(11, r * 0.24))}px sans-serif`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            let label = `${p.name || 'Player'}${p.isBot ? ' 🤖' : ''}`;
            if (p.team !== null && p.team !== undefined) label = `[${teams.NAMES[p.team] || ''}] ${label}`;
            ctx.fillText(label, pos.x, pos.y);
            if (p.id === myId) {
              ctx.font = `bold ${Math.min(18, Math.max(9, r * 0.15))}px sans-serif`;
              ctx.fillText(Math.round(cell.mass || 0), pos.x, pos.y + Math.min(r * 0.4, 45));
            }
          }
        }
      }
    }

    function drawHUD(now) {
      if (now - lastHudAt < 100) return;
      lastHudAt = now;
      const m = getMe();
      if (ui.mass) {
        let txt = m ? `Massa: ${Math.round(m.mass || 0)}` : '';
        if (m && myTeam !== null && myTeam !== undefined) txt += ` · Squadra: ${teams.NAMES[myTeam] || ''}`;
        if (m && m.shield) txt += ' · 🛡️';
        ui.mass.textContent = txt;
      }
      if (ui.respawn && ui.respawnCount) {
        if (m && m.dead) {
          ui.respawn.style.display = 'flex';
          ui.respawnCount.textContent = Math.max(0, Math.ceil(((m.respawnAt || 0) - Date.now()) / 1000));
        } else ui.respawn.style.display = 'none';
      }
      if (ui.stats) ui.stats.textContent = `⏱ ${Math.floor((now - stats.startedAt) / 1000)}s · 🏆 Max: ${Math.round(stats.maxMass)} · ⚔️ Kills ${myStats.kills} / Morti ${myStats.deaths}`;
    }

    function drawMinimap(now) {
      if (now - lastMinimapAt < 100) return;
      lastMinimapAt = now;
      const s = 160 / Math.max(world.width, world.height);
      mmCtx.clearRect(0, 0, 160, 160);
      mmCtx.fillStyle = 'rgba(255,255,255,.04)'; mmCtx.fillRect(0, 0, 160, 160);
      mmCtx.strokeStyle = 'rgba(255,77,77,.6)'; mmCtx.strokeRect(0, 0, world.width * s, world.height * s);
      for (const z of state.zones) {
        mmCtx.fillStyle = z.kind === 'bonus' ? 'rgba(126,242,154,.25)' : 'rgba(255,77,77,.25)';
        mmCtx.beginPath(); mmCtx.arc(z.x * s, z.y * s, z.r * s, 0, Math.PI * 2); mmCtx.fill();
      }
      for (const p of state.players) {
        if (!p.cells || !p.cells.length) continue;
        const c = p.cells[0];
        mmCtx.fillStyle = p.id === myId ? '#6ee7ff' : (p.color || '#fff');
        mmCtx.beginPath(); mmCtx.arc(c.x * s, c.y * s, p.id === myId ? 3 : 2, 0, Math.PI * 2); mmCtx.fill();
      }
      const vwpx = viewW / camera.zoom * s;
      const vhpx = viewH / camera.zoom * s;
      mmCtx.strokeStyle = 'rgba(110,231,255,.85)';
      mmCtx.strokeRect(camera.x * s - vwpx / 2, camera.y * s - vhpx / 2, vwpx, vhpx);
    }

    function drawLeaderboard(now) {
      if (!ui.lb || now - lastLeaderboardAt < 500) return;
      lastLeaderboardAt = now;
      const sig = state.leaderboard.map((e) => `${e.id}:${e.mass}`).join('|');
      if (sig === lastLeaderboardSignature) return;
      lastLeaderboardSignature = sig;
      let html = '';
      state.leaderboard.forEach((e, i) => {
        html += `<li class="${e.id === myId ? 'me' : ''}${e.isBot ? ' bot' : ''}"><span class="rank">${i + 1}.</span><span class="name">${escapeHtml(e.name)}</span><span class="m">${e.mass}</span></li>`;
      });
      ui.lb.innerHTML = html;
    }

    function updateKillfeed(kf) {
      if (!ui.killfeed) return;
      const sig = kf.map((k) => `${k.killer}|${k.victim}|${k.at}`).join('|');
      if (sig === lastKillfeedSignature) return;
      lastKillfeedSignature = sig;
      ui.killfeed.innerHTML = kf.map((k) => `<div class="kill-item"><span style="color:${escapeHtml(k.killerColor)}">${escapeHtml(k.killer)}</span><span class="kill-x">🩸</span><span style="color:${escapeHtml(k.victimColor)}">${escapeHtml(k.victim)}</span></div>`).join('');
    }

    function addChatMsg(name, text, color) {
      if (!ui.chatBox) return;
      const div = document.createElement('div');
      div.className = 'chat-msg';
      div.innerHTML = `<span class="chat-name" style="color:${escapeHtml(color || '#fff')}">${escapeHtml(name)}</span><span class="chat-text">${escapeHtml(text)}</span>`;
      ui.chatBox.appendChild(div);
      while (ui.chatBox.children.length > 40) ui.chatBox.removeChild(ui.chatBox.firstChild);
      ui.chatBox.scrollTop = ui.chatBox.scrollHeight;
    }

    if (ui.chat) ui.chat.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && ui.chat.value.trim()) {
        send({ type: 'chat', text: ui.chat.value.trim() });
        ui.chat.value = '';
      }
    });

    if (ui.play && ui.name) ui.play.addEventListener('click', () => {
      if (connecting || connected) return;
      const name = ui.name.value.trim() || 'Player';
      localStorage.setItem('nickname', name);
      if (ui.serverUrl && ui.serverUrl.value.trim()) localStorage.setItem('gameServerUrl', ui.serverUrl.value.trim().replace(/\/$/, ''));
      const team = ui.team && ui.team.value !== '' ? Number.parseInt(ui.team.value, 10) : null;
      connect(name, Number.isInteger(team) ? team : null);
    });
    if (ui.name && ui.play) ui.name.addEventListener('keydown', (e) => { if (e.key === 'Enter') ui.play.click(); });
    if (ui.name) ui.name.value = savedName();
    if (ui.serverUrl) ui.serverUrl.value = getConfiguredServer();

    if (ui.botForm) ui.botForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!ui.botStatus) return;
      ui.botStatus.textContent = 'Spawn in corso...';
      try {
        const apiRoot = currentApiRoot();
        if (!apiRoot) throw new Error('server');
        const url = `${apiRoot}/api/spawn-bot?count=${encodeURIComponent(ui.botCount?.value || '10')}&mass=${encodeURIComponent(ui.botMass?.value || '30')}&name=${encodeURIComponent(ui.botName?.value || 'Bot')}`;
        const res = await fetch(url, { cache: 'no-store' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        ui.botStatus.textContent = `✅ Spawnati ${data.spawned} bot (massa ${data.mass}).`;
      } catch (_) { ui.botStatus.textContent = '❌ Errore collegamento server.'; }
    });

    async function loadSeason() {
      try {
        const apiRoot = currentApiRoot();
        if (!apiRoot) throw new Error('server');
        const res = await fetch(`${apiRoot}/api/season`, { cache: 'no-store' });
        if (!res.ok) throw new Error('season');
        const data = await res.json();
        if (!ui.seasonList) return;
        ui.seasonList.innerHTML = (Array.isArray(data) ? data.slice(0, 10) : []).map((e, i) => `<li class="season-item"><span class="rank">${i + 1}.</span><span class="name">${escapeHtml(e.name)}</span><span class="m">${e.score} pts (${e.kills}⚔️/${e.deaths}💀)</span></li>`).join('');
      } catch (_) {}
    }
    if (ui.seasonBtn && ui.seasonPanel) ui.seasonBtn.addEventListener('click', async () => { ui.seasonPanel.classList.toggle('open'); if (ui.seasonPanel.classList.contains('open')) await loadSeason(); });
    if (ui.seasonClose && ui.seasonPanel) ui.seasonClose.addEventListener('click', () => ui.seasonPanel.classList.remove('open'));

    // ---- Custom skin upload (image or GIF) ----
    // skins.php lives in the same folder as auth.php; deriving the base from
    // AUTH_API_URL (rather than trusting whatever path the server embeds in its
    // own responses) keeps this working even if the PHP backend is deployed
    // under a different subpath than it assumes for itself.
    function skinsApiBase() {
      const auth = String(window.AUTH_API_URL || '').trim();
      if (!auth) return '';
      return auth.replace(/auth\.php(?:\?.*)?$/i, 'skins.php');
    }
    function resolveSkinUrl(rawUrl) {
      if (!rawUrl) return '';
      const base = skinsApiBase();
      if (!base) return rawUrl;
      const qIndex = rawUrl.indexOf('?');
      const query = qIndex >= 0 ? rawUrl.slice(qIndex) : '';
      if (/action=serve/i.test(query)) return base + query;
      return rawUrl;
    }
    function randomUploadId() {
      const bytes = new Uint8Array(16);
      (window.crypto || window.msCrypto).getRandomValues(bytes);
      return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
    }
    async function uploadCustomSkin(file, title, onProgress) {
      const base = skinsApiBase();
      const token = localStorage.getItem('authToken') || '';
      if (!base) throw new Error('Server di autenticazione non configurato.');
      if (!token) throw new Error('Devi effettuare il login per usare una skin personalizzata.');
      const CHUNK = 512 * 1024;
      const total = Math.max(1, Math.ceil(file.size / CHUNK));
      const uploadId = randomUploadId();
      for (let i = 0; i < total; i++) {
        const fd = new FormData();
        fd.append('action', 'upload_chunk');
        fd.append('token', token);
        fd.append('upload_id', uploadId);
        fd.append('chunk_index', String(i));
        fd.append('total_chunks', String(total));
        fd.append('total_bytes', String(file.size));
        fd.append('chunk', file.slice(i * CHUNK, Math.min(file.size, (i + 1) * CHUNK)), `chunk-${i}.part`);
        const res = await fetch(base, { method: 'POST', body: fd, cache: 'no-store' });
        let data = {};
        try { data = JSON.parse(await res.text()); } catch (_) { throw new Error(`Upload HTTP ${res.status}`); }
        if (!res.ok || !data.ok) throw new Error(data.error || `Chunk ${i + 1}/${total} non riuscito`);
        if (onProgress) onProgress(Math.round(((i + 1) / total) * 100));
      }
      const finRes = await fetch(base, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ action: 'finalize', token, upload_id: uploadId, title: (title || file.name.replace(/\.[^.]+$/, '')).slice(0, 64) }),
        cache: 'no-store',
      });
      const finData = await finRes.json().catch(() => ({}));
      if (!finRes.ok || !finData.ok) throw new Error(finData.error || 'Finalizzazione non riuscita.');
      const skin = finData.skin;
      const eqRes = await fetch(base, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'equip', token, id: skin.id }),
        cache: 'no-store',
      });
      const eqData = await eqRes.json().catch(() => ({}));
      if (!eqRes.ok || !eqData.ok) throw new Error(eqData.error || 'Impossibile equipaggiare la skin.');
      return skin;
    }
    async function removeCustomSkin() {
      const base = skinsApiBase();
      const token = localStorage.getItem('authToken') || '';
      if (!base) throw new Error('Server di autenticazione non configurato.');
      if (!token) throw new Error('Devi effettuare il login.');
      const res = await fetch(base, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'unequip', token }),
        cache: 'no-store',
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) throw new Error(data.error || 'Rimozione non riuscita.');
    }
    function rejoinToApplySkin() {
      if (!connected || !lastJoinName) return;
      manualDisconnect = true;
      try { ws && ws.close(1000, 'skin-update'); } catch (_) {}
      setTimeout(() => { manualDisconnect = false; connect(lastJoinName, lastJoinTeam); }, 300);
    }
    if (ui.skinUploadBtn) ui.skinUploadBtn.addEventListener('click', async () => {
      const file = ui.skinFile && ui.skinFile.files && ui.skinFile.files[0];
      if (!file) { if (ui.skinUploadStatus) ui.skinUploadStatus.textContent = '❌ Seleziona prima un file.'; return; }
      const title = ui.skinTitleInput ? ui.skinTitleInput.value.trim() : '';
      ui.skinUploadBtn.disabled = true;
      if (ui.skinUploadStatus) ui.skinUploadStatus.textContent = '⏳ Upload 0%';
      try {
        await uploadCustomSkin(file, title, (pct) => { if (ui.skinUploadStatus) ui.skinUploadStatus.textContent = `⏳ Upload ${pct}%`; });
        if (ui.skinUploadStatus) ui.skinUploadStatus.textContent = '✅ Skin applicata!';
        rejoinToApplySkin();
      } catch (e) {
        if (ui.skinUploadStatus) ui.skinUploadStatus.textContent = `❌ ${e && e.message ? e.message : 'Upload fallito'}`;
      } finally {
        ui.skinUploadBtn.disabled = false;
      }
    });
    if (ui.skinRemoveBtn) ui.skinRemoveBtn.addEventListener('click', async () => {
      ui.skinRemoveBtn.disabled = true;
      if (ui.skinUploadStatus) ui.skinUploadStatus.textContent = '⏳ Rimozione...';
      try {
        await removeCustomSkin();
        if (ui.skinUploadStatus) ui.skinUploadStatus.textContent = '✅ Skin rimossa.';
        rejoinToApplySkin();
      } catch (e) {
        if (ui.skinUploadStatus) ui.skinUploadStatus.textContent = `❌ ${e && e.message ? e.message : 'Errore'}`;
      } finally {
        ui.skinRemoveBtn.disabled = false;
      }
    });

    const skinColors = ['#ff6b6b', '#ffa94d', '#ffd43b', '#69db7c', '#4dd0ff', '#748ffc', '#b48cff', '#ff7ce0', '#ffffff'];
    const skinPresets = ['', '🐱', '🐶', '👑', '🦁', '🔥', '⚔️', '🌙', '💎', '🚀', '👻', '🐲'];
    if (ui.skinColors) skinColors.forEach((c) => {
      const s = document.createElement('span'); s.style.background = c; if (c === myColor) s.className = 'active';
      s.addEventListener('click', () => { myColor = c; localStorage.setItem('skin-color', c); ui.skinColors.querySelectorAll('span').forEach((x) => x.classList.remove('active')); s.classList.add('active'); });
      ui.skinColors.appendChild(s);
    });
    if (ui.skinPresets) skinPresets.forEach((prefix) => {
      const s = document.createElement('span'); s.textContent = prefix || '___';
      s.addEventListener('click', () => { if (ui.name) { ui.name.value = prefix + ui.name.value; ui.name.focus(); } });
      ui.skinPresets.appendChild(s);
    });
    if (ui.skinBtn && ui.skinPanel) ui.skinBtn.addEventListener('click', () => ui.skinPanel.classList.toggle('open'));
    if (ui.skinClose && ui.skinPanel) ui.skinClose.addEventListener('click', () => ui.skinPanel.classList.remove('open'));

    // 90 nuove funzioni: PvP + Shop/Coins + Admin/Bot
    const sendFeature = (category, action, extra = {}) => send({ type: category, action, ...extra });
    const nearestEnemyId = () => {
      const me = getMe(); if (!me || !me.cells || !me.cells.length) return null;
      let best = null, bestD = Infinity;
      for (const p of state.players) {
        if (p.id === myId || p.dead || (myTeam !== null && p.team === myTeam)) continue;
        const c = p.cells && p.cells[0]; if (!c) continue;
        const d = Math.hypot(c.x - camera.x, c.y - camera.y);
        if (d < bestD) { bestD=d; best=p; }
      }
      return best ? best.id : null;
    };
    const pvpActions = {
      mark:'mark', hunter:'hunter', parry:'parry', stun:'stun', slow:'slow', knockback:'knockback', trap:'trap', mine:'mine', lifesteal:'lifesteal', execute:'execute', shieldbreak:'shieldbreak', duel:'duel', duelCancel:'duelCancel', arenaIn:'arenaIn', arenaOut:'arenaOut', spectate:'spectate'
    };
    document.querySelectorAll('[data-pvp-action]').forEach((b) => b.addEventListener('click', () => {
      const action = b.dataset.pvpAction;
      const targetId = ['mark','stun','slow','knockback','lifesteal','execute','shieldbreak','duel','spectate'].includes(action) ? nearestEnemyId() : null;
      sendFeature('pvp', action, targetId ? { targetId } : {});
    }));
    document.querySelectorAll('[data-shop-action]').forEach((b) => b.addEventListener('click', () => {
      const action = b.dataset.shopAction;
      const itemId = b.dataset.itemId || '';
      const questId = b.dataset.questId || '';
      sendFeature('shop', action, itemId ? {itemId} : questId ? {questId} : {});
    }));
    document.querySelectorAll('[data-admin-action]').forEach((b) => b.addEventListener('click', () => {
      const action = b.dataset.adminAction;
      const token = ui.adminToken ? ui.adminToken.value : '';
      const target = ui.adminTarget ? ui.adminTarget.value.trim() : '';
      if (!token) { if (ui.featureStatus) ui.featureStatus.textContent = '❌ Inserisci ADMIN_TOKEN'; return; }
      let value = b.dataset.value || '';
      let extra = {};
      if (action === 'setMass' || action === 'setCoins' || action === 'spawnBots' || action === 'removeBots' || action === 'botDifficulty' || action === 'botTeam' || action === 'setTeam') value = prompt('Valore:', value || '10') || '';
      else if (action === 'setColor') value = prompt('Colore #RRGGBB:','#ffffff') || '';
      else if (action === 'broadcast') value = prompt('Messaggio broadcast:','') || '';
      else if (action === 'botMode') value = prompt('Bot mode: balanced/aggressive/farmer/defender/hunter/passive',value || 'balanced') || '';
      else if (action === 'botTarget') value = prompt('Target Bot: ID o nome','') || '';
      else if (action === 'botName') value = prompt('Nuovo nome bot:','Bot') || '';
      else if (action === 'teleport') { extra.x = Number(prompt('X:', String(Math.round(camera.x)) || '2500')); extra.y = Number(prompt('Y:', String(Math.round(camera.y)) || '2500')); }
      sendFeature('admin', action, { token, target, value, ...extra });
    }));
    const featureBtn = el('btn-features'), featurePanel = el('feature-panel');
    if (featureBtn && featurePanel) featureBtn.addEventListener('click', () => featurePanel.classList.toggle('open'));

    // Send only the latest mouse target, max 20 times/sec.
    window.setInterval(() => {
      if (!connected || !myId) return;
      setMouseTarget();
      if (!Number.isFinite(lastSentTarget.x) || Math.abs(target.x - lastSentTarget.x) > 1 || Math.abs(target.y - lastSentTarget.y) > 1) {
        send({ type: 'target', x: target.x, y: target.y });
        lastSentTarget.x = target.x;
        lastSentTarget.y = target.y;
      }
    }, 50);

    function frame(now) {
      // Keep rendering at the display refresh rate. The old 30 FPS crowd cap
      // made the game visibly stutter as soon as ~28 players were nearby.
      const targetFrameMs = 16.667;
      if (now - lastFrameDrawAt < targetFrameMs) { requestAnimationFrame(frame); return; }
      const dtMs = lastFrameDrawAt ? (now - lastFrameDrawAt) : targetFrameMs;
      lastFrameDrawAt = now;
      currentDt = Math.min(0.12, Math.max(0.001, dtMs / 1000));
      updateCamera(currentDt);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, viewW, viewH);
      ctx.save();
      ctx.translate(viewW / 2, viewH / 2);
      ctx.scale(camera.zoom, camera.zoom);
      ctx.translate(-camera.x, -camera.y);
      drawGrid();
      drawZones();
      drawPellets();
      drawPowerups();
      drawProjectiles();
      drawHazards();
      drawCells();
      ctx.restore();
      drawHUD(now);
      drawMinimap(now);
      drawLeaderboard(now);
      requestAnimationFrame(frame);
    }

    // Initial UI/session state for the simple public game page.
    requestAnimationFrame(frame);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
})();
