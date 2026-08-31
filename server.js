"use strict";

const http = require("http");
const fs = require("fs");
const path = require("path");
const WebSocket = require("ws");

const PORT = Number(process.env.PORT || 3000);

const WORLD = 6000;
const TICK_MS = 30;

const FOOD_COUNT = 850;
const MAX_PLAYERS = 60;
const MAX_CELLS = 16;

const MOVE_SPEED = 4.2;
const MAX_SPEED = 5;

const MAX_CHAT_LENGTH = 180;
const MAX_CHAT_MESSAGES = 100;

const FOOD_MASS = 1;

const COLORS = [
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
const events = [];

function random(min, max) {
  return Math.random() * (max - min) + min;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function distance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function randomColor() {
  return COLORS[
    Math.floor(Math.random() * COLORS.length)
  ];
}

function randomId() {
  return (
    Math.random().toString(36).slice(2) +
    Math.random().toString(36).slice(2)
  );
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

function makeFood(x, y) {
  return {
    id: randomId(),
    x: x ?? random(30, WORLD - 30),
    y: y ?? random(30, WORLD - 30),
    r: random(3, 7),
    color: randomColor()
  };
}

for (let i = 0; i < FOOD_COUNT; i++) {
  foods.push(makeFood());
}

/* =========================================================
   PLAYER
========================================================= */

function createCell(player, radius, x, y) {
  return {
    id: randomId(),
    owner: player.id,
    x,
    y,
    r: radius,
    vx: 0,
    vy: 0,
    boost: 0
  };
}

function createPlayer(id, name) {
  const player = {
    id,
    name: cleanName(name),
    color: randomColor(),

    x: WORLD / 2,
    y: WORLD / 2,

    targetX: WORLD / 2,
    targetY: WORLD / 2,

    score: 0,
    energy: 100,

    level: 1,
    xp: 0,

    cells: [],

    lastSplit: 0,
    lastEject: 0,
    lastChat: 0,

    socket: null,

    alive: true
  };

  findSpawn(player);

  player.cells.push(
    createCell(
      player,
      25,
      player.x,
      player.y
    )
  );

  return player;
}

function findSpawn(player) {
  for (let attempt = 0; attempt < 100; attempt++) {
    const x = random(200, WORLD - 200);
    const y = random(200, WORLD - 200);

    let valid = true;

    for (const other of players.values()) {
      if (
        distance({ x, y }, other) < 350
      ) {
        valid = false;
        break;
      }
    }

    if (valid) {
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

/* =========================================================
   XP
========================================================= */

function gainXP(player, amount) {
  player.xp += amount;

  while (
    player.xp >= player.level * 50
  ) {
    player.xp -= player.level * 50;
    player.level++;

    send(player, {
      type: "levelUp",
      level: player.level
    });
  }
}

/* =========================================================
   MOVIMENTO
========================================================= */

function getSpeed(cell) {
  let speed =
    MOVE_SPEED *
    Math.pow(
      25 / Math.max(cell.r, 1),
      0.43
    );

  return clamp(
    speed,
    0.45,
    MAX_SPEED
  );
}

function movePlayer(player) {
  const cells = player.cells;

  for (const cell of cells) {
    let targetX = player.targetX;
    let targetY = player.targetY;

    if (cell !== cells[0]) {
      targetX =
        player.targetX +
        Math.cos(cell.id.length) * 20;

      targetY =
        player.targetY +
        Math.sin(cell.id.length) * 20;
    }

    const dx = targetX - cell.x;
    const dy = targetY - cell.y;

    const d = Math.hypot(dx, dy);

    if (d > 2) {
      const speed = getSpeed(cell);

      cell.x +=
        (dx / d) * speed;

      cell.y +=
        (dy / d) * speed;
    }

    if (cell.boost > 0) {
      cell.x += cell.vx;
      cell.y += cell.vy;

      cell.vx *= 0.9;
      cell.vy *= 0.9;

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

  if (cells.length > 0) {
    player.x = cells[0].x;
    player.y = cells[0].y;
  }
}

/* =========================================================
   FOOD
========================================================= */

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
          cell.r = Math.sqrt(
            cell.r * cell.r +
            FOOD_MASS
          );

          player.score++;
          gainXP(player, 1);

          foods.splice(i, 1);
          foods.push(makeFood());
        }
      }
    }
  }
}

/* =========================================================
   SPLIT
========================================================= */

function splitPlayer(player) {
  const now = Date.now();

  if (
    now - player.lastSplit < 900
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

    if (cell.r < 24) {
      continue;
    }

    const newRadius =
      cell.r / Math.sqrt(2);

    cell.r = newRadius;

    const angle = Math.atan2(
      player.targetY - cell.y,
      player.targetX - cell.x
    );

    const child = createCell(
      player,
      newRadius,
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
      )
    );

    child.vx =
      Math.cos(angle) * 10;

    child.vy =
      Math.sin(angle) * 10;

    child.boost = 25;

    player.cells.push(child);
  }
}

/* =========================================================
   EJECT MASS
========================================================= */

function ejectMass(player) {
  const now = Date.now();

  if (
    now - player.lastEject < 120
  ) {
    return;
  }

  if (player.energy < 8) {
    return;
  }

  player.lastEject = now;
  player.energy -= 8;

  for (const cell of player.cells) {
    if (cell.r < 16) {
      continue;
    }

    cell.r = Math.sqrt(
      Math.max(
        16,
        cell.r * cell.r - 6
      )
    );

    const angle = Math.atan2(
      player.targetY - cell.y,
      player.targetX - cell.x
    );

    foods.push(
      makeFood(
        clamp(
          cell.x +
          Math.cos(angle) *
          cell.r *
          1.6,
          10,
          WORLD - 10
        ),
        clamp(
          cell.y +
          Math.sin(angle) *
          cell.r *
          1.6,
          10,
          WORLD - 10
        )
      )
    );
  }
}

/* =========================================================
   COLLISIONS
========================================================= */

function killPlayer(player, killer) {
  if (!player.alive) {
    return;
  }

  player.alive = false;

  send(player, {
    type: "dead",
    score: player.score,
    level: player.level
  });

  if (killer) {
    gainXP(
      killer,
      20
    );

    killer.score += 20;
  }

  players.delete(player.id);
}

function collisions() {
  const all = [];

  for (const player of players.values()) {
    for (const cell of player.cells) {
      all.push({
        player,
        cell
      });
    }
  }

  for (
    let i = 0;
    i < all.length;
    i++
  ) {
    for (
      let j = i + 1;
      j < all.length;
      j++
    ) {
      const A = all[i];
      const B = all[j];

      if (
        A.player === B.player
      ) {
        continue;
      }

      if (
        !players.has(A.player.id) ||
        !players.has(B.player.id)
      ) {
        continue;
      }

      const d =
        distance(
          A.cell,
          B.cell
        );

      if (
        d >
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
        B.cell.r > A.cell.r
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

      big.cell.r =
        Math.sqrt(
          big.cell.r ** 2 +
          small.cell.r ** 2 *
          0.82
        );

      big.player.score +=
        Math.floor(
          small.cell.r ** 2
        );

      big.player.xp += 20;

      small.player.cells =
        small.player.cells.filter(
          c =>
            c.id !==
            small.cell.id
        );

      if (
        small.player.cells.length === 0
      ) {
        killPlayer(
          small.player,
          big.player
        );
      }
    }
  }
}

/* =========================================================
   ENERGY
========================================================= */

function updateEnergy(player) {
  player.energy =
    clamp(
      player.energy + 0.35,
      0,
      100
    );
}

/* =========================================================
   CHAT
========================================================= */

function send(player, data) {
  if (
    player.socket &&
    player.socket.readyState ===
    WebSocket.OPEN
  ) {
    try {
      player.socket.send(
        JSON.stringify(data)
      );
    } catch {}
  }
}

function broadcast(data) {
  const encoded =
    JSON.stringify(data);

  for (const player of players.values()) {
    if (
      player.socket &&
      player.socket.readyState ===
      WebSocket.OPEN
    ) {
      try {
        player.socket.send(encoded);
      } catch {}
    }
  }
}

function addChat(player, text) {
  const now = Date.now();

  if (
    now - player.lastChat < 500
  ) {
    return;
  }

  text = cleanMessage(text);

  if (!text) {
    return;
  }

  player.lastChat = now;

  const message = {
    id: randomId(),
    playerId: player.id,
    name: player.name,
    color: player.color,
    text,
    time: new Date()
      .toLocaleTimeString(
        "it-IT",
        {
          hour: "2-digit",
          minute: "2-digit"
        }
      )
  };

  chat.push(message);

  while (
    chat.length >
    MAX_CHAT_MESSAGES
  ) {
    chat.shift();
  }

  broadcast({
    type: "chatMessage",
    message
  });
}

/* =========================================================
   PUBLIC STATE
========================================================= */

function publicPlayer(player) {
  return {
    id: player.id,
    name: player.name,
    color: player.color,
    score: player.score,
    energy: Math.floor(
      player.energy
    ),
    level: player.level,
    xp: player.xp,

    cells:
      player.cells.map(
        cell => ({
          id: cell.id,
          x: cell.x,
          y: cell.y,
          r: cell.r
        })
      )
  };
}

function publicState() {
  return {
    type: "state",
    world: WORLD,
    foods,
    players:
      [...players.values()]
        .map(publicPlayer)
  };
}

/* =========================================================
   GAME LOOP
========================================================= */

function update() {
  for (const player of players.values()) {
    movePlayer(player);
    updateEnergy(player);
  }

  eatFood();
  collisions();
}

function broadcastState() {
  broadcast(
    publicState()
  );
}

setInterval(
  () => {
    update();
    broadcastState();
  },
  TICK_MS
);

/* =========================================================
   HTTP
========================================================= */

const publicDir =
  path.join(
    __dirname,
    "public"
  );

const server =
  http.createServer(
    (req, res) => {
      let requestPath =
        req.url.split("?")[0];

      if (
        requestPath === "/"
      ) {
        requestPath =
          "/index.html";
      }

      let filename;

      try {
        filename =
          path.resolve(
            publicDir,
            "." + requestPath
          );
      } catch {
        res.writeHead(400);
        return res.end(
          "Bad request"
        );
      }

      if (
        filename !== publicDir &&
        !filename.startsWith(
          publicDir +
          path.sep
        )
      ) {
        res.writeHead(403);
        return res.end(
          "Forbidden"
        );
      }

      fs.readFile(
        filename,
        (error, data) => {
          if (error) {
            res.writeHead(
              404,
              {
                "Content-Type":
                  "text/plain; charset=utf-8"
              }
            );

            return res.end(
              "Not found"
            );
          }

          const ext =
            path.extname(
              filename
            ).toLowerCase();

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

          res.writeHead(
            200,
            {
              "Content-Type":
                types[ext] ||
                "application/octet-stream",
              "Cache-Control":
                ext === ".html"
                  ? "no-cache"
                  : "public, max-age=3600"
            }
          );

          res.end(data);
        }
      );
    }
  );

/* =========================================================
   WEBSOCKET
========================================================= */

const wss =
  new WebSocket.Server({
    server
  });

wss.on(
  "connection",
  socket => {
    if (
      players.size >=
      MAX_PLAYERS
    ) {
      socket.send(
        JSON.stringify({
          type: "error",
          message:
            "Server pieno"
        })
      );

      socket.close();
      return;
    }

    const id =
      randomId();

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
          !message ||
          typeof message.type !==
          "string"
        ) {
          return;
        }

        /* JOIN */

        if (
          message.type === "join"
        ) {
          if (player) {
            return;
          }

          player =
            createPlayer(
              id,
              message.name
            );

          player.socket =
            socket;

          players.set(
            id,
            player
          );

          send(
            player,
            {
              type: "welcome",
              id,
              world: WORLD,
              playerCount:
                players.size
            }
          );

          send(
            player,
            {
              type:
                "chatHistory",
              messages: chat
            }
          );

          broadcast({
            type:
              "system",
            text:
              `${player.name} è entrato nella partita`
          });

          return;
        }

        if (!player) {
          return;
        }

        /* MOVE */

        if (
          message.type ===
          "move"
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

        /* SPLIT */

        else if (
          message.type ===
          "split"
        ) {
          splitPlayer(player);
        }

        /* EJECT */

        else if (
          message.type ===
          "eject"
        ) {
          ejectMass(player);
        }

        /* CHAT */

        else if (
          message.type ===
          "chat"
        ) {
          addChat(
            player,
            message.text
          );
        }

        /* NAME */

        else if (
          message.type ===
          "changeName"
        ) {
          player.name =
            cleanName(
              message.name
            );

          broadcast({
            type:
              "nameChanged",
            id: player.id,
            name: player.name
          });
        }
      }
    );

    socket.on(
      "close",
      () => {
        if (!player) {
          return;
        }

        broadcast({
          type:
            "system",
          text:
            `${player.name} ha lasciato la partita`
        });

        players.delete(
          player.id
        );
      }
    );

    socket.on(
      "error",
      () => {}
    );
  }
);

/* =========================================================
   START
========================================================= */

server.listen(
  PORT,
  "0.0.0.0",
  () => {
    console.log(
      `Cell Arena 3.0 avviato sulla porta ${PORT}`
    );

    console.log(
      `World: ${WORLD}x${WORLD}`
    );

    console.log(
      `Players max: ${MAX_PLAYERS}`
    );

    console.log(
      `Movement speed: ${MOVE_SPEED}`
    );
  }
);
