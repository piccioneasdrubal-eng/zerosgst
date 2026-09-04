(() => {
  'use strict';

  const CONFIG = window.GAME_CONFIG || {};
  const AUTH_URL = String(CONFIG.AUTH_API_URL || '/auth/auth.php').trim().replace(/\/$/, '');
  const TOKEN_KEY = 'zl_auth_token';
  const USER_KEY = 'zl_auth_user';

  const $ = (id) => document.getElementById(id);
  const portal = $('portalOverlay');
  const loginForm = $('loginForm');
  const registerForm = $('registerForm');
  const loginError = $('loginError');
  const regError = $('regError');
  const regSuccess = $('regSuccess');
  const authStatus = $('authStatus');

  const clean = (v, max = 120) => String(v ?? '').trim().slice(0, max);

  function getToken() {
    try { return localStorage.getItem(TOKEN_KEY) || ''; } catch (_) { return ''; }
  }

  function getUser() {
    try { return JSON.parse(localStorage.getItem(USER_KEY) || 'null'); } catch (_) { return null; }
  }

  function setSession(data) {
    if (!data || !data.ok || !data.token) throw new Error(data?.error || 'Sessione non valida');
    localStorage.setItem(TOKEN_KEY, data.token);
    localStorage.setItem(USER_KEY, JSON.stringify(data.user || null));
    if (data.user?.name) localStorage.setItem('currentUser', data.user.name);
    window.dispatchEvent(new CustomEvent('auth-changed', { detail: data }));
  }

  function clearSession() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    localStorage.removeItem('currentUser');
    window.dispatchEvent(new Event('auth-changed'));
  }

  async function request(action, payload = {}) {
    if (!AUTH_URL) throw new Error('AUTH_API_URL non configurato.');
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    try {
      const res = await fetch(AUTH_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify({ action, ...payload }),
        cache: 'no-store',
        signal: controller.signal,
      });
      const text = await res.text();
      let data = {};
      try { data = JSON.parse(text); } catch (_) { data = { ok: false, error: `Risposta auth non JSON (HTTP ${res.status})` }; }
      if (!res.ok && !data.error) data.error = `HTTP ${res.status}`;
      if (res.status >= 500 && data.error) data.error = `Server auth: ${data.error}`;
      if (!data.ok && !data.error) data.error = 'Operazione non riuscita.';
      return data;
    } catch (err) {
      if (err?.name === 'AbortError') throw new Error('Servizio auth non risponde.');
      throw new Error('Impossibile contattare il servizio auth.');
    } finally {
      clearTimeout(timeout);
    }
  }

  function switchPortalTab(tab) {
    const isLogin = tab === 'login';
    if ($('loginForm')) $('loginForm').style.display = isLogin ? 'block' : 'none';
    if ($('registerForm')) $('registerForm').style.display = isLogin ? 'none' : 'block';
    document.querySelectorAll('[data-portal-tab]').forEach((button) => button.classList.toggle('active', button.dataset.portalTab === tab));
    if (loginError) loginError.style.display = 'none';
    if (regError) regError.style.display = 'none';
    if (regSuccess) regSuccess.style.display = 'none';
  }

  function showLoginError(message) {
    if (!loginError) return;
    loginError.textContent = message;
    loginError.style.display = 'block';
  }

  function showRegError(message) {
    if (!regError) return;
    regError.textContent = message;
    regError.style.display = 'block';
  }

  function applySession(user) {
    if (!portal) return;
    const authenticated = Boolean(getToken() && user);
    portal.style.display = authenticated ? 'none' : 'flex';
    const welcome = $('welcomeUser');
    const name = $('name');
    if (authenticated) {
      const displayName = String(user.name || user.email || 'Player').slice(0, 16);
      if (welcome) welcome.textContent = displayName;
      if (name && !name.value) name.value = localStorage.getItem('agarNick') || displayName;
      if (authStatus) authStatus.textContent = user.email ? `Accesso: ${user.email}` : 'Sessione attiva';
    }
  }

  async function login() {
    const email = clean($('loginEmail')?.value, 160).toLowerCase();
    const password = $('loginPass')?.value || '';
    if (!email || !password) return showLoginError('Inserisci email e password.');
    try {
      const data = await request('login', { email, password });
      if (!data.ok) return showLoginError(data.error || 'Credenziali non valide.');
      setSession(data);
      if ($('name')) $('name').value = localStorage.getItem('agarNick') || data.user?.name || 'Player';
      applySession(data.user);
    } catch (err) { showLoginError(err.message); }
  }

  async function register() {
    const email = clean($('regEmail')?.value, 160).toLowerCase();
    const name = clean($('regName')?.value, 40);
    const password = $('regPass')?.value || '';
    if (!email) return showRegError('Inserisci un indirizzo email valido.');
    if (name.length < 2) return showRegError('Il nome deve contenere almeno 2 caratteri.');
    if (password.length < 8) return showRegError('La password deve contenere almeno 8 caratteri.');
    try {
      const data = await request('register', { email, name, password });
      if (!data.ok) return showRegError(data.error || 'Registrazione non riuscita.');

      // Dopo la registrazione NON effettuare il login automatico:
      // il portale iniziale deve rimanere visibile e passare alla scheda Accesso.
      // Questo evita che il pannello scompaia immediatamente dopo la creazione dell'account.
      clearSession();
      if (portal) portal.style.display = 'flex';
      switchPortalTab('login');
      if ($('loginEmail')) $('loginEmail').value = email;
      if ($('loginPass')) $('loginPass').value = '';
      if (regSuccess) {
        regSuccess.textContent = '✅ Account creato. Ora accedi con email e password.';
        regSuccess.style.display = 'block';
      }
      if (authStatus) authStatus.textContent = 'Registrazione completata. Effettua il login per entrare nel gioco.';
    } catch (err) { showRegError(err.message); }
  }

  async function logout() {
    const token = getToken();
    try { if (token) await request('logout', { token }); } catch (_) {}
    clearSession();
    if (portal) portal.style.display = 'flex';
  }

  async function restore() {
    const token = getToken();
    const user = getUser();
    if (!token) return applySession(null);
    if (user) applySession(user);
    try {
      const data = await request('me', { token });
      if (!data.ok || !data.user) throw new Error(data.error || 'Sessione scaduta.');
      localStorage.setItem(USER_KEY, JSON.stringify(data.user));
      localStorage.setItem('currentUser', data.user.name || data.user.email || 'Player');
      applySession(data.user);
    } catch (_) {
      clearSession();
      applySession(null);
    }
  }


  async function refreshProfile() {
    const token = getToken();
    if (!token) return null;
    const data = await request('me', { token });
    if (!data.ok || !data.user) throw new Error(data.error || 'Profilo non disponibile.');
    localStorage.setItem(USER_KEY, JSON.stringify(data.user));
    localStorage.setItem('currentUser', data.user.name || data.user.email || 'Player');
    window.dispatchEvent(new CustomEvent('auth-profile-updated', { detail: data.user }));
    applySession(data.user);
    return data.user;
  }

  async function syncStats(stats) {
    const token = getToken();
    if (!token) return null;
    const data = await request('sync_stats', { token, stats: stats || {} });
    if (!data.ok || !data.user) throw new Error(data.error || 'Impossibile sincronizzare le statistiche.');
    localStorage.setItem(USER_KEY, JSON.stringify(data.user));
    window.dispatchEvent(new CustomEvent('auth-profile-updated', { detail: data.user }));
    return data.user;
  }

  async function claimDaily(mission) {
    const token = getToken();
    if (!token) throw new Error('Accedi per usare le missioni giornaliere.');
    const data = await request('claim_daily', { token, mission });
    if (!data.ok || !data.user) throw new Error(data.error || 'Ricompensa non disponibile.');
    localStorage.setItem(USER_KEY, JSON.stringify(data.user));
    window.dispatchEvent(new CustomEvent('auth-profile-updated', { detail: data.user }));
    return data.user;
  }

  async function health() {
    const url = AUTH_URL + (AUTH_URL.includes('?') ? '&' : '?') + 'health=1';
    try {
      const r = await fetch(url, { cache: 'no-store' });
      return await r.json();
    } catch (_) { return { ok:false, error:'Health check non disponibile' }; }
  }

  window.ZLAuth = { getToken, getUser, login, register, logout, restore, switchPortalTab, health, refreshProfile, syncStats, claimDaily };
  window.switchPortalTab = switchPortalTab;
  window.eseguiLogin = login;
  window.eseguiRegistrazione = register;
  window.effettuaLogout = (e) => { if (e?.preventDefault) e.preventDefault(); void logout(); };

  document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('[data-portal-tab]').forEach((b) => b.addEventListener('click', () => switchPortalTab(b.dataset.portalTab)));
    loginForm?.addEventListener('submit', (e) => { e.preventDefault(); void login(); });
    registerForm?.addEventListener('submit', (e) => { e.preventDefault(); void register(); });
    restore();
  });
})();
