/**
 * client.js — browser client for agar-server.
 * Optimized rendering/network, safe keyboard handling and smooth local rendering.
 */
(() => {
  'use strict';

  function boot() {
    const qs = new URLSearchParams(location.search);
    const rawServer = qs.get('server') || 'https://agar-server-bruo.onrender.com';
    const serverUrl = rawServer.replace(/\/$/, '');

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

    const WS_ROOT = wsUrl(serverUrl);
    const API_ROOT = httpUrl(serverUrl);

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
      btnSplit: el('btn-split'),
      btnFeed: el('btn-feed'),
      btnVirus: el('btn-virus'),
      featurePanel: el('feature-panel'),
      featureStatus: el('feature-status'),
      adminToken: el('admin-token'),
      adminTarget: el('admin-target'),
    };

    let dpr = Math.min(window.devicePixelRatio || 1, 2);
    let viewW = window.innerWidth;
    let viewH = window.innerHeight;
    function resize() {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
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
    const mouse = { x: viewW / 2, y: viewH / 2 };
    const target = { x: camera.x, y: camera.y };
    let lastSentTarget = { x: NaN, y: NaN };
    let connected = false;
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

    async function connect(name, team) {
      if (ws && ws.readyState !== WebSocket.CLOSED) {
        try { ws.close(1000, 'reconnect'); } catch (_) {}
      }
      connected = false;
      myId = null;
      try {
        ws = new WebSocket(WS_ROOT);
      } catch (_) {
        if (ui.botStatus) ui.botStatus.textContent = '❌ WebSocket non disponibile.';
        return;
      }
      ws.onopen = () => {
        connected = true;
        if (ui.botStatus) ui.botStatus.textContent = '';

        send({ type: 'join', name, color: myColor, team });
      };
      ws.onmessage = (ev) => {
        let msg;
        try { msg = JSON.parse(ev.data); } catch (_) { return; }
        if (!msg || typeof msg.type !== 'string') return;
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
      ws.onclose = () => {
        connected = false;
        myId = null;
        if (ui.menu) ui.menu.style.display = 'flex';
      };
      ws.onerror = () => {
        connected = false;
        if (ui.botStatus) ui.botStatus.textContent = '❌ Connessione al server fallita.';
      };
    }

    function getMe() { return state.players.find((p) => p.id === myId) || null; }

    function updateCamera() {
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
      camera.x += (mx - camera.x) * 0.22;
      camera.y += (my - camera.y) * 0.22;
      const targetZoom = clamp(Math.pow(Math.min(Math.max(mass, 1), 20000), 0.4) / 6, 0.4, 2.2);
      camera.zoom += (targetZoom - camera.zoom) * 0.10;
      setMouseTarget();
    }

    function renderCellPosition(c) {
      let r = renderCells.get(c.id);
      if (!r) {
        r = { x: c.x, y: c.y };
        renderCells.set(c.id, r);
      } else {
        const ease = 0.34;
        r.x += (c.x - r.x) * ease;
        r.y += (c.y - r.y) * ease;
      }
      return r;
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
        if (Math.abs(p.x - camera.x) > maxX || Math.abs(p.y - camera.y) > maxY) continue;
        const r = 4 + Math.min(4, Number(p.mass) || 0);
        ctx.moveTo(p.x + r, p.y);
        ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
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
        if (Math.abs(v.x - camera.x) > viewW / 2 / camera.zoom + 100 || Math.abs(v.y - camera.y) > viewH / 2 / camera.zoom + 100) continue;
        const r = 4 + 2 * Math.sqrt(Math.max(1, v.mass || 1));
        ctx.moveTo(v.x + r, v.y);
        ctx.arc(v.x, v.y, r, 0, Math.PI * 2);
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

    function drawCells() {
      for (const p of state.players) {
        for (const c of p.cells || []) {
          const pos = renderCellPosition(c);
          const r = 10 * Math.sqrt(Math.max(1, c.mass || 1));
          if (Math.abs(pos.x - camera.x) > viewW / 2 / camera.zoom + r || Math.abs(pos.y - camera.y) > viewH / 2 / camera.zoom + r) continue;
          ctx.globalAlpha = p.invisible && p.id !== myId ? 0.15 : 1;
          ctx.fillStyle = p.color || '#fff';
          ctx.beginPath(); ctx.arc(pos.x, pos.y, r, 0, Math.PI * 2); ctx.fill();
          ctx.globalAlpha = 1;
          ctx.strokeStyle = p.shield ? '#4de8ff' : 'rgba(0,0,0,.35)';
          ctx.lineWidth = Math.max(1, r * (p.shield ? 0.12 : 0.06));
          ctx.stroke();
          if ((r > 20 || p.id === myId)) {
            ctx.fillStyle = '#fff';
            ctx.font = `bold ${Math.max(11, r * 0.35)}px sans-serif`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            let label = `${p.name || 'Player'}${p.isBot ? ' 🤖' : ''}`;
            if (p.team !== null && p.team !== undefined) label = `[${teams.NAMES[p.team] || ''}] ${label}`;
            ctx.fillText(label, pos.x, pos.y);
            if (p.id === myId) {
              ctx.font = `bold ${Math.max(9, r * 0.22)}px sans-serif`;
              ctx.fillText(Math.round(c.mass), pos.x, pos.y + r * 0.4);
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
      const name = ui.name.value.trim() || 'Player';
      localStorage.setItem('nickname', name);
      const team = ui.team && ui.team.value !== '' ? Number.parseInt(ui.team.value, 10) : null;
      connect(name, Number.isInteger(team) ? team : null);
    });
    if (ui.name && ui.play) ui.name.addEventListener('keydown', (e) => { if (e.key === 'Enter') ui.play.click(); });
    if (ui.name) ui.name.value = savedName();

    if (ui.botForm) ui.botForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!ui.botStatus) return;
      ui.botStatus.textContent = 'Spawn in corso...';
      try {
        const url = `${API_ROOT}/api/spawn-bot?count=${encodeURIComponent(ui.botCount?.value || '10')}&mass=${encodeURIComponent(ui.botMass?.value || '30')}&name=${encodeURIComponent(ui.botName?.value || 'Bot')}`;
        const res = await fetch(url, { cache: 'no-store' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        ui.botStatus.textContent = `✅ Spawnati ${data.spawned} bot (massa ${data.mass}).`;
      } catch (_) { ui.botStatus.textContent = '❌ Errore collegamento server.'; }
    });

    async function loadSeason() {
      try {
        const res = await fetch(`${API_ROOT}/api/season`, { cache: 'no-store' });
        if (!res.ok) throw new Error('season');
        const data = await res.json();
        if (!ui.seasonList) return;
        ui.seasonList.innerHTML = (Array.isArray(data) ? data.slice(0, 10) : []).map((e, i) => `<li class="season-item"><span class="rank">${i + 1}.</span><span class="name">${escapeHtml(e.name)}</span><span class="m">${e.score} pts (${e.kills}⚔️/${e.deaths}💀)</span></li>`).join('');
      } catch (_) {}
    }
    if (ui.seasonBtn && ui.seasonPanel) ui.seasonBtn.addEventListener('click', async () => { ui.seasonPanel.classList.toggle('open'); if (ui.seasonPanel.classList.contains('open')) await loadSeason(); });
    if (ui.seasonClose && ui.seasonPanel) ui.seasonClose.addEventListener('click', () => ui.seasonPanel.classList.remove('open'));

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
      updateCamera();
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
