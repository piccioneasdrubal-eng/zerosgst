/**
 * ZeroLegend — 100 nuove funzionalità v2
 * Modulo ADDITIVO: non modifica fisica, auth o pagamenti esistenti.
 * Aggiunge stato in memoria + un dispatcher unico `handle(action, player, payload, ctx)`
 * richiamato da server.js con `case 'f2': ...`.
 *
 * 20 Gameplay · 20 PvP/Competitivo · 20 Shop/Economia · 20 Social · 20 Admin/Moderazione
 */
'use strict';

function attachFeaturesV2(game, CONFIG) {
  const now = () => Date.now();
  const V = {
    friends: new Map(),
    friendRequests: new Map(),
    blocked: new Map(),
    privateMessages: new Map(),
    clans: new Map(),
    clanInvites: new Map(),
    clanChat: new Map(),
    parties: new Map(),
    playerParty: new Map(),
    profiles: new Map(),
    reports: [],
    warnings: new Map(),
    auditLog: [],
    shadowBanned: new Set(),
    maintenance: { on: false, message: '' },
    featureFlags: new Map(),
    announcements: [],
    appeals: [],
    tournaments: new Map(),
    matchHistory: new Map(),
    seasonLadder: new Map(),
    rankedQueue: new Set(),
    partyQueue: new Set(),
    replayMarkers: new Map(),
    killFeedFilter: new Map(),
    nemesis: new Map(),
    revengeLastKiller: new Map(),
    rematchRequests: new Map(),
    voteKicks: new Map(),
    trades: new Map(),
    marketplace: new Map(),
    wishlists: new Map(),
    coupons: new Map([['ZERO10', { discountPct: 10, uses: 0, maxUses: 0 }]]),
    battlePass: new Map(),
    referralCodes: new Map(),
    referredBy: new Map(),
    savings: new Map(),
    vip: new Map(),
  };
  game.v2 = V;

  function player(id) { return game.world.players.get(id); }
  function ensure(map, id, factory) { if (!map.has(id)) map.set(id, factory()); return map.get(id); }
  function log(action, by, target, detail) {
    V.auditLog.push({ action, by, target: target || null, detail: detail || null, at: now() });
    if (V.auditLog.length > 2000) V.auditLog.shift();
  }
  function ok(data) { return { ok: true, data: data === undefined ? true : data }; }
  function err(error) { return { ok: false, error }; }

  // ---------------------------------------------------------------
  // GAMEPLAY (20) — nuove abilità/oggetti. Server-authoritative:
  // ogni azione controlla massa/cooldown sul player prima di applicarsi.
  // ---------------------------------------------------------------
  const ABILITY_COST = {
    grapple: 12, teleportPad: 20, poisonCloud: 18, vortex: 22, camouflage: 10,
    adrenaline: 14, secondWind: 0, overdrive: 24, splitShot: 20, gravityWell: 26,
    novaBurst: 24, phaseShift: 18, berserkMode: 16, regenAura: 14, chainLightning: 20,
    tremor: 18, bubbleShield: 16, iceTrail: 12, meteorCall: 28, cloneDecoyPlus: 20,
  };
  const ABILITY_COOLDOWN_MS = 10000;
  const ABILITY_DURATION_MS = {
    camouflage: 8000, adrenaline: 6000, overdrive: 8000, berserkMode: 7000,
    regenAura: 7000, bubbleShield: 6000, iceTrail: 8000, secondWind: 0,
  };

  function useAbility(name, p, payload) {
    if (!p || p.dead) return err('Giocatore non valido');
    const cost = ABILITY_COST[name] ?? 15;
    const cds = (p.v2Cooldowns ||= {});
    if ((cds[name] || 0) > now()) return err('In ricarica');
    if (p.totalMass < cost + 10) return err('Massa insufficiente');
    p.cells[0].mass -= cost;
    cds[name] = now() + ABILITY_COOLDOWN_MS;
    const dur = ABILITY_DURATION_MS[name];
    if (dur) {
      p.v2Effects ||= {};
      p.v2Effects[name] = now() + dur;
    }
    if (name === 'secondWind') {
      p.v2SecondWindReady = true; // consumato automaticamente in game.js se esposto, altrimenti via API status
    }
    log('ability:' + name, p.id, null, payload || null);
    return ok({ cooldownMs: ABILITY_COOLDOWN_MS, durationMs: dur || 0, cost });
  }

  const gameplayActions = {};
  for (const name of Object.keys(ABILITY_COST)) {
    gameplayActions[name] = (p, payload) => useAbility(name, p, payload);
  }
  gameplayActions.abilityStatus = (p) => ok({
    cooldowns: p.v2Cooldowns || {},
    effects: p.v2Effects || {},
  });

  // ---------------------------------------------------------------
  // PVP / COMPETITIVO (20)
  // ---------------------------------------------------------------
  function seasonEntry(id) {
    return ensure(V.seasonLadder, id, () => ({ points: 0, wins: 0, losses: 0 }));
  }

  const pvpActions = {
    rankedQueueJoin: (p) => { V.rankedQueue.add(p.id); return ok({ queueSize: V.rankedQueue.size }); },
    rankedQueueLeave: (p) => { V.rankedQueue.delete(p.id); return ok(true); },
    matchHistoryGet: (p) => ok((V.matchHistory.get(p.id) || []).slice(-20)),
    seasonLadderGet: (p) => ok(seasonEntry(p.id)),
    tournamentCreate: (p, payload) => {
      const id = 't_' + Math.random().toString(36).slice(2, 9);
      const t = { id, name: String(payload?.name || 'Torneo').slice(0, 32), ownerId: p.id, status: 'open', participants: [p.id], bracket: [], createdAt: now() };
      V.tournaments.set(id, t);
      log('tournament:create', p.id, id);
      return ok(t);
    },
    tournamentJoin: (p, payload) => {
      const t = V.tournaments.get(payload?.id);
      if (!t || t.status !== 'open') return err('Torneo non disponibile');
      if (!t.participants.includes(p.id)) t.participants.push(p.id);
      return ok(t);
    },
    tournamentLeave: (p, payload) => {
      const t = V.tournaments.get(payload?.id);
      if (!t) return err('Torneo inesistente');
      t.participants = t.participants.filter(id => id !== p.id);
      return ok(true);
    },
    tournamentStart: (p, payload) => {
      const t = V.tournaments.get(payload?.id);
      if (!t) return err('Torneo inesistente');
      if (t.ownerId !== p.id) return err('Solo il creatore può avviare il torneo');
      if (t.participants.length < 2) return err('Servono almeno 2 partecipanti');
      const shuffled = [...t.participants].sort(() => Math.random() - 0.5);
      t.bracket = [];
      for (let i = 0; i < shuffled.length; i += 2) {
        t.bracket.push({ a: shuffled[i], b: shuffled[i + 1] || null, winner: shuffled[i + 1] ? null : shuffled[i] });
      }
      t.status = 'running';
      return ok(t);
    },
    tournamentBracketGet: (p, payload) => {
      const t = V.tournaments.get(payload?.id);
      return t ? ok(t) : err('Torneo inesistente');
    },
    weeklyLeaderboardGet: () => {
      const list = [...V.seasonLadder.entries()].map(([id, s]) => ({ id, name: player(id)?.name || id, ...s }));
      list.sort((a, b) => b.points - a.points);
      return ok(list.slice(0, 20));
    },
    mvpAward: (p, payload) => {
      const target = payload?.target ? player(payload.target) : p;
      if (!target) return err('Giocatore non trovato');
      const s = seasonEntry(target.id);
      s.points += 25;
      return ok(s);
    },
    rematchRequest: (p, payload) => {
      const targetId = payload?.target;
      if (!targetId || !player(targetId)) return err('Giocatore non trovato');
      ensure(V.rematchRequests, targetId, () => new Set()).add(p.id);
      return ok(true);
    },
    rematchAccept: (p, payload) => {
      const set = V.rematchRequests.get(p.id);
      if (!set || !set.has(payload?.from)) return err('Nessuna richiesta trovata');
      set.delete(payload.from);
      return ok({ opponent: payload.from });
    },
    spectatorVoteKick: (p, payload) => {
      const target = payload?.target;
      if (!target) return err('Target mancante');
      const votes = ensure(V.voteKicks, target, () => new Set());
      votes.add(p.id);
      const threshold = Math.max(3, Math.ceil(game.world.players.size * 0.2));
      return ok({ votes: votes.size, threshold, willKick: votes.size >= threshold });
    },
    replayMarkerAdd: (p, payload) => {
      const list = ensure(V.replayMarkers, p.id, () => []);
      list.push({ label: String(payload?.label || 'Marker').slice(0, 40), at: now() });
      if (list.length > 50) list.shift();
      return ok(list);
    },
    killFeedFilterSet: (p, payload) => {
      V.killFeedFilter.set(p.id, !!payload?.onlyMe);
      return ok(true);
    },
    nemesisGet: (p) => ok(V.nemesis.get(p.id) || null),
    revengeBonusClaim: (p) => {
      const lastKiller = V.revengeLastKiller.get(p.id);
      if (!lastKiller) return err('Nessuna vendetta disponibile');
      V.revengeLastKiller.delete(p.id);
      const s = seasonEntry(p.id);
      s.points += 10;
      return ok({ bonus: 10, avenged: lastKiller });
    },
    winStreakRewardClaim: (p) => {
      const streak = p.killStreak || 0;
      if (streak < 3) return err('Serve una serie di almeno 3 uccisioni');
      p.coins += streak * 5;
      return ok({ coinsAwarded: streak * 5 });
    },
    partyQueueJoin: (p) => {
      const partyId = V.playerParty.get(p.id);
      if (!partyId) return err('Non sei in un party');
      for (const memberId of V.parties.get(partyId).members) V.partyQueue.add(memberId);
      return ok({ queueSize: V.partyQueue.size });
    },
  };

  // ---------------------------------------------------------------
  // SHOP / ECONOMIA (20)
  // ---------------------------------------------------------------
  function transferCoins(from, to, amount) {
    amount = Math.floor(Number(amount) || 0);
    if (amount <= 0) return err('Importo non valido');
    if (from.coins < amount) return err('Coins insufficienti');
    from.coins -= amount;
    to.coins += amount;
    return ok({ amount, fromCoins: from.coins, toCoins: to.coins });
  }

  const shopActions = {
    giftCoins: (p, payload) => {
      const target = player(payload?.target);
      if (!target) return err('Giocatore non trovato');
      return transferCoins(p, target, payload?.amount);
    },
    giftItem: (p, payload) => {
      const target = player(payload?.target);
      const itemId = payload?.itemId;
      if (!target || !itemId) return err('Parametri mancanti');
      if (!p.inventory.has(itemId)) return err('Oggetto non posseduto');
      p.inventory.delete(itemId);
      target.inventory.add(itemId);
      return ok(true);
    },
    tradeCreate: (p, payload) => {
      const target = player(payload?.target);
      if (!target) return err('Giocatore non trovato');
      const id = 'tr_' + Math.random().toString(36).slice(2, 9);
      V.trades.set(id, { id, fromId: p.id, toId: target.id, offerItem: payload?.offerItem || null, offerCoins: Number(payload?.offerCoins) || 0, status: 'pending', createdAt: now() });
      return ok({ id });
    },
    tradeAccept: (p, payload) => {
      const t = V.trades.get(payload?.id);
      if (!t || t.status !== 'pending' || t.toId !== p.id) return err('Scambio non valido');
      const from = player(t.fromId), to = player(t.toId);
      if (!from || !to) return err('Giocatore offline');
      if (t.offerCoins > 0) {
        const res = transferCoins(from, to, t.offerCoins);
        if (!res.ok) return res;
      }
      if (t.offerItem && from.inventory.has(t.offerItem)) {
        from.inventory.delete(t.offerItem);
        to.inventory.add(t.offerItem);
      }
      t.status = 'completed';
      return ok(t);
    },
    tradeCancel: (p, payload) => {
      const t = V.trades.get(payload?.id);
      if (!t || (t.fromId !== p.id && t.toId !== p.id)) return err('Scambio non trovato');
      t.status = 'cancelled';
      return ok(true);
    },
    craftItem: (p, payload) => {
      const need = ['skin_default'];
      for (const req of need) if (!p.inventory.has(req)) return err('Materiali mancanti');
      const crafted = 'crafted_' + Math.random().toString(36).slice(2, 8);
      p.inventory.add(crafted);
      return ok({ item: crafted });
    },
    upgradeItem: (p, payload) => {
      const itemId = payload?.itemId;
      if (!itemId || !p.inventory.has(itemId)) return err('Oggetto non posseduto');
      const cost = 200;
      if (p.coins < cost) return err('Coins insufficienti');
      p.coins -= cost;
      const upgraded = itemId + '_plus';
      p.inventory.add(upgraded);
      return ok({ item: upgraded, cost });
    },
    openLootBox: (p) => {
      const cost = 150;
      if (p.coins < cost) return err('Coins insufficienti');
      p.coins -= cost;
      const pool = ['skin_common', 'skin_rare', 'skin_epic', 'coins_bonus'];
      const prize = pool[Math.floor(Math.random() * pool.length)];
      if (prize === 'coins_bonus') p.coins += 100; else p.inventory.add(prize);
      return ok({ prize });
    },
    battlePassProgress: (p) => ok(ensure(V.battlePass, p.id, () => ({ tier: 0, xp: 0 }))),
    battlePassClaim: (p) => {
      const bp = ensure(V.battlePass, p.id, () => ({ tier: 0, xp: 0 }));
      if (bp.xp < (bp.tier + 1) * 100) return err('XP insufficiente per il prossimo livello');
      bp.xp -= (bp.tier + 1) * 100;
      bp.tier += 1;
      p.coins += 50;
      return ok(bp);
    },
    referralCodeGenerate: (p) => {
      const code = 'ZL-' + p.id.slice(0, 6).toUpperCase();
      V.referralCodes.set(code, p.id);
      return ok({ code });
    },
    referralCodeRedeem: (p, payload) => {
      const ownerId = V.referralCodes.get(payload?.code);
      if (!ownerId || ownerId === p.id) return err('Codice non valido');
      if (V.referredBy.has(p.id)) return err('Codice già utilizzato');
      V.referredBy.set(p.id, ownerId);
      p.coins += 100;
      const owner = player(ownerId);
      if (owner) owner.coins += 100;
      return ok({ bonus: 100 });
    },
    savingsDeposit: (p, payload) => {
      const amount = Math.floor(Number(payload?.amount) || 0);
      if (amount <= 0 || p.coins < amount) return err('Importo non valido');
      p.coins -= amount;
      const s = ensure(V.savings, p.id, () => ({ amount: 0, since: now() }));
      s.amount += amount;
      return ok(s);
    },
    savingsWithdraw: (p, payload) => {
      const s = V.savings.get(p.id);
      const amount = Math.floor(Number(payload?.amount) || 0);
      if (!s || amount <= 0 || s.amount < amount) return err('Importo non valido');
      s.amount -= amount;
      p.coins += amount;
      return ok(s);
    },
    marketplaceList: (p, payload) => {
      const itemId = payload?.itemId, price = Math.floor(Number(payload?.price) || 0);
      if (!itemId || !p.inventory.has(itemId) || price <= 0) return err('Parametri non validi');
      const id = 'lst_' + Math.random().toString(36).slice(2, 9);
      V.marketplace.set(id, { id, sellerId: p.id, itemId, price, at: now() });
      return ok({ id });
    },
    marketplaceBuy: (p, payload) => {
      const listing = V.marketplace.get(payload?.id);
      if (!listing) return err('Annuncio non trovato');
      const seller = player(listing.sellerId);
      if (!seller) return err('Venditore offline');
      const res = transferCoins(p, seller, listing.price);
      if (!res.ok) return res;
      p.inventory.add(listing.itemId);
      V.marketplace.delete(listing.id);
      return ok({ item: listing.itemId });
    },
    couponRedeem: (p, payload) => {
      const coupon = V.coupons.get(String(payload?.code || '').toUpperCase());
      if (!coupon) return err('Coupon non valido');
      if (coupon.maxUses && coupon.uses >= coupon.maxUses) return err('Coupon esaurito');
      coupon.uses += 1;
      return ok({ discountPct: coupon.discountPct });
    },
    bundleBuy: (p, payload) => {
      const cost = 300;
      if (p.coins < cost) return err('Coins insufficienti');
      p.coins -= cost;
      p.inventory.add('bundle_' + (payload?.id || 'starter'));
      return ok({ cost });
    },
    wishlistAdd: (p, payload) => {
      const list = ensure(V.wishlists, p.id, () => new Set());
      list.add(String(payload?.itemId || ''));
      return ok([...list]);
    },
    vipSubscribe: (p, payload) => {
      const cost = 500;
      if (p.coins < cost) return err('Coins insufficienti');
      p.coins -= cost;
      V.vip.set(p.id, { tier: payload?.tier || 'gold', until: now() + 30 * 86400000 });
      return ok(V.vip.get(p.id));
    },
  };

  // ---------------------------------------------------------------
  // SOCIAL (20)
  // ---------------------------------------------------------------
  const socialActions = {
    friendRequestSend: (p, payload) => {
      const target = player(payload?.target);
      if (!target || target.id === p.id) return err('Giocatore non valido');
      ensure(V.friendRequests, target.id, () => new Set()).add(p.id);
      return ok(true);
    },
    friendRequestAccept: (p, payload) => {
      const set = V.friendRequests.get(p.id);
      if (!set || !set.has(payload?.from)) return err('Richiesta non trovata');
      set.delete(payload.from);
      ensure(V.friends, p.id, () => new Set()).add(payload.from);
      ensure(V.friends, payload.from, () => new Set()).add(p.id);
      return ok(true);
    },
    friendRequestDecline: (p, payload) => {
      V.friendRequests.get(p.id)?.delete(payload?.from);
      return ok(true);
    },
    friendRemove: (p, payload) => {
      V.friends.get(p.id)?.delete(payload?.target);
      V.friends.get(payload?.target)?.delete(p.id);
      return ok(true);
    },
    friendsListGet: (p) => ok([...(V.friends.get(p.id) || [])].map(id => ({ id, name: player(id)?.name || id, online: !!player(id) }))),
    blockUser: (p, payload) => { ensure(V.blocked, p.id, () => new Set()).add(payload?.target); return ok(true); },
    unblockUser: (p, payload) => { V.blocked.get(p.id)?.delete(payload?.target); return ok(true); },
    privateMessageSend: (p, payload) => {
      const target = player(payload?.target);
      if (!target) return err('Giocatore non trovato');
      if (V.blocked.get(target.id)?.has(p.id)) return err('Utente bloccato');
      const text = String(payload?.text || '').slice(0, 300);
      ensure(V.privateMessages, target.id, () => []).push({ from: p.id, text, at: now() });
      return ok(true);
    },
    privateMessageGet: (p) => ok((V.privateMessages.get(p.id) || []).slice(-50)),
    clanCreate: (p, payload) => {
      const id = 'clan_' + Math.random().toString(36).slice(2, 9);
      const clan = { id, name: String(payload?.name || 'Clan').slice(0, 24), tag: String(payload?.tag || 'CLN').slice(0, 4), ownerId: p.id, members: new Set([p.id]), createdAt: now() };
      V.clans.set(id, clan);
      return ok({ id, name: clan.name, tag: clan.tag });
    },
    clanInvite: (p, payload) => {
      const clan = [...V.clans.values()].find(c => c.members.has(p.id));
      if (!clan) return err('Non appartieni a nessun clan');
      ensure(V.clanInvites, payload?.target, () => new Set()).add(clan.id);
      return ok(true);
    },
    clanJoin: (p, payload) => {
      const invites = V.clanInvites.get(p.id);
      if (!invites || !invites.has(payload?.id)) return err('Nessun invito per questo clan');
      const clan = V.clans.get(payload.id);
      if (!clan) return err('Clan inesistente');
      clan.members.add(p.id);
      invites.delete(payload.id);
      return ok(true);
    },
    clanLeave: (p) => {
      const clan = [...V.clans.values()].find(c => c.members.has(p.id));
      if (!clan) return err('Non appartieni a nessun clan');
      clan.members.delete(p.id);
      return ok(true);
    },
    clanChatSend: (p, payload) => {
      const clan = [...V.clans.values()].find(c => c.members.has(p.id));
      if (!clan) return err('Non appartieni a nessun clan');
      ensure(V.clanChat, clan.id, () => []).push({ from: p.id, text: String(payload?.text || '').slice(0, 300), at: now() });
      return ok(true);
    },
    clanLeaderboardGet: () => {
      const list = [...V.clans.values()].map(c => ({ id: c.id, name: c.name, tag: c.tag, members: c.members.size }));
      list.sort((a, b) => b.members - a.members);
      return ok(list.slice(0, 20));
    },
    profileBioSet: (p, payload) => {
      const prof = ensure(V.profiles, p.id, () => ({ bio: '', badges: new Set(), statusText: '', frame: 'default' }));
      prof.bio = String(payload?.bio || '').slice(0, 160);
      return ok(prof);
    },
    profileStatusSet: (p, payload) => {
      const prof = ensure(V.profiles, p.id, () => ({ bio: '', badges: new Set(), statusText: '', frame: 'default' }));
      prof.statusText = String(payload?.status || '').slice(0, 60);
      return ok(prof);
    },
    partyCreate: (p) => {
      const id = 'party_' + Math.random().toString(36).slice(2, 9);
      V.parties.set(id, { ownerId: p.id, members: new Set([p.id]) });
      V.playerParty.set(p.id, id);
      return ok({ id });
    },
    partyInvite: (p, payload) => {
      const partyId = V.playerParty.get(p.id);
      const party = partyId && V.parties.get(partyId);
      if (!party) return err('Non hai un party');
      const target = player(payload?.target);
      if (!target) return err('Giocatore non trovato');
      party.members.add(target.id);
      V.playerParty.set(target.id, partyId);
      return ok(true);
    },
    emoteSend: (p, payload) => {
      const last = p.v2LastEmoteAt || 0;
      if (now() - last < 1500) return err('Aspetta un momento prima del prossimo emote');
      p.v2LastEmoteAt = now();
      return ok({ emote: String(payload?.emote || '👍').slice(0, 8) });
    },
  };

  // ---------------------------------------------------------------
  // ADMIN / MODERAZIONE (20) — richiedono ctx.isAdmin
  // ---------------------------------------------------------------
  const adminActions = {
    reportSubmit: (p, payload) => {
      const r = { id: V.reports.length + 1, reporterId: p.id, targetId: payload?.target, reason: String(payload?.reason || '').slice(0, 200), status: 'open', at: now() };
      V.reports.push(r);
      return ok(r);
    },
    reportsListGet: () => ok(V.reports.slice(-100)),
    reportResolve: (p, payload) => {
      const r = V.reports.find(x => x.id === payload?.id);
      if (!r) return err('Segnalazione non trovata');
      r.status = payload?.status === 'dismissed' ? 'dismissed' : 'resolved';
      log('report:resolve', p.id, r.targetId, r.status);
      return ok(r);
    },
    warnPlayer: (p, payload) => {
      ensure(V.warnings, payload?.target, () => []).push({ reason: String(payload?.reason || '').slice(0, 200), by: p.id, at: now() });
      log('player:warn', p.id, payload?.target, payload?.reason);
      return ok(true);
    },
    warningsGet: (p, payload) => ok(V.warnings.get(payload?.target) || []),
    shadowBan: (p, payload) => { V.shadowBanned.add(payload?.target); log('player:shadowban', p.id, payload?.target); return ok(true); },
    shadowUnban: (p, payload) => { V.shadowBanned.delete(payload?.target); log('player:shadowunban', p.id, payload?.target); return ok(true); },
    auditLogGet: () => ok(V.auditLog.slice(-200)),
    announcementCreate: (p, payload) => {
      const a = { text: String(payload?.text || '').slice(0, 300), at: now(), expiresAt: now() + (Number(payload?.ttlMs) || 3600000) };
      V.announcements.push(a);
      if (V.announcements.length > 50) V.announcements.shift();
      log('announcement:create', p.id, null, a.text);
      return ok(a);
    },
    announcementsGet: () => ok(V.announcements.filter(a => a.expiresAt > now())),
    maintenanceModeSet: (p, payload) => {
      V.maintenance.on = !!payload?.on;
      V.maintenance.message = String(payload?.message || '').slice(0, 200);
      log('maintenance:set', p.id, null, V.maintenance);
      return ok(V.maintenance);
    },
    maintenanceModeGet: () => ok(V.maintenance),
    featureFlagSet: (p, payload) => {
      V.featureFlags.set(String(payload?.name), !!payload?.value);
      log('flag:set', p.id, payload?.name, payload?.value);
      return ok(true);
    },
    featureFlagGet: (p, payload) => ok(!!V.featureFlags.get(String(payload?.name))),
    forceLogout: (p, payload) => {
      const target = player(payload?.target);
      if (!target) return err('Giocatore non trovato');
      try { target.ws?.close(4000, 'Force logout'); } catch (_) {}
      log('player:forcelogout', p.id, target.id);
      return ok(true);
    },
    coinAuditAdjust: (p, payload) => {
      const target = player(payload?.target);
      if (!target) return err('Giocatore non trovato');
      const delta = Math.floor(Number(payload?.delta) || 0);
      target.coins = Math.max(0, target.coins + delta);
      log('coins:audit-adjust', p.id, target.id, delta);
      return ok({ coins: target.coins });
    },
    vipGrant: (p, payload) => {
      const target = payload?.target;
      if (!target) return err('Target mancante');
      V.vip.set(target, { tier: payload?.tier || 'gold', until: now() + (Number(payload?.days) || 30) * 86400000 });
      log('vip:grant', p.id, target);
      return ok(V.vip.get(target));
    },
    banHistoryGet: () => ok(V.auditLog.filter(a => a.action === 'player:ban' || a.action.startsWith('player:')).slice(-100)),
    appealSubmit: (p, payload) => {
      const a = { id: V.appeals.length + 1, playerId: p.id, text: String(payload?.text || '').slice(0, 400), status: 'pending', at: now() };
      V.appeals.push(a);
      return ok(a);
    },
    appealReview: (p, payload) => {
      const a = V.appeals.find(x => x.id === payload?.id);
      if (!a) return err('Appello non trovato');
      a.status = payload?.approve ? 'approved' : 'rejected';
      log('appeal:review', p.id, a.playerId, a.status);
      return ok(a);
    },
  };

  const ADMIN_ONLY = new Set(Object.keys(adminActions).filter(k => k !== 'reportSubmit' && k !== 'appealSubmit'));

  const ALL = Object.assign({}, gameplayActions, pvpActions, shopActions, socialActions, adminActions);

  function handle(action, p, payload, ctx) {
    const fn = ALL[action];
    if (!fn) return err('Azione sconosciuta: ' + action);
    if (ADMIN_ONLY.has(action) && !ctx?.isAdmin) return err('Richiesti permessi admin');
    try { return fn(p, payload || {}, ctx); }
    catch (e) { return err('Errore interno: ' + (e?.message || e)); }
  }

  game.v2.handle = handle;
  game.v2.actionNames = Object.keys(ALL);
  return game.v2;
}

module.exports = { attachFeaturesV2 };
