const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const WebSocket = require("ws");

const PORT = process.env.PORT || 3000;
const SITE_URL = process.env.SITE_URL || `http://localhost:${PORT}`;

/* ---------------------------
   RUOLI: Admin / Moderatore / Vip user / User
   Assegna account admin/moderatore tramite variabili d'ambiente
   (elenco username separati da virgola), oppure impostando
   manualmente il campo "role" in data/users.json.
---------------------------- */
const ADMIN_USERNAMES = (process.env.ADMIN_USERNAMES || "").split(",").map(s => s.trim().toLowerCase()).filter(Boolean);
const MODERATOR_USERNAMES = (process.env.MODERATOR_USERNAMES || "").split(",").map(s => s.trim().toLowerCase()).filter(Boolean);
const ROLE_ORDER = { user: 0, vip: 1, moderator: 2, admin: 3 };

function roleForUser(user) {
  if (!user) return "user";
  const uname = (user.username || "").toLowerCase();
  if (user.role === "admin" || ADMIN_USERNAMES.includes(uname)) return "admin";
  if (user.role === "moderator" || MODERATOR_USERNAMES.includes(uname)) return "moderator";
  if (user.role === "vip") return "vip";
  return "user";
}

function roleAtLeast(role, min) {
  return (ROLE_ORDER[role] || 0) >= (ROLE_ORDER[min] || 0);
}

const mutedNames = new Set();

const WORLD = 6000;
const TICK = 30;

const FOOD_COUNT = 850;
const MAX_PLAYERS = 60;
const MAX_CHAT_LENGTH = 180;

const VIRUS_COUNT = 18;
const VIRUS_R = 34;
const POWERUP_TARGET = 8;
const POWERUP_R = 15;

const DASH_COST = 25;
const DASH_IMPULSE = 900;
const BOOST_SPEED_MULT = 1.55;
const BOOST_ENERGY_DRAIN = 18; // per second
const COMBO_WINDOW_MS = 3000;
const SPAWN_PROTECT_MS = 3000;
const MERGE_TIME_MS = 9000;

// Variabile globale per la quantità di Bot desiderata
let targetBotCount = 10; 

const colors = [
  "#42d392",
  "#55a7ff",
  "#ff6680",
  "#ffbf55",
  "#b56cff",
  "#25d9d0",
  "#f472b6",
  "#a3e635"
];

const players = new Map();
const foods = [];
const viruses = [];
const powerups = [];
const chat = [];
let powerupSpawnTimer = 5000;

function random(a, b) {
  return Math.random() * (b - a) + a;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function distance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function randomColor() {
  return colors[Math.floor(Math.random() * colors.length)];
}

function randomId() {
  return Math.random().toString(36).slice(2) +
         Math.random().toString(36).slice(2);
}

function makeFood() {
  return {
    id: randomId(),
    x: random(25, WORLD - 25),
    y: random(25, WORLD - 25),
    r: random(3, 7),
    color: randomColor()
  };
}

for (let i = 0; i < FOOD_COUNT; i++) {
  foods.push(makeFood());
}

function makeVirus() {
  return {
    id: randomId(),
    x: random(150, WORLD - 150),
    y: random(150, WORLD - 150),
    r: VIRUS_R,
    spikes: 18
  };
}

for (let i = 0; i < VIRUS_COUNT; i++) {
  viruses.push(makeVirus());
}

function makePowerup() {
  return {
    id: randomId(),
    x: random(150, WORLD - 150),
    y: random(150, WORLD - 150),
    r: POWERUP_R,
    type: Math.random() < 0.5 ? "speed" : "mass"
  };
}

/* ---------------------------
   SICUREZZA CHAT / NOMI
---------------------------- */

function cleanName(name) {
  return String(name || "Player")
    // \p{L} = qualsiasi lettera Unicode, \p{N} = qualsiasi cifra Unicode
    // (prima si usava \w, che ammette solo ASCII e cancellava nomi in cirillico/cinese/giapponese/hindi/ecc.)
    .replace(/[^\p{L}\p{N} ._-]/gu, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 16) || "Player";
}

function cleanMessage(message) {
  return String(message || "")
    .replace(/[<>]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_CHAT_LENGTH);
}

/* ---------------------------
   PLAYER & BOTS
---------------------------- */

// Aggiornata per accettare isBot, startMass e startSpeed
function createPlayer(id, name, isBot = false, startMass = 25, startSpeed = 7) {
  const p = {
    id,
    name: cleanName(name),
    color: randomColor(),

    x: WORLD / 2,
    y: WORLD / 2,

    targetX: WORLD / 2,
    targetY: WORLD / 2,

    r: startMass, // Massa personalizzata
    baseSpeed: startSpeed, // Velocità personalizzata
    isBot: isBot, // Identificatore bot

    energy: 100,
    score: 0,

    cells: [],

    lastMove: 0,
    lastSplit: 0,
    lastEject: 0,
    lastChat: 0,

    boosting: false,
    speedBoostUntil: 0,
    spawnProtectUntil: Date.now() + SPAWN_PROTECT_MS,
    comboCount: 0,
    comboUntil: 0,

    socket: null
  };

  findSpawn(p);
  ensureCells(p); // Crea fisicamente la cellula nel mondo, altrimenti il player/bot non si muove mai

  return p;
}

function findSpawn(player) {
  for (let attempt = 0; attempt < 100; attempt++) {
    const x = random(200, WORLD - 200);
    const y = random(200, WORLD - 200);

    let good = true;

    for (const other of players.values()) {
      if (distance(
        { x, y },
        { x: other.x, y: other.y }
      ) < 350) {
        good = false;
        break;
      }
    }

    if (good) {
      player.x = x;
      player.y = y;
      player.targetX = x;
      player.targetY = y;
      return;
    }
  }

  player.x = random(300, WORLD - 300);
  player.y = random(300, WORLD - 300);
  player.targetX = player.x;
  player.targetY = player.y;
}

// Mantiene il numero di bot configurato nel server
function updateBots() {
  let currentBots = 0;
  for (const p of players.values()) {
    if (p.isBot) currentBots++;
  }
  
  while (currentBots < targetBotCount && players.size < MAX_PLAYERS) {
    const id = "bot_" + randomId();
    const botName = "Bot_" + Math.floor(random(1000, 9999));
    const bot = createPlayer(id, botName, true, 25, 5); // I bot hanno statistiche standard
    players.set(id, bot);
    currentBots++;
  }
  
  // Rimuovi bot in eccesso se il target viene abbassato
  if (currentBots > targetBotCount) {
    let toRemove = currentBots - targetBotCount;
    for (const p of players.values()) {
      if (p.isBot && toRemove > 0) {
        killPlayer(p);
        toRemove--;
      }
    }
  }
}

// Intelligenza artificiale basilare per i bot
function updateBotsAI() {
  for (const p of players.values()) {
    if (p.isBot) {
      // 5% di probabilità per tick di cambiare direzione casualmente
      if (Math.random() < 0.05) {
        p.targetX = p.x + random(-600, 600);
        p.targetY = p.y + random(-600, 600);
        p.targetX = clamp(p.targetX, 0, WORLD);
        p.targetY = clamp(p.targetY, 0, WORLD);
      }
    }
  }
}

/* ---------------------------
   CELLS
---------------------------- */

function getCells(player) {
  if (player.cells.length > 0) {
    return player.cells;
  }

  return [{
    id: player.id,
    x: player.x,
    y: player.y,
    r: player.r,
    vx: 0,
    vy: 0,
    boost: 0
  }];
}

function ensureCells(player) {
  if (player.cells.length === 0) {
    player.cells.push({
      id: player.id,
      x: player.x,
      y: player.y,
      r: player.r,
      vx: 0,
      vy: 0,
      boost: 0,
      mergeTimer: 0
    });
  }
}

function syncPlayerMainData(player) {
  if (player.cells.length === 1) {
    const c = player.cells[0];

    player.x = c.x;
    player.y = c.y;
    player.r = c.r;
  }
}

function publicPlayer(player) {
  const cells = getCells(player);
  const now = Date.now();

  return {
    id: player.id,
    name: player.name,
    color: player.color,
    role: player.role || "user",
    score: Math.floor(player.score),
    energy: Math.floor(player.energy),
    speedBoostMsLeft: Math.max(0, player.speedBoostUntil - now),
    spawnProtectMsLeft: Math.max(0, player.spawnProtectUntil - now),

    cells: cells.map(c => ({
      id: c.id,
      x: c.x,
      y: c.y,
      r: c.r
    }))
  };
}

/* ---------------------------
   MOVIMENTO
---------------------------- */

function movePlayer(player) {
  const cells = getCells(player);

  for (const cell of cells) {
    const dx = player.targetX - cell.x;
    const dy = player.targetY - cell.y;

    const d = Math.hypot(dx, dy);

    if (d < 2) continue;

    // Utilizza la baseSpeed impostata dal client o 7 di default
    let speed = (player.baseSpeed || 7) * Math.pow(25 / Math.max(cell.r, 1), 0.43);

    // Scala il clamp basandosi sulla velocità base personalizzata
    speed = clamp(speed, 0.75, (player.baseSpeed * 1.15) || 8);

    if (player.speedBoostUntil > Date.now()) speed *= 1.35;

    if (player.boosting && player.energy > 0) {
      speed *= BOOST_SPEED_MULT;
      player.energy = clamp(player.energy - BOOST_ENERGY_DRAIN * (TICK / 1000), 0, 100);
    }

    cell.x += (dx / d) * speed;
    cell.y += (dy / d) * speed;

    if (cell.boost > 0) {
      cell.x += cell.vx || 0;
      cell.y += cell.vy || 0;

      cell.vx *= 0.90;
      cell.vy *= 0.90;

      cell.boost--;
    }

    cell.x = clamp(cell.x, cell.r, WORLD - cell.r);
    cell.y = clamp(cell.y, cell.r, WORLD - cell.r);
  }

  syncPlayerMainData(player);
}

/* ---------------------------
   CIBO E LOGICHE GIOCO
---------------------------- */

function eatFood() {
  for (const player of players.values()) {
    const cells = getCells(player);

    for (const cell of cells) {
      for (let i = foods.length - 1; i >= 0; i--) {
        const food = foods[i];

        if (distance(cell, food) < cell.r + food.r) {
          cell.r = Math.sqrt(cell.r * cell.r + 1);
          player.score += 1;

          foods.splice(i, 1);
          foods.push(makeFood());
        }
      }
    }
    syncPlayerMainData(player);
  }
}

function splitPlayer(player) {
  const now = Date.now();
  if (now - player.lastSplit < 900) return;

  ensureCells(player);
  if (player.cells.length >= 16) return;

  player.lastSplit = now;

  const originalCells = [...player.cells];
  const created = [];

  for (const cell of originalCells) {
    if (cell.r < 24) continue;
    if (player.cells.length + created.length >= 16) break;

    const oldRadius = cell.r;
    const newRadius = oldRadius / Math.sqrt(2);
    cell.r = newRadius;

    const angle = Math.atan2(player.targetY - cell.y, player.targetX - cell.x);

    const child = {
      id: randomId(),
      x: clamp(cell.x + Math.cos(angle) * newRadius * 1.8, newRadius, WORLD - newRadius),
      y: clamp(cell.y + Math.sin(angle) * newRadius * 1.8, newRadius, WORLD - newRadius),
      r: newRadius,
      vx: Math.cos(angle) * 13,
      vy: Math.sin(angle) * 13,
      boost: 28,
      mergeTimer: MERGE_TIME_MS
    };

    cell.mergeTimer = MERGE_TIME_MS;
    created.push(child);
  }

  player.cells.push(...created);
  syncPlayerMainData(player);
}

/* ---------------------------
   MERGE (ricongiunzione cellule dopo split)
---------------------------- */

function mergeCells(player) {
  if (player.cells.length < 2) return;

  for (const c of player.cells) {
    if (c.mergeTimer > 0) c.mergeTimer = Math.max(0, c.mergeTimer - TICK);
  }

  for (let i = 0; i < player.cells.length; i++) {
    for (let j = player.cells.length - 1; j > i; j--) {
      const a = player.cells[i];
      const b = player.cells[j];

      if (a.mergeTimer > 0 || b.mergeTimer > 0) continue;
      if (distance(a, b) >= (a.r + b.r) * 0.72) continue;

      const total = a.r * a.r + b.r * b.r;
      a.x = (a.x * a.r * a.r + b.x * b.r * b.r) / total;
      a.y = (a.y * a.r * a.r + b.y * b.r * b.r) / total;
      a.r = Math.sqrt(total);

      player.cells.splice(j, 1);
    }
  }

  syncPlayerMainData(player);
}

/* ---------------------------
   VIRUS
---------------------------- */

function virusCollisions() {
  for (const player of players.values()) {
    const cells = getCells(player);

    for (let i = cells.length - 1; i >= 0; i--) {
      const c = cells[i];
      if (c.r < 55) continue;
      if (player.cells.length >= 16) continue;

      for (let vi = 0; vi < viruses.length; vi++) {
        const v = viruses[vi];
        if (distance(c, v) >= c.r + v.r * 0.35) continue;

        const freeSlots = 16 - player.cells.length + 1;
        const amount = Math.max(2, Math.min(8, freeSlots));
        const mass = c.r * c.r;
        const pieceMass = mass / amount;

        c.r = Math.sqrt(pieceMass);
        c.mergeTimer = MERGE_TIME_MS;

        const pieces = [];
        for (let k = 0; k < amount - 1; k++) {
          const angle = (Math.PI * 2 * k) / (amount - 1);
          pieces.push({
            id: randomId(),
            x: clamp(c.x + Math.cos(angle) * c.r * 2, c.r, WORLD - c.r),
            y: clamp(c.y + Math.sin(angle) * c.r * 2, c.r, WORLD - c.r),
            r: c.r,
            vx: Math.cos(angle) * 15,
            vy: Math.sin(angle) * 15,
            boost: 20,
            mergeTimer: MERGE_TIME_MS
          });
        }

        player.cells.push(...pieces);
        syncPlayerMainData(player);

        viruses.splice(vi, 1);
        viruses.push(makeVirus());
        break;
      }
    }
  }
}

/* ---------------------------
   POWERUP
---------------------------- */

function updatePowerups() {
  powerupSpawnTimer -= TICK;
  if (powerupSpawnTimer <= 0 && powerups.length < POWERUP_TARGET) {
    powerups.push(makePowerup());
    powerupSpawnTimer = random(10000, 18000);
  }

  for (const player of players.values()) {
    const cells = getCells(player);

    for (let pi = powerups.length - 1; pi >= 0; pi--) {
      const p = powerups[pi];
      let taken = false;

      for (const c of cells) {
        if (distance(c, p) >= c.r + p.r) continue;

        if (p.type === "speed") {
          player.speedBoostUntil = Date.now() + 8000;
        } else {
          let biggest = cells[0];
          for (const cc of cells) if (cc.r > biggest.r) biggest = cc;
          biggest.r = Math.sqrt(biggest.r * biggest.r + 30 * 30);
          syncPlayerMainData(player);
        }

        taken = true;
        break;
      }

      if (taken) {
        powerups.splice(pi, 1);
      }
    }
  }
}

function ejectMass(player) {
  const now = Date.now();
  if (now - player.lastEject < 120 || player.energy < 8) return;

  player.lastEject = now;
  player.energy -= 8;
  ensureCells(player);

  for (const cell of player.cells) {
    if (cell.r < 16) continue;
    cell.r = Math.sqrt(Math.max(20, cell.r * cell.r - 6));

    const angle = Math.atan2(player.targetY - cell.y, player.targetX - cell.x);

    foods.push({
      id: randomId(),
      x: clamp(cell.x + Math.cos(angle) * cell.r * 1.5, 10, WORLD - 10),
      y: clamp(cell.y + Math.sin(angle) * cell.r * 1.5, 10, WORLD - 10),
      r: 8,
      color: player.color
    });
  }
  syncPlayerMainData(player);
}

function allCells() {
  const result = [];
  for (const player of players.values()) {
    const cells = getCells(player);
    for (const cell of cells) {
      result.push({ owner: player, cell });
    }
  }
  return result;
}

function killPlayer(player) {
  if (!players.has(player.id)) return;
  try {
    if (player.socket && player.socket.readyState === WebSocket.OPEN) {
      player.socket.send(JSON.stringify({ type: "dead", score: player.score }));
    }
  } catch {}
  players.delete(player.id);
}

function collisions() {
  const cells = allCells();

  for (let i = 0; i < cells.length; i++) {
    for (let j = i + 1; j < cells.length; j++) {
      const A = cells[i];
      const B = cells[j];

      if (A.owner === B.owner || !players.has(A.owner.id) || !players.has(B.owner.id)) continue;

      const a = A.cell;
      const b = B.cell;
      const d = distance(a, b);

      if (d > Math.max(a.r, b.r) * 0.78) continue;

      let big = A;
      let small = B;

      if (b.r > a.r) {
        big = B;
        small = A;
      }

      if (big.cell.r <= small.cell.r * 1.12) continue;

      const now = Date.now();
      if (small.owner.spawnProtectUntil && small.owner.spawnProtectUntil > now) continue;

      big.cell.r = Math.sqrt(big.cell.r * big.cell.r + small.cell.r * small.cell.r * 0.82);
      const owner = small.owner;
      const victimName = owner.name;
      const wasLastCell = owner.cells.length <= 1;

      if (owner.cells.length > 0) {
        owner.cells = owner.cells.filter(c => c.id !== small.cell.id);
        if (owner.cells.length === 0) killPlayer(owner);
      } else {
        killPlayer(owner);
      }

      big.owner.score += Math.floor(small.cell.r * small.cell.r);
      syncPlayerMainData(big.owner);

      if (wasLastCell) {
        const killer = big.owner;
        if (now < killer.comboUntil) killer.comboCount++;
        else killer.comboCount = 1;
        killer.comboUntil = now + COMBO_WINDOW_MS;

        try {
          if (killer.socket && killer.socket.readyState === WebSocket.OPEN) {
            killer.socket.send(JSON.stringify({
              type: "kill",
              combo: killer.comboCount,
              victim: victimName
            }));
          }
        } catch {}

        addSystemMessage("SYS_ALERT", "#0088ff", "[KILL] " + killer.name + " ha eliminato " + victimName);
      }
    }
  }
}

/* ---------------------------
   CHAT
---------------------------- */

const CHAT_COOLDOWN_MS = 600;

function addChatMessage(player, text) {
  const now = Date.now();
  if (now - (player.lastChat || 0) < CHAT_COOLDOWN_MS) return; // anti-spam
  player.lastChat = now;

  text = cleanMessage(text);
  if (!text) return;

  if (text.startsWith("/")) {
    handleChatCommand(player, text);
    return;
  }

  if (mutedNames.has(player.name.toLowerCase())) {
    sendSystemToPlayer(player, "Sei silenziato da uno Staff member e non puoi scrivere in chat.");
    return;
  }

  const message = {
    id: randomId(),
    playerId: player.id,
    name: player.name,
    color: player.color,
    role: player.role || "user",
    text,
    time: new Date().toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" })
  };

  chat.push(message);
  if (chat.length > 80) chat.splice(0, chat.length - 80);
  broadcastChat();
}

// Invia un messaggio di sistema visibile solo a un giocatore (non salvato nella history condivisa)
function sendSystemToPlayer(player, text) {
  if (!player.socket || player.socket.readyState !== WebSocket.OPEN) return;
  const localMsg = {
    id: randomId(),
    playerId: null,
    name: "SYS_STAFF",
    color: "#ff6680",
    role: "admin",
    text,
    time: new Date().toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" })
  };
  try {
    player.socket.send(JSON.stringify({ type: "chatHistory", messages: [...chat, localMsg] }));
  } catch {}
}

function findPlayerByName(name) {
  const low = (name || "").toLowerCase();
  for (const p of players.values()) {
    if (p.name.toLowerCase() === low) return p;
  }
  return null;
}

// Comandi chat riservati allo Staff (Admin / Moderatore): /kick /mute /unmute, + /help per tutti
function handleChatCommand(player, text) {
  const parts = text.slice(1).trim().split(/\s+/);
  const cmd = (parts.shift() || "").toLowerCase();
  const arg = parts.join(" ");

  if (cmd === "help") {
    const staffHelp = roleAtLeast(player.role, "moderator")
      ? " Comandi Staff: /kick <nome>, /mute <nome>, /unmute <nome>."
      : "";
    sendSystemToPlayer(player, "Comandi disponibili: /help." + staffHelp);
    return;
  }

  if (!["kick", "mute", "unmute"].includes(cmd)) return;

  if (!roleAtLeast(player.role, "moderator")) {
    sendSystemToPlayer(player, "Non hai i permessi per usare questo comando (richiede ruolo Moderatore o Admin).");
    return;
  }

  if (!arg) {
    sendSystemToPlayer(player, "Uso: /" + cmd + " <nome giocatore>");
    return;
  }

  if (cmd === "kick") {
    const target = findPlayerByName(arg);
    if (target && target.socket) {
      try { target.socket.close(); } catch {}
      addSystemMessage("SYS_MOD", "#ff6680", player.name + " ha espulso " + target.name + " dalla partita.");
    } else {
      sendSystemToPlayer(player, "Giocatore \"" + arg + "\" non trovato.");
    }
  } else if (cmd === "mute") {
    mutedNames.add(arg.toLowerCase());
    addSystemMessage("SYS_MOD", "#ff6680", player.name + " ha silenziato " + arg + ".");
  } else if (cmd === "unmute") {
    mutedNames.delete(arg.toLowerCase());
    addSystemMessage("SYS_MOD", "#ff6680", player.name + " ha riattivato la chat di " + arg + ".");
  }
}

// Messaggi di sistema (join/leave/kill): non soggetti al cooldown anti-spam del giocatore
function addSystemMessage(name, color, text) {
  const message = {
    id: randomId(),
    playerId: null,
    name,
    color,
    text,
    time: new Date().toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" })
  };

  chat.push(message);
  if (chat.length > 80) chat.splice(0, chat.length - 80);
  broadcastChat();
}

function broadcastChat() {
  const data = JSON.stringify({ type: "chatHistory", messages: chat });
  for (const player of players.values()) {
    if (player.socket && player.socket.readyState === WebSocket.OPEN) {
      try { player.socket.send(data); } catch {}
    }
  }
}

function broadcastPlayerCount() {
  const data = JSON.stringify({ type: "playerCount", count: players.size });
  for (const player of players.values()) {
    if (player.socket && player.socket.readyState === WebSocket.OPEN) {
      try { player.socket.send(data); } catch {}
    }
  }
}

/* ---------------------------
   SERVER GAME LOOP
---------------------------- */

function update() {
  updateBots();   // Gestisci la quantità di bot
  updateBotsAI(); // Calcola i movimenti AI

  for (const player of players.values()) {
    movePlayer(player);
    player.energy = clamp(player.energy + 0.35, 0, 100);
    mergeCells(player);
  }

  eatFood();
  collisions();
  virusCollisions();
  updatePowerups();
}

/* ---------------------------
   BROADCAST
---------------------------- */

function broadcastState() {
  const state = JSON.stringify({
    type: "state",
    world: WORLD,
    foods,
    viruses,
    powerups,
    players: [...players.values()].map(publicPlayer)
  });

  for (const player of players.values()) {
    if (player.socket && player.socket.readyState === WebSocket.OPEN) {
      try { player.socket.send(state); } catch {}
    }
  }
}

/* ---------------------------
   ACCOUNT SYSTEM
   Registrazione/login classica + login social (Google, Facebook,
   Apple, Discord, X). Le credenziali OAuth di ogni provider vanno
   messe come variabili d'ambiente (vedi fondo file / README).
   NB: gli utenti sono salvati in data/users.json (semplice, senza
   database esterno). Le sessioni sono in memoria: riavviando il
   server tutti dovranno rifare il login.
---------------------------- */

const DATA_DIR = path.join(__dirname, "data");
const USERS_FILE = path.join(DATA_DIR, "users.json");

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(USERS_FILE)) fs.writeFileSync(USERS_FILE, "{}");

function loadUsers() {
  try {
    return JSON.parse(fs.readFileSync(USERS_FILE, "utf8"));
  } catch {
    return {};
  }
}

function saveUsers(users) {
  fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
}

// token di sessione -> username. In memoria (semplice e sufficiente
// per un gioco indie; per produzione seria conviene un JWT o un DB).
const sessions = new Map();

function hashPassword(password, salt = crypto.randomBytes(16).toString("hex")) {
  const hash = crypto.scryptSync(String(password), salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

function verifyPassword(password, stored) {
  const [salt, hash] = String(stored || "").split(":");
  if (!salt || !hash) return false;
  const check = crypto.scryptSync(String(password), salt, 64).toString("hex");
  return crypto.timingSafeEqual(Buffer.from(hash), Buffer.from(check));
}

function createSession(username) {
  const token = crypto.randomBytes(32).toString("hex");
  sessions.set(token, username);
  return token;
}

function getUserByToken(token) {
  if (!token || !sessions.has(token)) return null;
  const users = loadUsers();
  const username = sessions.get(token);
  return users[username] ? { username, ...users[username] } : null;
}

function getSessionUser(req) {
  const auth = req.headers["authorization"] || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
  return getUserByToken(token);
}

function publicUser(u) {
  return {
    username: u.username,
    email: u.email || null,
    provider: u.provider || "local",
    role: roleForUser(u),
    level: u.level || 1,
    xp: u.xp || 0,
    coins: u.coins || 0,
    skins: u.skins || ["default"],
    equippedSkin: u.equippedSkin || "default"
  };
}

function readJSONBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    let size = 0;
    req.on("data", chunk => {
      size += chunk.length;
      if (size > 1e6) { req.destroy(); reject(new Error("Payload troppo grande")); return; }
      body += chunk;
    });
    req.on("end", () => {
      try { resolve(body ? JSON.parse(body) : {}); }
      catch { reject(new Error("JSON non valido")); }
    });
    req.on("error", reject);
  });
}

function sendJSON(res, status, data) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(data));
}

function validUsername(name) {
  return typeof name === "string" && /^[a-zA-Z0-9_.-]{3,20}$/.test(name);
}

/* -------- API: registrazione / login classici -------- */

async function handleApiRegister(req, res) {
  let body;
  try { body = await readJSONBody(req); } catch (e) { return sendJSON(res, 400, { error: e.message }); }

  const username = String(body.username || "").trim();
  const email = String(body.email || "").trim();
  const password = String(body.password || "");

  if (!validUsername(username)) {
    return sendJSON(res, 400, { error: "Username non valido (3-20 caratteri: lettere, numeri, _ . -)" });
  }
  if (password.length < 6) {
    return sendJSON(res, 400, { error: "La password deve avere almeno 6 caratteri" });
  }

  const users = loadUsers();
  if (users[username]) {
    return sendJSON(res, 409, { error: "Username già registrato" });
  }

  users[username] = {
    username,
    email: email || null,
    provider: "local",
    passwordHash: hashPassword(password),
    role: "user",
    level: 1,
    xp: 0,
    coins: 0,
    skins: ["default"],
    equippedSkin: "default",
    createdAt: Date.now()
  };
  saveUsers(users);

  const token = createSession(username);
  sendJSON(res, 201, { token, user: publicUser(users[username]) });
}

async function handleApiLogin(req, res) {
  let body;
  try { body = await readJSONBody(req); } catch (e) { return sendJSON(res, 400, { error: e.message }); }

  const username = String(body.username || "").trim();
  const password = String(body.password || "");
  const users = loadUsers();
  const user = users[username];

  if (!user || user.provider !== "local" || !verifyPassword(password, user.passwordHash)) {
    return sendJSON(res, 401, { error: "Credenziali non valide" });
  }

  const token = createSession(username);
  sendJSON(res, 200, { token, user: publicUser(user) });
}

function handleApiMe(req, res) {
  const user = getSessionUser(req);
  if (!user) return sendJSON(res, 401, { error: "Non autenticato" });
  sendJSON(res, 200, { user: publicUser(user) });
}

async function handleApiProgress(req, res) {
  const session = getSessionUser(req);
  if (!session) return sendJSON(res, 401, { error: "Non autenticato" });

  let body;
  try { body = await readJSONBody(req); } catch (e) { return sendJSON(res, 400, { error: e.message }); }

  const users = loadUsers();
  const user = users[session.username];
  if (!user) return sendJSON(res, 404, { error: "Utente non trovato" });

  if (Number.isFinite(body.level)) user.level = clamp(Math.floor(body.level), 1, 1000);
  if (Number.isFinite(body.xp)) user.xp = Math.max(0, Math.floor(body.xp));
  if (Number.isFinite(body.coins)) user.coins = Math.max(0, Math.floor(body.coins));
  if (Array.isArray(body.skins)) user.skins = [...new Set(["default", ...body.skins.map(String)])];
  if (typeof body.equippedSkin === "string") user.equippedSkin = body.equippedSkin;

  saveUsers(users);
  sendJSON(res, 200, { user: publicUser(user) });
}

function handleApiLogout(req, res) {
  const auth = req.headers["authorization"] || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
  if (token) sessions.delete(token);
  sendJSON(res, 200, { ok: true });
}

/* -------- LOGIN SOCIALE (5 provider) --------
   Ogni provider richiede un'app registrata sul relativo pannello
   sviluppatori, da cui ottieni CLIENT_ID e CLIENT_SECRET, da mettere
   come variabili d'ambiente. Redirect URI da configurare presso il
   provider: `${SITE_URL}/auth/<provider>/callback`
*/

const OAUTH_PROVIDERS = {
  google: {
    authUrl: "https://accounts.google.com/o/oauth2/v2/auth",
    tokenUrl: "https://oauth2.googleapis.com/token",
    profileUrl: "https://www.googleapis.com/oauth2/v3/userinfo",
    scope: "openid email profile",
    clientId: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    extraAuthParams: { response_type: "code", access_type: "online" },
    mapProfile: p => ({ id: p.sub, name: p.name || p.email, email: p.email })
  },
  facebook: {
    authUrl: "https://www.facebook.com/v19.0/dialog/oauth",
    tokenUrl: "https://graph.facebook.com/v19.0/oauth/access_token",
    profileUrl: "https://graph.facebook.com/me?fields=id,name,email",
    scope: "email public_profile",
    clientId: process.env.FACEBOOK_CLIENT_ID,
    clientSecret: process.env.FACEBOOK_CLIENT_SECRET,
    extraAuthParams: { response_type: "code" },
    mapProfile: p => ({ id: p.id, name: p.name, email: p.email })
  },
  discord: {
    authUrl: "https://discord.com/api/oauth2/authorize",
    tokenUrl: "https://discord.com/api/oauth2/token",
    profileUrl: "https://discord.com/api/users/@me",
    scope: "identify email",
    clientId: process.env.DISCORD_CLIENT_ID,
    clientSecret: process.env.DISCORD_CLIENT_SECRET,
    extraAuthParams: { response_type: "code" },
    mapProfile: p => ({ id: p.id, name: p.username, email: p.email })
  },
  twitter: {
    authUrl: "https://twitter.com/i/oauth2/authorize",
    tokenUrl: "https://api.twitter.com/2/oauth2/token",
    profileUrl: "https://api.twitter.com/2/users/me",
    scope: "tweet.read users.read offline.access",
    clientId: process.env.TWITTER_CLIENT_ID,
    clientSecret: process.env.TWITTER_CLIENT_SECRET,
    extraAuthParams: { response_type: "code" },
    pkce: true, // X/Twitter richiede PKCE anche con client confidenziale
    mapProfile: p => ({ id: p.data.id, name: p.data.name, email: null })
  }
  // Apple Sign In non usa un authorization-code flow standard: richiede
  // un client_secret firmato come JWT con la chiave privata .p8 del tuo
  // account Apple Developer, e la risposta arriva via POST (form_post),
  // non redirect GET. Vedi handleAppleAuth più sotto: è predisposto ma
  // richiede che tu inserisca APPLE_TEAM_ID, APPLE_KEY_ID, APPLE_CLIENT_ID
  // e la chiave privata APPLE_PRIVATE_KEY per attivarsi davvero.
};

const oauthState = new Map(); // state -> { provider, verifier, createdAt }

function cleanupOauthState() {
  const now = Date.now();
  for (const [state, entry] of oauthState) {
    if (now - entry.createdAt > 10 * 60 * 1000) oauthState.delete(state);
  }
}

function base64url(buf) {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function findOrCreateSocialUser(provider, profile) {
  const users = loadUsers();
  const key = `${provider}:${profile.id}`;

  let username = Object.keys(users).find(u => users[u].socialKey === key);
  if (!username) {
    let base = validUsername(profile.name) ? profile.name : `${provider}_${profile.id}`.slice(0, 20);
    username = base;
    let i = 1;
    while (users[username]) username = `${base}_${i++}`.slice(0, 20);

    users[username] = {
      username,
      email: profile.email || null,
      provider,
      socialKey: key,
      role: "user",
      level: 1,
      xp: 0,
      coins: 0,
      skins: ["default"],
      equippedSkin: "default",
      createdAt: Date.now()
    };
    saveUsers(users);
  }
  return users[username];
}

function handleAuthStart(req, res, provider) {
  const cfg = OAUTH_PROVIDERS[provider];
  if (!cfg || !cfg.clientId || !cfg.clientSecret) {
    res.writeHead(302, { Location: "/?authError=" + encodeURIComponent(provider + "_not_configured") });
    return res.end();
  }

  cleanupOauthState();
  const state = crypto.randomBytes(16).toString("hex");
  const entry = { provider, createdAt: Date.now() };

  const params = new URLSearchParams({
    client_id: cfg.clientId,
    redirect_uri: `${SITE_URL}/auth/${provider}/callback`,
    scope: cfg.scope,
    state,
    ...cfg.extraAuthParams
  });

  if (cfg.pkce) {
    const verifier = base64url(crypto.randomBytes(32));
    const challenge = base64url(crypto.createHash("sha256").update(verifier).digest());
    entry.verifier = verifier;
    params.set("code_challenge", challenge);
    params.set("code_challenge_method", "S256");
  }

  oauthState.set(state, entry);

  res.writeHead(302, { Location: `${cfg.authUrl}?${params.toString()}` });
  res.end();
}

async function handleAuthCallback(req, res, provider, query) {
  const cfg = OAUTH_PROVIDERS[provider];
  const { code, state, error } = query;

  if (error || !cfg) {
    res.writeHead(302, { Location: "/?authError=" + encodeURIComponent(error || "unknown_provider") });
    return res.end();
  }

  const entry = oauthState.get(state);
  if (!entry || entry.provider !== provider) {
    res.writeHead(302, { Location: "/?authError=invalid_state" });
    return res.end();
  }
  oauthState.delete(state);

  try {
    const tokenParams = new URLSearchParams({
      client_id: cfg.clientId,
      client_secret: cfg.clientSecret,
      code,
      grant_type: "authorization_code",
      redirect_uri: `${SITE_URL}/auth/${provider}/callback`
    });
    if (cfg.pkce) tokenParams.set("code_verifier", entry.verifier);

    const tokenResp = await fetch(cfg.tokenUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: tokenParams.toString()
    });
    const tokenData = await tokenResp.json();
    if (!tokenData.access_token) throw new Error("Nessun access_token ricevuto da " + provider);

    const profileResp = await fetch(cfg.profileUrl, {
      headers: { Authorization: `Bearer ${tokenData.access_token}` }
    });
    const profileRaw = await profileResp.json();
    const profile = cfg.mapProfile(profileRaw);

    const user = await findOrCreateSocialUser(provider, profile);
    const sessionToken = createSession(user.username);

    res.writeHead(302, {
      Location: "/?token=" + encodeURIComponent(sessionToken) + "&welcome=" + encodeURIComponent(user.username)
    });
    res.end();
  } catch (err) {
    console.error(`Errore login ${provider}:`, err.message);
    res.writeHead(302, { Location: "/?authError=" + encodeURIComponent(provider + "_failed") });
    res.end();
  }
}

// Apple Sign In: predisposto ma richiede configurazione extra (vedi sopra).
// Se le variabili non sono impostate risponde semplicemente con l'errore,
// così il pulsante non si rompe silenziosamente.
function handleAppleAuthStart(req, res) {
  if (!process.env.APPLE_CLIENT_ID || !process.env.APPLE_TEAM_ID || !process.env.APPLE_KEY_ID || !process.env.APPLE_PRIVATE_KEY) {
    res.writeHead(302, { Location: "/?authError=apple_not_configured" });
    return res.end();
  }
  // Implementazione completa richiede firma JWT del client_secret con la
  // chiave privata Apple (.p8) e gestione della risposta POST form_post.
  // Struttura pronta: aggiungi qui la generazione del JWT (es. libreria
  // 'jsonwebtoken') quando avrai le tue credenziali Apple Developer.
  res.writeHead(302, { Location: "/?authError=apple_not_implemented" });
  res.end();
}

/* ---------------------------
   HTTP SERVER
---------------------------- */

const publicDir = path.join(__dirname, "public");

const server = http.createServer((req, res) => {
  const fullUrl = new URL(req.url, SITE_URL);
  let requestPath = fullUrl.pathname;
  const query = Object.fromEntries(fullUrl.searchParams);

  /* --- API account (registrazione/login/profilo/progressi) --- */
  if (requestPath === "/api/register" && req.method === "POST") return handleApiRegister(req, res);
  if (requestPath === "/api/login" && req.method === "POST") return handleApiLogin(req, res);
  if (requestPath === "/api/logout" && req.method === "POST") return handleApiLogout(req, res);
  if (requestPath === "/api/me" && req.method === "GET") return handleApiMe(req, res);
  if (requestPath === "/api/progress" && req.method === "POST") return handleApiProgress(req, res);

  /* --- Login sociale --- */
  const authMatch = requestPath.match(/^\/auth\/([a-z]+)(\/callback)?$/);
  if (authMatch) {
    const provider = authMatch[1];
    const isCallback = !!authMatch[2];

    if (provider === "apple" && !isCallback) return handleAppleAuthStart(req, res);
    if (provider === "apple") {
      res.writeHead(302, { Location: "/?authError=apple_not_configured" });
      return res.end();
    }
    if (OAUTH_PROVIDERS[provider]) {
      return isCallback
        ? handleAuthCallback(req, res, provider, query)
        : handleAuthStart(req, res, provider);
    }
  }

  if (requestPath === "/") requestPath = "/index.html";

  let filename;
  try {
    filename = path.resolve(publicDir, "." + requestPath);
  } catch {
    res.writeHead(400);
    return res.end("Bad request");
  }

  if (filename !== publicDir && !filename.startsWith(publicDir + path.sep)) {
    res.writeHead(403);
    return res.end("Forbidden");
  }

  fs.readFile(filename, (error, data) => {
    if (error) {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      return res.end("Not found");
    }

    const ext = path.extname(filename).toLowerCase();
    const types = {
      ".html": "text/html; charset=utf-8",
      ".js": "text/javascript; charset=utf-8",
      ".css": "text/css; charset=utf-8",
      ".json": "application/json; charset=utf-8",
      ".png": "image/png",
      ".jpg": "image/jpeg",
      ".svg": "image/svg+xml",
      ".ico": "image/x-icon"
    };

    res.writeHead(200, {
      "Content-Type": types[ext] || "application/octet-stream",
      "Cache-Control": ext === ".html" ? "no-cache" : "public, max-age=3600"
    });
    res.end(data);
  });
});

/* ---------------------------
   WEBSOCKET
---------------------------- */

const wss = new WebSocket.Server({ server });

function heartbeat() {
  this.isAlive = true;
}

wss.on("connection", socket => {
  if (players.size >= MAX_PLAYERS) {
    socket.send(JSON.stringify({ type: "error", message: "Server pieno" }));
    socket.close();
    return;
  }

  socket.isAlive = true;
  socket.on("pong", heartbeat);

  const id = randomId();
  let player = null;

  socket.on("message", raw => {
    let message;
    try {
      message = JSON.parse(raw.toString());
    } catch { return; }

    /* JOIN */
    if (message.type === "join") {
      if (player) return;

      // Accetta le nuove statistiche fornite dal client
      const startMass = message.startMass ? Number(message.startMass) : 25;
      const startSpeed = message.startSpeed ? Number(message.startSpeed) : 7;
      if (message.botCount !== undefined) targetBotCount = Number(message.botCount);

      player = createPlayer(id, message.name, false, startMass, startSpeed);
      if (typeof message.color === "string" && /^#[0-9a-fA-F]{6}$/.test(message.color)) {
        player.color = message.color;
      }

      const accountUser = typeof message.token === "string" ? getUserByToken(message.token) : null;
      player.role = roleForUser(accountUser);
      player.accountUsername = accountUser ? accountUser.username : null;

      player.socket = socket;
      players.set(id, player);

      socket.send(JSON.stringify({
        type: "welcome",
        id,
        world: WORLD,
        playerCount: players.size
      }));
      socket.send(JSON.stringify({ type: "chatHistory", messages: chat }));
      addSystemMessage("SYS_LOG", "#0088ff", player.name + " è entrato nella partita");
      broadcastPlayerCount();
      return;
    }

    if (!player) return;

    /* SETTINGS - Riceve i comandi del menu in tempo reale */
    if (message.type === "settings") {
      if (message.startMass) {
        const newMass = Number(message.startMass);
        player.r = newMass;
        for (const cell of player.cells) cell.r = newMass;
      }
      if (message.startSpeed) player.baseSpeed = Number(message.startSpeed);
      if (message.botCount !== undefined) targetBotCount = Number(message.botCount);
    }

    /* MOVIMENTO */
    else if (message.type === "move") {
      const x = Number(message.x);
      const y = Number(message.y);
      if (Number.isFinite(x) && Number.isFinite(y)) {
        player.targetX = clamp(x, 0, WORLD);
        player.targetY = clamp(y, 0, WORLD);
      }
    }

    /* SPLIT */
    else if (message.type === "split") {
      splitPlayer(player);
    }

    /* EJECT */
    else if (message.type === "eject") {
      ejectMass(player);
    }

    /* BOOST (E tenuto premuto) */
    else if (message.type === "boosting") {
      player.boosting = !!message.value;
    }

    /* DASH (SHIFT) */
    else if (message.type === "dash") {
      if (player.energy >= DASH_COST) {
        player.energy -= DASH_COST;
        ensureCells(player);
        for (const cell of player.cells) {
          const angle = Math.atan2(player.targetY - cell.y, player.targetX - cell.x);
          cell.vx = Math.cos(angle) * DASH_IMPULSE;
          cell.vy = Math.sin(angle) * DASH_IMPULSE;
          cell.boost = Math.max(cell.boost, 16);
        }
      }
    }

    /* CHAT */
    else if (message.type === "chat") {
      addChatMessage(player, message.text);
    }

    /* CAMBIO NOME */
    else if (message.type === "changeName") {
      const newName = cleanName(message.name);
      if (newName) player.name = newName;
    }
  });

  socket.on("close", () => {
    if (player) {
      addSystemMessage("SYS_LOG", "#0088ff", player.name + " ha lasciato la partita");
      players.delete(player.id);
      broadcastPlayerCount();
    }
  });

  socket.on("error", () => {});
});

// Ripulisce periodicamente i socket morti (connessioni cadute senza un "close" pulito),
// altrimenti restano fantasma nella mappa e occupano uno slot giocatore per sempre.
const heartbeatInterval = setInterval(() => {
  for (const socket of wss.clients) {
    if (socket.isAlive === false) {
      socket.terminate();
      continue;
    }
    socket.isAlive = false;
    socket.ping();
  }
}, 20000);

wss.on("close", () => clearInterval(heartbeatInterval));

/* ---------------------------
   START
---------------------------- */

setInterval(() => {
  update();
  broadcastState();
}, TICK);

server.listen(PORT, "0.0.0.0", () => {
  console.log(`Zero And Yassine Evolution avviato sulla porta ${PORT}`);
  console.log(`World: ${WORLD}x${WORLD}`);
});
