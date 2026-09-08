(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const API = '/portal-api.php';
  const toast = m => { const t=$('toast'); if(!t)return; t.textContent=m; t.classList.add('show'); clearTimeout(window.__zt); window.__zt=setTimeout(()=>t.classList.remove('show'),2600); };
  async function api(action, payload={}) {
    const token = window.ZLAuth?.getToken?.() || '';
    const r = await fetch(API,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,token,...payload}),cache:'no-store'});
    const d=await r.json().catch(()=>({ok:false,error:'Risposta non valida'})); if(!r.ok||!d.ok) throw new Error(d.error||`HTTP ${r.status}`); return d;
  }
  const money=n=>Number(n||0).toLocaleString('it-IT');
  function renderProfile(d){ const u=d.user,p=d.profile; $('profileName').textContent=u.name; $('profileEmail').textContent=u.email; $('avatar').textContent=(u.name||'Z').slice(0,1).toUpperCase(); $('heroLevel').textContent=p.level; $('heroCoins').textContent=money(p.coins); $('heroGames').textContent=p.games_played; $('statCoins').textContent=money(p.coins); $('statGames').textContent=p.games_played; $('statKills').textContent=p.kills; $('statBestMass').textContent=p.best_mass; $('statElo').textContent=p.elo; const sc=$('shopCoins'); if(sc) sc.textContent=money(p.coins); const need=p.level*100; $('xpText').textContent=`${p.xp%100} / ${need} XP`; $('levelText').textContent=`Lv. ${p.level}`; $('xpBar').style.width=`${Math.min(100,(p.xp%100)/need*100)}%`; }
  async function loadProfile(){ try{const d=await api('profile'); renderProfile(d); $('account')?.classList.remove('hidden'); $('authCard')?.classList.add('hidden'); $('logoutBtn')?.classList.remove('hidden'); const as=$('authStatus'); if(as) as.textContent=`Connesso come ${d.user.name}`;}catch(_){ $('account')?.classList.add('hidden'); $('authCard')?.classList.remove('hidden'); $('logoutBtn')?.classList.add('hidden'); const as=$('authStatus'); if(as) as.textContent='Non autenticato'; } }
  async function loadShop(){
    if(!$('shopGrid')) return;
    try{
      const token = window.ZLAuth?.getToken?.();
      if(!token) throw new Error('Effettua il login.');
      async function economy(action, extra={}){
        const r = await fetch('/auth/economy.php',{
          method:'POST',
          headers:{'Content-Type':'application/json','Accept':'application/json'},
          body:JSON.stringify({action,token,...extra}),
          cache:'no-store'
        });
        const d = await r.json().catch(()=>({ok:false,error:'Risposta non valida'}));
        if(!r.ok || !d.ok) throw new Error(d.error || `HTTP ${r.status}`);
        return d;
      }
      const [cat, inv, wal] = await Promise.all([
        economy('catalog'),
        economy('inventory'),
        economy('wallet')
      ]);
      const inventory = Array.isArray(inv.wallet?.inventory) ? inv.wallet.inventory : [];
      const equipped = String(wal.wallet?.equippedSkin || 'default');
      const counts = new Map();
      for(const item of inventory) counts.set(item,(counts.get(item)||0)+1);
      const catalog = Object.entries(cat.catalog || {}).map(([item_id,item])=>({item_id,...item}));
      const sc=$('shopCoins');
      if(sc) sc.textContent=money(wal.wallet?.coins || 0);
      $('shopGrid').innerHTML = catalog.map(i=>{
        const qty=counts.get(i.item_id)||0;
        const isSkin=i.type==='skin';
        const isEquipped=equipped===i.item_id || (i.item_id==='skin_default' && equipped==='default');
        return `<article class="shop-item">
          <div class="tag">${i.type || 'item'}</div>
          <h3>${i.name}</h3>
          <p class="muted">Acquistabile con ZeroCoins</p>
          <div class="price">🪙 ${money(i.price)}</div>
          <button class="secondary-btn buy" data-key="${i.item_id}" ${isSkin && qty ? 'disabled':''}>${isSkin && qty ? `Posseduto x${qty}` : 'Acquista'}</button>
          ${isSkin && qty ? `<button class="secondary-btn equip" data-key="${i.item_id}">${isEquipped?'✅ Equipaggiato':'Equipaggia'}</button>`:''}
        </article>`;
      }).join('');
      document.querySelectorAll('#shopGrid .buy').forEach(b=>b.onclick=async()=>{
        try{
          await economy('purchase_item',{item_id:b.dataset.key});
          toast('✅ Acquisto completato');
          await loadShop();
        }catch(e){ toast('❌ '+e.message); }
      });
      document.querySelectorAll('#shopGrid .equip').forEach(b=>b.onclick=async()=>{
        try{
          await economy('equip',{item_id:b.dataset.key});
          toast('✅ Oggetto equipaggiato');
          await loadShop();
        }catch(e){ toast('❌ '+e.message); }
      });
    }catch(e){ toast('❌ '+e.message); }
  }
  async function loadLeaderboard(){ try{const d=await api('leaderboard');$('leaderboard').innerHTML=d.rows.length?d.rows.map((r,i)=>`<div class="leader-row"><span>${i+1}</span><span>${r.full_name} · Lv.${r.level}</span><b>${r.elo} ELO</b></div>`).join(''):'<div class="muted">Nessun giocatore ancora.</div>';}catch(_){$('leaderboard').innerHTML='<div class="muted">Accedi per vedere la classifica.</div>';} }
  function setupTabs(){document.querySelectorAll('.auth-tab').forEach(b=>b.onclick=()=>{document.querySelectorAll('.auth-tab').forEach(x=>x.classList.remove('active'));b.classList.add('active');const reg=b.dataset.tab==='register';$('loginForm').classList.toggle('hidden',reg);$('registerForm').classList.toggle('hidden',!reg);});}
  $('logoutBtn')?.addEventListener('click',()=>window.ZLAuth?.logout?.()); $('openProfile')?.addEventListener('click',()=>{$('profileModal')?.classList.remove('hidden');const d=window.ZLAuth.getUser()||{};const pd=$('profileDetail');if(pd)pd.innerHTML=`<p><b>${d.name||'Giocatore'}</b><br>${d.email||''}</p><p>Il profilo completo e lo stato Coins sono sincronizzati con il database.</p>`}); document.querySelectorAll('[data-close]').forEach(b=>b.onclick=()=>$('profileModal')?.classList.add('hidden')); $('heroShopBtn')?.addEventListener('click',()=>document.querySelector('#shop')?.scrollIntoView({behavior:'smooth'})); $('dailyBtn')?.addEventListener('click',async()=>{try{const d=await api('daily');toast(`🎁 +${d.reward} Coins`);renderProfile({user:window.ZLAuth.getUser(),profile:d.profile});}catch(e){toast('❌ '+e.message)}});
  window.addEventListener('auth-changed',()=>{loadProfile();loadShop();loadLeaderboard();}); document.addEventListener('DOMContentLoaded',()=>{setupTabs();setTimeout(()=>{loadProfile();loadShop();loadLeaderboard();},80);});
})();
