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

let BOT_COUNT = 15; // Gestione quantitÃ  bot

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
const bots = new Map();
const foods = [];
const chat = [];
const usersDB = new Map(); // Database in-memory per Login/Registrazione

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

function createPlayer(id, name, options = {}) {
  const startMass = Number(options.startMass) || 25;
  const initialRadius = Math.max(10, Math.min(100, startMass));

  const p = {
    id,
    name: cleanName(name),
    color: randomColor(),
    x: WORLD / 2,
    y: WORLD / 2,
    targetX: WORLD / 2,
    targetY: WORLD / 2,
    r: initialRadius,
    speedMultiplier: Number(options.startSpeed) || 1,
    energy: 100,
    score: 0,
    cells: [],
    lastMove: 0,
    lastSplit: 0,
    lastEject: 0,
    socket: null,
    isBot: options.isBot || false
  };

  findSpawn(p);
  return p;
}

function findSpawn(player) {
  for (let attempt = 0; attempt < 100; attempt++) {
    const x = random(200, WORLD - 200);
    const y = random(200, WORLD - 200);
    let good = true;

    for (const other of players.values()) {
      if (distance({ x, y }, { x: other.x, y: other.y }) < 350) {
        good = false;
        break;
      }
    }
    for (const other of bots.values()) {
      if (distance({ x, y }, { x: other.x, y: other.y }) < 350) {
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

function initBots() {
  bots.clear();
  for (let i = 0; i < BOT_COUNT; i++) {
    const botId = "bot_" + randomId();
    const bot = createPlayer(botId, "Bot_" + Math.floor(random(1, 999)), { isBot: true });
    bots.set(botId, bot);
  }
}

initBots();

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
   MOVIMENTO & BOT AI
---------------------------- */

function movePlayer(player) {
  const cells = getCells(player);

  for (const cell of cells) {
    const dx = player.targetX - cell.x;
    const dy = player.targetY - cell.y;
    const d = Math.hypot(dx, dy);

    if (d < 2) continue;

    let speed = 7 * Math.pow(25 / Math.max(cell.r, 1), 0.43) * (player.speedMultiplier || 1);
    speed = clamp(speed, 0.75, 12);

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

function updateBots() {
  for (const bot of bots.values()) {
    if (Math.random() < 0.05) {
      // Cerca cibo vicino o cambia direzione random
      let closestFood = null;
      let minDist = 400;

      for (const food of foods) {
        const d = distance(bot, food);
        if (d < minDist) {
          minDist = d;
          closestFood = food;
        }
      }

      if (closestFood) {
        bot.targetX = closestFood.x;
        bot.targetY = closestFood.y;
      } else {
        bot.targetX = clamp(bot.x + random(-500, 500), 50, WORLD - 50);
        bot.targetY = clamp(bot.y + random(-500, 500), 50, WORLD - 50);
      }
    }
    movePlayer(bot);
  }
}

/* ---------------------------
   CIBO
---------------------------- */

function eatFood() {
  const allEntities = [...players.values(), ...bots.values()];

  for (const player of allEntities) {
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

/* ---------------------------
   SPLIT & EJECT
---------------------------- */

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

/* ---------------------------
   COLLISIONI
---------------------------- */

function allCells() {
  const result = [];
  const allEntities = [...players.values(), ...bots.values()];

  for (const player of allEntities) {
    const cells = getCells(player);
    for (const cell of cells) {
      result.push({ owner: player, cell });
    }
  }
  return result;
}

function killPlayer(player) {
  if (player.isBot) {
    bots.delete(player.id);
    const newBot = createPlayer("bot_" + randomId(), "Bot_" + Math.floor(random(1, 999)), { isBot: true });
    bots.set(newBot.id, newBot);
    return;
  }

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

      if (A.owner === B.owner) continue;
      if (!players.has(A.owner.id) && !bots.has(A.owner.id)) continue;
      if (!players.has(B.owner.id) && !bots.has(B.owner.id)) continue;

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
   GAME LOOP
---------------------------- */

function update() {
  for (const player of players.values()) {
    movePlayer(player);
    player.energy = clamp(player.energy + 0.35, 0, 100);
  }

  updateBots();
  eatFood();
  collisions();
}

function broadcastState() {
  const state = JSON.stringify({
    type: "state",
    world: WORLD,
    foods,
    players: [
      ...players.values(),
      ...bots.values()
    ].map(publicPlayer)
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
   WEBSOCKET & AUTH / CONFIG
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
    } catch {
      return;
    }

    /* REGISTRAZIONE */
    if (message.type === "register") {
      const username = cleanName(message.username);
      const password = message.password;
      if (!username || !password) {
        socket.send(JSON.stringify({ type: "authResponse", success: false, message: "Dati non validi" }));
        return;
      }
      if (usersDB.has(username)) {
        socket.send(JSON.stringify({ type: "authResponse", success: false, message: "Utente già esistente" }));
      } else {
        usersDB.set(username, { password, highScore: 0 });
        socket.send(JSON.stringify({ type: "authResponse", success: true, message: "Registrazione completata" }));
      }
      return;
    }

    /* LOGIN */
    if (message.type === "login") {
      const username = cleanName(message.username);
      const password = message.password;
      const user = usersDB.get(username);
      if (user && user.password === password) {
        socket.send(JSON.stringify({ type: "authResponse", success: true, message: "Login riuscito", highScore: user.highScore }));
      } else {
        socket.send(JSON.stringify({ type: "authResponse", success: false, message: "Credenziali errate" }));
      }
      return;
    }

    /* JOIN PARTITA */
    if (message.type === "join") {
      if (player) return;

      player = createPlayer(id, message.name, {
        startMass: message.startMass,
        startSpeed: message.startSpeed
      });
      player.socket = socket;
      players.set(id, player);

      socket.send(JSON.stringify({ type: "welcome", id, world: WORLD, playerCount: players.size }));
      socket.send(JSON.stringify({ type: "chatHistory", messages: chat }));
      addChatMessage(player, "è entrato nella partita");
      return;
    }

    if (!player) return;

    if (message.type === "move") {
      const x = Number(message.x);
      const y = Number(message.y);
      if (Number.isFinite(x) && Number.isFinite(y)) {
        player.targetX = clamp(x, 0, WORLD);
        player.targetY = clamp(y, 0, WORLD);
      }
    } else if (message.type === "split") {
      splitPlayer(player);
    } else if (message.type === "eject") {
      ejectMass(player);
    } else if (message.type === "chat") {
      addChatMessage(player, message.text);
    } else if (message.type === "changeName") {
      const newName = cleanName(message.name);
      if (newName) player.name = newName;
    } else if (message.type === "updateSettings") {
      // Configurazione dinamica dei bot o parametri da menu laterale
      if (message.botCount !== undefined) {
        BOT_COUNT = clamp(Number(message.botCount), 0, 100);
        initBots();
      }
      if (message.startMass !== undefined) {
        player.r = clamp(Number(message.startMass), 10, 500);
      }
      if (message.startSpeed !== undefined) {
        player.speedMultiplier = clamp(Number(message.startSpeed), 0.5, 3);
      }
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
   GAME LOOP INTERVAL
---------------------------- */

setInterval(() => {
  update();
  broadcastState();
}, TICK);

/* ---------------------------
   START
---------------------------- */

server.listen(PORT, "0.0.0.0", () => {
  console.log(`Zero The Legend avviato sulla porta ${PORT}`);
  console.log(`World: ${WORLD}x${WORLD}`);
});
