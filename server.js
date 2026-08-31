const http = require("http");
const fs = require("fs");
const path = require("path");
const WebSocket = require("ws");

const PORT = process.env.PORT || 3000;

const WORLD = 6000;
const TICK = 30;

const FOOD_COUNT = 850;
const MAX_PLAYERS = 60;
const MAX_CELLS = 16;
const MAX_CHAT_LENGTH = 180;

const MOVE_SPEED = 3.2;
const BOOST_SPEED = 10;

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
const ejected = [];
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

function createCell(x, y, r, vx = 0, vy = 0, boost = 0) {
  return {
    id: randomId(),
    x,
    y,
    r,
    vx,
    vy,
    boost
  };
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
    score: 0,
    energy: 100,

    cells: [],

    lastSplit: 0,
    lastEject: 0,

    socket: null
  };

  findSpawn(p);

  p.cells.push(
    createCell(
      p.x,
      p.y,
      p.r
    )
  );

  return p;
}

function findSpawn(player) {
  for (let attempt = 0; attempt < 100; attempt++) {
    const x = random(250, WORLD - 250);
    const y = random(250, WORLD - 250);

    let good = true;

    for (const other of players.values()) {
      if (
        distance({ x, y }, other) < 350
      ) {
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

  player.x = WORLD / 2;
  player.y = WORLD / 2;
  player.targetX = player.x;
  player.targetY = player.y;
}

function syncMain(player) {
  if (!player.cells.length) return;

  const largest = player.cells.reduce(
    (a, b) => a.r > b.r ? a : b
  );

  player.x = largest.x;
  player.y = largest.y;
  player.r = largest.r;
}

function publicPlayer(player) {
  return {
    id: player.id,
    name: player.name,
    color: player.color,
    score: Math.floor(player.score),
    energy: Math.floor(player.energy),

    cells: player.cells.map(c => ({
      id: c.id,
      x: c.x,
      y: c.y,
      r: c.r
    }))
  };
}

/* =========================
   MOVIMENTO
========================= */

function movePlayer(player) {
  for (const cell of player.cells) {
    const dx = player.targetX - cell.x;
    const dy = player.targetY - cell.y;
    const d = Math.hypot(dx, dy);

    if (d > 1) {
      let speed =
        MOVE_SPEED *
        Math.pow(25 / Math.max(cell.r, 1), 0.35);

      speed = clamp(speed, 0.55, 4.2);

      cell.x += dx / d * speed;
      cell.y += dy / d * speed;
    }

    if (cell.boost > 0) {
      cell.x += cell.vx;
      cell.y += cell.vy;

      cell.vx *= 0.91;
      cell.vy *= 0.91;

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

  syncMain(player);
}

/* =========================
   FOOD
========================= */

function eatFood() {
  for (const player of players.values()) {
    for (const cell of player.cells) {
      for (let i = foods.length - 1; i >= 0; i--) {
        const food = foods[i];

        if (
          distance(cell, food) <
          cell.r + food.r
        ) {
          cell.r = Math.sqrt(
            cell.r * cell.r + 1
          );

          player.score += 1;

          foods.splice(i, 1);
          foods.push(makeFood());
        }
      }
    }

    syncMain(player);
  }
}

/* =========================
   SPLIT
========================= */

function splitPlayer(player) {
  const now = Date.now();

  if (
    now - player.lastSplit < 650
  ) {
    return;
  }

  if (
    player.cells.length >= MAX_CELLS
  ) {
    return;
  }

  player.lastSplit = now;

  const original = [...player.cells];

  for (const cell of original) {
    if (
      player.cells.length >= MAX_CELLS
    ) {
      break;
    }

    if (cell.r < 22) {
      continue;
    }

    const oldRadius = cell.r;
    const newRadius =
      oldRadius / Math.sqrt(2);

    cell.r = newRadius;

    const angle = Math.atan2(
      player.targetY - cell.y,
      player.targetX - cell.x
    );

    const child = createCell(
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

      Math.cos(angle) * BOOST_SPEED,
      Math.sin(angle) * BOOST_SPEED,
      24
    );

    player.cells.push(child);
  }

  syncMain(player);
}

/* =========================
   EJECT
========================= */

function ejectMass(player) {
  const now = Date.now();

  if (
    now - player.lastEject < 100
  ) {
    return;
  }

  if (player.energy < 8) {
    return;
  }

  player.lastEject = now;
  player.energy -= 8;

  for (const cell of player.cells) {
    if (cell.r < 17) {
      continue;
    }

    const angle = Math.atan2(
      player.targetY - cell.y,
      player.targetX - cell.x
    );

    cell.r = Math.sqrt(
      Math.max(
        16,
        cell.r * cell.r - 6
      )
    );

    ejected.push({
      id: randomId(),

      x: clamp(
        cell.x +
        Math.cos(angle) *
        (cell.r + 12),

        8,
        WORLD - 8
      ),

      y: clamp(
        cell.y +
        Math.sin(angle) *
        (cell.r + 12),

        8,
        WORLD - 8
      ),

      r: 7,

      vx: Math.cos(angle) * 8,
      vy: Math.sin(angle) * 8,

      color: player.color,
      life: 600
    });
  }

  syncMain(player);
}

function updateEjected() {
  for (let i = ejected.length - 1; i >= 0; i--) {
    const p = ejected[i];

    p.x += p.vx;
    p.y += p.vy;

    p.vx *= 0.94;
    p.vy *= 0.94;

    p.life--;

    if (
      p.life <= 0 ||
      p.x < 0 ||
      p.x > WORLD ||
      p.y < 0 ||
      p.y > WORLD
    ) {
      ejected.splice(i, 1);
    }
  }
}

/* =========================
   COLLISIONI
========================= */

function killPlayer(player) {
  if (!players.has(player.id)) {
    return;
  }

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
  const list = [];

  for (const player of players.values()) {
    for (const cell of player.cells) {
      list.push({
        owner: player,
        cell
      });
    }
  }

  for (let i = 0; i < list.length; i++) {
    for (let j = i + 1; j < list.length; j++) {
      const A = list[i];
      const B = list[j];

      if (A.owner === B.owner) {
        continue;
      }

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

      big.owner.score += Math.floor(
        small.cell.r *
        small.cell.r
      );

      if (
        owner.cells.length === 0
      ) {
        killPlayer(owner);
      }

      syncMain(big.owner);
    }
  }

  /* mangia palline lanciate */

  for (const pellet of ejected) {
    for (const player of players.values()) {
      for (const cell of player.cells) {
        if (
          distance(cell, pellet) <
          cell.r + pellet.r
        ) {
          cell.r = Math.sqrt(
            cell.r * cell.r +
            pellet.r * pellet.r
          );

          player.score += 2;

          const index =
            ejected.indexOf(pellet);

          if (index >= 0) {
            ejected.splice(index, 1);
          }

          break;
        }
      }
    }
  }

  for (const player of players.values()) {
    syncMain(player);
  }
}

/* =========================
   CHAT
========================= */

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
    chat.splice(
      0,
      chat.length - 80
    );
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

/* =========================
   UPDATE
========================= */

function update() {
  for (const player of players.values()) {
    movePlayer(player);

    player.energy = clamp(
      player.energy + 0.35,
      0,
      100
    );
  }

  updateEjected();
  eatFood();
  collisions();
}

/* =========================
   BROADCAST
========================= */

function broadcastState() {
  const state = JSON.stringify({
    type: "state",
    world: WORLD,

    foods,

    ejected,

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

/* =========================
   HTTP
========================= */

const publicDir =
  path.join(__dirname, "public");

const server = http.createServer(
  (req, res) => {
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
            "application/json; charset=utf-8",

          ".png":
            "image/png",

          ".jpg":
            "image/jpeg",

          ".svg":
            "image/svg+xml"
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

/* =========================
   WEBSOCKET
========================= */

const wss =
  new WebSocket.Server({
    server
  });

wss.on(
  "connection",
  socket => {

    if (
      players.size >= MAX_PLAYERS
    ) {
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

        if (
          message.type === "join"
        ) {

          if (player) return;

          player =
            createPlayer(
              id,
              message.name
            );

          player.socket = socket;

          players.set(
            id,
            player
          );

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

        if (
          message.type === "move"
        ) {

          const x =
            Number(message.x);

          const y =
            Number(message.y);

          if (
            Number.isFinite(x) &&
            Number.isFinite(y)
          ) {

            player.targetX =
              clamp(
                x,
                0,
                WORLD
              );

            player.targetY =
              clamp(
                y,
                0,
                WORLD
              );
          }
        }

        else if (
          message.type === "split"
        ) {
          splitPlayer(player);
        }

        else if (
          message.type === "eject"
        ) {
          ejectMass(player);
        }

        else if (
          message.type === "chat"
        ) {
          addChatMessage(
            player,
            message.text
          );
        }

        else if (
          message.type === "changeName"
        ) {

          const newName =
            cleanName(
              message.name
            );

          player.name = newName;
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
