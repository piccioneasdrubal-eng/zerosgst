(() => {
  'use strict';

  const KEY = { mode:'zl_game_mode', settings:'zl_user_settings', stats:'zl_local_stats' };
  const DEFAULTS = {
    showNames:true, showMass:true, showMinimap:true, showHud:true, showGrid:true, lowGraphics:false,
    smoothCamera:true, autoReconnect:true, sfx:true, threeD:true, wheelZoom:true,
    showPellets:true, showPowerups:true, showZones:true, showEffects:true, showShadows:true,
    showGlow:true, showDamage:true, showKillfeed:true, showLeaderboard:true, showChat:true, showTimer:true,
    pauseOnMenu:true, screenShake:true, particleQuality:2, effectQuality:2, zoomSpeed:1.2, zoomMin:0.45, zoomMax:2.6,
    cameraFollow:true, mouseSensitivity:1, invertZoom:false, lockZoom:false, fpsLimit:60, nameScale:1, massScale:1,
    uiScale:1, colorblind:false, highContrast:false, reducedMotion:false, teamColors:true, enemyOutline:true,
    friendlyOutline:true, arenaBorder:true, centerMarker:false, crosshair:false, aimLine:false, autoHideChat:false,
    fullscreenOnPlay:false, touchControls:true, autoRespawn:true, fastRestart:true, spawnProtection:true, autoSpectate:false,
    cameraCenter:true, showBackground:true, showVignette:true, showMiniPlayers:true, showOwnTrail:false,
    chatFilter:true, confirmPurchases:true, confirmActions:true, soundUi:true, soundGameplay:true, music:false,
    muteAll:false, menuBlur:true, compactHud:false, dynamicQuality:true, networkStats:false, pingMeter:true,
    showFps:true, showCoords:false, safeZoneWarnings:true, autoSave:true, rememberTab:true, rememberServer:true,
    preventAccidentalExit:true, keyboardHints:true, accessibilityMode:false, colorTheme:'neon', mode:'ffa'
  };

  const F = [
    ['play','Gioca ora','action'],['restart','Riavvia partita','action'],['godMode','God Mode 10s','action'],['spectate','Spettatore','action'],['fullscreen','Schermo intero','action'],['serverHealth','Controlla server','action'],
    ['modeFFA','Modalità FFA','action'],['modeTeams','Modalità Squadre','action'],['quickSplit','Split rapido','action'],['quickFeed','Feed rapido','action'],['quickVirus','Virus rapido','action'],
    ['wallet','Wallet','action'],['catalog','Catalogo Shop','action'],['inventory','Inventario','action'],['history','Storico acquisti','action'],['quests','Missioni','action'],
    ['daily','Ricompensa giornaliera','action'],['starter','Starter Gift','action'],['coinBoost','x2 Coins','action'],['buyGalaxy','Compra Galaxy','action'],['buyCyber','Compra Cyber','action'],
    ['buySpeed','Compra Speed Boost','action'],['buyMass','Compra Mass Boost','action'],['buyShield','Compra Shield Pack','action'],['buyBadge','Compra Bounty Badge','action'],['equipGalaxy','Equipaggia Galaxy','action'],
    ['equipCyber','Equipaggia Cyber','action'],['defaultSkin','Skin Default','action'],['uploadSkin','Carica skin','action'],['claimKills3','Riscatta 3 Kill','action'],['claimKills10','Riscatta 10 Kill','action'],
    ['pvpMark','PvP Mark','action'],['pvpHunter','PvP Hunter','action'],['pvpParry','PvP Parry','action'],['pvpStun','PvP Stun','action'],['pvpSlow','PvP Slow','action'],
    ['pvpKnockback','PvP Knockback','action'],['pvpTrap','PvP Trappola','action'],['pvpMine','PvP Mina','action'],['pvpLifesteal','PvP Lifesteal','action'],['pvpExecute','PvP Esecuzione','action'],
    ['pvpShieldbreak','PvP Rompi Scudo','action'],['pvpDuel','PvP Sfida','action'],['pvpDuelCancel','Annulla Duello','action'],['pvpArenaIn','Entra Arena','action'],['pvpArenaOut','Esci Arena','action'],
    ['adminList','Admin: Lista','action'],['adminGet','Admin: Get Player','action'],['adminKick','Admin: Kick','action'],['adminBan','Admin: Ban','action'],['adminUnban','Admin: Unban','action'],
    ['adminMute','Admin: Mute','action'],['adminUnmute','Admin: Unmute','action'],['adminFreeze','Admin: Freeze','action'],['adminUnfreeze','Admin: Unfreeze','action'],['adminMass','Admin: Massa','action'],
    ['adminCoins','Admin: Coins','action'],['adminTeleport','Admin: Teleport','action'],['adminHeal','Admin: Heal','action'],['adminKill','Admin: Kill','action'],['adminRespawn','Admin: Respawn','action'],
    ['adminTeam','Admin: Team','action'],['adminColor','Admin: Color','action'],['adminBroadcast','Admin: Broadcast','action'],['adminClear','Admin: Clear Events','action'],['adminSpawnBots','Admin: Spawn Bot','action'],
    ['adminRemoveBots','Admin: Remove Bot','action'],['adminPause','Admin: Pause','action'],['adminResume','Admin: Resume','action'],['adminReset','Admin: Reset Match','action'],['season','Classifica stagione','action'],
    ['saveSettings','Salva impostazioni','action'],['resetSettings','Ripristina impostazioni','action'],['copyId','Copia ID account','action'],['profileReload','Aggiorna profilo','action'],['openHelp','Aiuto comandi','action'],
    ['showNames','Mostra nomi','toggle'],['showMass','Mostra massa','toggle'],['showMinimap','Mostra minimappa','toggle'],['showHud','Mostra HUD','toggle'],['showGrid','Mostra griglia','toggle'],
    ['threeD','Grafica 3D','toggle'],['lowGraphics','Grafica leggera','toggle'],['smoothCamera','Camera fluida','toggle'],['autoReconnect','Riconnessione automatica','toggle'],['sfx','Effetti sonori','toggle'],
    ['wheelZoom','Zoom rotellina','toggle'],['showEffects','Effetti visivi','toggle'],['showShadows','Ombre cellule','toggle'],['showGlow','Glow cellule','toggle'],['showDamage','Numeri danno','toggle'],
    ['showKillfeed','Kill feed','toggle'],['showLeaderboard','Leaderboard','toggle'],['showChat','Chat','toggle'],['showTimer','Timer','toggle'],['screenShake','Screen shake','toggle'],
    ['showPellets','Mostra pellet','toggle'],['showPowerups','Mostra power-up','toggle'],['showZones','Mostra zone','toggle'],['arenaBorder','Bordo arena','toggle'],['teamColors','Colori squadra','toggle'],
    ['enemyOutline','Contorno nemici','toggle'],['friendlyOutline','Contorno alleati','toggle'],['centerMarker','Marker centrale','toggle'],['crosshair','Crosshair','toggle'],['aimLine','Linea mira','toggle'],
    ['autoRespawn','Auto respawn','toggle'],['fastRestart','Riavvio rapido','toggle'],['spawnProtection','Protezione spawn','toggle'],['autoSpectate','Spettatore automatico','toggle'],['chatFilter','Filtro chat','toggle'],
    ['autoHideChat','Nascondi chat automatica','toggle'],['dynamicQuality','Qualità dinamica','toggle'],['networkStats','Statistiche rete','toggle'],['pingMeter','Ping','toggle'],['showFps','FPS','toggle'],
    ['showCoords','Coordinate','toggle'],['safeZoneWarnings','Avvisi zona','toggle'],['autoSave','Auto Save','toggle'],['rememberTab','Ricorda scheda','toggle'],['keyboardHints','Suggerimenti tastiera','toggle'],
    ['pauseOnMenu','Pausa nel menu','toggle'],['fullscreenOnPlay','Fullscreen all’avvio','toggle'],['touchControls','Controlli touch','toggle'],['showBackground','Sfondo arena','toggle'],['showVignette','Vignetta','toggle'],
    ['reducedMotion','Movimento ridotto','toggle'],['highContrast','Contrasto alto','toggle'],['colorblind','Modalità daltonismo','toggle'],['menuBlur','Sfocatura menu','toggle'],['compactHud','HUD compatto','toggle'],
    ['confirmPurchases','Conferma acquisti','toggle'],['confirmActions','Conferma azioni','toggle'],['music','Musica','toggle'],['muteAll','Muto globale','toggle'],['accessibilityMode','Accessibilità','toggle']
  ];

  const F100 = F.slice(0, 100);

  const esc = s => String(s ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const $ = id => document.getElementById(id);
  const get = (k, fallback=null) => { try { const v=localStorage.getItem(k); return v===null?fallback:v; } catch(_) { return fallback; } };
  const set = (k,v) => { try { localStorage.setItem(k,v); } catch(_){} };
  let settings = loadSettings();
  function loadSettings(){ try{return {...DEFAULTS,...(JSON.parse(get(KEY.settings,'{}'))||{})};}catch(_){return {...DEFAULTS};} }
  function saveSettings(){ set(KEY.settings, JSON.stringify(settings)); window.dispatchEvent(new CustomEvent('zl-settings-changed',{detail:{...settings}})); try { window.ZLGame?.applySettings?.(settings); } catch(_){}; }
  function beep(freq=620,duration=45){ if(settings.muteAll||!settings.sfx)return; try{const AC=window.AudioContext||window.webkitAudioContext;if(!AC)return;const ac=beep.ac||(beep.ac=new AC());if(ac.state==='suspended')ac.resume().catch(()=>{});const o=ac.createOscillator(),g=ac.createGain();o.frequency.value=freq;o.type='sine';g.gain.value=.025;g.gain.exponentialRampToValueAtTime(.0001,ac.currentTime+duration/1000);o.connect(g);g.connect(ac.destination);o.start();o.stop(ac.currentTime+duration/1000);}catch(_){} }
  function user(){return window.ZLAuth?.getUser?.()||{};}
  function profile(){const u=user(); const s=u.stats||{}; const xp=Number(u.xp||0); const level=Math.max(1,Number(u.level||1)); const next=Number(u.next_level_xp||((level+1)*(level+1)*100)); const pct=Math.max(0,Math.min(100,Number(u.progress_pct??(xp/Math.max(1,next)*100))));return {...u,xp,level,coins:Number(u.coins||0),next,pct,stats:s};}
  function showTab(tab){document.querySelectorAll('.zl-tab-btn').forEach(b=>b.classList.toggle('active',b.dataset.tab===tab));document.querySelectorAll('.zl-tab-pane').forEach(p=>p.classList.toggle('active',p.dataset.pane===tab));set('zl_menu_tab',tab);render();}
  async function refreshProfile(){try{await window.ZLAuth?.refreshProfile?.();}catch(_){}render();}
  // Legacy compatibility for older menu builds.
  function refresh(){ return refreshProfile(); }
  function applyVisual(){document.documentElement.classList.toggle('zl-hide-grid',settings.showGrid===false);document.documentElement.classList.toggle('zl-hide-ui',settings.showHud===false);document.documentElement.classList.toggle('zl-hide-minimap',settings.showMinimap===false);document.documentElement.classList.toggle('zl-low-graphics',!!settings.lowGraphics);document.documentElement.classList.toggle('zl-reduced-motion',!!settings.reducedMotion);}
  function currentState(){return window.ZLGame?.getState?.()||{players:[],leaderboard:[]};}
  function nearestEnemy(){const me=window.ZLGame?.getMe?.();const id=window.ZLGame?.getMyId?.();if(!me)return null;let best=null,bd=Infinity;for(const p of currentState().players||[]){if(p.id===id||p.dead)continue;const c=p.cells?.[0];if(!c)continue;const d=Math.hypot(c.x-(me.cells?.[0]?.x||0),c.y-(me.cells?.[0]?.y||0));if(d<bd){bd=d;best=p;}}return best?.id||null;}
  async function authApi(action, extra={}){
    const token=window.ZLAuth?.getToken?.(); if(!token) throw new Error('Effettua il login.');
    const r=await fetch('/auth/auth.php',{method:'POST',headers:{'Content-Type':'application/json','Accept':'application/json'},body:JSON.stringify({action,token,...extra}),cache:'no-store'});
    const raw=await r.text(); let d={}; try{d=JSON.parse(raw)}catch(_){throw new Error(`Auth non JSON (HTTP ${r.status})`)}
    if(!r.ok||!d.ok) throw new Error(d.error||`Auth HTTP ${r.status}`);
    return d;
  }
  async function economyApi(action, extra = {}) {
    const token = window.ZLAuth?.getToken?.();
    if (!token) throw new Error('Effettua il login.');
    const body = { action, token, ...extra };
    if (body.itemId && !body.item_id) { body.item_id = body.itemId; delete body.itemId; }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 12000);
    try {
      const r = await fetch('/auth/economy.php', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify(body),
        cache: 'no-store',
        signal: controller.signal,
      });
      const raw = await r.text();
      let d = {};
      try { d = JSON.parse(raw); } catch (_) {
        throw new Error(`Economy non JSON (HTTP ${r.status})`);
      }
      if (!r.ok || !d.ok) throw new Error(String(d.error || `Economy HTTP ${r.status}`));
      return d;
    } catch (e) {
      if (e?.name === 'AbortError') throw new Error('Shop non risponde (timeout 12s).');
      throw e;
    } finally {
      clearTimeout(timer);
    }
  }

  async function shop(action,extra={}){
    const status=$('zl-menu-status'); if(status) status.textContent='⏳ '+action+'…';
    try{
      const map={wallet:'wallet',catalog:'catalog',inventory:'inventory',history:'history',buy:'purchase_item',purchase_item:'purchase_item',equip:'equip',unequip:'unequip'};
      const apiAction=map[action]||action;
      let d;
      if(action==='quests'){ d=await authApi('me'); }
      else if(action==='daily'){ d=await authApi('me'); }
      else if(action==='claimQuest'){ const mission=String(extra.questId||extra.mission||'').trim(); if(!mission) throw new Error('Missione non valida.'); d=await authApi('claim_daily',{mission}); }
      else { d=await economyApi(apiAction,extra); }
      if(d.wallet?.coins!=null){
        const u=window.ZLAuth?.getUser?.();
        if(u){
          u.coins=Number(d.wallet.coins);
          if(d.wallet.equippedSkin) u.equipped_skin=d.wallet.equippedSkin;
          if(Array.isArray(d.wallet.inventory)) u.inventory=d.wallet.inventory;
          try{localStorage.setItem('zl_auth_user',JSON.stringify(u));}catch(_){}
        }
      }
      try{ window.ZLGame?.syncWallet?.(); }catch(_){}
      if(status) status.textContent='✅ '+action+' completato.';
      try { await refreshProfile(); } catch (_) {}
      return d;
    }catch(e){ if(status)status.textContent='❌ '+(e?.message||'Errore shop'); return {ok:false,error:e?.message||'Errore shop'}; }
  }

  async function uploadCustomSkin(file, title = 'Skin personalizzata') {
    const MAX = 50 * 1024 * 1024, CHUNK = 512 * 1024;
    if (!(file instanceof File)) throw new Error('Seleziona un’immagine.');
    if (file.size > MAX) throw new Error("L'immagine supera il limite di 50 MB.");
    if (!/\.(gif|jpe?g|png|webp|avif|bmp)$/i.test(file.name)) throw new Error('Formato non supportato. Usa JPG, JPEG, PNG, GIF, WebP, AVIF o BMP.');
    const token = window.ZLAuth?.getToken?.(); if (!token) throw new Error('Accedi per caricare una skin.');
    const id = crypto?.getRandomValues ? [...crypto.getRandomValues(new Uint8Array(18))].map(x=>x.toString(16).padStart(2,'0')).join('') : `${Date.now()}${Math.random().toString(16).slice(2)}`;
    const total = Math.ceil(file.size/CHUNK); const status=$('zl-menu-status');
    for(let i=0;i<total;i++){
      const fd=new FormData(); fd.append('action','upload_chunk'); fd.append('token',token); fd.append('upload_id',id); fd.append('chunk_index',String(i)); fd.append('total_chunks',String(total)); fd.append('total_bytes',String(file.size)); fd.append('chunk',file.slice(i*CHUNK,Math.min(file.size,(i+1)*CHUNK)),`chunk-${i}.part`);
      const r=await fetch('/auth/skins.php',{method:'POST',body:fd,cache:'no-store'}); const raw=await r.text(); let d={}; try{d=JSON.parse(raw)}catch(_){throw new Error(`Upload HTTP ${r.status}`)}; if(!r.ok||!d.ok) throw new Error(d.error||`Chunk ${i+1} non riuscito`); if(status) status.textContent=`⏳ Upload ${Math.round((i+1)/total*100)}%`;
    }
    const r=await fetch('/auth/skins.php',{method:'POST',headers:{'Content-Type':'application/json','Accept':'application/json'},body:JSON.stringify({action:'finalize',token,upload_id:id,title:(title||file.name.replace(/\.[^.]+$/,'')).slice(0,64)}),cache:'no-store'});
    const raw=await r.text(); let d={}; try{d=JSON.parse(raw)}catch(_){throw new Error(`Finalizzazione HTTP ${r.status}`)}; if(!r.ok||!d.ok) throw new Error(d.error||`Finalizzazione fallita (HTTP ${r.status})`);
    if(status) status.textContent=`✅ Skin caricata: ${d.skin?.title||title}`; setTimeout(()=>loadMySkins?.(),0); return d.skin;
  }
  async function customUpload(){const i=$('zl-menu-skin-file');const title=$('zl-menu-skin-title')?.value?.trim();if(!i?.files?.[0]){toast('❌ Seleziona un’immagine.');return;} try{await uploadCustomSkin(i.files[0],title||i.files[0].name.replace(/\.[^.]+$/,''));beep(980,70);}catch(e){toast('❌ '+(e?.message||'Upload fallito'));}}  function assignKey(action){const btn=document.querySelector(`[data-key-action="${action}"]`); if(!btn)return;btn.textContent='Premi un tasto…';const handler=e=>{e.preventDefault();const key=e.code==='Space'?' ':String(e.key||'').toLowerCase();if(!key)return;let cfg={};try{cfg=JSON.parse(get('agarServerConfig','{}'))||{};}catch(_){}cfg.keybinds=cfg.keybinds||{split:' ',feed:'w',virus:'q',godmode:'g'};cfg.keybinds[action]=key;set('agarServerConfig',JSON.stringify(cfg));btn.textContent=key===' ' ? 'Space' : e.key;window.dispatchEvent(new Event('keybinds-changed'));saveSettings();window.removeEventListener('keydown',handler,true);beep(780,40);};window.addEventListener('keydown',handler,true);}
  function action(id){
    const map={
      play:()=>window.ZLGame?.start?.(), restart:()=>window.ZLGame?.restart?.(), spectate:()=>window.ZLGame?.send?.({type:'pvp',action:'spectate',targetId:nearestEnemy()}), fullscreen:()=>document.fullscreenElement?document.exitFullscreen?.():document.documentElement.requestFullscreen?.(), serverHealth:()=>checkHealth(), modeFFA:()=>{settings.mode='ffa';set(KEY.mode,'ffa');saveSettings();}, modeTeams:()=>{settings.mode='teams';set(KEY.mode,'teams');saveSettings();}, quickSplit:()=>window.ZLGame?.send?.({type:'split'}), quickFeed:()=>window.ZLGame?.send?.({type:'eject'}), quickVirus:()=>window.ZLGame?.send?.({type:'shoot-virus'}), godMode:()=>window.ZLGame?.send?.({type:'godmode'}),
      wallet:()=>shop('wallet'),catalog:()=>shop('catalog'),inventory:()=>shop('inventory'),history:()=>shop('history'),quests:()=>shop('quests'),daily:()=>shop('daily'),starter:()=>shop('buy',{itemId:'starter_bundle'}),coinBoost:()=>shop('buy',{itemId:'coin_boost_2x_60'}),buyGalaxy:()=>shop('buy',{itemId:'skin_galaxy'}),buyCyber:()=>shop('buy',{itemId:'skin_cyber'}),buySpeed:()=>shop('buy',{itemId:'boost_speed_60'}),buyMass:()=>shop('buy',{itemId:'boost_mass_60'}),buyShield:()=>shop('buy',{itemId:'shield_pack'}),buyBadge:()=>shop('buy',{itemId:'bounty_badge'}),equipGalaxy:()=>shop('equip',{itemId:'skin_galaxy'}),equipCyber:()=>shop('equip',{itemId:'skin_cyber'}),defaultSkin:()=>shop('unequip'),claimKills3:()=>shop('claimQuest',{questId:'kills3'}),claimKills10:()=>shop('claimQuest',{questId:'kills10'}),season:()=>document.getElementById('btn-season')?.click(),saveSettings:()=>{saveSettings();toast('✅ Impostazioni salvate');},resetSettings:()=>{settings={...DEFAULTS};saveSettings();render();},copyId:async()=>{const id=profile().id||'';try{await navigator.clipboard?.writeText(String(id));toast('✅ ID copiato');}catch(_){toast('ID: '+id)}},profileReload:()=>refreshProfile(),openHelp:()=>showTab('controls'),uploadSkin:()=>customUpload()
    };
    if(map[id]){beep(700,35);return map[id]();}
    if(id.startsWith('pvp')){const act={pvpMark:'mark',pvpHunter:'hunter',pvpParry:'parry',pvpStun:'stun',pvpSlow:'slow',pvpKnockback:'knockback',pvpTrap:'trap',pvpMine:'mine',pvpLifesteal:'lifesteal',pvpExecute:'execute',pvpShieldbreak:'shieldbreak',pvpDuel:'duel',pvpDuelCancel:'duelCancel',pvpArenaIn:'arenaIn',pvpArenaOut:'arenaOut'}[id]; return window.ZLGame?.send?.({type:'pvp',action:act,targetId:nearestEnemy()});}
    if(id.startsWith('admin')) return adminAction(id);
  }
  function toast(text){const s=$('zl-menu-status');if(s){s.textContent=text;clearTimeout(toast.t);toast.t=setTimeout(()=>s.textContent='',2200);}}
  async function checkHealth(){const s=$('zl-menu-health');const base=window.GAME_CONFIG?.GAME_SERVER_URL||get('gameServerUrl','');if(!base){if(s)s.textContent='⚪ Server non configurato';return;}const url=String(base).replace(/^ws/i,'http').replace(/\/$/,'')+'/healthz';if(s)s.textContent='⏳ controllo…';try{const t=performance.now();const r=await fetch(url,{cache:'no-store'});const ms=Math.round(performance.now()-t);const d=await r.json().catch(()=>({}));if(s)s.textContent=r.ok?`🟢 Online · ${ms} ms`:`🔴 HTTP ${r.status}`;}catch(_){if(s)s.textContent='🔴 Non raggiungibile';}}
  function adminPayload(id){const target=$('zl-admin-target')?.value?.trim()||'';const token=$('zl-admin-token')?.value||'';const value=$('zl-admin-value')?.value||'';const actionMap={adminList:'list',adminGet:'get',adminKick:'kick',adminBan:'ban',adminUnban:'unban',adminMute:'mute',adminUnmute:'unmute',adminFreeze:'freeze',adminUnfreeze:'unfreeze',adminMass:'setMass',adminCoins:'setCoins',adminTeleport:'teleport',adminHeal:'heal',adminKill:'kill',adminRespawn:'respawn',adminTeam:'setTeam',adminColor:'setColor',adminBroadcast:'broadcast',adminClear:'clearEvents',adminSpawnBots:'spawnBots',adminRemoveBots:'removeBots',adminPause:'pause',adminResume:'resume',adminReset:'resetMatch'};return {action:actionMap[id],token,target,value};}
  async function adminAction(id){
    const p=adminPayload(id); const token=window.ZLAuth?.getToken?.(); if(!token){toast('❌ Effettua il login come admin.');return;}
    try{
      if(window.ZLGame?.connected?.() && typeof window.ZLGame.admin==='function'){
        const d=await window.ZLGame.admin(p.action,{token,target:p.target,value:p.value});
        if(!d?.ok) throw new Error(d?.error||'Azione admin rifiutata.');
        toast('✅ '+p.action+' OK'); return d;
      }
      const base=String(window.GAME_CONFIG?.GAME_SERVER_URL||get('gameServerUrl','')).replace(/\/$/,'');
      if(!base) throw new Error('Server di gioco non configurato. Avvia una partita e riprova.');
      const url=base.replace(/^ws/i,'http').replace(/\/$/,'')+'/api/admin';
      const r=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json','Accept':'application/json'},body:JSON.stringify({token,...p}),cache:'no-store'});
      const raw=await r.text(); let d={}; try{d=JSON.parse(raw)}catch(_){throw new Error(`Admin non JSON (HTTP ${r.status})`)}
      if(!r.ok||!d.ok) throw new Error(d.error||`Admin HTTP ${r.status}`); toast('✅ '+p.action+' OK'); return d;
    }catch(e){toast('❌ '+(e?.message||'Errore admin'));return {ok:false,error:e?.message||'Errore admin'};}
  }
  function settingsRow(id,label){const v=settings[id];return `<button type="button" class="zl-setting-row" data-setting="${esc(id)}"><span>${esc(label)}</span><b class="${v?'on':''}">${v?'ON':'OFF'}</b></button>`;}
  function renderSettings(){const box=$('zl-all-settings');if(!box)return;box.innerHTML=F.filter(x=>x[2]==='toggle').map(x=>settingsRow(x[0],x[1])).join('');box.querySelectorAll('[data-setting]').forEach(b=>b.addEventListener('click',()=>{const id=b.dataset.setting;settings[id]=!settings[id];saveSettings();applyVisual();renderSettings();beep(640,25);}));}
  function renderControls(){const key=(()=>{try{return JSON.parse(get('agarServerConfig','{}')).keybinds||{};}catch(_){return {}}})();const box=$('zl-controls-list');if(!box)return;box.innerHTML=[['split','Split',key.split||' '],['feed','Feed',key.feed||'w'],['virus','Virus',key.virus||'q'],['godmode','God Mode',key.godmode||'g'],['sprint','Scatto','shift']].map(([k,l,v])=>`<div class="zl-key-row"><span>${l}</span><button type="button" data-key-action="${k}">${v===' ' ? 'Space':esc(v)}</button></div>`).join('');box.querySelectorAll('[data-key-action]').forEach(b=>b.addEventListener('click',()=>assignKey(b.dataset.keyAction)));}
  function render100(){const wrap=$('zl-function-list');if(!wrap)return;wrap.innerHTML=F100.map((x,i)=>{const [id,label,type]=x;return type==='toggle'?`<button type="button" class="zl-feature-card" data-f-id="${id}"><span>${String(i+1).padStart(3,'0')}</span><b>${esc(label)}</b><em class="${settings[id]?'on':''}">${settings[id]?'ON':'OFF'}</em></button>`:`<button type="button" class="zl-feature-card" data-f-id="${id}"><span>${String(i+1).padStart(3,'0')}</span><b>${esc(label)}</b><em>›</em></button>`;}).join('');wrap.querySelectorAll('[data-f-id]').forEach(b=>b.addEventListener('click',()=>{const id=b.dataset.fId;const def=F100.find(x=>x[0]===id);if(def?.[2]==='toggle'){settings[id]=!settings[id];saveSettings();applyVisual();render100();renderSettings();}else action(id);}));}
  function profileHtml(){const u=profile(),s=u.stats||{};const kd=s.deaths?(Number(s.kills||0)/Math.max(1,Number(s.deaths||0))).toFixed(2):String(Number(s.kills||0));return `<div class="zl-profile-head"><div class="zl-avatar">${esc(String(u.name||'P').slice(0,1).toUpperCase())}</div><div><h3>${esc(u.name||'Player')}</h3><p>${esc(u.email||'')}</p><small>${esc(String(u.role||'user').toUpperCase())} · ID ${Number(u.id)||0}</small></div></div><div class="zl-overview-grid"><div><small>💰 Coins</small><b>${Math.round(u.coins).toLocaleString('it-IT')}</b></div><div><small>⭐ Livello</small><b>${u.level}</b></div><div><small>✨ XP</small><b>${Math.round(u.xp).toLocaleString('it-IT')}</b></div><div><small>🏆 ELO</small><b>${Number(s.elo||1000)}</b></div></div><div class="zl-level"><div><b>Progressi livello</b><span>${Math.round(u.xp).toLocaleString('it-IT')} / ${Math.round(u.next).toLocaleString('it-IT')} XP</span></div><div class="zl-progress"><i style="width:${u.pct}%"></i></div><small>${Math.round(u.pct)}% · ${Math.max(0,Math.round(u.next-u.xp)).toLocaleString('it-IT')} XP al prossimo livello</small></div><div class="zl-stat-cards"><div><b>${s.matches||0}</b><small>Partite</small></div><div><b>${Math.round(s.bestMass||0)}</b><small>Max massa</small></div><div><b>${s.bestRank||'—'}</b><small>Miglior rank</small></div><div><b>${kd}</b><small>K/D</small></div><div><b>${s.kills||0}</b><small>Kill</small></div><div><b>${s.deaths||0}</b><small>Morti</small></div></div><div class="zl-section"><h3>🎯 Missioni</h3><p class="zl-note">Apri la scheda Shop → Missioni per riscattare i premi.</p></div>`;}
  function build(){
    const btn=document.createElement('button');btn.id='zl-user-btn';btn.type='button';btn.innerHTML='👤 <span>Profilo</span>';document.body.appendChild(btn);
    const overlay=document.createElement('div');overlay.id='zl-user-overlay';overlay.innerHTML=`<div class="zl-user-modal" role="dialog" aria-modal="true"><div class="zl-user-top"><div><small>ZEROLEGEND</small><h2>Menu Utente</h2></div><button id="zl-user-close" class="zl-icon-btn">✕</button></div><div class="zl-tabs"><button class="zl-tab-btn active" data-tab="profile">👤 Profilo</button><button class="zl-tab-btn" data-tab="play">🎮 Gioca</button><button class="zl-tab-btn" data-tab="shop">🛒 Shop</button><button class="zl-tab-btn" data-tab="settings">⚙ Impostazioni</button><button class="zl-tab-btn" data-tab="language">🌐 Lingua</button><button class="zl-tab-btn" data-tab="controls">⌨ Controlli</button><button class="zl-tab-btn" data-tab="graphics">🎨 Grafica</button><button class="zl-tab-btn" data-tab="audio">🔊 Audio</button><button class="zl-tab-btn" data-tab="functions">⚡ 100 Funzioni</button><button class="zl-tab-btn" data-tab="admin">🛡 Admin/Staff</button></div><div class="zl-account-strip"><div><span>💰 Coins</span><b id="zl-head-coins">0</b></div><div><span>⭐ Livello</span><b id="zl-head-level">1</b></div><div><span>✨ XP</span><b id="zl-head-xp">0</b></div><div class="zl-account-xp"><div><span>Progressi</span><b id="zl-head-xp-label">0 / 100</b></div><div class="zl-head-progress"><i id="zl-head-progress-bar"></i></div><small id="zl-head-next">—</small></div></div><div class="zl-tab-pane active" data-pane="profile"><div id="zl-profile-view"></div><div class="zl-actions"><button data-open-tab="shop">🛒 Shop</button><button data-open-tab="settings">⚙ Impostazioni</button><button data-open-tab="functions">⚡ 100 Funzioni</button><button id="zl-logout">🚪 Esci</button></div></div><div class="zl-tab-pane" data-pane="play"><h3>🎮 Partita</h3><div class="zl-modes"><button data-mode="ffa" class="zl-mode-btn">🌐 FFA<small>Tutti contro tutti</small></button><button data-mode="teams" class="zl-mode-btn">🛡 Squadre<small>Squadre bilanciate</small></button></div><div class="zl-quick-grid"><button data-action-id="play">▶ Gioca</button><button data-action-id="restart">🔄 Riavvia</button><button data-action-id="spectate">👁 Spettatore</button><button data-action-id="fullscreen">⛶ Fullscreen</button><button data-action-id="godMode">🛡 God Mode · 10s</button></div><div id="zl-menu-health" class="zl-health">⚪ Server</div></div><div class="zl-tab-pane" data-pane="shop"><h3>🛒 ZeroShop</h3><div class="zl-shop-grid"><button data-action-id="buyGalaxy">🌌 Galaxy<small>300 ZC</small></button><button data-action-id="buyCyber">⚡ Cyber<small>500 ZC</small></button><button data-action-id="buySpeed">🚀 Speed Boost<small>200 ZC</small></button><button data-action-id="buyMass">🥩 Mass Boost<small>400 ZC</small></button><button data-action-id="buyShield">🛡 Shield Pack<small>250 ZC</small></button><button data-action-id="buyBadge">🏹 Bounty Badge<small>350 ZC</small></button></div><div class="zl-coin-packages"><button data-coin-package="zc_1000"><b>1.000 ZC</b><small>€0,99</small></button><button data-coin-package="zc_5500"><b>5.500 ZC</b><small>€4,99</small></button><button data-coin-package="zc_12000"><b>12.000 ZC</b><small>€9,99</small></button><button data-coin-package="zc_30000"><b>30.000 ZC</b><small>€19,99</small></button></div><div class="zl-actions"><button data-action-id="wallet">💰 Wallet</button><button data-action-id="inventory">🎒 Inventario</button><button data-action-id="quests">🎯 Missioni</button><button data-action-id="daily">🎁 Daily</button><button data-action-id="history">📜 Storico</button></div></div><div class="zl-tab-pane" data-pane="settings"><h3>⚙ Tutte le impostazioni</h3><div id="zl-all-settings"></div><button id="zl-reset-settings" class="zl-secondary">↩ Ripristina tutto</button></div><div class="zl-tab-pane" data-pane="language"><h3>🌐 <span data-i18n="Lingua">Lingua</span></h3><div class="zl-language-box"><div class="zl-language-head"><div><b data-i18n="Scegli la lingua del gioco">Scegli la lingua del gioco</b><small>659+ lingue disponibili</small></div><select id="zl-language-main" class="zl-language-select"></select></div><p class="zl-note" data-i18n="Traduzione completa interfaccia">Traduzione completa interfaccia</p></div></div><div class="zl-tab-pane" data-pane="controls"><h3>⌨ Controlli e Keybind</h3><div id="zl-controls-list"></div><div class="zl-note">Clicca un comando e premi il tasto desiderato. Il salvataggio è automatico.</div><div class="zl-upload-row"><input id="zl-menu-skin-file" type="file" accept="image/jpeg,image/png,image/gif,image/webp,image/avif,image/bmp"><input id="zl-menu-skin-title" type="text" placeholder="Nome skin"><button data-action-id="uploadSkin">🖼️ Carica skin</button></div></div><div class="zl-tab-pane" data-pane="graphics"><h3>🎨 Grafica avanzata</h3><div class="zl-setting-control"><label>Zoom <input id="zl-zoom-range" type="range" min="0.45" max="2.6" step="0.05" value="1"></label></div><p class="zl-note">Usa la rotellina del mouse per lo zoom durante la partita. Le opzioni di qualità sono nella scheda Impostazioni.</p><div class="zl-detail-grid"><div><b>3D</b><small>Profondità e highlight</small></div><div><b>Glow</b><small>Effetti luminosi</small></div><div><b>Ombre</b><small>Contorni dinamici</small></div><div><b>Vignetta</b><small>Effetto arena</small></div></div></div><div class="zl-tab-pane" data-pane="audio"><h3>🔊 Audio</h3><div id="zl-audio-settings"></div><div class="zl-note">I suoni vengono generati nel browser dopo un'interazione dell'utente.</div></div><div class="zl-tab-pane" data-pane="functions"><h3>⚡ 100 Funzioni</h3><p class="zl-note">Tutte le funzioni sono raccolte qui in un unico pannello.</p><div id="zl-function-list" class="zl-function-grid"></div></div><div class="zl-tab-pane" data-pane="admin"><h3>🛡 Admin / Staff</h3><input id="zl-admin-token" type="password" placeholder="ADMIN_TOKEN (solo fallback)"><input id="zl-admin-target" type="text" placeholder="Player ID / nome"><input id="zl-admin-value" type="text" placeholder="Valore opzionale"><div id="zl-admin-grid" class="zl-function-grid"></div><p class="zl-note">Le azioni Admin vengono verificate dal server.</p></div><div id="zl-menu-status" class="zl-menu-status"></div></div>`;document.body.appendChild(overlay);
    const open=()=>{overlay.classList.add('open');document.documentElement.classList.add('zl-user-menu-open');showTab(get('zl_menu_tab','profile'));refreshProfile();renderControls();render100();renderSettings();checkHealth();};
    const close=()=>{overlay.classList.remove('open');document.documentElement.classList.remove('zl-user-menu-open');};
    btn.addEventListener('click',open);$('zl-user-close').addEventListener('click',close);overlay.addEventListener('click',e=>{if(e.target===overlay)close();});
    document.addEventListener('keydown',e=>{if(e.key==='Escape'){e.preventDefault();overlay.classList.contains('open')?close():open();}},true);
    overlay.querySelectorAll('.zl-tab-btn').forEach(b=>b.addEventListener('click',()=>showTab(b.dataset.tab)));overlay.querySelectorAll('[data-open-tab]').forEach(b=>b.addEventListener('click',()=>showTab(b.dataset.openTab)));
    overlay.addEventListener('click',e=>{const b=e.target.closest('[data-action-id]');if(b){action(b.dataset.actionId);}});
    overlay.querySelectorAll('[data-coin-package]').forEach(b=>b.addEventListener('click',()=>window.ZLUserMenu?.buyCoins?.(b.dataset.coinPackage)));
    overlay.querySelectorAll('.zl-mode-btn').forEach(b=>b.addEventListener('click',()=>{settings.mode=b.dataset.mode;set(KEY.mode,b.dataset.mode);saveSettings();refreshProfile();}));
    $('zl-reset-settings').addEventListener('click',()=>{settings={...DEFAULTS};saveSettings();applyVisual();renderSettings();render100();});$('zl-logout').addEventListener('click',()=>window.ZLAuth?.logout?.());
    $('zl-zoom-range').addEventListener('input',e=>{try{window.ZLGame?.setUserZoom?.(Number(e.target.value));}catch(_){}});
    // Admin grid: 26 actions from the existing server-side feature set
    const adminIds=['adminList','adminGet','adminKick','adminBan','adminUnban','adminMute','adminUnmute','adminFreeze','adminUnfreeze','adminMass','adminCoins','adminTeleport','adminHeal','adminKill','adminRespawn','adminTeam','adminColor','adminBroadcast','adminClear','adminSpawnBots','adminRemoveBots','adminPause','adminResume','adminReset'];
    const ag=$('zl-admin-grid');if(ag){ag.innerHTML=F.filter(x=>adminIds.includes(x[0])).map(x=>`<button class="zl-feature-card" data-action-id="${x[0]}"><span>⚙</span><b>${x[1]}</b><em>›</em></button>`).join('');}
    // audio toggles
    const aud=$('zl-audio-settings');if(aud)aud.innerHTML=[['sfx','Effetti sonori'],['soundUi','Suoni UI'],['soundGameplay','Suoni gameplay'],['music','Musica'],['muteAll','Muto globale']].map(x=>settingsRow(x[0],x[1])).join('');aud.querySelectorAll('[data-setting]').forEach(b=>b.addEventListener('click',()=>{settings[b.dataset.setting]=!settings[b.dataset.setting];saveSettings();aud.innerHTML=[['sfx','Effetti sonori'],['soundUi','Suoni UI'],['soundGameplay','Suoni gameplay'],['music','Musica'],['muteAll','Muto globale']].map(x=>settingsRow(x[0],x[1])).join('');beep(640,25);}));
    applyVisual();refreshProfile();
  }
  async function loadMySkins(){
    const box=$('zl-profile-view'); if(!box) return; const token=window.ZLAuth?.getToken?.(); if(!token) return;
    try{
      const r=await fetch('/auth/skins.php',{method:'POST',headers:{'Content-Type':'application/json','Accept':'application/json'},body:JSON.stringify({action:'list',token}),cache:'no-store'}); const d=await r.json(); if(!d.ok) return;
      const skins=Array.isArray(d.skins)?d.skins:[]; let el=box.querySelector('.zl-my-skins'); if(!el){el=document.createElement('div');el.className='zl-my-skins';box.appendChild(el);}
      el.innerHTML='<h3>🎨 Le mie skin</h3>' + (skins.length?`<div class="zl-skins-grid">${skins.map(x=>`<div class="zl-skin-card"><img src="${esc(x.url||'')}" alt="${esc(x.title)}"><b>${esc(x.title)}</b><small>${esc(x.mime||'')}</small>${x.equipped?'<strong>✓ IN USO</strong>':`<button type="button" data-equip-skin="${Number(x.id)}">USA SKIN</button>`}</div>`).join('')}</div>`:'<p class="zl-note">Nessuna skin caricata.</p>');
      el.querySelectorAll('[data-equip-skin]').forEach(b=>b.addEventListener('click',async()=>{try{const rr=await fetch('/auth/skins.php',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'equip',token,id:Number(b.dataset.equipSkin)})});const dd=await rr.json();if(!dd.ok)throw new Error(dd.error||'Equip fallito');toast('✅ Skin equipaggiata'); if(dd.skin?.url) window.ZLGame?.applyCustomSkin?.(dd.skin.url,dd.skin.mime||'',dd.skin.title||''); await refreshProfile(); window.ZLGame?.syncSkin?.();}catch(e){toast('❌ '+(e.message||'Errore'));}}));
    }catch(_){ }
  }
  function render(){const u=profile();$('zl-profile-view')?.replaceChildren(Object.assign(document.createElement('div'),{innerHTML:profileHtml()}));const c=$('zl-head-coins');if(c)c.textContent=Math.round(u.coins).toLocaleString('it-IT');const l=$('zl-head-level');if(l)l.textContent=u.level;const x=$('zl-head-xp');if(x)x.textContent=Math.round(u.xp).toLocaleString('it-IT');const lab=$('zl-head-xp-label');if(lab)lab.textContent=`${Math.round(u.xp).toLocaleString('it-IT')} / ${Math.round(u.next).toLocaleString('it-IT')}`;const bar=$('zl-head-progress-bar');if(bar)bar.style.width=u.pct+'%';const nxt=$('zl-head-next');if(nxt)nxt.textContent=`${Math.max(0,Math.round(u.next-u.xp)).toLocaleString('it-IT')} XP al prossimo livello`;applyVisual(); loadMySkins();}
  window.ZLUserMenu={open:()=>document.getElementById('zl-user-btn')?.click(),close:()=>document.getElementById('zl-user-close')?.click(),purchaseItem:(itemId)=>shop('buy',{itemId}),uploadSkin:async(file,title)=>{if(window.ZLCustomSkin?.upload)return window.ZLCustomSkin.upload(file,title);return null;},buyCoins:async(id)=>{const token=window.ZLAuth?.getToken?.();if(!token){toast('❌ Effettua il login.');return;}try{const r=await fetch('/payments/create-checkout.php',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token,package:id})});const d=await r.json();if(!r.ok||!d.ok)throw new Error(d.error||`HTTP ${r.status}`);location.href=d.url;}catch(e){toast('❌ '+(e?.message||'Pagamento non disponibile'));}},refresh:refreshProfile,settings:()=>showTab('settings'),profile:()=>showTab('profile')};
  document.addEventListener('DOMContentLoaded',build,{once:true});
})();
