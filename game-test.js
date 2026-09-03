'use strict';
const assert = require('node:assert/strict');
const { GameServer, CONFIG } = require('./game');

const game = new GameServer();
for (let i = 0; i < 80; i++) game.addPlayer(`Bot${i + 1}`, true);
const human = game.addPlayer('Human', false);
human.target = { x: 2500, y: 2500 };

for (let i = 0; i < 300; i++) game.tick();

assert.equal(game.world.players.size, 81);
assert.ok(game.world.pellets.length >= CONFIG.WORLD.PELLET_COUNT);
assert.ok(game.world.pellets.length <= CONFIG.WORLD.MAX_PELLETS);
assert.ok(game.world.powerups.length >= 20);
assert.equal(game.world.zones.length, CONFIG.ZONES.COUNT);

human.cells[0].mass = 100;
human.target = { x: human.cells[0].x + 300, y: human.cells[0].y };
assert.equal(game.split(human), true);
assert.equal(human.cells.length, 2);
const beforeMass = human.totalMass;
const ejected = game.eject(human);
assert.equal(ejected, true);
assert.ok(human.totalMass < beforeMass);

const snap = game.snapshotFor(human);
assert.ok(Array.isArray(snap.players));
assert.ok(Array.isArray(snap.pellets));
assert.ok(Array.isArray(snap.powerups));
assert.ok(Array.isArray(snap.zones));
assert.ok(snap.world.width === CONFIG.WORLD.WIDTH);

game.flushSeason(true);
console.log('GAME TEST OK');
console.log(`players=${game.world.players.size} pellets=${game.world.pellets.length} snapshotPlayers=${snap.players.length}`);

// ABILITY SMOKE TEST
const abilityNames = ['dash','blink','shockwave','freezeNearby','createDecoy','massBurst','heal','rage','reveal'];
for (const name of abilityNames) { const ag = new GameServer(); const ap = ag.addPlayer('Ability', false, null); ap.cells[0].mass = 250; if (!ag[name](ap)) throw new Error('Ability failed: ' + name); }
console.log('ABILITY SMOKE TEST OK');
