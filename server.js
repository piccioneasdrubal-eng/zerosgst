const http = require("http");
const fs = require("fs");
const path = require("path");
const WebSocket = require("ws");

const PORT = process.env.PORT || 3000;
const WORLD = 6000;
const TICK = 30;
const FOOD_COUNT = 1850;
const MAX_PLAYERS = 600;
const MAX_CHAT_LENGTH = 180;

let targetBotCount = 15; 

const colors = ["#42d392", "#55a7ff", "#ff6680", "#ffbf55", "#b56cff", "#25d9d0", "#f472b6", "#a3e635"];
const players = new Map();
const foods = [];
const chat = [];

function random(a, b) { return Math.random() * (b - a) + a; }
function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }
function distance(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }
function randomColor() { return colors[Math.floor(Math.random() * colors.length)]; }
function randomId() { return Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2); }

function makeFood() {
  return { id: randomId(), x: random(25, WORLD - 25), y: random(25, WORLD - 25), r: random(3, 7), color: randomColor() };
}

for (let i = 0; i < FOOD_COUNT; i++) { foods.push(makeFood()); }

function cleanName(name) { return String(name || "Player").replace(/[^\w ._-]/g, "").replace(/\s+/g, " ").trim().slice(0, 16) || "Player"; }
function cleanMessage(msg) { return String(msg || "").replace(/[<>]/g, "").replace(/\s+/g, " ").trim().slice(0, MAX_CHAT_LENGTH); }

function createPlayer(id, name, isBot = false, startMass = 25, startSpeed = 7) {
  const p = {
    id, name: cleanName(name), color: randomColor(),
    x: WORLD / 2, y: WORLD / 2, targetX: WORLD / 2, targetY: WORLD / 2,
    r: startMass, baseSpeed: startSpeed, isBot: isBot, energy: 100, score: 0,
    cells: [], lastMove: 0, lastSplit: 0, lastEject: 0, socket: null
  };
  findSpawn(p);
  ensureCells(p);
  return p;
}

function findSpawn(player) {
  for (let attempt = 0; attempt < 100; attempt++) {
    const x = random(200, WORLD - 200); const y = random(200, WORLD - 200);
    let good = true;
    for (const other of players.values()) {
      if (distance({ x, y }, { x: other.x, y: other.y }) < 350) { good = false; break; }
    }
    if (good) { player.x = x; player.y = y; player.targetX = x; player.targetY = y; return; }
  }
  player.x = random(300, WORLD - 300); player.y = random(300, WORLD - 300);
  player.targetX = player.x; player.targetY = player.y;
}

function updateBots() {
  let currentBots = 0;
  for (const p of players.values()) { if (p.isBot) currentBots++; }
  while (currentBots < targetBotCount && players.size < MAX_PLAYERS) {
    const id = "bot_" + randomId();
    const bot = createPlayer(id, "Bot_" + Math.floor(random(1000, 9999)), true, 25, 5);
    players.set(id, bot);
    currentBots++;
  }
  if (currentBots > targetBotCount) {
    let toRemove = currentBots - targetBotCount;
    for (const p of players.values()) {
      if (p.isBot && toRemove > 0) { killPlayer(p); toRemove--; }
    }
  }
}

function updateBotsAI() {
  for (const p of players.values()) {
    if (p.isBot && Math.random() < 0.05) {
      p.targetX = clamp(p.x + random(-600, 600), 0, WORLD);
      p.targetY = clamp(p.y + random(-600, 600), 0, WORLD);
    }
  }
}

function getCells(player) { return player.cells.length > 0 ? player.cells : [{ id: player.id, x: player.x, y: player.y, r: player.r, vx: 0, vy: 0, boost: 0 }]; }
function ensureCells(player) { if (player.cells.length === 0) player.cells.push({ id: player.id, x: player.x, y: player.y, r: player.r, vx: 0, vy: 0, boost: 0 }); }
function syncPlayerMainData(player) { if (player.cells.length === 1) { const c = player.cells[0]; player.x = c.x; player.y = c.y; player.r = c.r; } }

function publicPlayer(player) {
  return {
    id: player.id, name: player.name, color: player.color,
    score: Math.floor(player.score), energy: Math.floor(player.energy),
    // Inviamo il boost per permettere il rendering del Dash Neon sul client!
    cells: getCells(player).map(c => ({ id: c.id, x: c.x, y: c.y, r: c.r, boost: Math.floor(c.boost || 0) }))
  };
}

function movePlayer(player) {
  for (const cell of getCells(player)) {
    const dx = player.targetX - cell.x, dy = player.targetY - cell.y;
    const d = Math.hypot(dx, dy);
    
    if (d >= 2) {
      let speed = clamp((player.baseSpeed || 7) * Math.pow(25 / Math.max(cell.r, 1), 0.43), 0.75, 10);
      cell.x += (dx / d) * speed; cell.y += (dy / d) * speed;
    }

    if (cell.boost > 0) {
      cell.x += cell.vx || 0; cell.y += cell.vy || 0;
      cell.vx *= 0.88; cell.vy *= 0.88; cell.boost--;
    }
    cell.x = clamp(cell.x, cell.r, WORLD - cell.r); cell.y = clamp(cell.y, cell.r, WORLD - cell.r);
  }
  syncPlayerMainData(player);
}

function eatFood() {
  for (const player of players.values()) {
    for (const cell of getCells(player)) {
      for (let i = foods.length - 1; i >= 0; i--) {
        const food = foods[i];
        if (distance(cell, food) < cell.r + food.r - 2) {
          cell.r = Math.sqrt(cell.r * cell.r + 2);
          player.score += 2;
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
  if (now - player.lastSplit < 500) return;
  player.lastSplit = now;
  ensureCells(player);
  if (player.cells.length >= 16) return;

  const originalCells = [...player.cells];
  const created = [];
  for (const cell of originalCells) {
    if (cell.r < 18) continue; // Soglia abbassata per rendere lo split più rapido
    if (player.cells.length + created.length >= 16) break;
    const newRadius = cell.r / Math.sqrt(2);
    cell.r = newRadius;
    const angle = Math.atan2(player.targetY - cell.y, player.targetX - cell.x);
    created.push({
      id: randomId(),
      x: clamp(cell.x + Math.cos(angle) * newRadius * 1.8, newRadius, WORLD - newRadius),
      y: clamp(cell.y + Math.sin(angle) * newRadius * 1.8, newRadius, WORLD - newRadius),
      r: newRadius, vx: Math.cos(angle) * 16, vy: Math.sin(angle) * 16, boost: 28
    });
  }
  player.cells.push(...created);
  syncPlayerMainData(player);
}

function ejectMass(player) {
  const now = Date.now();
  if (now - player.lastEject < 100 || player.energy < 4) return;
  player.lastEject = now; player.energy -= 4;
  ensureCells(player);
  for (const cell of player.cells) {
    if (cell.r < 20) continue;
    cell.r = Math.sqrt(Math.max(20, cell.r * cell.r - 4));
    const angle = Math.atan2(player.targetY - cell.y, player.targetX - cell.x);
    foods.push({
      id: randomId(), r: 8, color: player.color,
      x: clamp(cell.x + Math.cos(angle) * cell.r * 1.5, 10, WORLD - 10),
      y: clamp(cell.y + Math.sin(angle) * cell.r * 1.5, 10, WORLD - 10)
    });
  }
  syncPlayerMainData(player);
}

function killPlayer(player) {
  if (!players.has(player.id)) return;
  if (player.socket && player.socket.readyState === WebSocket.OPEN) {
    try { player.socket.send(JSON.stringify({ type: "dead", score: player.score })); } catch {}
  }
  players.delete(player.id);
}

function collisions() {
  const cells = [];
  for (const p of players.values()) for (const c of getCells(p)) cells.push({ owner: p, cell: c });
  
  for (let i = 0; i < cells.length; i++) {
    for (let j = i + 1; j < cells.length; j++) {
      const A = cells[i], B = cells[j];
      if (A.owner === B.owner || !players.has(A.owner.id) || !players.has(B.owner.id)) continue;

      const d = distance(A.cell, B.cell);
      if (d > Math.max(A.cell.r, B.cell.r) * 0.78) continue;

      let big = A, small = B;
      if (B.cell.r > A.cell.r) { big = B; small = A; }
      if (big.cell.r <= small.cell.r * 1.12) continue;

      big.cell.r = Math.sqrt(big.cell.r * big.cell.r + small.cell.r * small.cell.r * 0.82);
      const owner = small.owner;
      if (owner.cells.length > 0) {
        owner.cells = owner.cells.filter(c => c.id !== small.cell.id);
        if (owner.cells.length === 0) killPlayer(owner);
      } else killPlayer(owner);
      big.owner.score += Math.floor(small.cell.r * small.cell.r);
      syncPlayerMainData(big.owner);
    }
  }
}

function addChatMessage(player, text) {
  text = cleanMessage(text);
  if (!text) return;
  chat.push({ id: randomId(), playerId: player.id, name: player.name, color: player.color, text, time: new Date().toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" }) });
  if (chat.length > 80) chat.splice(0, chat.length - 80);
  const data = JSON.stringify({ type: "chatHistory", messages: chat });
  for (const p of players.values()) if (p.socket && p.socket.readyState === WebSocket.OPEN) { try { p.socket.send(data); } catch {} }
}

function update() {
  updateBots(); updateBotsAI();
  for (const p of players.values()) { movePlayer(p); p.energy = clamp(p.energy + 0.35, 0, 100); }
  eatFood(); collisions();
}

function broadcastState() {
  const state = JSON.stringify({ type: "state", world: WORLD, foods, players: [...players.values()].map(publicPlayer) });
  for (const p of players.values()) if (p.socket && p.socket.readyState === WebSocket.OPEN) { try { p.socket.send(state); } catch {} }
}

const publicDir = path.join(__dirname, "public");
const server = http.createServer((req, res) => {
  let reqPath = req.url.split("?")[0];
  if (reqPath === "/") reqPath = "/index.html";
  try {
    const filename = path.resolve(publicDir, "." + reqPath);
    if (!filename.startsWith(publicDir)) throw new Error();
    fs.readFile(filename, (err, data) => {
      if (err) { res.writeHead(404); return res.end("Not found"); }
      const ext = path.extname(filename).toLowerCase();
      const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css" };
      res.writeHead(200, { "Content-Type": types[ext] || "application/octet-stream", "Cache-Control": "no-cache" });
      res.end(data);
    });
  } catch { res.writeHead(400); res.end("Bad request"); }
});

const wss = new WebSocket.Server({ server });
wss.on("connection", socket => {
  if (players.size >= MAX_PLAYERS) { socket.send(JSON.stringify({ type: "error", message: "Server pieno" })); socket.close(); return; }
  const id = randomId(); let player = null;

  socket.on("message", raw => {
    let msg; try { msg = JSON.parse(raw.toString()); } catch { return; }

    if (msg.type === "join" && !player) {
      if (msg.botCount !== undefined) targetBotCount = Number(msg.botCount);
      player = createPlayer(id, msg.name, false, msg.startMass ? Number(msg.startMass) : 25, 7);
      if (msg.color) player.color = msg.color;
      player.socket = socket;
      players.set(id, player);
      socket.send(JSON.stringify({ type: "welcome", id, world: WORLD, playerCount: players.size }));
      socket.send(JSON.stringify({ type: "chatHistory", messages: chat }));
      addChatMessage(player, "è entrato nell'arena");
      return;
    }
    if (!player) return;

    if (msg.type === "move") {
      if (Number.isFinite(msg.x) && Number.isFinite(msg.y)) { player.targetX = clamp(msg.x, 0, WORLD); player.targetY = clamp(msg.y, 0, WORLD); }
    }
    else if (msg.type === "split") splitPlayer(player);
    else if (msg.type === "eject") ejectMass(player);
    // DASH NEON IMPLEMENTATO
    else if (msg.type === "dash") {
      const now = Date.now();
      if (now - player.lastMove > 800 && player.energy >= 15) {
        player.lastMove = now; player.energy -= 15;
        ensureCells(player);
        for (const cell of player.cells) {
          const angle = Math.atan2(player.targetY - cell.y, player.targetX - cell.x);
          cell.vx = Math.cos(angle) * 25; cell.vy = Math.sin(angle) * 25;
          cell.boost = 20; 
        }
      }
    }
    else if (msg.type === "chat") addChatMessage(player, msg.text);
    else if (msg.type === "settings") {
      if (msg.botCount !== undefined) targetBotCount = Number(msg.botCount);
    }
    else if (msg.type === "updateProfile") {
      if (msg.name) player.name = cleanName(msg.name);
      if (msg.color) player.color = msg.color;
    }
  });

  socket.on("close", () => { if (player) { addChatMessage(player, "ha lasciato la partita"); players.delete(player.id); } });
});

setInterval(() => { update(); broadcastState(); }, TICK);
server.listen(PORT, "0.0.0.0", () => { console.log(`Arena on ${PORT} | World: ${WORLD}`); });
