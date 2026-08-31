const http = require("http");
const fs = require("fs");
const path = require("path");
const WebSocket = require("ws");

const PORT = process.env.PORT || 3000;

const WORLD = 6000;
const TICK = 40;

const FOOD_COUNT = 850;
const MAX_PLAYERS = 60;
const MAX_CHAT_LENGTH = 180;

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

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
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

function createPlayer(id, name) {
  const p = {
    id,
    name: cleanName(name),
    color: randomColor(),

    x: WORLD / 2,
    y: WORLD / 2,

    targetX: WORLD / 2,
    targetY: WORLD / 2,

    r: 25,
    energy: 100,
    score: 0,

    cells: [],

    lastSplit: 0,
    lastEject: 0,

    socket: null
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
      if (distance({ x, y }, other) < 350) {
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

function getCells(player) {
  if (player.cells.length) {
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

function syncPlayer(player) {
  if (player.cells.length === 1) {
    const c = player.cells[0];

    player.x = c.x;
    player.y = c.y;
    player.r = c.r;
  }
}

function publicPlayer(player) {
  return {
    id: player.id,
    name: player.name,
    color: player.color,
    score: Math.floor(player.score),
    energy: Math.floor(player.energy),

    cells: getCells(player).map(c => ({
      id: c.id,
      x: c.x,
      y: c.y,
      r: c.r
    }))
  };
}

/* MOVIMENTO PIÙ LENTO */

function movePlayer(player) {
  const cells = getCells(player);

  for (const cell of cells) {
    const dx = player.targetX - cell.x;
    const dy = player.targetY - cell.y;

    const d = Math.hypot(dx, dy);

    if (d < 2) continue;

    let speed =
      4.0 *
      Math.pow(25 / Math.max(cell.r, 1), 0.43);

    speed = clamp(speed, 0.45, 5);

    cell.x += dx / d * speed;
    cell.y += dy / d * speed;

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

  syncPlayer(player);
}

function eatFood() {
  for (const player of players.values()) {
    const cells = getCells(player);

    for (const cell of cells) {
      for (let i = foods.length - 1; i >= 0; i--) {
        const food = foods[i];

        if (distance(cell, food) < cell.r + food.r) {
          cell.r = Math.sqrt(cell.r * cell.r + 1);
          player.score++;

          foods.splice(i, 1);
          foods.push(makeFood());
        }
      }
    }

    syncPlayer(player);
  }
}

function splitPlayer(player) {
  const now = Date.now();

  if (now - player.lastSplit < 900) return;

  ensureCells(player);

  if (player.cells.length >= 16) return;

  player.lastSplit = now;

  const original = [...player.cells];
  const created = [];

  for (const cell of original) {
    if (cell.r < 24) continue;

    if (
      player.cells.length +
      created.length >= 16
    ) break;

    const oldRadius = cell.r;
    const newRadius = oldRadius / Math.sqrt(2);

    cell.r = newRadius;

    const angle = Math.atan2(
      player.targetY - cell.y,
      player.targetX - cell.x
    );

    created.push({
      id: randomId(),

      x: clamp(
        cell.x + Math.cos(angle) * newRadius * 1.8,
        newRadius,
        WORLD - newRadius
      ),

      y: clamp(
        cell.y + Math.sin(angle) * newRadius * 1.8,
        newRadius,
        WORLD - newRadius
      ),

      r: newRadius,

      vx: Math.cos(angle) * 9,
      vy: Math.sin(angle) * 9,

      boost: 25
    });
  }

  player.cells.push(...created);

  syncPlayer(player);
}

function ejectMass(player) {
  const now = Date.now();

  if (now - player.lastEject < 120) return;
  if (player.energy < 8) return;

  ensureCells(player);

  player.lastEject = now;
  player.energy -= 8;

  for (const cell of player.cells) {
    if (cell.r < 16) continue;

    cell.r = Math.sqrt(
      Math.max(
        20,
        cell.r * cell.r - 6
      )
    );

    const angle = Math.atan2(
      player.targetY - cell.y,
      player.targetX - cell.x
    );

    foods.push({
      id: randomId(),

      x: clamp(
        cell.x +
        Math.cos(angle) *
        cell.r *
        1.5,
        10,
        WORLD - 10
      ),

      y: clamp(
        cell.y +
        Math.sin(angle) *
        cell.r *
        1.5,
        10,
        WORLD - 10
      ),

      r: 8,
      color: player.color
    });
  }

  syncPlayer(player);
}

function allCells() {
  const result = [];

  for (const player of players.values()) {
    for (const cell of getCells(player)) {
      result.push({
        owner: player,
        cell
      });
    }
  }

  return result;
}

function killPlayer(player) {
  if (!players.has(player.id)) return;

  try {
    if (
      player.socket &&
      player.socket.readyState === WebSocket.OPEN
    ) {
      player.socket.send(
        JSON.stringify({
          type: "dead",
          score: player.score
        })
      );
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

      if (
        !players.has(A.owner.id) ||
        !players.has(B.owner.id)
      ) {
        continue;
      }

      const a = A.cell;
      const b = B.cell;

      const d = distance(a, b);

      if (
        d >
        Math.max(a.r, b.r) * 0.78
      ) {
        continue;
      }

      let big = A;
      let small = B;

      if (b.r > a.r) {
        big = B;
        small = A;
      }

      if (
        big.cell.r <=
        small.cell.r * 1.12
      ) {
        continue;
      }

      big.cell.r = Math.sqrt(
        big.cell.r * big.cell.r +
        small.cell.r * small.cell.r * 0.82
      );

      const owner = small.owner;

      owner.cells =
        owner.cells.filter(
          c => c.id !== small.cell.id
        );

      if (owner.cells.length === 0) {
        killPlayer(owner);
      }

      big.owner.score += Math.floor(
        small.cell.r *
        small.cell.r
      );

      syncPlayer(big.owner);
    }
  }
}

/* CHAT */

function addChatMessage(player, text) {
  text = cleanMessage(text);

  if (!text) return;

  const message = {
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
  };

  chat.push(message);

  if (chat.length > 80) {
    chat.splice(0, chat.length - 80);
  }

  broadcastChat();
}

function broadcastChat() {
  const data = JSON.stringify({
    type: "chatHistory",
    messages: chat
  });

  for (const player of players.values()) {
    if (
      player.socket &&
      player.socket.readyState === WebSocket.OPEN
    ) {
      try {
        player.socket.send(data);
      } catch {}
    }
  }
}

function update() {
  for (const player of players.values()) {
    movePlayer(player);

    player.energy = clamp(
      player.energy + 0.35,
      0,
      100
    );
  }

  eatFood();
  collisions();
}

function broadcastState() {
  const state = JSON.stringify({
    type: "state",
    world: WORLD,
    foods,
    players: [
      ...players.values()
    ].map(publicPlayer)
  });

  for (const player of players.values()) {
    if (
      player.socket &&
      player.socket.readyState === WebSocket.OPEN
    ) {
      try {
        player.socket.send(state);
      } catch {}
    }
  }
}

/* HTTP */

const publicDir = path.join(
  __dirname,
  "public"
);

const server = http.createServer(
  (req, res) => {
    let requestPath =
      req.url.split("?")[0];

    if (requestPath === "/") {
      requestPath = "/index.html";
    }

    const filename = path.resolve(
      publicDir,
      "." + requestPath
    );

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
          res.writeHead(404);
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
            "application/json; charset=utf-8"
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
  }
);

/* WEBSOCKET */

const wss =
  new WebSocket.Server({
    server
  });

wss.on(
  "connection",
  socket => {

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

    socket.on(
      "message",
      raw => {

        let message;

        try {
          message =
            JSON.parse(
              raw.toString()
            );
        } catch {
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

          players.set(id, player);

          socket.send(
            JSON.stringify({
              type: "welcome",
              id,
              world: WORLD,
              playerCount:
                players.size
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

        } else if (
          message.type === "split"
        ) {

          splitPlayer(player);

        } else if (
          message.type === "eject"
        ) {

          ejectMass(player);

        } else if (
          message.type === "chat"
        ) {

          addChatMessage(
            player,
            message.text
          );

        } else if (
          message.type === "changeName"
        ) {

          player.name =
            cleanName(message.name);
        }
      }
    );

    socket.on(
      "close",
      () => {

        if (player) {
          addChatMessage(
            player,
            "ha lasciato la partita"
          );

          players.delete(
            player.id
          );
        }
      }
    );

    socket.on(
      "error",
      () => {}
    );
  }
);

setInterval(
  () => {
    update();
    broadcastState();
  },
  TICK
);

server.listen(
  PORT,
  "0.0.0.0",
  () => {
    console.log(
      `Cell Arena avviato sulla porta ${PORT}`
    );
  }
);
