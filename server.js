const http = require("http");
const fs = require("fs");
const path = require("path");
const WebSocket = require("ws");

const PORT = process.env.PORT || 3000;

const WORLD = 6000;
const TICK = 30;

const FOOD_COUNT = 850;
const MAX_PLAYERS = 60;
const MAX_CHAT_LENGTH = 180;

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
const chat = [];

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

/* ---------------------------
   SICUREZZA CHAT / NOMI
---------------------------- */

function cleanName(name) {
  return String(name || "Player")
    .replace(/[^\w ._-]/g, "")
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

function createPlayer(id, name, isBot = false, startMass = 25, startSpeed = 7) {
  const p = {
    id,
    name: cleanName(name),
    color: randomColor(),

    x: WORLD / 2,
    y: WORLD / 2,

    targetX: WORLD / 2,
    targetY: WORLD / 2,

    r: startMass, 
    baseSpeed: startSpeed, 
    isBot: isBot, 

    energy: 100,
    score: 0,

    cells: [],

    lastMove: 0,
    lastSplit: 0,
    lastEject: 0,

    socket: null
  };

  findSpawn(p);
  ensureCells(p); // IL FIX CRITICO: Crea fisicamente la cellula nel mondo!
  
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
      boost: 0
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

  return {
    id: player.id,
    name: player.name,
    color: player.color,
    score: Math.floor(player.score),
    energy: Math.floor(player.energy),

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

  player.lastSplit = now;
  ensureCells(player);

  if (player.cells.length >= 16) return;

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
      boost: 28
    };

    created.push(child);
  }

  player.cells.push(...created);
  syncPlayerMainData(player);
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

      big.cell.r = Math.sqrt(big.cell.r * big.cell.r + small.cell.r * small.cell.r * 0.82);
      const owner = small.owner;

      if (owner.cells.length > 0) {
        owner.cells = owner.cells.filter(c => c.id !== small.cell.id);
        if (owner.cells.length === 0) killPlayer(owner);
      } else {
        killPlayer(owner);
      }

      big.owner.score += Math.floor(small.cell.r * small.cell.r);
      syncPlayerMainData(big.owner);
    }
  }
}

/* ---------------------------
   CHAT
---------------------------- */

function addChatMessage(player, text) {
  text = cleanMessage(text);
  if (!text) return;

  const message = {
    id: randomId(),
    playerId: player.id,
    name: player.name,
    color: player.color,
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

/* ---------------------------
   SERVER GAME LOOP
---------------------------- */

function update() {
  updateBots();   // Gestisci la quantità di bot
  updateBotsAI(); // Calcola i movimenti AI

  for (const player of players.values()) {
    movePlayer(player);
    player.energy = clamp(player.energy + 0.35, 0, 100);
  }

  eatFood();
  collisions();
}

/* ---------------------------
   BROADCAST
---------------------------- */

function broadcastState() {
  const state = JSON.stringify({
    type: "state",
    world: WORLD,
    foods,
    players: [...players.values()].map(publicPlayer)
  });

  for (const player of players.values()) {
    if (player.socket && player.socket.readyState === WebSocket.OPEN) {
      try { player.socket.send(state); } catch {}
    }
  }
}

/* ---------------------------
   HTTP SERVER
---------------------------- */

const publicDir = path.join(__dirname, "public");

const server = http.createServer((req, res) => {
  let requestPath = req.url.split("?")[0];
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

wss.on("connection", socket => {
  if (players.size >= MAX_PLAYERS) {
    socket.send(JSON.stringify({ type: "error", message: "Server pieno" }));
    socket.close();
    return;
  }

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
      player.socket = socket;
      players.set(id, player);

      socket.send(JSON.stringify({
        type: "welcome",
        id,
        world: WORLD,
        playerCount: players.size
      }));
      socket.send(JSON.stringify({ type: "chatHistory", messages: chat }));
      addChatMessage(player, "è entrato nella partita");
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
      addChatMessage(player, "ha lasciato la partita");
      players.delete(player.id);
    }
  });

  socket.on("error", () => {});
});

/* ---------------------------
   START
---------------------------- */

setInterval(() => {
  update();
  broadcastState();
}, TICK);

server.listen(PORT, "0.0.0.0", () => {
  console.log(`Cell Arena avviato sulla porta ${PORT}`);
  console.log(`World: ${WORLD}x${WORLD}`);
});
