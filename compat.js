(() => {
  'use strict';
  const DEFAULT_KEYS = { split: ' ', feed: 'w', virus: 'q' };
  const keyConfig = () => {
    try {
      const cfg = JSON.parse(localStorage.getItem('agarServerConfig') || '{}');
      cfg.keybinds = { ...DEFAULT_KEYS, ...(cfg.keybinds || {}) };
      return cfg;
    } catch (_) { return { keybinds: { ...DEFAULT_KEYS } }; }
  };

  window.cambiaScheda = function (id) {
    document.querySelectorAll('.tab-content').forEach((el) => el.classList.remove('active'));
    const target = document.getElementById(String(id));
    if (target) target.classList.add('active');
  };

  window.acquistaOggetto = function (legacyId) {
    const map = {
      skin_galassia: 'skin_galaxy',
      skin_cyber: 'skin_cyber',
      boost_speed: 'boost_speed_60',
      boost_mass: 'boost_mass_60',
      shield_pack: 'shield_pack',
      bounty_badge: 'bounty_badge'
    };
    const itemId = map[String(legacyId)] || String(legacyId);
    if (window.ZLUserMenu && typeof window.ZLUserMenu.purchaseItem === 'function') {
      return window.ZLUserMenu.purchaseItem(itemId);
    }
    const status = document.getElementById('feature-status');
    if (status) status.textContent = '❌ Menu Shop non ancora pronto.';
  };

  window.toggleBotAction = function (action) {
    const id = action === 'follow' ? 'btnFollow' : 'btnFarm';
    const btn = document.getElementById(id);
    if (!btn) return;
    const active = btn.classList.toggle('active');
    btn.dataset.enabled = active ? '1' : '0';
    btn.textContent = (action === 'follow' ? 'Seguimi (Follow): ' : 'Farming Cibo: ') + (active ? 'ATTIVO' : 'OFF');
  };

  window.assegnaTasto = function (elementId) {
    const field = document.getElementById(elementId);
    if (!field) return;
    field.value = 'Premi un tasto...';
    const handler = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); field.value = keyConfig().keybinds[elementId === 'keySplit' ? 'split' : elementId === 'keyFeed' ? 'feed' : 'virus'] || DEFAULT_KEYS.virus; window.removeEventListener('keydown', handler); return; }
      if (e.target && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName) && e.target !== field) return;
      e.preventDefault();
      const cfg = keyConfig();
      const keyName = elementId === 'keySplit' ? 'split' : elementId === 'keyFeed' ? 'feed' : 'virus';
      cfg.keybinds[keyName] = e.key || DEFAULT_KEYS[keyName];
      localStorage.setItem('agarServerConfig', JSON.stringify(cfg));
      field.value = cfg.keybinds[keyName];
      window.dispatchEvent(new Event('keybinds-changed'));
      window.removeEventListener('keydown', handler);
    };
    window.addEventListener('keydown', handler);
  };

  window.salvaImpostazioni = function () {
    const cfg = keyConfig();
    cfg.massa = Boolean(document.getElementById('optMassa')?.checked);
    cfg.nomi = Boolean(document.getElementById('optNomi')?.checked);
    for (let i = 1; i <= 4; i++) {
      cfg[`b${i}`] = {
        name: String(document.getElementById(`botName${i}`)?.value || `Bot ${i}`).slice(0, 40),
        color: String(document.getElementById(`botColor${i}`)?.value || '#ffffff'),
      };
    }
    localStorage.setItem('agarServerConfig', JSON.stringify(cfg));
    window.dispatchEvent(new Event('keybinds-changed'));
  };

  document.addEventListener('DOMContentLoaded', () => {
    const saved = keyConfig();
    const keyMap = [['keySplit', 'split'], ['keyFeed', 'feed'], ['keyVirus', 'virus']];
    for (const [id, name] of keyMap) { const el = document.getElementById(id); if (el) el.value = saved.keybinds[name]; }
  });
})();
