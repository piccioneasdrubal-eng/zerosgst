/**
 * agar-server — multiplayer .io-like game engine.
 * Focus: stable physics, bounded memory, spatial broad-phase and cheap AI.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const STAFF_ROLES = {
  owner: { tag: '[OWNER]', color: '#ff0055', name: 'Owner' },
  admin: { tag: '[ADMIN]', color: '#ff9900', name: 'Admin' },
  mod:   { tag: '[MOD]',   color: '#00d2ff', name: 'Moderatore' },
  vip:   { tag: '[VIP]',   color: '#ffd700', name: 'VIP' },
  user:  { tag: '',        color: '#ffffff', name: 'Utente' }
};

function getRoleData(role) {
  const key = String(role || 'user').toLowerCase();
  return STAFF_ROLES[key] || STAFF_ROLES.user;
}

const CONFIG = {
  PORT: Number(process.env.PORT) || 3000,
  WORLD: {
    WIDTH: 5000,
    HEIGHT: 5000,
    PELLET_COUNT: 1200,
    MAX_PELLETS: 1700,
    PELLET_MASS: 1,
    START_MASS: 20,
  },
  PHYSICS: {
    BASE_SPEED: 3.0,
    SPEED_MASS_DECAY: 0.55,
    EAT_FACTOR: 1.15,
    SPLIT_COOLDOWN: 500,
    SPLIT_MASS_THRESHOLD: 20,
    EJECT_MASS: 14,
    MERGE_TIMEOUT: 30_000,
    RESPAWN_TIME: 3000,
    BOT_RESPAWN_TIME: 700,
    SPRINT_COST: 1.2,
    SPRINT_SPEED: 1.9,
    SHIELD_TIME: 5000,
    VIRUS_SHOOT_COST: 30,
    VIRUS_PROJECTILE_MASS: 160,
    MAX_CELLS_PER_PLAYER: 12,
    BOT_MAX_CELLS: 6,
    MAX_CELL_MASS: 5000,
    MAX_PLAYER_MASS: 30000,
    MAX_DT: 0.05,
    DASH_COST: 7,
    GOD_MODE_DURATION: 10000,
    GOD_MODE_COOLDOWN: 45000,
    GOD_MODE_MASS_COST: 0,
    MOVE_ACCELERATION: 14,
    MOVE_FRICTION: 0.86,
    SPLIT_IMPULSE: 1120,
    SPLIT_IMPULSE_DECAY: 3.9,
    SPLIT_IMPULSE_TIME: 760,
    SPLIT_DRAG: 0.80,
    SPLIT_CURVE: 0.34,
    SPLIT_CURVE_FALLOFF: 1.15,
    SPLIT_MIN_SPEED: 0,
    MERGE_PULL_SPEED: 10.5,
    MERGE_PULL_ACCEL: 13,
    MERGE_SPRING: 18,
    MERGE_DAMPING: 7.5,
    MERGE_RADIUS_FACTOR: 0.96,
    DASH_DISTANCE: 320,
    BLINK_COST: 18,
    BLINK_DISTANCE: 480,
    SHOCKWAVE_COST: 24,
    SHOCKWAVE_RADIUS: 520,
    FREEZE_COST: 18,
    FREEZE_RADIUS: 560,
    HEAL_COST: 10,
    RAGE_COST: 12,
    REVEAL_COST: 8,
    DECOY_COST: 16,
    BURST_COST: 20,
  },
  TICK: 1000 / 30,
  NET_TICK: 1000 / 25,
  BOTS: {
    DEFAULT_COUNT: 12,
    MAX_COUNT: 100,
    ROOM_SHARE_LIMIT: 0.35,
    DEFAULT_MASS: 30,
    AGGRESSION: 0.95,
    VIEW_RADIUS: 1600,
    SPAWN_RADIUS: 1200,
    CHASE_RANGE: 1400,
    DECISION_INTERVAL: 120,
  },
  NETWORK: {
    VIEW_RADIUS: 1700,
    PELLET_VIEW_RADIUS: 1850,
    MAX_BUFFERED_AMOUNT: 256 * 1024,
    TARGET_MIN_INTERVAL: 50,
    MAX_VISIBLE_PLAYERS: 42,
    MAX_VISIBLE_PLAYERS_FULL: 28,
    MAX_VISIBLE_CELLS_PER_OTHER: 6,
    MAX_VISIBLE_CELLS_FULL: 4,
    MAX_VISIBLE_PELLETS: 260,
    MAX_VISIBLE_PELLETS_FULL: 160,
    CHAT_MIN_INTERVAL: 700,
    ABILITY_MIN_INTERVAL: 250,
    ABILITY_BUFFER: 128,
  },
  SERVER: {
    MAX_PLAYERS: 160,
    MAX_MESSAGE_LENGTH: 4096,
  },
  TEAMS: {
    NAMES: ['ROSSI', 'BLU', 'VERDI', 'GIALLI', 'VIOLA'],
    COLORS: ['#ff4d4d', '#4d7cff', '#4dff88', '#ffd633', '#c04dff'],
  },
  ZONES: {
    COUNT: 5,
    RADIUS: 320,
    BONUS_PELLET_MULT: 2,
    HAZARD_DPS: 4,
    BONUS_INTERVAL: 700,
    MAX_BONUS_PER_TICK: 1,
  },
};

const PELLET_GRID_SIZE = 160;
const PLAYER_GRID_SIZE = 400;
const rand = (min, max) => min + Math.random() * (max - min);
const randInt = (min, max) => Math.floor(rand(min, max + 1));
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const finite = (v) => Number.isFinite(v);
const dist2 = (a, b) => {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return dx * dx + dy * dy;
};
const randColor = () => `hsl(${randInt(0, 360)}, ${randInt(45, 85)}%, ${randInt(45, 60)}%)`;
const uid = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
const cellRadius = (mass) => 10 * Math.sqrt(Math.max(0, Math.min(CONFIG.PHYSICS.MAX_CELL_MASS, Number(mass) || 0)));

const DATA_FILE = process.env.DATA_FILE || path.join(__dirname, 'season-data.json');
function loadSeason() {
  try {
    const raw = fs.readFileSync(DATA_FILE, 'utf8');
    const d = JSON.parse(raw);
    if (d && typeof d === 'object' && d.players && typeof d.players === 'object') return d;
  } catch (_) {}
  return { players: {} };
}

function saveSeason(data) {
  try {
    const tmp = `${DATA_FILE}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(data), 'utf8');
    fs.renameSync(tmp, DATA_FILE);
    return true;
  } catch (_) {
    return false;
  }
}

class World {
  constructor() {
    this.players = new Map();
    this.pellets = [];
    this.pelletGrid = new Map();
    this.powerups = [];
    this.virusProjectiles = [];
    this.zones = [];
    this.killfeed = [];
    this.decoys = [];
    this.traps = [];
    this.mines = [];
    this.duels = new Map();
    this.announcements = [];
    this.pvpEvent = { type: null, endsAt: 0, label: '' };
    this.arena = { enabled: false, center: { x: CONFIG.WORLD.WIDTH / 2, y: CONFIG.WORLD.HEIGHT / 2 }, radius: 900 };
  }

  pelletGridKey(x, y) {
    return `${Math.floor(x / PELLET_GRID_SIZE)}:${Math.floor(y / PELLET_GRID_SIZE)}`;
  }

  rebuildPelletGrid() {
    this.pelletGrid.clear();
    for (const pellet of this.pellets) {
      if (pellet.consumed) continue;
      const key = this.pelletGridKey(pellet.x, pellet.y);
      let bucket = this.pelletGrid.get(key);
      if (!bucket) {
        bucket = [];
        this.pelletGrid.set(key, bucket);
      }
      bucket.push(pellet);
    }
  }

  nearbyPellets(x, y, radius) {
    const minGX = Math.floor((x - radius) / PELLET_GRID_SIZE);
    const maxGX = Math.floor((x + radius) / PELLET_GRID_SIZE);
    const minGY = Math.floor((y - radius) / PELLET_GRID_SIZE);
    const maxGY = Math.floor((y + radius) / PELLET_GRID_SIZE);
    const out = [];
    for (let gx = minGX; gx <= maxGX; gx++) {
      for (let gy = minGY; gy <= maxGY; gy++) {
        const bucket = this.pelletGrid.get(`${gx}:${gy}`);
        if (bucket) out.push(...bucket);
      }
    }
    return out;
  }

  addPellet(x, y, mass = CONFIG.WORLD.PELLET_MASS, vx = 0, vy = 0, color = null, ownerId = null) {
    if (this.pellets.length >= CONFIG.WORLD.MAX_PELLETS) return false;
    const m = Math.max(0.1, Number(mass) || CONFIG.WORLD.PELLET_MASS);
    this.pellets.push({
      id: uid(),
      x: clamp(Number(x) || 0, 0, CONFIG.WORLD.WIDTH),
      y: clamp(Number(y) || 0, 0, CONFIG.WORLD.HEIGHT),
      mass: m,
      vx: Number(vx) || 0,
      vy: Number(vy) || 0,
      consumed: false,
      ownerId: ownerId || null,
      releasedAt: Date.now(),
      color: color || randColor(),
    });
    return true;
  }

  initPellets() {
    for (let i = 0; i < CONFIG.WORLD.PELLET_COUNT; i++) {
      this.addPellet(rand(0, CONFIG.WORLD.WIDTH), rand(0, CONFIG.WORLD.HEIGHT));
    }
    this.rebuildPelletGrid();
  }

  spawnPellet() {
    return this.addPellet(rand(0, CONFIG.WORLD.WIDTH), rand(0, CONFIG.WORLD.HEIGHT));
  }

  initPowerups() {
    while (this.powerups.length < 20) this.spawnPowerup();
  }

  spawnPowerup() {
    const types = ['virus', 'speed', 'mass', 'invisible', 'magnet', 'shield'];
    const type = types[randInt(0, types.length - 1)];
    const mass = type === 'mass' ? 100 : type === 'virus' ? 160 : 40;
    this.powerups.push({ id: uid(), x: rand(0, CONFIG.WORLD.WIDTH), y: rand(0, CONFIG.WORLD.HEIGHT), type, mass });
  }

  initZones() {
    const r = CONFIG.ZONES.RADIUS;
    for (let i = 0; i < CONFIG.ZONES.COUNT; i++) {
      this.zones.push({
        id: uid(),
        x: rand(r, CONFIG.WORLD.WIDTH - r),
        y: rand(r, CONFIG.WORLD.HEIGHT - r),
        r,
        kind: i % 2 === 0 ? 'bonus' : 'hazard',
      });
    }
  }

  pushKillfeed(killerName, victimName, killerColor, victimColor) {
    this.killfeed.unshift({
      killer: String(killerName || 'Player'),
      victim: String(victimName || 'Player'),
      killerColor: String(killerColor || '#fff'),
      victimColor: String(victimColor || '#fff'),
      at: Date.now(),
    });
    if (this.killfeed.length > 8) this.killfeed.length = 8;
  }
}

class Cell {
  constructor(x, y, mass, ownerId) {
    this.id = uid();
    this.x = x;
    this.y = y;
    this.mass = Math.max(0.1, Number(mass) || 0.1);
    this.ownerId = ownerId;
    this.bornAt = Date.now();
    this.vx = 0;
    this.vy = 0;
    this.splitVx = 0;
    this.splitVy = 0;
    this.splitUntil = 0;
    this.mergeVx = 0;
    this.mergeVy = 0;
  }
  get radius() { return cellRadius(this.mass); }
}

class Player {
  constructor(id, name, isBot = false) {
    this.id = id;
    this.name = String(name || 'Player').slice(0, 16);
    this.isBot = !!isBot;
    this.color = randColor();
    this.team = null;
    this.role = 'user';
    this.cells = [];
    this.target = { x: CONFIG.WORLD.WIDTH / 2, y: CONFIG.WORLD.HEIGHT / 2 };
    this.lastSplit = 0;
    this.ws = null;
    this.botState = null;
    this.speedBoost = 0;
    this.invisible = 0;
    this.magnet = 0;
    this.shield = 0;
    this.sprinting = false;
    this.dead = false;
    this.respawnAt = 0;
    this.stats = { kills: 0, deaths: 0, joinAt: Date.now() };
    this.dashUntil = 0;
    this.dashVx = 0;
    this.dashVy = 0;
    this.freezeUntil = 0;
    this.rageUntil = 0;
    this.revealUntil = 0;
    this.respawnShieldUntil = 0;
    this.autoPilot = false;
    this.combo = 0;
    this.lastKillAt = 0;
    this.lastQuestPlayAt = Date.now();
    this.assists = 0;
    this.bounty = 0;
    this.nextAbilityAt = 0;
    this.events = [];
    this.coins = 1000;
    this.inventory = new Set(['skin_default']);
    this.equippedSkin = 'default';
    this.customSkinUrl = '';
    this.customSkinMime = '';
    this.customSkinTitle = '';
    this.shopHistory = [];
    this.dailyClaimAt = 0;
    this.questState = {};
    this.coinMultiplierUntil = 0;
    this.coinMultiplierValue = 1;
    this.starterGiftClaimed = false;
    this.damageLedger = new Map();
    this.pvpPoints = 0;
    this.elo = 1000;
    this.damageDealt = 0;
    this.damageTaken = 0;
    this.killStreak = 0;
    this.godUntil = 0;
    this.lastGodMode = 0;
    this.bestKillStreak = 0;
    this.parryUntil = 0;
    this.markedTargetId = null;
    this.hunterUntil = 0;
    this.slowUntil = 0;
    this.adminFrozen = false;
    this.mutedUntil = 0;
    this.adminBotEnabled = true;
    this.botMode = 'balanced';
    this.botDifficulty = 1;
    this.botTargetId = null;
    this.duelId = null;
    this.arena = false;
    this.gameMode = 'ffa';
  }

  get totalMass() {
    let total = 0;
    for (const c of this.cells) total += Math.max(0, c.mass);
    return total;
  }

  get center() {
    if (!this.cells.length) return null;
    let mass = 0, x = 0, y = 0;
    for (const c of this.cells) {
      const m = Math.max(0, c.mass);
      mass += m;
      x += c.x * m;
      y += c.y * m;
    }
    if (mass <= 0) {
      return { x: this.cells[0].x, y: this.cells[0].y, mass: 0 };
    }
    return { x: x / mass, y: y / mass, mass };
  }

  spawnCell() {
    return this.spawnCellAt(rand(40, CONFIG.WORLD.WIDTH - 40), rand(40, CONFIG.WORLD.HEIGHT - 40));
  }

  spawnCellAt(x, y) {
    const c = new Cell(
      clamp(Number(x) || 0, 10, CONFIG.WORLD.WIDTH - 10),
      clamp(Number(y) || 0, 10, CONFIG.WORLD.HEIGHT - 10),
      CONFIG.WORLD.START_MASS,
      this.id,
    );
    this.cells = [c];
    this.dead = false;
    this.respawnAt = 0;
    return c;
  }
}

class GameServer {
  constructor() {
    this.world = new World();
    this.world.initPellets();
    this.world.initPowerups();
    this.world.initZones();
    this.playerGrid = new Map();
    this.lastTick = Date.now();
    this.lastZoneTick = Date.now();
    this.season = loadSeason();
    this.seasonDirty = false;
    this.lastSeasonSave = 0;
    this.matchStartedAt = Date.now();
    this.totalTicks = 0;
    this.lastTickDuration = 0;
    this.paused = false;
    this.botAutomationEnabled = true;
    this.bannedNames = new Set();
    this.mutedNames = new Set();
    this.shopSale = { percent: 0, endsAt: 0 };
    this.pvpEvent = { type: null, endsAt: 0, label: '' };
  }

  seasonKey(playerOrName) {
    if (playerOrName && typeof playerOrName === 'object') {
      if (!playerOrName.isBot && playerOrName.accountId) return `account:${String(playerOrName.accountId)}`;
      return String(playerOrName.name || 'player').trim().toLowerCase();
    }
    return String(playerOrName || 'player').trim().toLowerCase();
  }

  markSeasonDirty() {
    this.seasonDirty = true;
  }

  addPlayer(name, isBot = false, team = null, auth = null) {
    const p = new Player(uid(), name, isBot);
    if (!isBot && auth && typeof auth === 'object') {
      p.accountId = auth.id ?? null;
      p.authEmail = String(auth.email || '');
      p.premium = Boolean(auth.premium);
      p.role = String(auth.role || 'user').toLowerCase();
      p.isAdmin = auth.is_admin === true || Number(auth.is_admin) === 1 || ['admin','owner','administrator'].includes(p.role);
    }
    if (Number.isInteger(team) && team >= 0 && team < CONFIG.TEAMS.COLORS.length) {
      p.team = team;
      p.color = CONFIG.TEAMS.COLORS[team];
    }
    this.world.players.set(p.id, p);
    if (isBot) {
      const spot = this.findSafeSpawn(p);
      p.spawnCellAt(spot.x, spot.y);
    } else {
      p.spawnCell();
    }
    return p;
  }

  playerSummary(p) {
    if (!p) return null;
    const roleData = getRoleData(p.role);
    return {
      id: p.id,
      name: p.name,
      role: p.role || 'user',
      roleTag: roleData.tag,
      roleColor: roleData.color,
      roleName: roleData.name,
      mass: Math.round(p.totalMass),
      kills: p.stats.kills,
      deaths: p.stats.deaths,
      assists: p.assists,
      combo: p.combo,
      bounty: Math.round(p.bounty),
      team: p.team,
      pvpPoints: Math.round(p.pvpPoints),
      elo: Math.round(p.elo),
      coins: Math.round(p.coins),
      streak: p.killStreak
    };
  }

  findSafeSpawn(p = null) {
    return { x: rand(80, CONFIG.WORLD.WIDTH - 80), y: rand(80, CONFIG.WORLD.HEIGHT - 80) };
  }

  markTarget(p, targetId = null) {
    if (!p) return null;
    p.markedTargetId = targetId;
    return targetId;
  }

  // Aggiunto il metodo leaderboard mancante
  leaderboard() {
    const list = [];
    for (const p of this.world.players.values()) {
      if (p.totalMass > 0 || !p.dead) {
        const roleData = getRoleData(p.role);
        list.push({
          id: p.id,
          name: p.name,
          mass: Math.round(p.totalMass),
          roleTag: roleData.tag,
          roleColor: roleData.color
        });
      }
    }
    // Ordina i giocatori in base alla massa in ordine decrescente
    list.sort((a, b) => b.mass - a.mass);
    // Restituisce i primi 10 giocatori
    return list.slice(0, 10);
  }
}

module.exports = { GameServer, CONFIG, STAFF_ROLES, getRoleData };
