"use strict";

const http = require("http");
const fs = require("fs");
const path = require("path");
const WebSocket = require("ws");

const PORT = Number(process.env.PORT || 3000);

const WORLD = 6000;
const TICK = 40;

const FOOD_COUNT = 1000;
const POWER_COUNT = 35;
const MAX_PLAYERS = 60;
const MAX_BOTS = 12;
const MAX_CELLS = 16;
const MAX_CHAT_LENGTH = 180;

const PLAYER_SPEED = 4.2;
const SPLIT_SPEED = 13;
const EJECT_SPEED = 8;

const colors = [
  "#42d392",
  "#55a7ff",
  "#ff6680",
  "#ffbf55",
  "#b56cff",
  "#25d9d0",
  "#f472b6",
  "#a3e635",
  "#fb7185",
  "#38bdf8"
];

const powerTypes = [
  "energy",
  "speed",
  "growth",
  "shield"
];

const players = new Map();
const foods = [];
const ejected = [];
const powers = [];
const chat = [];

function random(a, b) {
  return Math.random() * (b - a) + a;
}

function clamp(v, a, b) {
  return Math.max(a, Math.min(b, v));
}

function distance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function randomId() {
  return (
    Math.random().toString(36).slice(2) +
    Math.random().toString(36).slice(2)
  );
}

function randomColor() {
  return colors[Math.floor(Math.random() * colors.length)];
}

function cleanName(name) {
  return String(name || "Player")
    .replace(/[^\w ._-]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 16) || "Player";
}

function cleanMessage(text) {
  return String(text || "")
    .replace(/[<>]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_CHAT_LENGTH);
}

function makeFood() {
  return {
    id: randomId(),
    x: random(20, WORLD - 20),
    y: random(20, WORLD - 20),
    r: random(3, 7),
    color: randomColor()
  };
}

function makePower() {
  return {
    id: randomId(),
    x: random(80, WORLD - 80),
    y: random(80, WORLD - 80),
    r: 12,
    type: powerTypes[
      Math.floor(Math.random() * powerTypes.length)
    ]
  };
}

for (let i = 0; i < FOOD_COUNT; i++) {
  foods.push(makeFood());
}

for (let i = 0; i < POWER_COUNT; i++) {
  powers.push(makePower());
}

function findSpawn() {
  for (let attempt = 0; attempt < 100; attempt++) {
    const x = random(250, WORLD - 250);
    const y = random(250, WORLD - 250);

    let good = true;

    for (const p of players.values()) {
      for (const c of p.cells) {
        if (Math.hypot(x - c.x, y - c.y) < 400) {
          good = false;
          break;
        }
      }
      if (!good) break;
    }

    if (good) return { x, y };
  }

  return {
    x: random(300, WORLD - 300),
    y: random(300, WORLD - 300)
  };
}

function makeCell(x, y, r, player, vx = 0, vy = 0) {
  return {
    id: randomId(),
    x,
    y,
    r,
    vx,
    vy,
    boost: 0,
    shield: 0
  };
}

function createPlayer(id, name, bot = false) {
  const spawn = findSpawn();

  const player = {
    id,
    name: cleanName(name),
    color: randomColor(),
    bot,

    targetX: spawn.x,
    targetY: spawn.y,

    energy: 100,
    score: 0,
    xp: 0,
    level: 1,

    mode: "classic",

    kills: 0,
    foodEaten: 0,
    powerups: 0,

    cells: [],

    lastSplit: 0,
    lastEject: 0,
    lastBotThink: 0,

    speedBoost: 0,
    growthBoost: 0,

    socket: null
  };

  player.cells.push(
    makeCell(
      spawn.x,
      spawn.y,
      25,
      player
    )
  );

  return player;
}

function totalMass(player) {
  return player.cells.reduce(
    (sum, c) => sum + c.r * c.r,
    0
  );
}

function addXP(player, amount) {
  player.xp += amount;

  while (player.xp >= player.level * 100) {
    player.xp -= player.level * 100;
    player.level++;
    player.energy = 100;
  }
}

function publicPlayer(player) {
  return {
    id: player.id,
    name: player.name,
    color: player.color,
    bot: player.bot,

    score: Math.floor(player.score),
    xp: Math.floor(player.xp),
    level: player.level,

    energy: Math.floor(player.energy),
    kills: player.kills,

    cells: player.cells.map(c => ({
      id: c.id,
      x: c.x,
      y: c.y,
      r: c.r,
      shield: c.shield > 0
    }))
  };
}

function broadcast(data) {
  const message = JSON.stringify(data);

  for (const player of players.values()) {
    if (
      player.socket &&
      player.socket.readyState === WebSocket.OPEN
    ) {
      try {
        player.socket.send(message);
      } catch {}
    }
  }
}

function addChatMessage(player, text) {
  text = cleanMessage(text);

  if (!text) return;

  chat.push({
    id: randomId(),
    playerId: player.id,
    name: player.name,
    color: player.color,
    text,
    time: new Date().toLocaleTimeString(
      "it-IT",
      {
        hour: "2-digit",
        minute: "2-digit"
      }
    )
  });

  if (chat.length > 80) {
    chat.splice(0, chat.length - 80);
  }

  broadcast({
    type: "chatHistory",
    messages: chat
  });
}

function moveCell(cell, player) {
  const dx = player.targetX - cell.x;
  const dy = player.targetY - cell.y;
  const d = Math.hypot(dx, dy);

  if (d > 1) {
    let speed =
      PLAYER_SPEED *
      Math.pow(
        25 / Math.max(cell.r, 1),
        0.30
      );

    if (player.speedBoost > 0) {
      speed *= 1.6;
    }

    speed = clamp(speed, 0.7, 7);

    cell.x += dx / d * speed;
    cell.y += dy / d * speed;
  }

  if (cell.boost > 0) {
    cell.x += cell.vx;
    cell.y += cell.vy;

    cell.vx *= 0.88;
    cell.vy *= 0.88;

    cell.boost--;
  }

  cell.x = clamp(
    cell.x,
    cell.r,
    WORLD - cell.r
  );

  cell.y = clamp(
    cell.y,
    cell.r,
    WORLD - cell.r
  );
}

function updateMovement() {
  for (const player of players.values()) {
    for (const cell of player.cells) {
      moveCell(cell, player);

      if (cell.shield > 0) {
        cell.shield--;
      }
    }

    player.energy = clamp(
      player.energy + 0.22,
      0,
      100
    );

    if (player.speedBoost > 0) {
      player.speedBoost--;
    }

    if (player.growthBoost > 0) {
      player.growthBoost--;
    }
  }
}

function eatFood() {
  for (const player of players.values()) {
    for (const cell of player.cells) {
      for (
        let i = foods.length - 1;
        i >= 0;
        i--
      ) {
        const food = foods[i];

        if (
          distance(cell, food) <
          cell.r + food.r
        ) {
          const gain =
            player.growthBoost > 0
              ? 2
              : 1;

          cell.r = Math.sqrt(
            cell.r * cell.r + gain
          );

          player.score++;
          player.foodEaten++;

          addXP(player, 4);

          foods.splice(i, 1);
          foods.push(makeFood());
        }
      }
    }
  }
}

function collectPowers() {
  for (let i = powers.length - 1; i >= 0; i--) {
    const power = powers[i];

    let collected = false;

    for (const player of players.values()) {
      for (const cell of player.cells) {
        if (
          distance(cell, power) <
          cell.r + power.r
        ) {
          applyPower(player, power.type);

          powers.splice(i, 1);
          powers.push(makePower());

          player.powerups++;
          addXP(player, 15);

          collected = true;
          break;
        }
      }

      if (collected) break;
    }
  }
}

function applyPower(player, type) {
  if (type === "energy") {
    player.energy = 100;
  }

  if (type === "speed") {
    player.speedBoost = 400;
  }

  if (type === "growth") {
    player.growthBoost = 600;
  }

  if (type === "shield") {
    for (const cell of player.cells) {
      cell.shield = 500;
    }
  }
}

function splitPlayer(player) {
  const now = Date.now();

  if (
    now - player.lastSplit < 650 ||
    player.cells.length >= MAX_CELLS
  ) {
    return;
  }

  player.lastSplit = now;

  const original = [...player.cells];

  for (const cell of original) {
    if (
      player.cells.length >= MAX_CELLS ||
      cell.r < 25
    ) {
      continue;
    }

    const newRadius =
      cell.r / Math.sqrt(2);

    cell.r = newRadius;

    const dx =
      player.targetX - cell.x;

    const dy =
      player.targetY - cell.y;

    const angle =
      Math.atan2(dy, dx);

    const child = makeCell(
      clamp(
        cell.x +
          Math.cos(angle) *
          newRadius *
          2,
        newRadius,
        WORLD - newRadius
      ),
      clamp(
        cell.y +
          Math.sin(angle) *
          newRadius *
          2,
        newRadius,
        WORLD - newRadius
      ),
      newRadius,
      player,
      Math.cos(angle) * SPLIT_SPEED,
      Math.sin(angle) * SPLIT_SPEED
    );

    child.boost = 28;

    player.cells.push(child);
  }
}

function ejectMass(player) {
  const now = Date.now();

  if (
    now - player.lastEject < 100 ||
    player.energy < 8
  ) {
    return;
  }

  player.lastEject = now;
  player.energy -= 8;

  for (const cell of player.cells) {
    if (cell.r < 17) continue;

    cell.r = Math.sqrt(
      Math.max(
        20,
        cell.r * cell.r - 8
      )
    );

    const dx =
      player.targetX - cell.x;

    const dy =
      player.targetY - cell.y;

    const angle =
      Math.atan2(dy, dx);

    ejected.push({
      id: randomId(),

      x:
        cell.x +
        Math.cos(angle) *
        (cell.r + 12),

      y:
        cell.y +
        Math.sin(angle) *
        (cell.r + 12),

      r: 7,

      vx:
        Math.cos(angle) *
        EJECT_SPEED,

      vy:
        Math.sin(angle) *
        EJECT_SPEED,

      color: player.color,
      owner: player.id,
      life: 350
    });
  }
}

function updateEjected() {
  for (
    let i = ejected.length - 1;
    i >= 0;
    i--
  ) {
    const e = ejected[i];

    e.x += e.vx;
    e.y += e.vy;

    e.vx *= 0.96;
    e.vy *= 0.96;

    e.life--;

    if (
      e.life <= 0 ||
      e.x < 0 ||
      e.x > WORLD ||
      e.y < 0 ||
      e.y > WORLD
    ) {
      ejected.splice(i, 1);
      continue;
    }

    let eaten = false;

    for (const player of players.values()) {
      for (const cell of player.cells) {
        if (
          distance(cell, e) <
          cell.r + e.r
        ) {
          if (
            cell.r > e.r * 1.1
          ) {
            cell.r = Math.sqrt(
              cell.r * cell.r + 10
            );

            player.score += 10;
            addXP(player, 10);

            eaten = true;
            break;
          }
        }
      }

      if (eaten) break;
    }

    if (eaten) {
      ejected.splice(i, 1);
    }
  }
}

function getAllCells() {
  const result = [];

  for (const player of players.values()) {
    for (const cell of player.cells) {
      result.push({
        player,
        cell
      });
    }
  }

  return result;
}

function removeCell(player, cell) {
  const index =
    player.cells.indexOf(cell);

  if (index !== -1) {
    player.cells.splice(index, 1);
  }

  if (player.cells.length === 0) {
    killPlayer(player);
  }
}

function killPlayer(player) {
  if (!players.has(player.id)) return;

  if (
    player.socket &&
    player.socket.readyState === WebSocket.OPEN
  ) {
    try {
      player.socket.send(
        JSON.stringify({
          type: "dead",
          score: Math.floor(player.score),
          xp: Math.floor(player.xp),
          level: player.level,
          kills: player.kills
        })
      );
    } catch {}
  }

  players.delete(player.id);
}

function collisions() {
  const all = getAllCells();

  for (let i = 0; i < all.length; i++) {
    const A = all[i];

    for (
      let j = i + 1;
      j < all.length;
      j++
    ) {
      const B = all[j];

      if (A.player === B.player) continue;

      if (
        !players.has(A.player.id) ||
        !players.has(B.player.id)
      ) {
        continue;
      }

      const d =
        distance(A.cell, B.cell);

      if (
        d >=
        Math.max(
          A.cell.r,
          B.cell.r
        ) * 0.78
      ) {
        continue;
      }

      let big = A;
      let small = B;

      if (
        B.cell.r >
        A.cell.r
      ) {
        big = B;
        small = A;
      }

      if (
        big.cell.r <=
        small.cell.r * 1.12
      ) {
        continue;
      }

      if (small.cell.shield > 0) {
        continue;
      }

      big.cell.r = Math.sqrt(
        big.cell.r *
          big.cell.r +
        small.cell.r *
          small.cell.r *
          0.82
      );

      big.player.score +=
        Math.floor(
          small.cell.r *
          small.cell.r
        );

      big.player.kills++;

      addXP(
        big.player,
        Math.floor(
          small.cell.r * 2
        )
      );

      removeCell(
        small.player,
        small.cell
      );
    }
  }
}

function botThink(bot) {
  const now = Date.now();

  if (now - bot.lastBotThink < 500) {
    return;
  }

  bot.lastBotThink = now;

  const main = bot.cells[0];

  if (!main) return;

  let target = null;
  let targetDistance = Infinity;

  for (const food of foods) {
    const d = distance(main, food);

    if (d < targetDistance) {
      target = food;
      targetDistance = d;
    }
  }

  for (const other of players.values()) {
    if (other === bot) continue;

    const otherCell = other.cells[0];

    if (!otherCell) continue;

    if (
      main.r >
      otherCell.r * 1.35
    ) {
      const d =
        distance(main, otherCell);

      if (d < targetDistance) {
        target = otherCell;
        targetDistance = d;
      }
    }
  }

  if (target) {
    bot.targetX = target.x;
    bot.targetY = target.y;
  }

  if (
    main.r > 32 &&
    Math.random() < 0.15
  ) {
    splitPlayer(bot);
  }

  if (
    Math.random() < 0.04
  ) {
    ejectMass(bot);
  }
}

function updateBots() {
  for (const player of players.values()) {
    if (player.bot) {
      botThink(player);
    }
  }
}

function spawnBots() {
  const desired =
    Math.min(
      MAX_BOTS,
      Math.max(
        4,
        10 - Math.floor(players.size / 8)
      )
    );

  let bots = [...players.values()]
    .filter(p => p.bot)
    .length;

  while (bots < desired) {
    if (players.size >= MAX_PLAYERS) break;

    const bot =
      createPlayer(
        "bot-" + randomId(),
        "Bot " + (bots + 1),
        true
      );

    players.set(
      bot.id,
      bot
    );

    bots++;
  }
}

function update() {
  spawnBots();
  updateBots();
  updateMovement();
  updateEjected();
  eatFood();
  collectPowers();
  collisions();
}

function broadcastState() {
  broadcast({
    type: "state",
    world: WORLD,

    foods,

    powers,

    ejected: ejected.map(e => ({
      id: e.id,
      x: e.x,
      y: e.y,
      r: e.r,
      color: e.color
    })),

    players: [
      ...players.values()
    ].map(publicPlayer)
  });
}

/* HTTP */

const publicDir =
  path.join(__dirname, "public");

const server =
  http.createServer((req, res) => {
    let requestPath =
      req.url.split("?")[0];

    if (requestPath === "/") {
      requestPath = "/index.html";
    }

    let filename;

    try {
      filename = path.resolve(
        publicDir,
        "." + requestPath
      );
    } catch {
      res.writeHead(400);
      return res.end("Bad request");
    }

    if (
      filename !== publicDir &&
      !filename.startsWith(
        publicDir + path.sep
      )
    ) {
      res.writeHead(403);
      return res.end("Forbidden");
    }

    fs.readFile(
      filename,
      (error, data) => {
        if (error) {
          res.writeHead(404, {
            "Content-Type":
              "text/plain; charset=utf-8"
          });

          return res.end("Not found");
        }

        const ext =
          path.extname(filename)
            .toLowerCase();

        const types = {
          ".html":
            "text/html; charset=utf-8",

          ".js":
            "text/javascript; charset=utf-8",

          ".css":
            "text/css; charset=utf-8",

          ".json":
            "application/json; charset=utf-8",

          ".png": "image/png",
          ".jpg": "image/jpeg",
          ".svg": "image/svg+xml",
          ".ico": "image/x-icon"
        };

        res.writeHead(200, {
          "Content-Type":
            types[ext] ||
            "application/octet-stream",

          "Cache-Control":
            ext === ".html"
              ? "no-cache"
              : "public, max-age=3600"
        });

        res.end(data);
      }
    );
  });

const wss =
  new WebSocket.Server({
    server,
    maxPayload: 16 * 1024
  });

wss.on("connection", socket => {
  if (players.size >= MAX_PLAYERS) {
    socket.send(
      JSON.stringify({
        type: "error",
        message: "Server pieno"
      })
    );

    socket.close();
    return;
  }

  const id = randomId();
  let player = null;

  socket.on("message", raw => {
    let message;

    try {
      message =
        JSON.parse(raw.toString());
    } catch {
      return;
    }

    if (
      !message ||
      typeof message.type !== "string"
    ) {
      return;
    }

    if (message.type === "join") {
      if (player) return;

      player =
        createPlayer(
          id,
          message.name
        );

      player.socket = socket;

      if (
        typeof message.mode === "string"
      ) {
        player.mode =
          ["classic", "survival", "chaos"]
            .includes(message.mode)
              ? message.mode
              : "classic";
      }

      players.set(
        player.id,
        player
      );

      socket.send(
        JSON.stringify({
          type: "welcome",
          id: player.id,
          world: WORLD,
          playerCount: players.size
        })
      );

      socket.send(
        JSON.stringify({
          type: "chatHistory",
          messages: chat
        })
      );

      addChatMessage(
        player,
        "è entrato nella partita"
      );

      return;
    }

    if (!player) return;

    if (message.type === "move") {
      const x = Number(message.x);
      const y = Number(message.y);

      if (
        Number.isFinite(x) &&
        Number.isFinite(y)
      ) {
        player.targetX =
          clamp(x, 0, WORLD);

        player.targetY =
          clamp(y, 0, WORLD);
      }

      return;
    }

    if (message.type === "split") {
      splitPlayer(player);
      return;
    }

    if (message.type === "eject") {
      ejectMass(player);
      return;
    }

    if (message.type === "chat") {
      addChatMessage(
        player,
        message.text
      );
      return;
    }

    if (message.type === "changeName") {
      const newName =
        cleanName(message.name);

      player.name = newName;

      broadcast({
        type: "nameChanged",
        id: player.id,
        name: player.name
      });

      return;
    }
  });

  socket.on("close", () => {
    if (!player) return;

    if (players.has(player.id)) {
      addChatMessage(
        player,
        "ha lasciato la partita"
      );

      players.delete(
        player.id
      );
    }
  });

  socket.on("error", () => {});
});

setInterval(() => {
  update();
  broadcastState();
}, TICK);

server.listen(
  PORT,
  "0.0.0.0",
  () => {
    console.log(
      `Cell Arena 2.0 avviato sulla porta ${PORT}`
    );
  }
);
