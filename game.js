/**
 * agar-server — multiplayer .io-like game engine.
 * Focus: stable physics, bounded memory, spatial broad-phase and cheap AI.
 */
'use strict';

const fs = require('fs');
const path = require('path');

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
    SPLIT_COOLDOWN: 1000,
    SPLIT_MASS_THRESHOLD: 20,
    EJECT_MASS: 15,
    MERGE_TIMEOUT: 30_000,
    RESPAWN_TIME: 3000,
    BOT_RESPAWN_TIME: 700,
    SPRINT_COST: 1.2,
    SPRINT_SPEED: 1.9,
    SHIELD_TIME: 5000,
    VIRUS_SHOOT_COST: 30,
    VIRUS_PROJECTILE_MASS: 160,
    MAX_CELLS_PER_PLAYER: 24,
    MAX_DT: 0.05,
    DASH_COST: 7,
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
  NET_TICK: 1000 / 20,
  BOTS: {
    DEFAULT_COUNT: 12,
    MAX_COUNT: 100,
    DEFAULT_MASS: 30,
    AGGRESSION: 0.95,
    VIEW_RADIUS: 1600,
    SPAWN_RADIUS: 1200,
    CHASE_RANGE: 1400,
    DECISION_INTERVAL: 120,
  },
  NETWORK: {
    VIEW_RADIUS: 1900,
    PELLET_VIEW_RADIUS: 2200,
    MAX_BUFFERED_AMOUNT: 512 * 1024,
    TARGET_MIN_INTERVAL: 40,
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
const cellRadius = (mass) => 10 * Math.sqrt(Math.max(0, Number(mass) || 0));

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

  addPellet(x, y, mass = CONFIG.WORLD.PELLET_MASS) {
    if (this.pellets.length >= CONFIG.WORLD.MAX_PELLETS) return false;
    const m = Math.max(0.1, Number(mass) || CONFIG.WORLD.PELLET_MASS);
    this.pellets.push({
      id: uid(),
      x: clamp(Number(x) || 0, 0, CONFIG.WORLD.WIDTH),
      y: clamp(Number(y) || 0, 0, CONFIG.WORLD.HEIGHT),
      mass: m,
      consumed: false,
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

  markSeasonDirty() {
    this.seasonDirty = true;
  }

  flushSeason(force = false) {
    const now = Date.now();
    if (!force && (!this.seasonDirty || now - this.lastSeasonSave < 3000)) return;
    for (const p of this.world.players.values()) {
      if (p.isBot) continue;
      const key = String(p.name || 'player').trim().toLowerCase();
      const rec = this.season.players[key] || (this.season.players[key] = { name: p.name, score: 0, kills: 0, deaths: 0 });
      rec.name = p.name;
      rec.coins = Math.round(p.coins);
      rec.inventory = [...p.inventory].slice(0, 100);
      rec.equippedSkin = p.equippedSkin;
      rec.pvpPoints = Math.round(p.pvpPoints);
      rec.elo = Math.round(p.elo);
      rec.bestKillStreak = Math.round(p.bestKillStreak);
      rec.damageDealt = Math.round(p.damageDealt);
      rec.damageTaken = Math.round(p.damageTaken);
      rec.starterGiftClaimed = p.starterGiftClaimed;
      rec.dailyClaimAt = p.dailyClaimAt;
      rec.questState = p.questState;
    }
    if (saveSeason(this.season)) {
      this.seasonDirty = false;
      this.lastSeasonSave = now;
    }
  }

  recordDeath(name) {
    const key = String(name || 'player').trim().toLowerCase();
    if (!this.season.players[key]) this.season.players[key] = { name: String(name || 'Player').slice(0, 16), score: 0, kills: 0, deaths: 0 };
    this.season.players[key].deaths += 1;
    this.season.players[key].name = String(name || 'Player').slice(0, 16);
    this.markSeasonDirty();
  }

  recordKill(name, mass) {
    const key = String(name || 'player').trim().toLowerCase();
    if (!this.season.players[key]) this.season.players[key] = { name: String(name || 'Player').slice(0, 16), score: 0, kills: 0, deaths: 0 };
    const p = this.season.players[key];
    p.kills += 1;
    p.score += Math.max(1, Math.round(Number(mass) / 2));
    p.name = String(name || 'Player').slice(0, 16);
    this.markSeasonDirty();
  }

  seasonLeaderboard(limit = 10) {
    const n = clamp(Number(limit) || 10, 1, 50);
    return Object.values(this.season.players)
      .sort((a, b) => Number(b.score) - Number(a.score))
      .slice(0, n);
  }

  addPlayer(name, isBot = false, team = null) {
    const p = new Player(uid(), name, isBot);
    if (Number.isInteger(team) && team >= 0 && team < CONFIG.TEAMS.COLORS.length) {
      p.team = team;
      p.color = CONFIG.TEAMS.COLORS[team];
    }
    const saved = this.season.players[p.name.trim().toLowerCase()];
    if (saved && typeof saved === 'object') {
      p.coins = clamp(Number(saved.coins) || 1000, 0, 100000000);
      p.inventory = new Set(Array.isArray(saved.inventory) && saved.inventory.length ? saved.inventory.slice(0, 100) : ['skin_default']);
      p.equippedSkin = String(saved.equippedSkin || 'default').slice(0, 40);
      p.pvpPoints = Number(saved.pvpPoints) || 0;
      p.elo = clamp(Number(saved.elo) || 1000, 400, 4000);
      p.bestKillStreak = Number(saved.bestKillStreak) || 0;
      p.damageDealt = Number(saved.damageDealt) || 0;
      p.damageTaken = Number(saved.damageTaken) || 0;
      p.starterGiftClaimed = Boolean(saved.starterGiftClaimed);
      p.dailyClaimAt = Number(saved.dailyClaimAt) || 0;
      p.questState = saved.questState && typeof saved.questState === 'object' ? saved.questState : {};
    }
    this.world.players.set(p.id, p);
    if (isBot) {
      const cx = CONFIG.WORLD.WIDTH / 2;
      const cy = CONFIG.WORLD.HEIGHT / 2;
      p.spawnCellAt(cx + rand(-CONFIG.BOTS.SPAWN_RADIUS, CONFIG.BOTS.SPAWN_RADIUS), cy + rand(-CONFIG.BOTS.SPAWN_RADIUS, CONFIG.BOTS.SPAWN_RADIUS));
      p.botState = {
        wanderTheta: rand(0, Math.PI * 2),
        targetX: p.target.x,
        targetY: p.target.y,
        nextDecisionAt: 0,
        nextWanderAt: Date.now() + rand(300, 1500),
        botMode: p.botMode,
      };
    } else {
      p.spawnCell();
    }
    return p;
  }

  removePlayer(id) {
    const p = this.world.players.get(id);
    if (!p) return;
    for (const c of p.cells) {
      const count = Math.min(40, Math.max(1, Math.floor(Math.max(1, c.mass) / 12)));
      for (let i = 0; i < count; i++) {
        this.world.addPellet(c.x + rand(-c.radius, c.radius), c.y + rand(-c.radius, c.radius), CONFIG.WORLD.PELLET_MASS * 2);
        if (this.world.pellets.length >= CONFIG.WORLD.MAX_PELLETS) break;
      }
    }
    this.world.players.delete(id);
    this.world.rebuildPelletGrid();
  }

  queueEvent(p, type, data = {}) {
    if (!p || !Array.isArray(p.events)) return;
    p.events.push({ type, ...data, at: Date.now() });
    if (p.events.length > CONFIG.PHYSICS.MAX_CELLS_PER_PLAYER * 2) p.events.splice(0, p.events.length - CONFIG.PHYSICS.MAX_CELLS_PER_PLAYER * 2);
  }

  canUseAbility(p, cooldown = 400) {
    const now = Date.now();
    if (!p || p.dead || !p.cells.length || now < p.nextAbilityAt) return false;
    p.nextAbilityAt = now + Math.max(CONFIG.NETWORK.ABILITY_MIN_INTERVAL, cooldown);
    return true;
  }

  spendMass(p, cost) {
    const amount = Math.max(0, Number(cost) || 0);
    if (!p || p.dead || p.totalMass <= amount + 8) return false;
    let remaining = amount;
    for (const cell of [...p.cells].sort((a, b) => b.mass - a.mass)) {
      const take = Math.min(remaining, Math.max(0, cell.mass - 5));
      cell.mass -= take;
      remaining -= take;
      if (remaining <= 0.001) return true;
    }
    return false;
  }

  dash(p) {
    if (!this.canUseAbility(p, 900) || !this.spendMass(p, CONFIG.PHYSICS.DASH_COST)) return false;
    const c = p.center;
    const t = p.target || c;
    const ang = Math.atan2(t.y - c.y, t.x - c.x);
    p.dashUntil = Date.now() + 220;
    p.dashVx = Math.cos(ang) * (CONFIG.PHYSICS.DASH_DISTANCE / 0.22);
    p.dashVy = Math.sin(ang) * (CONFIG.PHYSICS.DASH_DISTANCE / 0.22);
    this.queueEvent(p, 'ability', { name: 'dash' });
    return true;
  }

  blink(p) {
    if (!this.canUseAbility(p, 1400) || !this.spendMass(p, CONFIG.PHYSICS.BLINK_COST)) return false;
    const c = p.center;
    const t = p.target || c;
    const ang = Math.atan2(t.y - c.y, t.x - c.x);
    const d = Math.min(CONFIG.PHYSICS.BLINK_DISTANCE, Math.max(80, Math.hypot(t.x - c.x, t.y - c.y)));
    const x = clamp(c.x + Math.cos(ang) * d, 60, CONFIG.WORLD.WIDTH - 60);
    const y = clamp(c.y + Math.sin(ang) * d, 60, CONFIG.WORLD.HEIGHT - 60);
    const dx = x - c.x, dy = y - c.y;
    for (const cell of p.cells) { cell.x = clamp(cell.x + dx, cell.radius, CONFIG.WORLD.WIDTH - cell.radius); cell.y = clamp(cell.y + dy, cell.radius, CONFIG.WORLD.HEIGHT - cell.radius); }
    this.queueEvent(p, 'ability', { name: 'blink' });
    return true;
  }

  shockwave(p) {
    if (!this.canUseAbility(p, 2200) || !this.spendMass(p, CONFIG.PHYSICS.SHOCKWAVE_COST)) return false;
    const c = p.center;
    const r2 = CONFIG.PHYSICS.SHOCKWAVE_RADIUS ** 2;
    for (const other of this.world.players.values()) {
      if (other.id === p.id || other.dead || (p.team !== null && p.team === other.team)) continue;
      const oc = other.center; if (!oc || dist2(c, oc) > r2) continue;
      const ang = Math.atan2(oc.y - c.y, oc.x - c.x);
      const push = 220;
      for (const cell of other.cells) { cell.x = clamp(cell.x + Math.cos(ang) * push, cell.radius, CONFIG.WORLD.WIDTH - cell.radius); cell.y = clamp(cell.y + Math.sin(ang) * push, cell.radius, CONFIG.WORLD.HEIGHT - cell.radius); }
    }
    this.queueEvent(p, 'ability', { name: 'shockwave' });
    return true;
  }

  freezeNearby(p) {
    if (!this.canUseAbility(p, 2500) || !this.spendMass(p, CONFIG.PHYSICS.FREEZE_COST)) return false;
    const c = p.center;
    const r2 = CONFIG.PHYSICS.FREEZE_RADIUS ** 2;
    let hits = 0;
    for (const other of this.world.players.values()) {
      if (other.id === p.id || other.dead || (p.team !== null && p.team === other.team)) continue;
      const oc = other.center; if (!oc || dist2(c, oc) > r2) continue;
      other.freezeUntil = Date.now() + 1500; hits++;
      this.queueEvent(other, 'status', { name: 'frozen' });
    }
    this.queueEvent(p, 'ability', { name: 'freeze', hits });
    return true;
  }

  createDecoy(p) {
    if (!this.canUseAbility(p, 2200) || !this.spendMass(p, CONFIG.PHYSICS.DECOY_COST)) return false;
    const c = p.center;
    this.world.decoys.push({ id: uid(), x: c.x, y: c.y, mass: Math.max(8, p.totalMass * 0.12), color: p.color, name: p.name, team: p.team, expiresAt: Date.now() + 6000 });
    this.queueEvent(p, 'ability', { name: 'decoy' });
    return true;
  }

  massBurst(p) {
    if (!this.canUseAbility(p, 1800) || !this.spendMass(p, CONFIG.PHYSICS.BURST_COST)) return false;
    const c = p.center;
    for (let i = 0; i < 4; i++) {
      const a = Math.atan2(p.target.y - c.y, p.target.x - c.x) + (i - 1.5) * 0.14;
      this.world.addPellet(c.x + Math.cos(a) * (c.mass ? cellRadius(c.mass) + 20 : 30), c.y + Math.sin(a) * (c.mass ? cellRadius(c.mass) + 20 : 30), 5);
    }
    this.queueEvent(p, 'ability', { name: 'burst' });
    return true;
  }

  heal(p) {
    if (!this.canUseAbility(p, 5000) || !this.spendMass(p, CONFIG.PHYSICS.HEAL_COST)) return false;
    for (const cell of p.cells) cell.mass += 7;
    this.queueEvent(p, 'ability', { name: 'heal' });
    return true;
  }

  rage(p) {
    if (!this.canUseAbility(p, 6500) || !this.spendMass(p, CONFIG.PHYSICS.RAGE_COST)) return false;
    p.rageUntil = Date.now() + 5000;
    this.queueEvent(p, 'ability', { name: 'rage' });
    return true;
  }

  reveal(p) {
    if (!this.canUseAbility(p, 3000) || !this.spendMass(p, CONFIG.PHYSICS.REVEAL_COST)) return false;
    p.revealUntil = Date.now() + 5000;
    this.queueEvent(p, 'ability', { name: 'reveal' });
    return true;
  }

  setAutoPilot(p, enabled) {
    if (!p || p.dead) return false;
    p.autoPilot = Boolean(enabled);
    if (p.autoPilot && !p.botState) {
      p.botState = { wanderTheta: rand(0, Math.PI * 2), targetX: p.target.x, targetY: p.target.y, nextDecisionAt: 0, nextWanderAt: Date.now() + 500 };
    }
    if (!p.autoPilot && p.botState && !p.isBot) p.botState = null;
    this.queueEvent(p, 'autopilot', { enabled: p.autoPilot });
    return true;
  }

  findSafeSpawn(p = null) {
    let best = { x: rand(80, CONFIG.WORLD.WIDTH - 80), y: rand(80, CONFIG.WORLD.HEIGHT - 80), score: -1 };
    for (let i = 0; i < 24; i++) {
      const candidate = { x: rand(80, CONFIG.WORLD.WIDTH - 80), y: rand(80, CONFIG.WORLD.HEIGHT - 80) };
      let nearest = Infinity;
      for (const other of this.world.players.values()) {
        if (!other || other.dead || (p && other.id === p.id)) continue;
        const c = other.center; if (!c) continue;
        nearest = Math.min(nearest, Math.sqrt(dist2(candidate, c)));
      }
      if (nearest > best.score) best = { ...candidate, score: nearest };
    }
    return best;
  }

  grantRespawnShield(p, duration = 3500) {
    if (!p) return;
    p.respawnShieldUntil = Date.now() + duration;
    p.shield = Math.max(p.shield, p.respawnShieldUntil);
  }

  updateTimedEffects(now) {
    for (const p of this.world.players.values()) {
      if (p.dead) continue;
      if (p.autoPilot && p.botState) this.chooseBotTarget(p, now);
      if (p.rageUntil > now) {
        for (const cell of p.cells) cell.mass = Math.max(5, cell.mass - 0.25 / 30);
      }
      if (p.lastKillAt && now - p.lastKillAt > 8000) { p.combo = 0; this.resetKillStreak(p); }
      if (p.coinMultiplierUntil && p.coinMultiplierUntil <= now) p.coinMultiplierValue = 1;
      if (now - p.lastQuestPlayAt >= 60000) { p.lastQuestPlayAt = now; this.addQuestProgress(p, 'play', 1); }
    }
  }

  cleanupExpiredEntities(now) {
    if (this.world.decoys.length) this.world.decoys = this.world.decoys.filter((d) => d.expiresAt > now);
    if (this.world.traps.length) this.world.traps = this.world.traps.filter((x) => x.expiresAt > now);
    if (this.world.mines.length) this.world.mines = this.world.mines.filter((x) => x.expiresAt > now);
    if (this.pvpEvent && this.pvpEvent.endsAt && this.pvpEvent.endsAt <= now) this.pvpEvent = { type: null, endsAt: 0, label: '' };
    if (!this.pvpEvent || !this.pvpEvent.type) this.startPvPEvent(['bounty','massacre','duel'][Math.floor(now / 120000) % 3]);
    for (const p of this.world.players.values()) if (p.mutedUntil && p.mutedUntil <= now) p.mutedUntil = 0;
    this.world.announcements = this.world.announcements.filter((a) => now - a.at < 30000);
  }

  teamScores() {
    const out = CONFIG.TEAMS.NAMES.map((name, index) => ({ team: index, name, mass: 0, kills: 0, players: 0 }));
    for (const p of this.world.players.values()) {
      if (p.team === null || !out[p.team]) continue;
      out[p.team].mass += p.totalMass;
      out[p.team].kills += p.stats.kills;
      out[p.team].players += 1;
    }
    return out.map((x) => ({ ...x, mass: Math.round(x.mass) })).sort((a, b) => b.mass - a.mass);
  }

  matchInfo() {
    return { startedAt: this.matchStartedAt, elapsed: Date.now() - this.matchStartedAt, players: this.world.players.size, bots: [...this.world.players.values()].filter((p) => p.isBot).length };
  }

  performanceStats() {
    return { tick: CONFIG.TICK, networkTick: CONFIG.NET_TICK, totalTicks: this.totalTicks, lastTickMs: this.lastTickDuration, players: this.world.players.size, pellets: this.world.pellets.length, projectiles: this.world.virusProjectiles.length, decoys: this.world.decoys.length };
  }

  playerSummary(p) {
    if (!p) return null;
    return { id: p.id, name: p.name, mass: Math.round(p.totalMass), kills: p.stats.kills, deaths: p.stats.deaths, assists: p.assists, combo: p.combo, bounty: Math.round(p.bounty), team: p.team, pvpPoints: Math.round(p.pvpPoints), elo: Math.round(p.elo), coins: Math.round(p.coins), streak: p.killStreak };
  }

  nearbyThreats(p, radius = 1000) {
    if (!p || !p.center) return [];
    const c = p.center;
    return this.nearbyPlayers(c.x, c.y, radius).filter((o) => o.id !== p.id && !o.dead && (p.team === null || p.team !== o.team)).map((o) => {
      const oc = o.center; return { id: o.id, name: o.name, mass: Math.round(o.totalMass), distance: Math.round(Math.sqrt(dist2(c, oc))), threat: o.totalMass > p.totalMass * 1.15 };
    }).sort((a, b) => a.distance - b.distance).slice(0, 12);
  }


  // =========================
  // 30 FUNZIONI PvP
  // =========================
  getPlayer(idOrName) {
    if (!idOrName) return null;
    const raw = String(idOrName);
    const direct = this.world.players.get(raw);
    if (direct) return direct;
    const lower = raw.trim().toLowerCase();
    for (const p of this.world.players.values()) if (p.name.toLowerCase() === lower) return p;
    return null;
  }

  updateKillStreak(p) {
    if (!p) return 0;
    p.killStreak = (p.killStreak || 0) + 1;
    p.bestKillStreak = Math.max(p.bestKillStreak || 0, p.killStreak);
    return p.killStreak;
  }

  resetKillStreak(p) {
    if (!p) return;
    p.killStreak = 0;
  }

  awardPvpPoints(p, points) {
    if (!p || p.isBot) return 0;
    const amount = clamp(Math.round(Number(points) || 0), -10000, 10000);
    p.pvpPoints = Math.max(0, (p.pvpPoints || 0) + amount);
    this.markSeasonDirty();
    return amount;
  }

  updateElo(winner, loser, result = 1) {
    if (!winner || !loser || winner.id === loser.id) return 0;
    const expected = 1 / (1 + Math.pow(10, (loser.elo - winner.elo) / 400));
    const score = result ? 1 : 0;
    const delta = Math.round(32 * (score - expected));
    winner.elo = clamp((winner.elo || 1000) + delta, 400, 4000);
    loser.elo = clamp((loser.elo || 1000) - delta, 400, 4000);
    this.markSeasonDirty();
    return delta;
  }

  recordPvpDamage(attacker, victim, amount) {
    if (!attacker || !victim || attacker.id === victim.id) return false;
    const dmg = clamp(Number(amount) || 0, 0, 100000);
    if (!dmg) return false;
    attacker.damageDealt = (attacker.damageDealt || 0) + dmg;
    victim.damageTaken = (victim.damageTaken || 0) + dmg;
    victim.damageLedger.set(attacker.id, Date.now());
    this.markSeasonDirty();
    return true;
  }

  registerAssist(p) {
    if (!p) return 0;
    p.assists = (p.assists || 0) + 1;
    return p.assists;
  }

  setBounty(p, amount) {
    if (!p || p.dead) return false;
    p.bounty = clamp(Math.round(Number(amount) || 0), 0, 50000);
    this.queueEvent(p, 'bounty', { amount: p.bounty });
    return true;
  }

  collectBounty(killer, victim) {
    if (!killer || !victim) return 0;
    const reward = Math.max(0, Math.round(victim.bounty || 0));
    if (!reward) return 0;
    victim.bounty = 0;
    this.addCoins(killer, reward);
    this.awardPvpPoints(killer, Math.round(reward / 10));
    this.queueEvent(killer, 'bounty-collected', { reward });
    return reward;
  }

  resolveEnemy(p, targetId = null) {
    if (!p) return null;
    const direct = targetId ? this.getPlayer(targetId) : null;
    if (direct && !direct.dead && direct.id !== p.id && (p.team === null || p.team !== direct.team)) return direct;
    const c = p.center;
    if (!c) return null;
    let best = null, bestD2 = 900000000;
    for (const other of this.nearbyPlayers(c.x, c.y, 900)) {
      if (other.id === p.id || other.dead || (p.team !== null && p.team === other.team)) continue;
      const d2v = dist2(c, other.center);
      if (d2v < bestD2) { bestD2 = d2v; best = other; }
    }
    return best;
  }

  markTarget(p, targetId = null) {
    const target = this.resolveEnemy(p, targetId);
    if (!target) return false;
    p.markedTargetId = target.id;
    this.queueEvent(p, 'marked-target', { targetId: target.id, target: target.name });
    return true;
  }

  hunterMode(p) {
    if (!p || p.dead || !this.spendMass(p, 18)) return false;
    p.hunterUntil = Date.now() + 7000;
    p.revealUntil = Math.max(p.revealUntil, Date.now() + 7000);
    this.queueEvent(p, 'ability', { name: 'hunter' });
    return true;
  }

  parry(p) {
    if (!this.canUseAbility(p, 3500) || !this.spendMass(p, 10)) return false;
    p.parryUntil = Date.now() + 1100;
    this.queueEvent(p, 'ability', { name: 'parry' });
    return true;
  }

  stunTarget(p, targetId = null) {
    if (!this.canUseAbility(p, 2200) || !this.spendMass(p, 12)) return false;
    const target = this.resolveEnemy(p, targetId); if (!target) return false;
    target.freezeUntil = Math.max(target.freezeUntil, Date.now() + 900);
    this.recordPvpDamage(p, target, 2);
    this.queueEvent(target, 'status', { name: 'stunned', by: p.name });
    return true;
  }

  slowTarget(p, targetId = null) {
    if (!this.canUseAbility(p, 2000) || !this.spendMass(p, 9)) return false;
    const target = this.resolveEnemy(p, targetId); if (!target) return false;
    target.slowUntil = Math.max(target.slowUntil, Date.now() + 2200);
    this.recordPvpDamage(p, target, 1);
    this.queueEvent(target, 'status', { name: 'slowed', by: p.name });
    return true;
  }

  knockbackTarget(p, targetId = null) {
    if (!this.canUseAbility(p, 1700) || !this.spendMass(p, 11)) return false;
    const target = this.resolveEnemy(p, targetId); if (!target) return false;
    const a = p.center, b = target.center; const ang = Math.atan2(b.y - a.y, b.x - a.x);
    for (const cell of target.cells) {
      cell.x = clamp(cell.x + Math.cos(ang) * 260, cell.radius, CONFIG.WORLD.WIDTH - cell.radius);
      cell.y = clamp(cell.y + Math.sin(ang) * 260, cell.radius, CONFIG.WORLD.HEIGHT - cell.radius);
    }
    this.recordPvpDamage(p, target, 3);
    return true;
  }

  createTrap(p) {
    if (!this.canUseAbility(p, 3500) || !this.spendMass(p, 14)) return false;
    const c = p.center, t = p.target || c; const ang = Math.atan2(t.y - c.y, t.x - c.x);
    const x = clamp(c.x + Math.cos(ang) * 260, 30, CONFIG.WORLD.WIDTH - 30);
    const y = clamp(c.y + Math.sin(ang) * 260, 30, CONFIG.WORLD.HEIGHT - 30);
    this.world.traps.push({ id: uid(), x, y, r: 80, ownerId: p.id, expiresAt: Date.now() + 12000 });
    this.queueEvent(p, 'ability', { name: 'trap' });
    return true;
  }

  createMine(p) {
    if (!this.canUseAbility(p, 4200) || !this.spendMass(p, 18)) return false;
    const c = p.center, t = p.target || c; const ang = Math.atan2(t.y - c.y, t.x - c.x);
    const x = clamp(c.x + Math.cos(ang) * 360, 30, CONFIG.WORLD.WIDTH - 30);
    const y = clamp(c.y + Math.sin(ang) * 360, 30, CONFIG.WORLD.HEIGHT - 30);
    this.world.mines.push({ id: uid(), x, y, r: 70, ownerId: p.id, expiresAt: Date.now() + 15000, damage: 22 });
    this.queueEvent(p, 'ability', { name: 'mine' });
    return true;
  }

  triggerTraps() {
    const now = Date.now();
    for (let i = this.world.traps.length - 1; i >= 0; i--) {
      const trap = this.world.traps[i];
      if (trap.expiresAt <= now) { this.world.traps.splice(i, 1); continue; }
      const owner = this.world.players.get(trap.ownerId);
      for (const p of this.world.players.values()) {
        if (p.dead || !p.center || p.id === trap.ownerId || (owner && owner.team !== null && owner.team === p.team)) continue;
        if (dist2(p.center, trap) > trap.r * trap.r) continue;
        p.slowUntil = Math.max(p.slowUntil, now + 1800);
        p.freezeUntil = Math.max(p.freezeUntil, now + 350);
        if (owner) this.recordPvpDamage(owner, p, 6);
        this.queueEvent(p, 'trap', { by: owner ? owner.name : 'trap' });
        this.world.traps.splice(i, 1);
        break;
      }
    }
  }

  triggerMines() {
    const now = Date.now();
    for (let i = this.world.mines.length - 1; i >= 0; i--) {
      const mine = this.world.mines[i];
      if (mine.expiresAt <= now) { this.world.mines.splice(i, 1); continue; }
      const owner = this.world.players.get(mine.ownerId);
      let detonated = false;
      for (const p of this.world.players.values()) {
        if (p.dead || !p.center || p.id === mine.ownerId || (owner && owner.team !== null && owner.team === p.team)) continue;
        if (dist2(p.center, mine) > mine.r * mine.r) continue;
        for (const cell of p.cells) cell.mass = Math.max(5, cell.mass - mine.damage);
        p.freezeUntil = Math.max(p.freezeUntil, now + 650);
        if (owner) this.recordPvpDamage(owner, p, mine.damage);
        this.queueEvent(p, 'mine-hit', { by: owner ? owner.name : 'mine', damage: mine.damage });
        detonated = true;
        break;
      }
      if (detonated) this.world.mines.splice(i, 1);
    }
  }

  lifesteal(p, targetId = null) {
    if (!this.canUseAbility(p, 2600) || !this.spendMass(p, 15)) return false;
    const target = this.resolveEnemy(p, targetId); if (!target) return false;
    const stolen = Math.min(35, Math.max(8, target.totalMass * 0.04));
    let remain = stolen;
    for (const cell of [...target.cells].sort((a,b)=>b.mass-a.mass)) {
      const take = Math.min(remain, Math.max(0, cell.mass - 5)); cell.mass -= take; remain -= take;
      if (remain <= 0.01) break;
    }
    const gained = stolen - remain;
    const first = p.cells[0]; if (first) first.mass += gained;
    this.recordPvpDamage(p, target, gained);
    this.queueEvent(p, 'ability', { name: 'lifesteal', value: Math.round(gained) });
    return gained > 0;
  }

  executeTarget(p, targetId = null) {
    if (!this.canUseAbility(p, 4000) || !this.spendMass(p, 25)) return false;
    const target = this.resolveEnemy(p, targetId); if (!target || target.totalMass > p.totalMass * 0.22) return false;
    this.eliminatePlayer(target, p, 'execution');
    return true;
  }

  shieldBreak(p, targetId = null) {
    if (!this.canUseAbility(p, 2800) || !this.spendMass(p, 13)) return false;
    const target = this.resolveEnemy(p, targetId); if (!target) return false;
    target.shield = 0; target.respawnShieldUntil = 0;
    this.queueEvent(target, 'status', { name: 'shield-broken', by: p.name });
    return true;
  }

  duelChallenge(p, targetId = null) {
    const target = this.resolveEnemy(p, targetId); if (!target || target.duelId) return false;
    const id = uid();
    const duel = { id, a: p.id, b: target.id, createdAt: Date.now(), accepted: false, resolved: false };
    this.world.duels.set(id, duel); p.duelId = id; target.pendingDuelId = id;
    this.queueEvent(target, 'duel-challenge', { id, from: p.id, fromName: p.name });
    return true;
  }

  duelAccept(p, duelId = null) {
    const id = duelId || p.pendingDuelId; const duel = this.world.duels.get(id);
    if (!duel || duel.b !== p.id || duel.resolved) return false;
    duel.accepted = true; duel.startedAt = Date.now(); p.duelId = id; delete p.pendingDuelId;
    const a = this.world.players.get(duel.a); if (a) a.duelId = id;
    this.queueEvent(p, 'duel-start', { id }); if (a) this.queueEvent(a, 'duel-start', { id });
    return true;
  }

  duelCancel(p, duelId = null) {
    const id = duelId || p.duelId || p.pendingDuelId; const duel = this.world.duels.get(id);
    if (!duel) return false;
    duel.resolved = true; const a = this.world.players.get(duel.a), b = this.world.players.get(duel.b);
    for (const q of [a,b]) if (q && q.duelId === id) q.duelId = null;
    if (b && b.pendingDuelId === id) delete b.pendingDuelId;
    this.world.duels.delete(id); return true;
  }

  resolveDuels() {
    const now = Date.now();
    for (const [id, duel] of this.world.duels) {
      const a = this.world.players.get(duel.a), b = this.world.players.get(duel.b);
      if (!a || !b || a.dead || b.dead || !a.center || !b.center) { this.duelCancel(a || b, id); continue; }
      if (!duel.accepted) { if (now - duel.createdAt > 15000) this.duelCancel(a || b, id); continue; }
      if (dist2(a.center, b.center) > 1600 * 1600) continue;
      if (now - duel.startedAt > 45000) { this.queueEvent(a, 'duel-timeout', {}); this.queueEvent(b, 'duel-timeout', {}); this.duelCancel(a, id); }
    }
  }

  enterArena(p) { if (!p || p.dead) return false; p.arena = true; this.queueEvent(p, 'arena', { enabled: true }); return true; }
  leaveArena(p) { if (!p) return false; p.arena = false; this.queueEvent(p, 'arena', { enabled: false }); return true; }
  spectate(p, targetId) {
    const target = this.getPlayer(targetId); if (!p || !target || target.id === p.id || target.dead) return false;
    p.spectateTargetId = target.id; p.spectating = true; this.queueEvent(p, 'spectate', { targetId: target.id, name: target.name }); return true;
  }
  startPvPEvent(kind = 'bounty') {
    const labels = { bounty: 'CACCIA ALLE TAGLIE', duel: 'DUEL EVENT', massacre: 'MASSACRO' };
    this.pvpEvent = { type: String(kind || 'bounty').slice(0, 20), endsAt: Date.now() + 120000, label: labels[kind] || 'EVENTO PVP' };
    return this.pvpEvent;
  }
  antiCampTick(now) {
    for (const p of this.world.players.values()) {
      if (p.dead || !p.center) continue;
      const nearest = this.nearbyPlayers(p.center.x, p.center.y, 450).filter(o => o.id !== p.id && !o.dead);
      if (nearest.length === 0 && now - p.stats.joinAt > 180000 && p.totalMass > 500) this.queueEvent(p, 'anti-camp', { bonus: true });
    }
  }
  pvpLeaderboard(limit = 10) {
    return [...this.world.players.values()].filter(p => !p.isBot).sort((a,b) => (b.pvpPoints - a.pvpPoints) || (b.elo - a.elo)).slice(0, clamp(Number(limit)||10,1,50)).map(p => ({ id:p.id, name:p.name, points:Math.round(p.pvpPoints), elo:Math.round(p.elo), kills:p.stats.kills, streak:p.bestKillStreak }));
  }

  eliminatePlayer(victim, killer = null, reason = 'pvp') {
    if (!victim || victim.dead) return false;
    const mass = victim.totalMass;
    if (killer) this.handlePvpKill(killer, victim, mass, reason);
    victim.stats.deaths += 1;
    if (!victim.isBot) this.recordDeath(victim.name);
    this.startRespawn(victim);
    return true;
  }

  handlePvpKill(killer, victim, mass, reason = 'pvp') {
    killer.stats.kills += 1;
    killer.combo = (killer.combo || 0) + 1;
    killer.lastKillAt = Date.now();
    this.updateKillStreak(killer);
    killer.bounty = Math.min(5000, killer.bounty + Math.max(10, Math.round(mass * 0.25)));
    this.collectBounty(killer, victim);
    const recent = [...(victim.damageLedger || new Map()).entries()].filter(([aid,at]) => Date.now() - at <= 6000 && this.world.players.has(aid));
    for (const [aid] of recent.slice(0, 3)) { const a = this.world.players.get(aid); if (a && a.id !== killer.id) this.registerAssist(a); }
    this.awardPvpPoints(killer, 10 + Math.min(50, Math.round(mass / 20)));
    if (!killer.isBot) this.recordKill(killer.name, mass);
    this.rewardKillCoins(killer, mass);
    this.rewardStreakCoins(killer);
    this.updateElo(killer, victim, 1);
    this.world.pushKillfeed(killer.name, victim.name, killer.color, victim.color);
    this.queueEvent(killer, 'kill', { victim: victim.name, reason, streak: killer.killStreak });
    return true;
  }

  breakShieldOnHit(attacker, victim) {
    if (!victim || victim.shield <= Date.now()) return false;
    victim.shield = 0;
    this.recordPvpDamage(attacker, victim, 4);
    this.queueEvent(victim, 'status', { name: 'shield-broken', by: attacker ? attacker.name : 'unknown' });
    return true;
  }

  // =========================
  // 30 FUNZIONI SHOP / COINS
  // =========================
  getCatalog() {
    return [
      { id:'skin_default', name:'Skin Default', price:0, type:'skin' },
      { id:'skin_galaxy', name:'Skin Galattica', price:300, type:'skin' },
      { id:'skin_cyber', name:'Skin Cyberpunk', price:500, type:'skin' },
      { id:'boost_speed_60', name:'Boost Velocità 60s', price:220, type:'consumable' },
      { id:'boost_mass_60', name:'Boost Massa 60s', price:260, type:'consumable' },
      { id:'shield_pack', name:'Scudo 15s', price:280, type:'consumable' },
      { id:'coins_500', name:'Pacchetto 500 ZC', price:350, type:'consumable' },
      { id:'bounty_badge', name:'Badge Cacciatore', price:450, type:'skin' },
    ];
  }
  getWallet(p) { return p ? { coins: Math.round(p.coins), multiplier: this.getCoinMultiplier(p), inventory: [...p.inventory], equipped: p.equippedSkin } : null; }
  addCoins(p, amount, reason = 'reward') {
    if (!p) return 0; const base = Math.max(0, Math.round(Number(amount)||0)); const gained = Math.round(base * this.getCoinMultiplier(p));
    p.coins = clamp(p.coins + gained, 0, 100000000); p.shopHistory.push({ type:'earn', amount:gained, reason, at:Date.now() }); if (p.shopHistory.length > 40) p.shopHistory.shift(); this.markSeasonDirty(); return gained;
  }
  spendCoins(p, amount, reason = 'purchase') {
    if (!p) return false; const n = Math.max(0, Math.round(Number(amount)||0)); if (p.coins < n) return false; p.coins -= n; p.shopHistory.push({ type:'spend', amount:n, reason, at:Date.now() }); if (p.shopHistory.length > 40) p.shopHistory.shift(); this.markSeasonDirty(); return true;
  }
  isOwned(p, itemId) { return !!(p && p.inventory.has(String(itemId))); }
  addInventoryItem(p, itemId) { if (!p || !itemId) return false; p.inventory.add(String(itemId).slice(0,60)); this.markSeasonDirty(); return true; }
  removeInventoryItem(p, itemId) { if (!p || itemId === 'skin_default') return false; return p.inventory.delete(String(itemId)); }
  equipItem(p, itemId) { if (!p || !this.isOwned(p,itemId)) return false; p.equippedSkin = String(itemId).replace(/^skin_/,'').slice(0,40); this.queueEvent(p,'shop',{action:'equip',itemId}); this.markSeasonDirty(); return true; }
  unequipItem(p) { if (!p) return false; p.equippedSkin='default'; this.markSeasonDirty(); return true; }
  buyItem(p, itemId) { const item = this.getCatalog().find(x=>x.id===itemId); if (!p || !item || this.isOwned(p,item.id)) return false; const price=this.applySalePrice(item.price); if (!this.spendCoins(p,price,'buy:'+item.id)) return false; this.addInventoryItem(p,item.id); p.shopHistory.push({type:'buy',item:item.id,price,at:Date.now()}); if (item.type==='skin') this.equipItem(p,item.id); return true; }
  useItem(p, itemId) {
    if (!p || !this.isOwned(p,itemId)) return false;
    const now=Date.now();
    if (itemId==='boost_speed_60') p.speedBoost=Math.max(p.speedBoost, now+60000);
    else if (itemId==='boost_mass_60') { for(const c of p.cells) c.mass += 12; }
    else if (itemId==='shield_pack') p.shield=Math.max(p.shield, now+15000);
    else if (itemId==='coins_500') this.addCoins(p,500,'item');
    else return false;
    if (!itemId.startsWith('skin_') && itemId!=='bounty_badge') this.removeInventoryItem(p,itemId);
    this.queueEvent(p,'shop',{action:'use',itemId}); this.markSeasonDirty(); return true;
  }
  getInventory(p) { return p ? [...p.inventory].sort() : []; }
  getPurchaseHistory(p) { return p ? p.shopHistory.slice(-20).reverse() : []; }
  currentSale() { const now=Date.now(); if(this.shopSale && this.shopSale.endsAt>now) return {discount:this.shopSale.percent,endsAt:this.shopSale.endsAt}; const hour=Math.floor(now/3600000); return { discount:(hour%6===0)?25:0, endsAt:0 }; }
  applySalePrice(price) { const n=Math.max(0,Math.round(Number(price)||0)); const sale=this.currentSale(); return Math.max(0,Math.round(n*(1-(Number(sale.discount)||0)/100))); }
  createSale(percent=15,durationMs=3600000) { this.shopSale={percent:clamp(Number(percent)||0,0,70),endsAt:Date.now()+clamp(Number(durationMs)||3600000,60000,86400000)}; return this.shopSale; }
  refreshQuests(p) { if(!p) return []; const d=new Date().toISOString().slice(0,10); if(p.questState.date!==d){ p.questState={date:d,kills:0,coins:0,plays:0,claimed:[]}; } return p.questState; }
  getQuests(p) { this.refreshQuests(p); return [{id:'kills3',label:'3 uccisioni',goal:3,progress:p.questState.kills||0,reward:150},{id:'kills10',label:'10 uccisioni',goal:10,progress:p.questState.kills||0,reward:450},{id:'coins1000',label:'Guadagna 1000 ZC',goal:1000,progress:p.questState.coins||0,reward:180},{id:'play5',label:'5 minuti online',goal:5,progress:p.questState.plays||0,reward:120}].map(q=>({...q,complete:q.progress>=q.goal,claimed:(p.questState.claimed||[]).includes(q.id)})); }
  addQuestProgress(p,type,amount=1) { if(!p) return; this.refreshQuests(p); if(type==='kill') p.questState.kills+=amount; if(type==='coins') p.questState.coins+=amount; if(type==='play') p.questState.plays+=amount; this.markSeasonDirty(); }
  claimQuest(p,questId) { const q=this.getQuests(p).find(x=>x.id===questId); if(!q || !q.complete || q.claimed) return false; p.questState.claimed.push(q.id); this.addCoins(p,q.reward,'quest:'+q.id); return true; }
  claimDailyReward(p) { if(!p) return false; const now=Date.now(); if(now-p.dailyClaimAt<86400000) return false; p.dailyClaimAt=now; this.addCoins(p,250,'daily'); this.queueEvent(p,'daily',{reward:250}); return true; }
  rewardMatchCoins(p, base=30) { return this.addCoins(p,base,'match'); }
  rewardKillCoins(p, mass=0) { const n=35+Math.min(300,Math.round(Number(mass)/2)); this.addQuestProgress(p,'kill',1); const g=this.addCoins(p,n,'kill'); this.addQuestProgress(p,'coins',g); return g; }
  rewardStreakCoins(p) { const n=Math.min(400,Math.max(0,(p.killStreak||0)*30)); return n?this.addCoins(p,n,'streak'):0; }
  rewardTeamWin(p,rank=1) { if(!p) return 0; return this.addCoins(p,Math.max(50,300-(rank-1)*50),'team-win'); }
  getCoinMultiplier(p) { return p && p.coinMultiplierUntil>Date.now()?Math.max(1,Number(p.coinMultiplierValue)||1):1; }
  activateCoinBoost(p,multiplier=2,durationMs=60000) { if(!p || !this.spendCoins(p,200,'coin-boost')) return false; p.coinMultiplierValue=clamp(Number(multiplier)||2,1,5); p.coinMultiplierUntil=Date.now()+clamp(Number(durationMs)||60000,10000,3600000); return true; }
  starterGift(p) { if(!p || p.starterGiftClaimed) return false; p.starterGiftClaimed=true; this.addCoins(p,500,'starter'); this.addInventoryItem(p,'shield_pack'); return true; }
  refundLastPurchase(p) { if(!p) return false; const idx=[...p.shopHistory].map((e,i)=>[e,i]).reverse().find(([e])=>e.type==='buy' && !e.refunded); if(!idx) return false; const [e,i]=idx; e.refunded=true; this.addCoins(p,e.price,'refund'); this.removeInventoryItem(p,e.item); if(String(e.item).startsWith('skin_') && p.equippedSkin===String(e.item).replace(/^skin_/,'').slice(0,40)) p.equippedSkin='default'; this.markSeasonDirty(); return true; }
  shopStats(p) { return p?{coins:Math.round(p.coins),inventory:this.getInventory(p).length,earned:p.shopHistory.filter(x=>x.type==='earn').reduce((a,x)=>a+x.amount,0),spent:p.shopHistory.filter(x=>x.type==='spend').reduce((a,x)=>a+x.amount,0),multiplier:this.getCoinMultiplier(p)}:null; }

  // =========================
  // 30 FUNZIONI ADMIN / BOT
  // =========================
  adminAuthenticate(token) { const expected=String(process.env.ADMIN_TOKEN||''); return !!expected && String(token||'')===expected; }
  adminListPlayers() { return [...this.world.players.values()].map(p=>this.playerSummary(p)); }
  adminGetPlayer(idOrName) { const p=this.getPlayer(idOrName); return p?this.playerSnapshot(p):null; }
  adminKick(idOrName) { const p=this.getPlayer(idOrName); if(!p) return false; p.adminKicked=true; return p; }
  adminBan(idOrName) { const p=this.getPlayer(idOrName); if(!p) return false; this.bannedNames.add(p.name.toLowerCase()); return this.adminKick(p.id); }
  adminUnban(name) { return this.bannedNames.delete(String(name||'').trim().toLowerCase()); }
  adminMute(idOrName,durationMs=600000) { const p=this.getPlayer(idOrName); if(!p) return false; p.mutedUntil=Date.now()+clamp(Number(durationMs)||600000,1000,86400000); this.mutedNames.add(p.name.toLowerCase()); return true; }
  adminUnmute(idOrName) { const p=this.getPlayer(idOrName); const name=p?p.name:String(idOrName||''); this.mutedNames.delete(name.toLowerCase()); if(p) p.mutedUntil=0; return true; }
  adminFreeze(idOrName) { const p=this.getPlayer(idOrName); if(!p) return false; p.adminFrozen=true; p.freezeUntil=Date.now()+86400000; return true; }
  adminUnfreeze(idOrName) { const p=this.getPlayer(idOrName); if(!p) return false; p.adminFrozen=false; p.freezeUntil=0; return true; }
  adminSetMass(idOrName,mass) { const p=this.getPlayer(idOrName); if(!p) return false; const m=clamp(Number(mass)||20,5,1000000); if(!p.cells.length)p.spawnCell(); p.cells[0].mass=m; return true; }
  adminSetCoins(idOrName,coins) { const p=this.getPlayer(idOrName); if(!p) return false; p.coins=clamp(Number(coins)||0,0,100000000); this.markSeasonDirty(); return true; }
  adminTeleport(idOrName,x,y) { const p=this.getPlayer(idOrName); if(!p) return false; for(const c of p.cells){c.x=clamp(Number(x)||c.x,c.radius,CONFIG.WORLD.WIDTH-c.radius);c.y=clamp(Number(y)||c.y,c.radius,CONFIG.WORLD.HEIGHT-c.radius);} return true; }
  adminHeal(idOrName) { const p=this.getPlayer(idOrName); if(!p) return false; if(!p.cells.length)p.spawnCell(); for(const c of p.cells)c.mass+=25; this.queueEvent(p,'admin',{action:'heal'}); return true; }
  adminKill(idOrName,killerId=null) { const p=this.getPlayer(idOrName); const k=killerId?this.getPlayer(killerId):null; return p?this.eliminatePlayer(p,k,'admin'):false; }
  adminRespawn(idOrName) { const p=this.getPlayer(idOrName); if(!p) return false; p.dead=true; p.respawnAt=Date.now(); return true; }
  adminSetTeam(idOrName,team) { const p=this.getPlayer(idOrName); if(!p) return false; p.team=Number.isInteger(Number(team))&&Number(team)>=0&&Number(team)<CONFIG.TEAMS.COLORS.length?Number(team):null; if(p.team!==null)p.color=CONFIG.TEAMS.COLORS[p.team]; return true; }
  adminSetColor(idOrName,color) { const p=this.getPlayer(idOrName); if(!p || !/^#[0-9a-fA-F]{6}$/.test(String(color||''))) return false; p.color=String(color); return true; }
  adminBroadcast(text) { const msg=String(text||'').replace(/[<>]/g,'').slice(0,160); this.world.announcements.unshift({id:uid(),text:msg,at:Date.now()}); this.world.announcements.length=Math.min(this.world.announcements.length,10); for(const p of this.world.players.values()) this.queueEvent(p,'announcement',{text:msg}); return {ok:true,text:msg}; }
  adminClearEvents() { for(const p of this.world.players.values()) p.events=[]; this.world.announcements=[]; return true; }
  adminSpawnBots(count=1,mass=30,mode='balanced') { if(!this.botAutomationEnabled) return 0; const current=[...this.world.players.values()].filter(p=>p.isBot).length; const n=Math.min(clamp(Number(count)||1,1,100),Math.max(0,CONFIG.BOTS.MAX_COUNT-current)); for(let i=0;i<n;i++){const p=this.addPlayer(`AdminBot${Date.now().toString().slice(-4)}_${i+1}`,true);p.cells[0].mass=clamp(Number(mass)||30,5,10000);p.botMode=String(mode||'balanced').slice(0,20);} return n; }
  adminRemoveBots(count=999) { let left=clamp(Number(count)||999,1,CONFIG.BOTS.MAX_COUNT); let removed=0; for(const p of [...this.world.players.values()]){ if(left<=0)break; if(p.isBot){this.removePlayer(p.id);left--;removed++;} } return removed; }
  adminSetBotMode(mode) { const m=['balanced','aggressive','farmer','defender','hunter','passive'].includes(mode)?mode:'balanced'; for(const p of this.world.players.values()) if(p.isBot)p.botMode=m; return m; }
  adminSetBotTarget(botId,targetId) { const b=this.getPlayer(botId),t=this.getPlayer(targetId); if(!b||!b.isBot||!t||t.dead) return false; b.botTargetId=t.id; return true; }
  adminSetBotDifficulty(level) { const v=clamp(Number(level)||1,1,5); for(const p of this.world.players.values()) if(p.isBot)p.botDifficulty=v; CONFIG.BOTS.AGGRESSION=0.55+v*0.09; return v; }
  adminSetBotTeam(team) { const t=Number.isInteger(Number(team))&&Number(team)>=0&&Number(team)<CONFIG.TEAMS.COLORS.length?Number(team):null; for(const p of this.world.players.values()) if(p.isBot){p.team=t;if(t!==null)p.color=CONFIG.TEAMS.COLORS[t];} return t; }
  adminSetBotName(botId,name) { const b=this.getPlayer(botId); if(!b||!b.isBot)return false; b.name=String(name||'Bot').replace(/[<>]/g,'').slice(0,16)||'Bot'; return true; }
  adminToggleBots(enabled) { this.botAutomationEnabled=Boolean(enabled); return this.botAutomationEnabled; }
  adminPause() { this.paused=true; return true; }
  adminResume() { this.paused=false; return true; }
  adminResetMatch() { for(const p of this.world.players.values()){ if(!p.isBot){p.coins=Math.max(p.coins,1000);} p.cells=[]; p.dead=false; p.spawnCell(); p.resetForMatch = true; } this.matchStartedAt=Date.now(); this.world.killfeed=[]; this.world.traps=[]; this.world.mines=[]; this.world.duels.clear(); return true; }

  consumeEvents(p) {
    if (!p || !p.events || !p.events.length) return [];
    const out = p.events.slice(); p.events.length = 0; return out;
  }

  movePlayer(p, dt) {
    if (!p.cells.length) return;
    const center = p.center;
    if (!center) return;
    const t = p.target || center;
    const now = Date.now();

    if (p.freezeUntil > now || p.adminFrozen) return;

    if (p.sprinting && !p.isBot) {
      for (const cell of p.cells) {
        cell.mass = Math.max(10, cell.mass - CONFIG.PHYSICS.SPRINT_COST * dt);
      }
    }

    for (const cell of p.cells) {
      const dx = t.x - cell.x;
      const dy = t.y - cell.y;
      const d2v = dx * dx + dy * dy;
      if (d2v <= 1) continue;
      const d = Math.sqrt(d2v);
      let speed = this.speedAt(cell);
      if (p.speedBoost > now) speed *= 1.7;
      if (p.rageUntil > now) speed *= 1.55;
      if (p.slowUntil > now) speed *= 0.48;
      if (p.hunterUntil > now) speed *= 1.12;
      if (p.sprinting && !p.isBot) speed *= CONFIG.PHYSICS.SPRINT_SPEED;
      if (p.dashUntil > now) {
        cell.x += p.dashVx * dt;
        cell.y += p.dashVy * dt;
      } else {
        const step = Math.min(speed * dt, d);
        cell.x += (dx / d) * step;
        cell.y += (dy / d) * step;
      }
      const r = cell.radius;
      cell.x = clamp(cell.x, r, CONFIG.WORLD.WIDTH - r);
      cell.y = clamp(cell.y, r, CONFIG.WORLD.HEIGHT - r);
    }

    // Cheap local separation only between the player's own cells.
    if (p.cells.length > 1) {
      for (let i = 0; i < p.cells.length; i++) {
        const a = p.cells[i];
        for (let j = i + 1; j < p.cells.length; j++) {
          const b = p.cells[j];
          const dx = a.x - b.x;
          const dy = a.y - b.y;
          const d2v = dx * dx + dy * dy;
          const minD = a.radius + b.radius;
          if (d2v <= 0 || d2v >= minD * minD) continue;
          const d = Math.sqrt(d2v);
          const push = (minD - d) * 0.5;
          const nx = dx / d;
          const ny = dy / d;
          a.x = clamp(a.x + nx * push, a.radius, CONFIG.WORLD.WIDTH - a.radius);
          a.y = clamp(a.y + ny * push, a.radius, CONFIG.WORLD.HEIGHT - a.radius);
          b.x = clamp(b.x - nx * push, b.radius, CONFIG.WORLD.WIDTH - b.radius);
          b.y = clamp(b.y - ny * push, b.radius, CONFIG.WORLD.HEIGHT - b.radius);
        }
      }
    }
  }

  speedAt(cell) {
    return CONFIG.PHYSICS.BASE_SPEED * 100 * Math.pow(Math.max(1, cell.mass), -CONFIG.PHYSICS.SPEED_MASS_DECAY);
  }

  setTarget(p, x, y) {
    if (!finite(x) || !finite(y)) return;
    p.target = {
      x: clamp(x, 0, CONFIG.WORLD.WIDTH),
      y: clamp(y, 0, CONFIG.WORLD.HEIGHT),
    };
  }

  split(p) {
    if (p.dead || !p.cells.length || p.cells.length >= CONFIG.PHYSICS.MAX_CELLS_PER_PLAYER) return false;
    const now = Date.now();
    if (now - p.lastSplit < CONFIG.PHYSICS.SPLIT_COOLDOWN) return false;
    let cell = null;
    for (const c of p.cells) if (!cell || c.mass > cell.mass) cell = c;
    if (!cell || cell.mass < CONFIG.PHYSICS.SPLIT_MASS_THRESHOLD) return false;

    p.lastSplit = now;
    const half = cell.mass / 2;
    cell.mass = half;
    const dir = p.target ? Math.atan2(p.target.y - cell.y, p.target.x - cell.x) : 0;
    const newR = cellRadius(half);
    const offset = cell.radius + newR + 8;
    const nc = new Cell(
      clamp(cell.x + Math.cos(dir) * offset, newR, CONFIG.WORLD.WIDTH - newR),
      clamp(cell.y + Math.sin(dir) * offset, newR, CONFIG.WORLD.HEIGHT - newR),
      half,
      p.id,
    );
    nc.bornAt = now;
    p.cells.push(nc);
    return true;
  }

  eject(p) {
    if (p.dead || !p.cells.length || p.totalMass < CONFIG.PHYSICS.EJECT_MASS + 5) return false;
    let cell = p.cells[0];
    for (const c of p.cells) if (c.mass > cell.mass) cell = c;
    if (cell.mass <= CONFIG.PHYSICS.EJECT_MASS + 1) return false;
    cell.mass -= CONFIG.PHYSICS.EJECT_MASS;
    const dir = p.target ? Math.atan2(p.target.y - cell.y, p.target.x - cell.x) : 0;
    return this.world.addPellet(
      cell.x + Math.cos(dir) * cell.radius,
      cell.y + Math.sin(dir) * cell.radius,
      CONFIG.PHYSICS.EJECT_MASS,
    );
  }

  shootVirus(p) {
    if (p.dead || !p.cells.length || p.totalMass < CONFIG.PHYSICS.VIRUS_SHOOT_COST + 20) return false;
    let cell = p.cells[0];
    for (const c of p.cells) if (c.mass > cell.mass) cell = c;
    if (cell.mass <= CONFIG.PHYSICS.VIRUS_SHOOT_COST + 5) return false;
    cell.mass -= CONFIG.PHYSICS.VIRUS_SHOOT_COST;
    const dir = p.target ? Math.atan2(p.target.y - cell.y, p.target.x - cell.x) : 0;
    this.world.virusProjectiles.push({
      id: uid(),
      x: cell.x + Math.cos(dir) * (cell.radius + 6),
      y: cell.y + Math.sin(dir) * (cell.radius + 6),
      vx: Math.cos(dir) * 600,
      vy: Math.sin(dir) * 600,
      mass: CONFIG.PHYSICS.VIRUS_PROJECTILE_MASS,
      ownerId: p.id,
      createdAt: Date.now(),
    });
    return true;
  }

  resolvePellets() {
    const now = Date.now();
    for (const player of this.world.players.values()) {
      if (player.dead) continue;
      const magnet = player.magnet > now;
      for (const cell of player.cells) {
        const pickupRadius = magnet ? cell.radius * 3 : cell.radius;
        const rr = pickupRadius + 8;
        for (const pellet of this.world.nearbyPellets(cell.x, cell.y, rr)) {
          if (pellet.consumed) continue;
          if (dist2(cell, pellet) <= pickupRadius * pickupRadius) {
            pellet.consumed = true;
            cell.mass += pellet.mass;
          }
        }
      }
    }
  }

  resolvePlayerCollisions() {
    const cells = [];
    const grid = new Map();
    const key = (gx, gy) => `${gx}:${gy}`;

    for (const p of this.world.players.values()) {
      if (p.dead) continue;
      for (const c of p.cells) {
        const idx = cells.length;
        cells.push({ p, c });
        const minGX = Math.floor((c.x - c.radius) / PLAYER_GRID_SIZE);
        const maxGX = Math.floor((c.x + c.radius) / PLAYER_GRID_SIZE);
        const minGY = Math.floor((c.y - c.radius) / PLAYER_GRID_SIZE);
        const maxGY = Math.floor((c.y + c.radius) / PLAYER_GRID_SIZE);
        for (let gx = minGX; gx <= maxGX; gx++) {
          for (let gy = minGY; gy <= maxGY; gy++) {
            const k = key(gx, gy);
            let bucket = grid.get(k);
            if (!bucket) {
              bucket = [];
              grid.set(k, bucket);
            }
            bucket.push(idx);
          }
        }
      }
    }

    const eatenCells = new Set();
    const killedBy = new Map();
    const now = Date.now();

    for (let i = 0; i < cells.length; i++) {
      const a = cells[i];
      if (eatenCells.has(a.c.id)) continue;
      const minGX = Math.floor((a.c.x - a.c.radius) / PLAYER_GRID_SIZE);
      const maxGX = Math.floor((a.c.x + a.c.radius) / PLAYER_GRID_SIZE);
      const minGY = Math.floor((a.c.y - a.c.radius) / PLAYER_GRID_SIZE);
      const maxGY = Math.floor((a.c.y + a.c.radius) / PLAYER_GRID_SIZE);
      const candidates = new Set();

      for (let gx = minGX; gx <= maxGX; gx++) {
        for (let gy = minGY; gy <= maxGY; gy++) {
          const bucket = grid.get(key(gx, gy));
          if (!bucket) continue;
          for (const j of bucket) {
            if (j > i) candidates.add(j);
          }
        }
      }

      for (const j of candidates) {
        const b = cells[j];
        if (eatenCells.has(b.c.id) || a.p.id === b.p.id) continue;
        if (a.p.team !== null && a.p.team === b.p.team) continue;
        if (a.p.shield > now || b.p.shield > now) continue;

        const d2v = dist2(a.c, b.c);
        const eatA = a.c.mass > b.c.mass * CONFIG.PHYSICS.EAT_FACTOR && d2v < Math.pow(Math.max(0, a.c.radius - b.c.radius * 0.4), 2);
        const eatB = b.c.mass > a.c.mass * CONFIG.PHYSICS.EAT_FACTOR && d2v < Math.pow(Math.max(0, b.c.radius - a.c.radius * 0.4), 2);
        if (!eatA && !eatB) continue;
        if (eatA && b.p.parryUntil > now) {
          b.p.parryUntil = 0;
          for (const cell of a.p.cells) { cell.x = clamp(cell.x - (b.c.x - a.c.x) * 0.15, cell.radius, CONFIG.WORLD.WIDTH-cell.radius); cell.y = clamp(cell.y - (b.c.y - a.c.y) * 0.15, cell.radius, CONFIG.WORLD.HEIGHT-cell.radius); }
          this.queueEvent(b.p, 'parry-success', { attacker: a.p.name });
          continue;
        }
        if (eatB && a.p.parryUntil > now) {
          a.p.parryUntil = 0;
          for (const cell of b.p.cells) { cell.x = clamp(cell.x - (a.c.x - b.c.x) * 0.15, cell.radius, CONFIG.WORLD.WIDTH-cell.radius); cell.y = clamp(cell.y - (a.c.y - b.c.y) * 0.15, cell.radius, CONFIG.WORLD.HEIGHT-cell.radius); }
          this.queueEvent(a.p, 'parry-success', { attacker: b.p.name });
          continue;
        }

        if (eatA && (!eatB || a.c.mass >= b.c.mass)) {
          const victimMass = Math.max(0, b.c.mass);
          a.c.mass += victimMass;
          eatenCells.add(b.c.id);
          killedBy.set(b.c.id, { killer: a.p, mass: victimMass });
          this.recordPvpDamage(a.p, b.p, Math.min(victimMass, a.c.mass * 0.25));
        } else {
          const victimMass = Math.max(0, a.c.mass);
          b.c.mass += victimMass;
          eatenCells.add(a.c.id);
          killedBy.set(a.c.id, { killer: b.p, mass: victimMass });
          this.recordPvpDamage(b.p, a.p, Math.min(victimMass, b.c.mass * 0.25));
          break;
        }
      }
    }

    if (!eatenCells.size) return;

    for (const p of this.world.players.values()) {
      const before = p.cells.length;
      p.cells = p.cells.filter((c) => !eatenCells.has(c.id));
      if (before > 0 && p.cells.length === 0 && !p.dead) {
        let killer = null;
        let mass = 0;
        for (const { c } of cells) {
          if (c.ownerId !== p.id) continue;
          const hit = killedBy.get(c.id);
          if (hit) {
            killer = hit.killer;
            mass += hit.mass;
          }
        }
        if (killer) {
          this.handlePvpKill(killer, p, mass, 'eat');
          p.stats.deaths += 1;
          if (!p.isBot) this.recordDeath(p.name);
        }
        this.startRespawn(p);
      }
    }
  }

  resolvePowerups() {
    const now = Date.now();
    for (const player of this.world.players.values()) {
      if (player.dead) continue;
      for (const cell of player.cells) {
        for (let i = this.world.powerups.length - 1; i >= 0; i--) {
          const pu = this.world.powerups[i];
          if (dist2(cell, pu) < cell.radius * cell.radius) {
            this.applyPowerup(player, cell, pu, now);
            this.world.powerups.splice(i, 1);
          }
        }
      }
    }
    while (this.world.powerups.length < 20) this.world.spawnPowerup();
  }

  applyPowerup(player, cell, pu, now = Date.now()) {
    switch (pu.type) {
      case 'mass': cell.mass += pu.mass; break;
      case 'virus': this.explodeFromVirus(player, cell); break;
      case 'speed': player.speedBoost = now + 8000; break;
      case 'invisible': player.invisible = now + 5000; break;
      case 'magnet': player.magnet = now + 6000; break;
      case 'shield': player.shield = now + CONFIG.PHYSICS.SHIELD_TIME; break;
    }
  }

  explodeFromVirus(player, cell) {
    if (!cell || cell.mass < 50 || player.cells.length >= CONFIG.PHYSICS.MAX_CELLS_PER_PLAYER) return false;
    const maxPieces = CONFIG.PHYSICS.MAX_CELLS_PER_PLAYER - player.cells.length + 1;
    const pieces = Math.min(16, Math.floor(cell.mass / 10), Math.max(1, maxPieces));
    if (pieces < 2) return false;
    const perPiece = cell.mass / pieces;
    player.cells = player.cells.filter((c) => c !== cell);
    for (let i = 0; i < pieces; i++) {
      const ang = rand(0, Math.PI * 2);
      const m = new Cell(
        clamp(cell.x + Math.cos(ang) * (cell.radius + 20), 10, CONFIG.WORLD.WIDTH - 10),
        clamp(cell.y + Math.sin(ang) * (cell.radius + 20), 10, CONFIG.WORLD.HEIGHT - 10),
        perPiece,
        player.id,
      );
      player.cells.push(m);
    }
    return true;
  }

  updateVirusProjectiles(dt) {
    if (!this.world.virusProjectiles.length) return;
    const cells = [];
    for (const p of this.world.players.values()) {
      if (p.dead) continue;
      for (const c of p.cells) cells.push({ p, c });
    }

    for (let i = this.world.virusProjectiles.length - 1; i >= 0; i--) {
      const v = this.world.virusProjectiles[i];
      v.x += v.vx * dt;
      v.y += v.vy * dt;
      if (v.x < -100 || v.x > CONFIG.WORLD.WIDTH + 100 || v.y < -100 || v.y > CONFIG.WORLD.HEIGHT + 100 || Date.now() - v.createdAt > 6000) {
        this.world.virusProjectiles.splice(i, 1);
        continue;
      }
      const owner = this.world.players.get(v.ownerId);
      let hit = false;
      for (const { p, c } of cells) {
        if (p.dead || p.id === v.ownerId) continue;
        if (owner && owner.team !== null && owner.team === p.team) continue;
        if (dist2(v, c) < Math.pow(c.radius + 10, 2)) {
          this.explodeFromVirus(p, c);
          hit = true;
          break;
        }
      }
      if (hit) this.world.virusProjectiles.splice(i, 1);
    }
  }

  resolveZones(dt) {
    for (const player of this.world.players.values()) {
      if (player.dead) continue;
      const center = player.center;
      if (!center) continue;
      for (const z of this.world.zones) {
        if (z.kind !== 'hazard' || dist2(center, z) >= z.r * z.r) continue;
        for (const cell of player.cells) {
          cell.mass = Math.max(3, cell.mass - CONFIG.ZONES.HAZARD_DPS * dt);
        }
        break;
      }
    }
  }

  zoneTick(now) {
    if (now - this.lastZoneTick < CONFIG.ZONES.BONUS_INTERVAL) return;
    this.lastZoneTick = now;
    if (this.world.pellets.length >= CONFIG.WORLD.MAX_PELLETS - 20) return;
    let added = 0;
    for (const z of this.world.zones) {
      if (z.kind !== 'bonus' || added >= CONFIG.ZONES.MAX_BONUS_PER_TICK) continue;
      const angle = rand(0, Math.PI * 2);
      const radius = Math.sqrt(Math.random()) * z.r;
      if (this.world.addPellet(z.x + Math.cos(angle) * radius, z.y + Math.sin(angle) * radius, CONFIG.WORLD.PELLET_MASS * CONFIG.ZONES.BONUS_PELLET_MULT)) added++;
    }
  }

  mergeCells() {
    const now = Date.now();
    for (const p of this.world.players.values()) {
      if (p.dead || p.cells.length < 2) continue;
      let merged = true;
      while (merged && p.cells.length > 1) {
        merged = false;
        for (let i = 0; i < p.cells.length && !merged; i++) {
          for (let j = i + 1; j < p.cells.length; j++) {
            const a = p.cells[i], b = p.cells[j];
            if (now - a.bornAt <= CONFIG.PHYSICS.MERGE_TIMEOUT || now - b.bornAt <= CONFIG.PHYSICS.MERGE_TIMEOUT) continue;
            if (dist2(a, b) < Math.pow(a.radius + b.radius, 2)) {
              const total = a.mass + b.mass;
              a.x = (a.x * a.mass + b.x * b.mass) / total;
              a.y = (a.y * a.mass + b.y * b.mass) / total;
              a.mass = total;
              p.cells.splice(j, 1);
              merged = true;
              break;
            }
          }
        }
      }
    }
  }

  rebuildPlayerGrid() {
    this.playerGrid.clear();
    for (const p of this.world.players.values()) {
      if (p.dead) continue;
      const c = p.center;
      if (!c) continue;
      const gx = Math.floor(c.x / PLAYER_GRID_SIZE);
      const gy = Math.floor(c.y / PLAYER_GRID_SIZE);
      const key = `${gx}:${gy}`;
      let bucket = this.playerGrid.get(key);
      if (!bucket) {
        bucket = [];
        this.playerGrid.set(key, bucket);
      }
      bucket.push(p);
    }
  }

  nearbyPlayers(x, y, radius) {
    const minGX = Math.floor((x - radius) / PLAYER_GRID_SIZE);
    const maxGX = Math.floor((x + radius) / PLAYER_GRID_SIZE);
    const minGY = Math.floor((y - radius) / PLAYER_GRID_SIZE);
    const maxGY = Math.floor((y + radius) / PLAYER_GRID_SIZE);
    const out = [];
    for (let gx = minGX; gx <= maxGX; gx++) {
      for (let gy = minGY; gy <= maxGY; gy++) {
        const bucket = this.playerGrid.get(`${gx}:${gy}`);
        if (bucket) out.push(...bucket);
      }
    }
    return out;
  }

  chooseBotTarget(p, now) {
    if (!p.botState || !p.cells.length || now < p.botState.nextDecisionAt) return;
    p.botState.nextDecisionAt = now + CONFIG.BOTS.DECISION_INTERVAL;
    const c = p.center;
    if (!c) return;

    let nearestHuman = null, nearestHumanD2 = Infinity;
    let prey = null, preyD2 = Infinity;
    let threat = null, threatD2 = Infinity;
    const pm = p.totalMass;

    for (const other of this.nearbyPlayers(c.x, c.y, CONFIG.BOTS.VIEW_RADIUS)) {
      if (other.id === p.id || other.dead) continue;
      const o = other.center;
      if (!o) continue;
      const d2v = dist2(c, o);
      if (d2v > CONFIG.BOTS.VIEW_RADIUS * CONFIG.BOTS.VIEW_RADIUS) continue;
      if (!other.isBot && d2v < nearestHumanD2) { nearestHumanD2 = d2v; nearestHuman = o; }
      if (o.mass * CONFIG.PHYSICS.EAT_FACTOR < pm && d2v < preyD2) { preyD2 = d2v; prey = o; }
      if (pm * CONFIG.PHYSICS.EAT_FACTOR < o.mass && d2v < threatD2) { threatD2 = d2v; threat = o; }
    }

    let tx = c.x, ty = c.y;
    const forced = p.botTargetId ? this.getPlayer(p.botTargetId) : null;
    if (forced && !forced.dead) { tx = forced.center.x; ty = forced.center.y; }
    if (!forced && (p.botMode === 'hunter' || p.botMode === 'aggressive') && nearestHuman && nearestHumanD2 < CONFIG.BOTS.CHASE_RANGE * CONFIG.BOTS.CHASE_RANGE && Math.random() < CONFIG.BOTS.AGGRESSION) {
      tx = nearestHuman.x;
      ty = nearestHuman.y;
    } else if (threat) {
      const ang = Math.atan2(c.y - threat.y, c.x - threat.x);
      tx = c.x + Math.cos(ang) * 500;
      ty = c.y + Math.sin(ang) * 500;
    } else if (prey && Math.random() < CONFIG.BOTS.AGGRESSION) {
      tx = prey.x;
      ty = prey.y;
    } else {
      const pellets = this.world.nearbyPellets(c.x, c.y, 450);
      let best = null, bestD2 = Infinity;
      for (const pellet of pellets) {
        if (pellet.consumed) continue;
        const d2v = dist2(c, pellet);
        if (d2v < bestD2) { bestD2 = d2v; best = pellet; }
      }
      if (best) {
        tx = best.x;
        ty = best.y;
      } else {
        if (now >= p.botState.nextWanderAt) {
          p.botState.wanderTheta = rand(0, Math.PI * 2);
          p.botState.nextWanderAt = now + rand(500, 2500);
        }
        tx = c.x + Math.cos(p.botState.wanderTheta) * 300;
        ty = c.y + Math.sin(p.botState.wanderTheta) * 300;
      }
    }

    p.botState.targetX = tx;
    p.botState.targetY = ty;
    this.setTarget(p, tx, ty);
    if (prey && preyD2 < 200 * 200 && pm > CONFIG.PHYSICS.SPLIT_MASS_THRESHOLD * 3 && Math.random() < 0.05) this.split(p);
  }

  updateBot(p, dt, now) {
    if (p.dead) {
      this.respawnIfReady(p);
      return;
    }
    if (!p.cells.length) {
      p.spawnCell();
      return;
    }
    this.chooseBotTarget(p, now);
    if (p.botState) this.setTarget(p, p.botState.targetX, p.botState.targetY);
    this.movePlayer(p, dt);
  }

  startRespawn(p) {
    p.combo = 0;
    p.killStreak = 0;
    p.cells = [];
    p.dead = true;
    p.respawnAt = Date.now() + (p.isBot ? CONFIG.PHYSICS.BOT_RESPAWN_TIME : CONFIG.PHYSICS.RESPAWN_TIME);
    p.speedBoost = 0;
    p.invisible = 0;
    p.magnet = 0;
    p.shield = 0;
    p.sprinting = false;
  }

  respawnIfReady(p) {
    if (p.dead && Date.now() >= p.respawnAt) {
      const spot = this.findSafeSpawn(p);
      p.spawnCellAt(spot.x, spot.y);
      this.grantRespawnShield(p);
      this.queueEvent(p, 'status', { name: 'respawn-shield' });
    }
  }

  tick() {
    const tickStarted = Date.now();
    const now = tickStarted;
    if (this.paused) { this.totalTicks += 1; this.lastTickDuration = Date.now() - tickStarted; return; }
    const dt = clamp((now - this.lastTick) / 1000, 0, CONFIG.PHYSICS.MAX_DT);
    this.lastTick = now;

    this.rebuildPlayerGrid();
    for (const p of this.world.players.values()) {
      if (p.isBot && this.botAutomationEnabled && p.adminBotEnabled) this.updateBot(p, dt, now);
      else {
        this.respawnIfReady(p);
        if (!p.dead) {
          if (p.autoPilot && p.botState) this.chooseBotTarget(p, now);
          this.movePlayer(p, dt);
        }
      }
    }

    this.updateTimedEffects(now);
    this.resolvePellets();
    this.resolvePlayerCollisions();
    this.resolvePowerups();
    this.resolveZones(dt);
    this.updateVirusProjectiles(dt);
    this.zoneTick(now);
    this.triggerTraps();
    this.triggerMines();
    this.resolveDuels();
    this.antiCampTick(now);
    this.mergeCells();

    const before = this.world.pellets.length;
    this.world.pellets = this.world.pellets.filter((p) => !p.consumed);
    while (this.world.pellets.length < CONFIG.WORLD.PELLET_COUNT) this.world.spawnPellet();
    if (this.world.pellets.length !== before || this.world.pelletGrid.size === 0) this.world.rebuildPelletGrid();
    else this.world.rebuildPelletGrid();

    const cutoff = now - 6000;
    if (this.world.killfeed.length) this.world.killfeed = this.world.killfeed.filter((k) => k.at > cutoff);
    this.cleanupExpiredEntities(now);
    this.totalTicks += 1;
    this.lastTickDuration = Date.now() - tickStarted;
    this.flushSeason(false);
  }

  playerSnapshot(p, now = Date.now()) {
    return {
      id: p.id,
      name: p.name,
      isBot: p.isBot,
      color: p.color,
      team: p.team,
      mass: Math.round(p.totalMass),
      dead: p.dead,
      respawnAt: p.dead ? p.respawnAt : null,
      invisible: p.invisible > now,
      speedBoost: p.speedBoost > now,
      magnet: p.magnet > now,
      shield: p.shield > now,
      respawnShield: p.respawnShieldUntil > now,
      frozen: p.freezeUntil > now,
      rage: p.rageUntil > now,
      reveal: p.revealUntil > now,
      autoPilot: p.autoPilot,
      combo: p.combo,
      assists: p.assists,
      bounty: Math.round(p.bounty),
      kills: p.stats.kills,
      deaths: p.stats.deaths,
      pvpPoints: Math.round(p.pvpPoints),
      elo: Math.round(p.elo),
      damageDealt: Math.round(p.damageDealt),
      damageTaken: Math.round(p.damageTaken),
      killStreak: p.killStreak,
      hunter: p.hunterUntil > now,
      parry: p.parryUntil > now,
      slow: p.slowUntil > now,
      coins: Math.round(p.coins),
      equippedSkin: p.equippedSkin,
      cells: p.cells.map((c) => ({ x: c.x, y: c.y, mass: Math.max(0, Number(c.mass) || 0), id: c.id })),
    };
  }

  snapshotFor(viewer) {
    const center = viewer && viewer.center;
    const now = Date.now();
    const r2 = CONFIG.NETWORK.VIEW_RADIUS * CONFIG.NETWORK.VIEW_RADIUS;
    const pelletR2 = CONFIG.NETWORK.PELLET_VIEW_RADIUS * CONFIG.NETWORK.PELLET_VIEW_RADIUS;
    const players = [];

    for (const p of this.world.players.values()) {
      if (p.id === viewer.id) {
        players.push(this.playerSnapshot(p, now));
        continue;
      }
      if (p.dead || !center) continue;
      const pc = p.center;
      if (pc && dist2(center, pc) <= r2) {
        const snap = this.playerSnapshot(p, now);
        if (p.invisible > now && viewer.revealUntil <= now) snap.invisible = true;
        else snap.invisible = false;
        players.push(snap);
      }
    }

    const pellets = center
      ? this.world.nearbyPellets(center.x, center.y, CONFIG.NETWORK.PELLET_VIEW_RADIUS)
          .filter((pellet) => !pellet.consumed && dist2(center, pellet) <= pelletR2)
          .map(({ id, x, y, mass }) => ({ id, x, y, mass }))
      : [];

    const powerups = center
      ? this.world.powerups.filter((pu) => dist2(center, pu) <= pelletR2)
      : [];
    const decoys = center
      ? this.world.decoys.filter((d) => dist2(center, d) <= pelletR2)
      : [];
    const traps = center ? this.world.traps.filter((x) => dist2(center, x) <= pelletR2) : [];
    const mines = center ? this.world.mines.filter((x) => dist2(center, x) <= pelletR2) : [];
    const virusProjectiles = center
      ? this.world.virusProjectiles.filter((v) => dist2(center, v) <= pelletR2)
      : [];

    return {
      players,
      pellets,
      powerups,
      virusProjectiles,
      decoys,
      traps,
      mines,
      zones: this.world.zones,
      killfeed: this.world.killfeed,
      teamScores: this.teamScores(),
      matchInfo: this.matchInfo(),
      pvpLeaderboard: this.pvpLeaderboard(10),
      pvpEvent: this.pvpEvent,
      arena: this.arena,
      announcements: this.world.announcements,
      playerSummary: this.playerSummary(viewer),
      wallet: this.getWallet(viewer),
      shopCatalog: this.getCatalog(),
      shopSale: this.currentSale(),
      quests: this.getQuests(viewer),
      shopStats: this.shopStats(viewer),
      nearbyThreats: this.nearbyThreats(viewer),
      events: this.consumeEvents(viewer),
      world: { width: CONFIG.WORLD.WIDTH, height: CONFIG.WORLD.HEIGHT },
    };
  }

  snapshot() {
    return this.snapshotFor({ id: '__all__', center: { x: CONFIG.WORLD.WIDTH / 2, y: CONFIG.WORLD.HEIGHT / 2 } });
  }

  leaderboard() {
    return [...this.world.players.values()]
      .map((p) => ({ id: p.id, name: p.name, mass: Math.round(p.totalMass), isBot: p.isBot }))
      .sort((a, b) => b.mass - a.mass)
      .slice(0, 10);
  }
}

module.exports = { GameServer, CONFIG, cellRadius, rand, clamp, uid };
