/**
 * client.js — browser client for agar-server.
 * Optimized rendering/network, safe keyboard handling and smooth local rendering.
 */
(() => {
  'use strict';

  function boot() {
    const qs = new URLSearchParams(location.search);
    const config = window.GAME_CONFIG || {};
    const rawServer = qs.get('server') || localStorage.getItem('gameServerUrl') || String(config.GAME_SERVER_URL || '').trim();
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

    const WS_ROOT = serverUrl ? wsUrl(serverUrl) : '';
    const API_ROOT = serverUrl ? httpUrl(serverUrl) : '';

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
      btnGod: el('btn-godmode'),
      btnVirus: el('btn-virus'),
      featurePanel: el('feature-panel'),
      featureStatus: el('feature-status'),
      adminToken: el('admin-token'),
      adminTarget: el('admin-target'),
      gameServerUrl: el('game-server-url'),
      saveServerUrl: el('save-server-url'),
      gameServerStatus: el('game-server-status'),
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
    let camera = { x: world.width / 2, y: world.height / 2, zoom: 1, userZoom: 1 };
    const mouse = { x: viewW / 2, y: viewH / 2 };
    const target = { x: camera.x, y: camera.y };
    let lastSentTarget = { x: NaN, y: NaN };
    let connected = false;
    let connecting = false;
    let manualDisconnect = false;
    let roomFull = false;
    let authFailed = false;
    let reconnectTimer = 0;
    let reconnectAttempts = 0;
    let stateAt = 0;
    let stats = { startedAt: 0, maxMass: 0 };
    let myStats = { kills: 0, deaths: 0 };
    let teams = { NAMES: [], COLORS: [] };
    let renderCells = new Map();
    const customSkinImages = new Map();
    let localCustomSkin = { url:'', mime:'', title:'' };
    let lastHudAt = 0;
    let lastMinimapAt = 0;
    let lastLeaderboardAt = 0;
    let lastKillfeedSignature = '';
    let lastLeaderboardSignature = '';
    let lastFrameDrawAt = 0;
    let featureSeq = 0;
    const featurePending = new Map();
    const predictedEjects = [];
    let lastEjectVisualAt = 0;
    let ejectHeld = false;
    let ejectAutoTimer = 0;

    function getAuthToken() {
      try { return window.ZLAuth && typeof window.ZLAuth.getToken === 'function' ? window.ZLAuth.getToken() : localStorage.getItem('zl_auth_token') || ''; }
      catch (_) { return ''; }
    }
    function resolveServerUrl() {
      const configured = ui.gameServerUrl && ui.gameServerUrl.value ? ui.gameServerUrl.value.trim() : '';
      return (configured || qs.get('server') || localStorage.getItem('gameServerUrl') || String(config.GAME_SERVER_URL || '').trim()).replace(/\/$/, '');
    }
    function currentApiRoot() {
      const value = resolveServerUrl();
      return value ? httpUrl(value) : API_ROOT;
    }
    function updateServerStatus(text, ok = false) {
      if (!ui.gameServerStatus) return;
      ui.gameServerStatus.textContent = text || '';
      ui.gameServerStatus.style.color = ok ? '#6ee7ff' : '#9aa8b8';
    }
    if (ui.gameServerUrl) ui.gameServerUrl.value = localStorage.getItem('gameServerUrl') || String(config.GAME_SERVER_URL || '');
    if (ui.saveServerUrl) ui.saveServerUrl.addEventListener('click', () => {
      const value = ui.gameServerUrl ? ui.gameServerUrl.value.trim().replace(/\/$/, '') : '';
      if (!value) { localStorage.removeItem('gameServerUrl'); updateServerStatus('Inserisci l URL del backend multiplayer.'); return; }
      localStorage.setItem('gameServerUrl', value);
      updateServerStatus('✅ Server salvato. Premi Gioca per connetterti.', true);
    });

    const DEFAULT_KEYS = { split: ' ', feed: 'w', virus: 'q', godmode: 'g' };
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
          for (const name of ['split', 'feed', 'virus', 'godmode']) {
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

    const visualFx = [];
    let lastLocalMass = 0;
    let lastLocalKills = 0;
    let audioCtx = null;
    function soundEnabled() { try { return JSON.parse(localStorage.getItem('zl_user_settings') || '{}').sfx === true; } catch (_) { return false; } }
    function ensureAudio() { try { const AC=window.AudioContext||window.webkitAudioContext; if(!AC)return null; if(!audioCtx)audioCtx=new AC(); if(audioCtx.state==='suspended')audioCtx.resume().catch(()=>{}); return audioCtx; } catch (_) { return null; } }
    function playSfx(kind) { if(!soundEnabled())return; const ac=ensureAudio(); if(!ac)return; const map={split:[320,0.09,'sawtooth'],eject:[220,0.07,'square'],eat:[620,0.06,'sine'],kill:[120,0.18,'triangle'],death:[75,0.35,'sawtooth'],godmode:[480,0.25,'sine'],error:[90,0.12,'square'],buy:[880,0.09,'sine']}; const [freq,dur,type]=map[kind]||map.eat; const o=ac.createOscillator(),g=ac.createGain();o.type=type;o.frequency.setValueAtTime(freq,ac.currentTime);o.frequency.exponentialRampToValueAtTime(Math.max(45,freq*1.45),ac.currentTime+dur);g.gain.setValueAtTime(0.05,ac.currentTime);g.gain.exponentialRampToValueAtTime(0.0001,ac.currentTime+dur);o.connect(g);g.connect(ac.destination);o.start();o.stop(ac.currentTime+dur); }
    function fx(type,x,y,color='#6ee7ff',r=40) {
      const count = type === 'death' ? 34 : (type === 'kill' || type === 'godmode' ? 24 : 10);
      const particles = Array.from({length: count}, () => {
        const a = Math.random() * Math.PI * 2, speed = (0.35 + Math.random()) * r / 22;
        return {x, y, vx:Math.cos(a)*speed, vy:Math.sin(a)*speed, size:2+Math.random()*4};
      });
      visualFx.push({type,x,y,color,r,started:performance.now(),particles});
      if(visualFx.length>120)visualFx.splice(0,visualFx.length-120);
    }
    function drawVisualFx(now) {
      for(let i=visualFx.length-1;i>=0;i--){
        const f=visualFx[i],age=now-f.started;if(age>900){visualFx.splice(i,1);continue;}
        const t=age/900,rr=f.r*(1+t*2.4);
        ctx.save();ctx.globalAlpha=Math.max(0,1-t);ctx.strokeStyle=f.color;ctx.lineWidth=Math.max(1,4*(1-t));
        ctx.beginPath();ctx.arc(f.x,f.y,rr,0,Math.PI*2);ctx.stroke();
        if(f.type==='godmode'){ctx.lineWidth=Math.max(2,6*(1-t));ctx.beginPath();ctx.arc(f.x,f.y,rr*0.68,-t*4,t*4);ctx.stroke();}
        if(f.type==='death'){ctx.setLineDash([6/camera.zoom,6/camera.zoom]);ctx.beginPath();ctx.arc(f.x,f.y,rr*.8,0,Math.PI*2);ctx.stroke();ctx.setLineDash([]);}
        for(const p of f.particles||[]){p.x+=p.vx;p.y+=p.vy;p.vx*=.985;p.vy*=.985;ctx.globalAlpha=Math.max(0,1-t)*.9;ctx.fillStyle=f.color;ctx.beginPath();ctx.arc(p.x,p.y,p.size*(1-t*.5),0,Math.PI*2);ctx.fill();}
        ctx.restore();
      }
    }

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
      let sensitivity = 1; try { sensitivity = clamp(Number((JSON.parse(localStorage.getItem('zl_user_settings') || '{}') || {}).mouseSensitivity) || 1, 0.25, 3); } catch (_) {}
      target.x = clamp((mouse.x - rectCx) / camera.zoom * sensitivity + camera.x, 0, world.width);
      target.y = clamp((mouse.y - rectCy) / camera.zoom * sensitivity + camera.y, 0, world.height);
    }

    canvas.addEventListener('pointermove', (e) => {
      mouse.x = e.clientX;
      mouse.y = e.clientY;
    }, { passive: true });

    canvas.addEventListener('pointerdown', () => ensureAudio(), { passive:true });
    canvas.addEventListener('wheel', (e) => {
      let cfg = {}; try { cfg = JSON.parse(localStorage.getItem('zl_user_settings') || '{}') || {}; } catch (_) {}
      if (cfg.wheelZoom === false) return;
      e.preventDefault();
      const speed = clamp(Number(cfg.zoomSpeed) || 1.2, 0.1, 4);
      const minZoom = clamp(Number(cfg.zoomMin) || 0.45, 0.15, 1.5);
      const maxZoom = clamp(Number(cfg.zoomMax) || 2.6, 1, 5);
      const sign = cfg.invertZoom ? 1 : -1;
      camera.userZoom = clamp(camera.userZoom * Math.exp(sign * e.deltaY * 0.0012 * speed), minZoom, maxZoom);
    }, { passive:false });

    function isFormElement(node) {
      return node && /^(INPUT|SELECT|TEXTAREA|BUTTON)$/.test(node.tagName);
    }

    window.addEventListener('keydown', (e) => {
      if (isFormElement(document.activeElement)) return;
      const raw = typeof e.key === 'string' ? e.key : '';
      const code = typeof e.code === 'string' ? e.code : '';
      const keyValue = code === 'Space' ? ' ' : (code === 'KeyW' ? 'w' : (code === 'KeyQ' ? 'q' : (code.startsWith('Shift') ? 'shift' : raw)));
      const k = normalizeKey(keyValue);
      if (!k) return;
      if (e.repeat && k !== 'shift' && k !== normalizeKey(keybinds.feed)) return;

      if (k === normalizeKey(keybinds.split) || (normalizeKey(keybinds.split) === ' ' && raw === ' ')) {
        e.preventDefault();
        send({ type: 'split' });
        return;
      }
      if (k === normalizeKey(keybinds.feed)) {
        e.preventDefault();
        if (!ejectHeld) {
          ejectHeld = true;
          requestEject();
          clearInterval(ejectAutoTimer);
          ejectAutoTimer = setInterval(() => { if (ejectHeld) requestEject(); }, 130);
        }
        return;
      }
      if (k === normalizeKey(keybinds.virus)) {
        send({ type: 'shoot-virus' });
        return;
      }
      if (k === normalizeKey(keybinds.godmode)) {
        e.preventDefault();
        send({ type: 'godmode' });
        return;
      }
      if (k === 'shift') send({ type: 'sprint', on: true });
    });

    window.addEventListener('keyup', (e) => {
      const raw = typeof e.key === 'string' ? e.key : '';
      const code = typeof e.code === 'string' ? e.code : '';
      const keyValue = code === 'KeyW' ? 'w' : raw;
      if (normalizeKey(keyValue) === normalizeKey(keybinds.feed)) {
        ejectHeld = false;
        clearInterval(ejectAutoTimer);
        ejectAutoTimer = 0;
      }
      if (normalizeKey(raw) === 'shift') send({ type: 'sprint', on: false });
    });

    window.addEventListener('blur', () => { ejectHeld = false; clearInterval(ejectAutoTimer); ejectAutoTimer = 0; send({ type: 'sprint', on: false }); });

    for (const [button, action] of [[ui.btnSplit, 'split'], [ui.btnFeed, 'eject'], [ui.btnVirus, 'shoot-virus'], [ui.btnGod, 'godmode']]) {
      if (button) button.addEventListener('click', () => { if (action === 'eject') requestEject(); else send({ type: action }); });
    }

    async function connect(name, team, fromRetry = false) {
      if (connecting || connected) return;
      const currentServerUrl = resolveServerUrl();
      if (!currentServerUrl) {
        updateServerStatus('❌ Backend multiplayer non configurato. Inserisci l URL del server e salva.', false);
        return;
      }
      const authToken = getAuthToken();
      if (!authToken && (!config.ALLOW_GUEST || config.ALLOW_GUEST === false)) {
        updateServerStatus('❌ Sessione non autenticata. Effettua il login.');
        return;
      }
      if (!fromRetry) {
        manualDisconnect = false;
        roomFull = false;
        authFailed = false;
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
        sock = new WebSocket(wsUrl(currentServerUrl));
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
        const selectedMode = localStorage.getItem('zl_game_mode') || 'ffa';
        const joinTeam = selectedMode === 'teams' ? team : null;
        send({ type: 'join', name, color: myColor, team: joinTeam, mode: selectedMode, authToken });
      };
      sock.onmessage = (ev) => {
        let msg;
        try { msg = JSON.parse(ev.data); } catch (_) { return; }
        if (!msg || typeof msg.type !== 'string') return;
        if (msg.type === 'action-result') {
          const m = getMe(); const c = m?.cells?.[0];
          if (msg.ok) {
            if (msg.action === 'eject') {
              while (predictedEjects.length > 3) predictedEjects.shift();
            }
            if (c) {
              const fxType = msg.action === 'split' ? 'burst' : (msg.action === 'godmode' ? 'godmode' : 'pulse');
              const fxColor = msg.action === 'godmode' ? '#7df9ff' : (msg.action === 'split' ? '#ff66cc' : '#ffd166');
              fx(fxType, c.x, c.y, fxColor, msg.action === 'godmode' ? 120 : (msg.action === 'split' ? 70 : 35));
              if (msg.action === 'godmode') playSfx('godmode'); else playSfx(msg.action);
            }
          } else {
            if (msg.action === 'eject') { predictedEjects.length = 0; addChatMsg('⚠️', 'Massa insufficiente per lanciare (cresci un po\' prima di premere W).', '#ffb347'); }
            playSfx('error');
          }
          return;
        }
        if (msg.type === 'wallet-update') {
          const coins = Math.max(0, Math.round(Number(msg.wallet?.coins)||0));
          document.querySelectorAll('[data-zl-coins]').forEach(el => el.textContent = coins.toLocaleString('it-IT'));
          window.dispatchEvent(new CustomEvent('zl-wallet-updated', {detail:msg.wallet||{}}));
          return;
        }
        if (msg.type === 'auth-error') {
          connecting = false;
          connected = false;
          authFailed = true;
          roomFull = false;
          if (ui.menu) ui.menu.style.display = 'flex';
          updateServerStatus(`❌ ${msg.error || 'Autenticazione rifiutata.'}`);
          return;
        }
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
          const authUser = msg.auth?.user || {}; localCustomSkin = { url:String(authUser.custom_skin_url || ''), mime:String(authUser.custom_skin_mime || ''), title:String(authUser.custom_skin_title || '') };
          world = msg.world || world;
          teams = msg.teams || teams;
          myTeam = Number.isInteger(msg.auth?.team) ? msg.auth.team : (team ?? null);
          stats.startedAt = performance.now();
          stats.maxMass = 0;
          if (ui.menu) ui.menu.style.display = 'none';
          updateServerStatus(`✅ Connesso • ${msg.room?.players || '?'} giocatori`, true);
          send({type:'wallet-sync'});
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
          const localEvents = Array.isArray(msg.events) ? msg.events : [];
          for (const ev of localEvents) {
            const meNow = state.players.find((p) => p.id === myId);
            const pos = meNow?.cells?.[0] || {x:camera.x,y:camera.y};
            if (ev.type === 'kill') { fx('kill', pos.x, pos.y, '#ff3b81', 110); playSfx('kill'); }
            else if (ev.type === 'death') { fx('death', pos.x, pos.y, '#ff4268', 130); playSfx('death'); }
            else if (ev.type === 'godmode') { fx('godmode', pos.x, pos.y, '#7df9ff', 130); playSfx('godmode'); }
            else if (ev.type === 'split') { fx('burst', pos.x, pos.y, '#ff66cc', 70); playSfx('split'); }
            else if (ev.type === 'eject') { fx('pulse', pos.x, pos.y, '#ffd166', 35); playSfx('eject'); }
          }
          const m = state.players.find((p) => p.id === myId);
          if (m) {
            myStats = { kills: Number(m.kills) || 0, deaths: Number(m.deaths) || 0 };
            stats.maxMass = Math.max(stats.maxMass, Number(m.mass) || 0);
          }
          if (m) {
            const massNow = Number(m.mass)||0; const killsNow = Number(m.kills)||0;
            if (lastLocalMass>0 && massNow > lastLocalMass + 8) { const c=m.cells?.[0]; if(c){fx('pulse',c.x,c.y,'#7ef29a',40);playSfx('eat');} }
            if (killsNow > lastLocalKills) { const c=m.cells?.[0]; if(c){fx('burst',c.x,c.y,'#ff66cc',60);playSfx('kill');} }
            lastLocalMass = massNow; lastLocalKills = killsNow;
          }
          if (old && old.players) {
            const active = new Set();
            for (const p of state.players) for (const c of p.cells || []) active.add(c.id);
            for (const id of renderCells.keys()) if (!active.has(id)) renderCells.delete(id);
          }
          updateKillfeed(state.killfeed);
        } else if (msg.type === 'feature-result') {
          if (msg.requestId && featurePending.has(msg.requestId)) {
            const pending = featurePending.get(msg.requestId);
            featurePending.delete(msg.requestId);
            clearTimeout(pending.timer);
            pending.resolve(msg);
          }
          if (msg.wallet && Number.isFinite(Number(msg.wallet.coins))) {
            const coins = Math.max(0, Math.round(Number(msg.wallet.coins)));
            const a = document.getElementById('userCoins');
            const b = document.getElementById('menuCoins');
            if (a) a.textContent = String(coins);
            if (b) b.textContent = String(coins);
          }
          if (msg.category === 'shop' && msg.action === 'buy') playSfx(msg.ok ? 'buy' : 'error');
          if (msg.wallet && Number.isFinite(Number(msg.wallet.coins))) {
            document.querySelectorAll('[data-zl-coins]').forEach(el => el.textContent = Math.max(0,Math.round(Number(msg.wallet.coins))).toLocaleString('it-IT'));
            window.dispatchEvent(new CustomEvent('zl-wallet-updated', { detail: msg.wallet }));
          }
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
        if (authFailed) {
          setConnectionStatus('❌ Accesso rifiutato. Effettua nuovamente il login.');
          return;
        }
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
      const autoZoom = clamp(Math.pow(Math.min(Math.max(mass, 1), 20000), 0.4) / 6, 0.4, 2.2);
      const targetZoom = clamp(autoZoom * camera.userZoom, 0.30, 3.2);
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
      try { if (JSON.parse(localStorage.getItem('zl_user_settings') || '{}').showGrid === false) return; } catch (_) {}
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

    function predictEjectVisual() {
      const m = getMe();
      const c = m?.cells?.[0];
      if (!c) return;
      setMouseTarget();
      const dx = target.x - c.x, dy = target.y - c.y;
      const len = Math.hypot(dx,dy) || 1;
      const ux = dx/len, uy = dy/len;
      const start = Number(c.radius||30) + 24;
      predictedEjects.push({
        x:c.x + ux*start, y:c.y + uy*start,
        vx:ux*1700, vy:uy*1700,
        at:performance.now(), color:m.color || '#ffd166', life:900,
      });
      while(predictedEjects.length > 6) predictedEjects.shift();
    }

    function drawPredictedEjects(now) {
      const alive=[];
      for(const p of predictedEjects){
        const age=now-p.at; if(age>p.life) continue;
        const t=age/1000;
        const damp=1-Math.min(.72, age/1200);
        const x=p.x+p.vx*t*damp, y=p.y+p.vy*t*damp;
        if(Math.abs(x-camera.x)>viewW/2/camera.zoom+120 || Math.abs(y-camera.y)>viewH/2/camera.zoom+120){ alive.push(p); continue; }
        const r=11*(1-age/p.life*.25);
        const grad=ctx.createRadialGradient(x-r*.35,y-r*.4,1,x,y,r);
        grad.addColorStop(0,'#ffffff'); grad.addColorStop(.3,p.color); grad.addColorStop(1,'rgba(0,0,0,.15)');
        ctx.fillStyle=grad; ctx.shadowColor=p.color; ctx.shadowBlur=18;
        ctx.beginPath(); ctx.arc(x,y,r,0,Math.PI*2); ctx.fill(); ctx.shadowBlur=0;
        ctx.globalAlpha=.35;
        ctx.strokeStyle=p.color; ctx.lineWidth=3;
        ctx.beginPath(); ctx.moveTo(x-p.vx*.035,y-p.vy*.035); ctx.lineTo(x-p.vx*.12,y-p.vy*.12); ctx.stroke();
        ctx.globalAlpha=1;
        alive.push(p);
      }
      predictedEjects.length=0; predictedEjects.push(...alive);
    }

    function requestEject() {
      const now=performance.now();
      if(now-lastEjectVisualAt>90) { predictEjectVisual(); lastEjectVisualAt=now; }
      send({ type:'eject' });
    }

    function drawPellets() {
      const maxX = viewW / 2 / camera.zoom + 30;
      const maxY = viewH / 2 / camera.zoom + 30;
      for (const p of state.pellets) {
        if (Math.abs(p.x - camera.x) > maxX || Math.abs(p.y - camera.y) > maxY) continue;
        const r = 4 + Math.min(5, Number(p.mass) || 0);
        const hue = String(p.color || '#7d8590');
        const g = ctx.createRadialGradient(p.x-r*.35,p.y-r*.4,Math.max(1,r*.08),p.x,p.y,r);
        g.addColorStop(0,'#ffffff'); g.addColorStop(.22,hue); g.addColorStop(1,'#0a0d14');
        ctx.fillStyle=g; ctx.shadowColor=hue; ctx.shadowBlur=Math.min(12,r*1.5);
        ctx.beginPath(); ctx.arc(p.x,p.y,r*(1+Math.sin(performance.now()/240+p.x*.01)*.06),0,Math.PI*2); ctx.fill();
        ctx.shadowBlur=0;
      }
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

    function getCustomSkinImage(url) {
      const key=String(url||''); if(!key) return null;
      let item=customSkinImages.get(key);
      if(item) return item.img;
      const img=new Image(); item={img,error:false}; customSkinImages.set(key,item);
      img.onload=()=>{item.error=false;}; img.onerror=()=>{item.error=true;}; img.src=key;
      return img;
    }

    function drawCells(now = performance.now()) {
      const crowded = state.players.length >= 28;
      const veryCrowded = state.players.length >= 38;
      const maxRadius = veryCrowded ? 240 : (crowded ? 320 : 480);
      const showNamesForBots = !crowded;
      for (const p of state.players) {
        const cells = Array.isArray(p.cells) ? p.cells : [];
        for (const cell of cells) {
          const pos = renderCellPosition(cell);
          const rawRadius = 10 * Math.sqrt(Math.max(1, Number(cell.mass) || 1));
          const wobble = 1 + Math.sin(now * 0.004 + cell.x * 0.002 + cell.y * 0.001) * 0.012;
          const r = Math.min(rawRadius, maxRadius) * wobble;
          if (Math.abs(pos.x - camera.x) > viewW / 2 / camera.zoom + r || Math.abs(pos.y - camera.y) > viewH / 2 / camera.zoom + r) continue;
          ctx.globalAlpha = p.invisible && p.id !== myId ? 0.10 : 1;
          let use3D = true; try { use3D = JSON.parse(localStorage.getItem('zl_user_settings') || '{}').threeD !== false; } catch (_) {}
          if (use3D) {
            const grad = ctx.createRadialGradient(pos.x - r*0.32, pos.y - r*0.38, Math.max(2,r*0.05), pos.x, pos.y, r);
            const base = p.color || '#fff';
            grad.addColorStop(0, '#ffffff');
            grad.addColorStop(0.14, base);
            grad.addColorStop(0.72, base);
            grad.addColorStop(1, '#05070b');
            ctx.fillStyle = grad;
            ctx.shadowColor = base; ctx.shadowBlur = Math.min(26,r*0.10);
          } else ctx.fillStyle = p.color || '#fff';
          ctx.beginPath(); ctx.arc(pos.x, pos.y, r, 0, Math.PI * 2); ctx.fill(); ctx.shadowBlur = 0;
          const skinUrl = String(p.customSkinUrl || (p.id === myId ? localCustomSkin.url : ''));
          if (skinUrl) {
            const img = getCustomSkinImage(skinUrl);
            if (img && img.complete && img.naturalWidth > 0 && !img.error) {
              ctx.save();
              ctx.beginPath(); ctx.arc(pos.x,pos.y,r,0,Math.PI*2); ctx.clip();
              ctx.globalAlpha = p.invisible && p.id !== myId ? 0.10 : 1;
              ctx.drawImage(img,pos.x-r,pos.y-r,r*2,r*2);
              ctx.restore();
              ctx.globalAlpha = 1;
            }
          }
          if (use3D) { ctx.globalAlpha *= 0.28; ctx.fillStyle='#fff'; ctx.beginPath(); ctx.ellipse(pos.x-r*0.28,pos.y-r*0.30,r*0.22,r*0.13,-0.45,0,Math.PI*2); ctx.fill(); }
          ctx.globalAlpha = 1;
          if (p.godMode) {
            ctx.save();
            const ring = r * (1.15 + Math.sin(now * 0.006) * 0.08);
            ctx.globalAlpha = 0.85; ctx.strokeStyle = '#7df9ff'; ctx.lineWidth = Math.max(3, r * 0.08); ctx.shadowColor = '#7df9ff'; ctx.shadowBlur = 24;
            ctx.beginPath(); ctx.arc(pos.x, pos.y, ring, -now*0.002, now*0.002 + Math.PI*1.7); ctx.stroke();
            ctx.restore();
          }
          ctx.strokeStyle = p.shield ? '#4de8ff' : 'rgba(0,0,0,.35)';
          ctx.lineWidth = Math.max(1, Math.min(18, r * (p.shield ? 0.10 : 0.045)));
          ctx.stroke();

          let showNamesSetting = true; try { showNamesSetting = JSON.parse(localStorage.getItem('zl_user_settings') || '{}').showNames !== false; } catch (_) {}
          const showName = showNamesSetting && (p.id === myId || (!p.isBot && !veryCrowded) || (!p.isBot && r > 46 && crowded) || (showNamesForBots && r > 70));
          if (showName) {
            ctx.fillStyle = '#fff';
            ctx.font = `bold ${Math.min(28, Math.max(11, r * 0.24))}px sans-serif`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            let label = `${p.name || 'Player'}${p.isBot ? ' 🤖' : ''}`;
            if (p.team !== null && p.team !== undefined) label = `[${teams.NAMES[p.team] || ''}] ${label}`;
            ctx.fillText(label, pos.x, pos.y);
            let showMassSetting = true; try { showMassSetting = JSON.parse(localStorage.getItem('zl_user_settings') || '{}').showMass !== false; } catch (_) {}
            if (p.id === myId && showMassSetting) {
              ctx.font = `bold ${Math.min(18, Math.max(9, r * 0.15))}px sans-serif`;
              ctx.fillText(Math.round(cell.mass || 0), pos.x, pos.y + Math.min(r * 0.4, 45));
            if (p.id === myId && p.godMode) { ctx.fillStyle='#7df9ff'; ctx.font=`bold ${Math.min(16,Math.max(9,r*.12))}px sans-serif`; ctx.fillText('GOD '+Math.ceil((p.godModeRemaining||0)/1000)+'s',pos.x,pos.y-Math.min(r*.4,45)); }
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
      if (m && Number.isFinite(Number(m.coins))) {
        const coins = Math.max(0, Math.round(Number(m.coins)));
        const a = document.getElementById('userCoins');
        const b = document.getElementById('menuCoins');
        if (a) a.textContent = String(coins);
        if (b) b.textContent = String(coins);
      }
    }

    function drawMinimap(now) {
      try { if (JSON.parse(localStorage.getItem('zl_user_settings') || '{}').showMinimap === false) return; } catch (_) {}
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
      const mode = localStorage.getItem('zl_game_mode') || 'ffa';
      const rawTeam = ui.team && ui.team.value !== '' ? Number.parseInt(ui.team.value, 10) : null;
      const team = mode === 'teams' && Number.isInteger(rawTeam) ? rawTeam : null;
      connect(name, team);
    });
    if (ui.name && ui.play) ui.name.addEventListener('keydown', (e) => { if (e.key === 'Enter') ui.play.click(); });
    if (ui.name) ui.name.value = savedName();

    if (ui.botForm) ui.botForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!ui.botStatus) return;
      ui.botStatus.textContent = 'Spawn in corso...';
      try {
        const url = `${currentApiRoot()}/api/spawn-bot?count=${encodeURIComponent(ui.botCount?.value || '10')}&mass=${encodeURIComponent(ui.botMass?.value || '30')}&name=${encodeURIComponent(ui.botName?.value || 'Bot')}`;
        const res = await fetch(url, { cache: 'no-store' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        ui.botStatus.textContent = `✅ Spawnati ${data.spawned} bot (massa ${data.mass}).`;
      } catch (_) { ui.botStatus.textContent = '❌ Errore collegamento server.'; }
    });

    async function loadSeason() {
      try {
        const res = await fetch(`${currentApiRoot()}/api/season`, { cache: 'no-store' });
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
    const sendFeature = (category, action, extra = {}) => {
      const requestId = `f${Date.now().toString(36)}_${(++featureSeq).toString(36)}`;
      return new Promise((resolve) => {
        if (!ws || ws.readyState !== WebSocket.OPEN) return resolve({ ok:false, error:'Connessione al server non attiva.' });
        const timer = setTimeout(() => { featurePending.delete(requestId); resolve({ok:false,error:'Timeout server.'}); }, 7000);
        featurePending.set(requestId, {resolve, timer});
        ws.send(JSON.stringify({ type: category, action, requestId, ...extra }));
      });
    };
    // API pubblica per il pannello legacy presente nell'HTML.
    window.ZLGame = {
      send,
      connected: () => connected,
      connecting: () => connecting,
      getState: () => state,
      getMe: () => getMe(),
      getWorld: () => ({ ...world }),
      getMyId: () => myId,
      getMode: () => localStorage.getItem('zl_game_mode') || 'ffa',
      setMode: (mode) => { localStorage.setItem('zl_game_mode', mode === 'teams' ? 'teams' : 'ffa'); },
      start: () => { if (ui.play) ui.play.click(); },
      disconnect: () => {
        manualDisconnect = true;
        clearTimeout(reconnectTimer);
        reconnectAttempts = 0;
        if (ws) { try { ws.close(1000, 'user disconnect'); } catch (_) {} }
        connected = false; connecting = false;
        if (ui.menu) ui.menu.style.display = 'flex';
      },
      restart: () => {
        manualDisconnect = true;
        clearTimeout(reconnectTimer);
        if (ws) { try { ws.close(1000, 'restart'); } catch (_) {} }
        connected = false; connecting = false;
        setTimeout(() => { manualDisconnect = false; if (ui.play) ui.play.click(); }, 80);
      },
      shop: async (action, extra = {}) => {
        try {
          const token = localStorage.getItem('zl_auth_token') || '';
          if (!token) return { ok:false, error:'Effettua il login.' };
          const map = { wallet:'wallet', catalog:'catalog', inventory:'inventory', history:'history', buy:'purchase_item', purchase_item:'purchase_item', equip:'equip', unequip:'unequip' };
          const body = { action: map[action] || action, token, ...(extra || {}) };
          if (body.itemId && !body.item_id) { body.item_id = body.itemId; delete body.itemId; }
          const controller = new AbortController();
          const timer = setTimeout(() => controller.abort(), 12000);
          try {
            const r = await fetch('/auth/economy.php', { method:'POST', headers:{'Content-Type':'application/json','Accept':'application/json'}, body:JSON.stringify(body), cache:'no-store', signal:controller.signal });
            const raw = await r.text(); let d = {};
            try { d = JSON.parse(raw); } catch (_) { return { ok:false, error:`Economy non JSON (HTTP ${r.status})` }; }
            return (!r.ok || !d.ok) ? { ok:false, error:d.error || `Economy HTTP ${r.status}` } : d;
          } catch (e) { return { ok:false, error:e?.name === 'AbortError' ? 'Shop non risponde (timeout 12s).' : 'Economy non raggiungibile.' }; }
          finally { clearTimeout(timer); }
        } catch (e) { return { ok:false, error:e?.message || 'Errore Shop.' }; }
      },
      admin: (action, extra = {}) => sendFeature('admin', action, extra),
      f2: (action, payload = {}) => sendFeature('f2', action, { payload }),
      syncWallet: () => send({type:'wallet-sync'}),
      applyCustomSkin: (url, mime = '', title = '') => { localCustomSkin = { url: String(url || ''), mime: String(mime || ''), title: String(title || '') }; },
      syncSkin: () => { const token = getAuthToken(); if (!token || !ws || ws.readyState !== WebSocket.OPEN) return Promise.resolve({ok:false,error:'Connessione al server non attiva.'}); return sendFeature('refresh-skin', 'refresh-skin', { authToken: token }); },
      resetZoom: () => { camera.userZoom = 1; },
      setUserZoom: (z) => { camera.userZoom = clamp(Number(z) || 1, 0.45, 2.6); },
      applySettings: (settings) => {
        if (!settings || typeof settings !== 'object') return;
        try { if (settings.wheelZoom === false) camera.userZoom = 1; } catch (_) {}
      },
      zoom: () => camera.zoom,
    };
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
    document.querySelectorAll('[data-shop-action]').forEach((b) => b.addEventListener('click', async () => {
      const action = b.dataset.shopAction;
      const itemId = b.dataset.itemId || '';
      const questId = b.dataset.questId || '';
      const status = document.getElementById('zl-menu-status');
      try {
        if (window.ZLUserMenu?.purchaseItem && (action === 'buy' || action === 'purchase_item')) {
          await window.ZLUserMenu.purchaseItem(itemId);
          return;
        }
        if (typeof window.ZLGame?.shop === 'function') {
          const d = await window.ZLGame.shop(action, itemId ? {itemId} : questId ? {questId} : {});
          if (!d?.ok) {
            const errMsg = d?.error || 'Azione shop non riuscita.';
            console.warn('[ZeroLegend Shop]', errMsg);
            if (status) status.textContent = '❌ ' + errMsg;
            addChatMsg('🛒', errMsg, '#ff6b6b');
          } else if (status) {
            status.textContent = '✅ ' + action + ' completato.';
          }
        }
      } catch (err) {
        const errMsg = err?.message || String(err);
        console.warn('[ZeroLegend Shop]', errMsg);
        if (status) status.textContent = '❌ ' + errMsg;
        addChatMsg('🛒', errMsg, '#ff6b6b');
      }
    }));
    document.querySelectorAll('[data-admin-action]').forEach((b) => b.addEventListener('click', () => {
      const action = b.dataset.adminAction;
      const token = ui.adminToken ? ui.adminToken.value : '';
      const target = ui.adminTarget ? ui.adminTarget.value.trim() : '';
      const meUser = window.ZLAuth?.getUser?.() || {};
      const isAuthenticatedAdmin = meUser && (Number(meUser.is_admin) === 1 || ['admin','owner'].includes(String(meUser.role || '').toLowerCase()));
      if (!token && !isAuthenticatedAdmin) { if (ui.featureStatus) ui.featureStatus.textContent = '❌ Account non autorizzato: effettua il login come admin.'; return; }
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

    // Send only the latest mouse target, max 20 times/sec. Pause target updates
    // while the user menu is open so ESC behaves like an in-game pause/menu.
    window.setInterval(() => {
      if (!connected || !myId) return;
      if (document.documentElement.classList.contains('zl-user-menu-open')) return;
      setMouseTarget();
      if (!Number.isFinite(lastSentTarget.x) || Math.abs(target.x - lastSentTarget.x) > 1 || Math.abs(target.y - lastSentTarget.y) > 1) {
        send({ type: 'target', x: target.x, y: target.y });
        lastSentTarget.x = target.x;
        lastSentTarget.y = target.y;
      }
    }, 50);

    function frame(now) {
      const crowded = state.players.length >= 28;
      const targetFrameMs = crowded ? 33 : 16;
      if (now - lastFrameDrawAt < targetFrameMs) { requestAnimationFrame(frame); return; }
      lastFrameDrawAt = now;
      updateCamera();
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, viewW, viewH);
      ctx.save();
      ctx.translate(viewW / 2, viewH / 2);
      ctx.scale(camera.zoom, camera.zoom);
      ctx.translate(-camera.x, -camera.y);
      drawGrid();
      drawZones();
      drawPredictedEjects(now);
      drawPellets();
      drawPowerups();
      drawProjectiles();
      drawHazards();
      drawCells();
      drawVisualFx(now);
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