(() => {
  'use strict';
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const $ = id => document.getElementById(id);

  // 20 Gameplay · 20 PvP · 20 Shop/Economia · 20 Social · 20 Admin
  const CATS = [
    { id: 'gameplay', label: '🎮 Gameplay', items: [
      ['grapple', 'Rampino'], ['teleportPad', 'Varco teletrasporto'], ['poisonCloud', 'Nube velenosa'],
      ['vortex', 'Vortice risucchio'], ['camouflage', 'Mimetizzazione'], ['adrenaline', 'Adrenalina'],
      ['secondWind', 'Salvezza automatica'], ['overdrive', 'Overdrive cooldown'], ['splitShot', 'Colpo multiplo'],
      ['gravityWell', 'Pozzo gravitazionale'], ['novaBurst', 'Esplosione Nova'], ['phaseShift', 'Fase attraversamento'],
      ['berserkMode', 'Modalità Berserk'], ['regenAura', 'Aura rigenerante'], ['chainLightning', 'Fulmine a catena'],
      ['tremor', 'Scossa rallentante'], ['bubbleShield', 'Scudo a bolla'], ['iceTrail', 'Scia di ghiaccio'],
      ['meteorCall', 'Richiama meteora'], ['cloneDecoyPlus', 'Clone avanzato'],
    ]},
    { id: 'pvp', label: '⚔️ PvP', items: [
      ['rankedQueueJoin', 'Entra in coda ranked'], ['rankedQueueLeave', 'Esci dalla coda'], ['matchHistoryGet', 'Storico partite'],
      ['seasonLadderGet', 'Classifica stagionale'], ['tournamentCreate', 'Crea torneo'], ['tournamentJoin', 'Entra nel torneo'],
      ['tournamentLeave', 'Esci dal torneo'], ['tournamentStart', 'Avvia torneo'], ['tournamentBracketGet', 'Tabellone torneo'],
      ['weeklyLeaderboardGet', 'Classifica settimanale'], ['mvpAward', 'Premio MVP'], ['rematchRequest', 'Richiedi rivincita'],
      ['rematchAccept', 'Accetta rivincita'], ['spectatorVoteKick', 'Vota kick spettatore'], ['replayMarkerAdd', 'Segna momento replay'],
      ['killFeedFilterSet', 'Filtro kill feed'], ['nemesisGet', 'Il tuo nemico'], ['revengeBonusClaim', 'Riscatta bonus vendetta'],
      ['winStreakRewardClaim', 'Riscatta bonus serie vittorie'], ['partyQueueJoin', 'Coda ranked di gruppo'],
    ]},
    { id: 'shop', label: '🛒 Shop/Economia', items: [
      ['giftCoins', 'Regala coins'], ['giftItem', 'Regala oggetto'], ['tradeCreate', 'Proponi scambio'],
      ['tradeAccept', 'Accetta scambio'], ['tradeCancel', 'Annulla scambio'], ['craftItem', 'Crea oggetto'],
      ['upgradeItem', 'Potenzia oggetto'], ['openLootBox', 'Apri loot box'], ['battlePassProgress', 'Progressi Battle Pass'],
      ['battlePassClaim', 'Riscatta livello Battle Pass'], ['referralCodeGenerate', 'Genera codice invito'],
      ['referralCodeRedeem', 'Riscatta codice invito'], ['savingsDeposit', 'Deposita risparmi'], ['savingsWithdraw', 'Preleva risparmi'],
      ['marketplaceList', 'Vendi sul mercato'], ['marketplaceBuy', 'Compra dal mercato'], ['couponRedeem', 'Riscatta coupon'],
      ['bundleBuy', 'Compra bundle'], ['wishlistAdd', 'Aggiungi a lista desideri'], ['vipSubscribe', 'Abbonati VIP'],
    ]},
    { id: 'social', label: '👥 Social', items: [
      ['friendRequestSend', 'Invia richiesta amicizia'], ['friendRequestAccept', 'Accetta amicizia'], ['friendRequestDecline', 'Rifiuta amicizia'],
      ['friendRemove', 'Rimuovi amico'], ['friendsListGet', 'Lista amici'], ['blockUser', 'Blocca utente'],
      ['unblockUser', 'Sblocca utente'], ['privateMessageSend', 'Invia messaggio privato'], ['privateMessageGet', 'Leggi messaggi privati'],
      ['clanCreate', 'Crea clan'], ['clanInvite', 'Invita nel clan'], ['clanJoin', 'Entra nel clan'],
      ['clanLeave', 'Lascia il clan'], ['clanChatSend', 'Chat di clan'], ['clanLeaderboardGet', 'Classifica clan'],
      ['profileBioSet', 'Imposta bio profilo'], ['profileStatusSet', 'Imposta stato'], ['partyCreate', 'Crea party'],
      ['partyInvite', 'Invita nel party'], ['emoteSend', 'Invia emote'],
    ]},
    { id: 'admin', label: '🛡 Admin', items: [
      ['reportSubmit', 'Invia segnalazione'], ['reportsListGet', 'Lista segnalazioni'], ['reportResolve', 'Risolvi segnalazione'],
      ['warnPlayer', 'Avvisa giocatore'], ['warningsGet', 'Storico avvisi'], ['shadowBan', 'Shadow ban'],
      ['shadowUnban', 'Rimuovi shadow ban'], ['auditLogGet', 'Registro azioni'], ['announcementCreate', 'Crea annuncio'],
      ['announcementsGet', 'Annunci attivi'], ['maintenanceModeSet', 'Imposta manutenzione'], ['maintenanceModeGet', 'Stato manutenzione'],
      ['featureFlagSet', 'Imposta feature flag'], ['featureFlagGet', 'Leggi feature flag'], ['forceLogout', 'Forza disconnessione'],
      ['coinAuditAdjust', 'Correggi coins (audit)'], ['vipGrant', 'Concedi VIP'], ['banHistoryGet', 'Storico ban'],
      ['appealSubmit', 'Invia ricorso'], ['appealReview', 'Valuta ricorso'],
    ]},
  ];

  function needsPayload(id) {
    return !['friendsListGet', 'privateMessageGet', 'weeklyLeaderboardGet', 'rankedQueueJoin', 'rankedQueueLeave',
      'matchHistoryGet', 'seasonLadderGet', 'partyQueueJoin', 'battlePassProgress', 'battlePassClaim',
      'referralCodeGenerate', 'openLootBox', 'winStreakRewardClaim', 'revengeBonusClaim', 'nemesisGet',
      'clanCreate', 'clanLeave', 'clanLeaderboardGet', 'clanChatSend', 'partyCreate', 'emoteSend',
      'reportsListGet', 'auditLogGet', 'announcementsGet', 'maintenanceModeGet', 'vipSubscribe'].includes(id);
  }

  async function run(id) {
    const status = $('zl-v2-status');
    let payload = {};
    if (needsPayload(id)) {
      const target = $('zl-v2-target')?.value?.trim();
      const value = $('zl-v2-value')?.value?.trim();
      if (target) payload.target = target;
      if (value !== undefined && value !== '') {
        if (!Number.isNaN(Number(value))) payload.amount = payload.delta = payload.price = payload.days = Number(value);
        payload.text = payload.reason = payload.name = payload.status = payload.itemId = payload.code = payload.emote = value;
      }
    }
    if (status) status.textContent = '⏳ ' + id + '…';
    try {
      const res = await window.ZLGame?.f2?.(id, payload);
      if (!res) throw new Error('Connessione al server non attiva.');
      if (!res.ok) throw new Error(res.error || 'Azione rifiutata');
      if (status) status.textContent = '✅ ' + id + ' → ' + (typeof res.data === 'object' ? JSON.stringify(res.data).slice(0, 140) : String(res.data));
    } catch (e) {
      if (status) status.textContent = '❌ ' + (e?.message || 'Errore');
    }
  }

  function panelHtml() {
    return `<p class="zl-note">Nuovo blocco di 100 funzionalità (Gameplay, PvP, Shop, Social, Admin). Alcune azioni richiedono un ID giocatore o un valore nei campi qui sotto.</p>
      <div class="zl-upload-row">
        <input id="zl-v2-target" type="text" placeholder="ID giocatore / clan / torneo (se richiesto)">
        <input id="zl-v2-value" type="text" placeholder="Valore / importo / testo (se richiesto)">
      </div>
      <div class="zl-tabs" id="zl-v2-subtabs">${CATS.map((c, i) => `<button type="button" class="zl-tab-btn${i === 0 ? ' active' : ''}" data-v2-cat="${c.id}">${c.label}</button>`).join('')}</div>
      ${CATS.map((c, i) => `<div class="zl-function-grid zl-v2-pane" data-v2-pane="${c.id}" style="${i === 0 ? '' : 'display:none'}">${c.items.map(([id, label]) => `<button type="button" class="zl-feature-card" data-v2-action="${id}"><span>›</span><b>${esc(label)}</b><em>${esc(id)}</em></button>`).join('')}</div>`).join('')}
      <div id="zl-v2-status" class="zl-menu-status"></div>`;
  }

  function injectTab() {
    const tabs = document.querySelector('.zl-tabs');
    const overlay = document.getElementById('zl-user-overlay');
    if (!tabs || !overlay || document.querySelector('[data-tab="v2"]')) return false;
    const btn = document.createElement('button');
    btn.type = 'button'; btn.className = 'zl-tab-btn'; btn.dataset.tab = 'v2'; btn.textContent = '🆕 100 Funzioni v2';
    tabs.appendChild(btn);
    const pane = document.createElement('div');
    pane.className = 'zl-tab-pane'; pane.dataset.pane = 'v2'; pane.innerHTML = panelHtml();
    overlay.querySelector('.zl-user-modal')?.insertBefore(pane, overlay.querySelector('#zl-menu-status')?.closest('.zl-tab-pane') || null);
    if (!pane.parentElement) overlay.querySelector('.zl-user-modal')?.appendChild(pane);

    btn.addEventListener('click', () => {
      document.querySelectorAll('.zl-tab-btn').forEach(b => b.classList.toggle('active', b === btn));
      document.querySelectorAll('.zl-tab-pane').forEach(p => p.classList.toggle('active', p.dataset.pane === 'v2'));
    });
    pane.querySelectorAll('[data-v2-cat]').forEach(sb => sb.addEventListener('click', () => {
      pane.querySelectorAll('[data-v2-cat]').forEach(x => x.classList.toggle('active', x === sb));
      pane.querySelectorAll('[data-v2-pane]').forEach(p => { p.style.display = p.dataset.v2Pane === sb.dataset.v2Cat ? '' : 'none'; });
    }));
    pane.querySelectorAll('[data-v2-action]').forEach(b => b.addEventListener('click', () => run(b.dataset.v2Action)));
    return true;
  }

  document.addEventListener('DOMContentLoaded', () => {
    if (injectTab()) return;
    // fallback: l'overlay del menu utente potrebbe non essere ancora pronto.
    let tries = 0;
    const timer = setInterval(() => { if (injectTab() || ++tries > 40) clearInterval(timer); }, 100);
  }, { once: true });
})();
