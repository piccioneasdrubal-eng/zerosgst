(() => {
  'use strict';

  const STORAGE_KEY = 'zl_language';
  const SOURCE = 'it';
  const CACHE_KEY = 'zl_translation_cache_v2';

  const LANGS = [
    ['it','🇮🇹','Italiano'],['en','🇬🇧','English'],['es','🇪🇸','Español'],['fr','🇫🇷','Français'],
    ['de','🇩🇪','Deutsch'],['pt','🇵🇹','Português'],['ru','🇷🇺','Русский'],['zh','🇨🇳','中文'],
    ['ja','🇯🇵','日本語'],['ko','🇰🇷','한국어'],['ar','🇸🇦','العربية'],['tr','🇹🇷','Türkçe'],
    ['hi','🇮🇳','हिन्दी'],['pl','🇵🇱','Polski'],['nl','🇳🇱','Nederlands'],['sv','🇸🇪','Svenska'],
    ['da','🇩🇰','Dansk'],['fi','🇫🇮','Suomi'],['cs','🇨🇿','Čeština'],['el','🇬🇷','Ελληνικά'],
    ['ro','🇷🇴','Română'],['uk','🇺🇦','Українська'],['vi','🇻🇳','Tiếng Việt'],['id','🇮🇩','Bahasa Indonesia'],
    ['th','🇹🇭','ไทย'],['he','🇮🇱','עברית'],['no','🇳🇴','Norsk'],['hu','🇭🇺','Magyar'],
    ['sk','🇸🇰','Slovenčina'],['bg','🇧🇬','Български'],['hr','🇭🇷','Hrvatski'],['sr','🇷🇸','Српски'],
    ['sl','🇸🇮','Slovenščina'],['et','🇪🇪','Eesti'],['lv','🇱🇻','Latviešu'],['lt','🇱🇹','Lietuvių'],
    ['fa','🇮🇷','فارسی'],['ur','🇵🇰','اردو'],['bn','🇧🇩','বাংলা'],['ta','🇮🇳','தமிழ்'],
    ['te','🇮🇳','తెలుగు'],['mr','🇮🇳','मराठी'],['ms','🇲🇾','Bahasa Melayu'],['sw','🇹🇿','Kiswahili'],
    ['ca','🇪🇸','Català'],['eu','🇪🇸','Euskara'],['gl','🇪🇸','Galego'],['cy','🇬🇧','Cymraeg'],
    ['af','🇿🇦','Afrikaans'],['sq','🇦🇱','Shqip'],['is','🇮🇸','Íslenska'],['ga','🇮🇪','Gaeilge']
  ];

  // Further language identifiers: they remain selectable and use online translation as fallback.
  const EXTRA = [
    'ab','aa','ak','am','as','az','be','bs','br','co','eo','hy','ka','kk','km','kn','ky','lo','mk','ml','mn','my','ne','pa','si','tg','tk','uz','yo','zu','fy','gd','fo','mt','jv','ceb','ht','la','lb','sw','xh','ig','ha','rw','so','ps','ku','ckb'
  ];
  const FLAGS = Object.fromEntries(LANGS.map(([c,f]) => [c,f]));
  Object.assign(FLAGS,{ab:'🇬🇪',aa:'🇪🇹',ak:'🇬🇭',am:'🇪🇹',as:'🇮🇳',az:'🇦🇿',be:'🇧🇾',bs:'🇧🇦',br:'🇫🇷',co:'🇫🇷',eo:'🌐',hy:'🇦🇲',ka:'🇬🇪',kk:'🇰🇿',km:'🇰🇭',kn:'🇮🇳',ky:'🇰🇬',lo:'🇱🇦',mk:'🇲🇰',ml:'🇮🇳',mn:'🇲🇳',my:'🇲🇲',ne:'🇳🇵',pa:'🇮🇳',si:'🇱🇰',tg:'🇹🇯',tk:'🇹🇲',uz:'🇺🇿',yo:'🇳🇬',zu:'🇿🇦',jv:'🇮🇩',ceb:'🇵🇭',ht:'🇭🇹',la:'🏛️',lb:'🇱🇺',xh:'🇿🇦',ig:'🇳🇬',ha:'🇳🇬',rw:'🇷🇼',so:'🇸🇴',ps:'🇦🇫',ku:'🌐',ckb:'🌐'});

  const NAME_BY_CODE = Object.fromEntries(LANGS.map(([c,_f,n]) => [c,n]));
  const PAIR = {};
  const add = (lang, obj) => { PAIR[lang] = Object.assign(PAIR[lang] || {}, obj); };

  const base = {
    'Menu Utente':'User Menu','Profilo':'Profile','Gioca':'Play','Shop':'Shop','Statistiche':'Statistics','Impostazioni':'Settings',
    'Controlli':'Controls','Grafica':'Graphics','Audio':'Audio','Lingua':'Language','100 Funzioni':'100 Functions','Admin/Staff':'Admin/Staff',
    'Gioca ora':'Play now','Riavvia partita':'Restart game','Spettatore':'Spectator','Schermo intero':'Fullscreen','Controlla server':'Check server',
    'Modalità FFA':'FFA Mode','Modalità Squadre':'Team Mode','Wallet':'Wallet','Catalogo':'Catalog','Inventario':'Inventory','Storico':'History',
    'Missioni':'Quests','Daily':'Daily','Ricompensa giornaliera':'Daily reward','Starter Gift':'Starter Gift','x2 Coins':'x2 Coins',
    'Classifica':'Leaderboard','Classifica stagione':'Season leaderboard','Carica skin':'Upload skin','Le mie skin':'My skins','Usa skin':'Use skin',
    'In uso':'In use','Usa default':'Use default','Nome skin':'Skin name','Formato':'Format','Dimensione':'Size','Scegli la lingua del gioco':'Choose game language',
    'Traduzione completa interfaccia':'Translate the whole interface','Seleziona lingua':'Select language','Tutti contro tutti':'Free-for-all','Squadre bilanciate':'Balanced teams',
    'Mostra nomi':'Show names','Mostra massa':'Show mass','Mostra minimappa':'Show minimap','Mostra HUD':'Show HUD','Mostra griglia':'Show grid',
    'Grafica 3D':'3D graphics','Grafica leggera':'Low graphics','Camera fluida':'Smooth camera','Riconnessione automatica':'Auto reconnect','Effetti sonori':'Sound effects',
    'Zoom rotellina':'Wheel zoom','Effetti visivi':'Visual effects','Ombre cellule':'Cell shadows','Glow cellule':'Cell glow','Mostra pellet':'Show pellets',
    'Mostra power-up':'Show power-ups','Mostra zone':'Show zones','Bordo arena':'Arena border','Colori squadra':'Team colors','Contorno nemici':'Enemy outline',
    'Contorno alleati':'Friendly outline','Marker centrale':'Center marker','Crosshair':'Crosshair','Linea mira':'Aim line','Auto respawn':'Auto respawn',
    'Riavvio rapido':'Fast restart','Protezione spawn':'Spawn protection','Spettatore automatico':'Auto spectator','Filtro chat':'Chat filter',
    'Qualità dinamica':'Dynamic quality','Statistiche rete':'Network stats','Ping':'Ping','FPS':'FPS','Coordinate':'Coordinates','Avvisi zona':'Zone warnings',
    'Auto Save':'Auto Save','Ricorda scheda':'Remember tab','Suggerimenti tastiera':'Keyboard hints','Pausa nel menu':'Pause in menu','Fullscreen all’avvio':'Fullscreen on start',
    'Controlli touch':'Touch controls','Sfondo arena':'Arena background','Vignetta':'Vignette','Movimento ridotto':'Reduced motion','Contrasto alto':'High contrast',
    'Modalità daltonismo':'Colorblind mode','Sfocatura menu':'Menu blur','HUD compatto':'Compact HUD','Conferma acquisti':'Confirm purchases','Conferma azioni':'Confirm actions',
    'Musica':'Music','Muto globale':'Global mute','Accessibilità':'Accessibility','Progressi livello':'Level progress','Partite':'Games','Max massa':'Max mass',
    'Miglior rank':'Best rank','Kill':'Kills','Morti':'Deaths','Coins':'Coins','Livello':'Level','XP':'XP','Progressi':'Progress','Tempo di gioco':'Play time',
    'Stato account':'Account status','Account':'Account','Ruolo':'Role','ID account':'Account ID','Data registrazione':'Registration date',
    'Shop':'Shop','ZeroShop':'ZeroShop','Acquista':'Buy','Acquisto':'Purchase','Inizia':'Start','Chiudi':'Close','Salva':'Save','Ripristina':'Reset',
    'Profilo utente':'User profile','Impostazioni di gioco':'Game settings','Tasto Split':'Split key','Tasto Feed':'Feed key','Tasto Virus':'Virus key',
    'Effetti speciali':'Special effects','God Mode':'God Mode','10 secondi':'10 seconds','Server':'Server','Connesso':'Connected','Disconnesso':'Disconnected',
    'Nessuno':'None','Default':'Default','Skin':'Skin','Crea Account':'Create account','Accedi':'Login','Registrati':'Register','Esci':'Logout',
    'Nessun utente autenticato':'No authenticated user','Benvenuto':'Welcome','Mouse = muoviti':'Mouse = move','Spazio = split':'Space = split','W = feed':'W = feed','Q = virus':'Q = virus','ESC = Menu Utente':'ESC = User Menu'
  };
  for (const l of LANGS.map(x=>x[0])) if (l !== 'it') add(l, base);
  add('en', { 'User Menu':'User Menu' });
  add('es', {'Menu Utente':'Menú de usuario','Profilo':'Perfil','Gioca':'Jugar','Shop':'Tienda','Statistiche':'Estadísticas','Impostazioni':'Ajustes','Controlli':'Controles','Grafica':'Gráficos','Audio':'Audio','Lingua':'Idioma','100 Funzioni':'100 funciones','Gioca ora':'Jugar ahora','Riavvia partita':'Reiniciar partida','Spettatore':'Espectador','Schermo intero':'Pantalla completa','Modalità FFA':'Modo FFA','Modalità Squadre':'Modo equipos','Wallet':'Cartera','Inventario':'Inventario','Missioni':'Misiones','Daily':'Diario','Classifica':'Clasificación','Le mie skin':'Mis skins','Usa skin':'Usar skin','In uso':'En uso','Usa default':'Usar predeterminada','Scegli la lingua del gioco':'Elige el idioma del juego','Mostra nomi':'Mostrar nombres','Mostra massa':'Mostrar masa','Mostra minimappa':'Mostrar minimapa','Mostra HUD':'Mostrar HUD','Grafica 3D':'Gráficos 3D','Grafica leggera':'Gráficos bajos','Camera fluida':'Cámara fluida','Effetti sonori':'Efectos de sonido','Zoom rotellina':'Zoom con rueda','Effetti visivi':'Efectos visuales','Musica':'Música','Muto globale':'Silencio global','Progressi livello':'Progreso del nivel','Partite':'Partidas','Max massa':'Masa máxima','Miglior rank':'Mejor rango','Kill':'Bajas','Morti':'Muertes','Coins':'Monedas','Livello':'Nivel','Progressi':'Progreso','Crea Account':'Crear cuenta','Accedi':'Iniciar sesión','Registrati':'Registrarse','Esci':'Salir'});
  add('fr', {'Menu Utente':'Menu utilisateur','Profilo':'Profil','Gioca':'Jouer','Shop':'Boutique','Statistiche':'Statistiques','Impostazioni':'Paramètres','Controlli':'Commandes','Grafica':'Graphismes','Audio':'Audio','Lingua':'Langue','100 Funzioni':'100 fonctions','Gioca ora':'Jouer maintenant','Riavvia partita':'Redémarrer','Spettatore':'Spectateur','Schermo intero':'Plein écran','Modalità FFA':'Mode FFA','Modalità Squadre':'Mode équipes','Inventario':'Inventaire','Missioni':'Missions','Daily':'Quotidien','Classifica':'Classement','Le mie skin':'Mes skins','Usa skin':'Utiliser la skin','In uso':'Utilisée','Usa default':'Utiliser par défaut','Scegli la lingua del gioco':'Choisissez la langue du jeu','Mostra nomi':'Afficher les noms','Mostra massa':'Afficher la masse','Mostra minimappa':'Afficher la mini-carte','Mostra HUD':'Afficher le HUD','Grafica 3D':'Graphismes 3D','Camera fluida':'Caméra fluide','Effetti sonori':'Effets sonores','Musica':'Musique','Progressi livello':'Progression du niveau','Partite':'Parties','Max massa':'Masse max','Miglior rank':'Meilleur rang','Kill':'Éliminations','Morti':'Morts','Coins':'Pièces','Livello':'Niveau','Progressi':'Progression','Crea Account':'Créer un compte','Accedi':'Connexion','Registrati':'Inscription','Esci':'Déconnexion'});
  add('de', {'Menu Utente':'Benutzermenü','Profilo':'Profil','Gioca':'Spielen','Shop':'Shop','Statistiche':'Statistiken','Impostazioni':'Einstellungen','Controlli':'Steuerung','Grafica':'Grafik','Audio':'Audio','Lingua':'Sprache','100 Funzioni':'100 Funktionen','Gioca ora':'Jetzt spielen','Riavvia partita':'Spiel neu starten','Spettatore':'Zuschauer','Schermo intero':'Vollbild','Modalità FFA':'FFA-Modus','Modalità Squadre':'Team-Modus','Inventario':'Inventar','Missioni':'Quests','Daily':'Täglich','Classifica':'Rangliste','Le mie skin':'Meine Skins','Usa skin':'Skin verwenden','In uso':'In Gebrauch','Usa default':'Standard verwenden','Scegli la lingua del gioco':'Spielsprache auswählen','Mostra nomi':'Namen anzeigen','Mostra massa':'Masse anzeigen','Mostra minimappa':'Minikarte anzeigen','Mostra HUD':'HUD anzeigen','Grafica 3D':'3D-Grafik','Camera fluida':'Flüssige Kamera','Effetti sonori':'Soundeffekte','Musica':'Musik','Progressi livello':'Level-Fortschritt','Partite':'Spiele','Max massa':'Max Masse','Miglior rank':'Bester Rang','Kill':'Kills','Morti':'Tode','Coins':'Münzen','Livello':'Level','Progressi':'Fortschritt','Crea Account':'Konto erstellen','Accedi':'Anmelden','Registrati':'Registrieren','Esci':'Abmelden'});
  add('pt', {'Menu Utente':'Menu do usuário','Profilo':'Perfil','Gioca':'Jogar','Shop':'Loja','Statistiche':'Estatísticas','Impostazioni':'Configurações','Controlli':'Controles','Grafica':'Gráficos','Audio':'Áudio','Lingua':'Idioma','100 Funzioni':'100 funções','Gioca ora':'Jogar agora','Riavvia partita':'Reiniciar','Spettatore':'Espectador','Schermo intero':'Tela cheia','Inventario':'Inventário','Missioni':'Missões','Daily':'Diário','Classifica':'Classificação','Le mie skin':'Minhas skins','Usa skin':'Usar skin','In uso':'Em uso','Usa default':'Usar padrão','Mostra nomi':'Mostrar nomes','Mostra massa':'Mostrar massa','Mostra minimappa':'Mostrar minimapa','Mostra HUD':'Mostrar HUD','Grafica 3D':'Gráficos 3D','Camera fluida':'Câmera suave','Effetti sonori':'Efeitos sonoros','Musica':'Música','Progressi livello':'Progresso do nível','Partite':'Partidas','Max massa':'Massa máxima','Miglior rank':'Melhor posição','Kill':'Abates','Morti':'Mortes','Coins':'Moedas','Livello':'Nível','Progressi':'Progresso','Crea Account':'Criar conta','Accedi':'Entrar','Registrati':'Registrar','Esci':'Sair'});
  add('ru', {'Menu Utente':'Меню пользователя','Profilo':'Профиль','Gioca':'Играть','Shop':'Магазин','Statistiche':'Статистика','Impostazioni':'Настройки','Controlli':'Управление','Grafica':'Графика','Audio':'Звук','Lingua':'Язык','100 Funzioni':'100 функций','Gioca ora':'Играть сейчас','Riavvia partita':'Перезапустить','Spettatore':'Наблюдатель','Schermo intero':'Полный экран','Inventario':'Инвентарь','Missioni':'Задания','Daily':'Ежедневно','Classifica':'Таблица лидеров','Le mie skin':'Мои скины','Usa skin':'Использовать скин','In uso':'Используется','Usa default':'Использовать по умолчанию','Mostra nomi':'Показывать имена','Mostra massa':'Показывать массу','Mostra minimappa':'Показывать мини-карту','Mostra HUD':'Показывать HUD','Grafica 3D':'3D-графика','Camera fluida':'Плавная камера','Effetti sonori':'Звуковые эффекты','Musica':'Музыка','Progressi livello':'Прогресс уровня','Partite':'Игры','Max massa':'Макс. масса','Miglior rank':'Лучший ранг','Kill':'Убийства','Morti':'Смерти','Coins':'Монеты','Livello':'Уровень','Progressi':'Прогресс','Crea Account':'Создать аккаунт','Accedi':'Войти','Registrati':'Регистрация','Esci':'Выйти'});
  add('zh', {'Menu Utente':'用户菜单','Profilo':'个人资料','Gioca':'开始游戏','Shop':'商店','Statistiche':'统计','Impostazioni':'设置','Controlli':'控制','Grafica':'图形','Audio':'音频','Lingua':'语言','100 Funzioni':'100项功能','Gioca ora':'立即游戏','Riavvia partita':'重新开始','Spettatore':'观战','Schermo intero':'全屏','Inventario':'背包','Missioni':'任务','Daily':'每日','Classifica':'排行榜','Le mie skin':'我的皮肤','Usa skin':'使用皮肤','In uso':'使用中','Usa default':'使用默认','Mostra nomi':'显示名称','Mostra massa':'显示质量','Mostra minimappa':'显示小地图','Mostra HUD':'显示HUD','Grafica 3D':'3D图形','Camera fluida':'平滑镜头','Effetti sonori':'音效','Musica':'音乐','Progressi livello':'等级进度','Partite':'对局','Max massa':'最大质量','Miglior rank':'最佳排名','Kill':'击杀','Morti':'死亡','Coins':'金币','Livello':'等级','Progressi':'进度','Crea Account':'创建账户','Accedi':'登录','Registrati':'注册','Esci':'退出'});
  add('ja', {'Menu Utente':'ユーザーメニュー','Profilo':'プロフィール','Gioca':'プレイ','Shop':'ショップ','Statistiche':'統計','Impostazioni':'設定','Controlli':'操作','Grafica':'グラフィック','Audio':'オーディオ','Lingua':'言語','100 Funzioni':'100機能','Gioca ora':'今すぐプレイ','Riavvia partita':'再起動','Spettatore':'観戦','Schermo intero':'全画面','Inventario':'インベントリ','Missioni':'ミッション','Daily':'デイリー','Classifica':'ランキング','Le mie skin':'マイスキン','Usa skin':'スキンを使用','In uso':'使用中','Usa default':'デフォルトを使用','Mostra nomi':'名前を表示','Mostra massa':'質量を表示','Mostra minimappa':'ミニマップを表示','Mostra HUD':'HUDを表示','Grafica 3D':'3Dグラフィック','Camera fluida':'スムーズカメラ','Effetti sonori':'効果音','Musica':'音楽','Progressi livello':'レベル進行','Partite':'ゲーム','Max massa':'最大質量','Miglior rank':'最高ランク','Kill':'キル','Morti':'死亡','Coins':'コイン','Livello':'レベル','Progressi':'進行状況','Crea Account':'アカウント作成','Accedi':'ログイン','Registrati':'登録','Esci':'ログアウト'});
  add('ko', {'Menu Utente':'사용자 메뉴','Profilo':'프로필','Gioca':'플레이','Shop':'상점','Statistiche':'통계','Impostazioni':'설정','Controlli':'조작','Grafica':'그래픽','Audio':'오디오','Lingua':'언어','100 Funzioni':'100가지 기능','Gioca ora':'지금 플레이','Riavvia partita':'재시작','Spettatore':'관전','Schermo intero':'전체 화면','Inventario':'인벤토리','Missioni':'미션','Daily':'일일','Classifica':'순위표','Le mie skin':'내 스킨','Usa skin':'스킨 사용','In uso':'사용 중','Usa default':'기본 사용','Mostra nomi':'이름 표시','Mostra massa':'질량 표시','Mostra minimappa':'미니맵 표시','Mostra HUD':'HUD 표시','Grafica 3D':'3D 그래픽','Camera fluida':'부드러운 카메라','Effetti sonori':'효과음','Musica':'음악','Progressi livello':'레벨 진행','Partite':'게임','Max massa':'최대 질량','Miglior rank':'최고 순위','Kill':'킬','Morti':'사망','Coins':'코인','Livello':'레벨','Progressi':'진행','Crea Account':'계정 만들기','Accedi':'로그인','Registrati':'회원가입','Esci':'로그아웃'});
  add('ar', {'Menu Utente':'قائمة المستخدم','Profilo':'الملف الشخصي','Gioca':'العب','Shop':'المتجر','Statistiche':'الإحصائيات','Impostazioni':'الإعدادات','Controlli':'التحكم','Grafica':'الرسومات','Audio':'الصوت','Lingua':'اللغة','100 Funzioni':'100 وظيفة','Gioca ora':'العب الآن','Riavvia partita':'إعادة التشغيل','Spettatore':'مشاهد','Schermo intero':'ملء الشاشة','Inventario':'المخزون','Missioni':'المهام','Daily':'يومي','Classifica':'لوحة المتصدرين','Le mie skin':'جلودي','Usa skin':'استخدم المظهر','In uso':'قيد الاستخدام','Usa default':'استخدم الافتراضي','Mostra nomi':'إظهار الأسماء','Mostra massa':'إظهار الكتلة','Mostra minimappa':'إظهار الخريطة المصغرة','Mostra HUD':'إظهار HUD','Grafica 3D':'رسومات ثلاثية الأبعاد','Camera fluida':'كاميرا سلسة','Effetti sonori':'مؤثرات صوتية','Musica':'موسيقى','Progressi livello':'تقدم المستوى','Partite':'المباريات','Max massa':'أقصى كتلة','Miglior rank':'أفضل ترتيب','Kill':'قتل','Morti':'وفيات','Coins':'عملات','Livello':'المستوى','Progressi':'التقدم','Crea Account':'إنشاء حساب','Accedi':'دخول','Registrati':'تسجيل','Esci':'خروج'});
  add('tr', {'Menu Utente':'Kullanıcı Menüsü','Profilo':'Profil','Gioca':'Oyna','Shop':'Mağaza','Statistiche':'İstatistikler','Impostazioni':'Ayarlar','Controlli':'Kontroller','Grafica':'Grafik','Audio':'Ses','Lingua':'Dil','100 Funzioni':'100 işlev','Gioca ora':'Şimdi oyna','Riavvia partita':'Yeniden başlat','Spettatore':'İzleyici','Schermo intero':'Tam ekran','Inventario':'Envanter','Missioni':'Görevler','Daily':'Günlük','Classifica':'Liderlik tablosu','Le mie skin':'Skinlerim','Usa skin':'Skini kullan','In uso':'Kullanımda','Usa default':'Varsayılanı kullan','Mostra nomi':'İsimleri göster','Mostra massa':'Kütleyi göster','Mostra minimappa':'Mini haritayı göster','Mostra HUD':'HUD göster','Grafica 3D':'3D grafik','Camera fluida':'Akıcı kamera','Effetti sonori':'Ses efektleri','Musica':'Müzik','Progressi livello':'Seviye ilerlemesi','Partite':'Maçlar','Max massa':'Maks. kütle','Miglior rank':'En iyi derece','Kill':'Öldürmeler','Morti':'Ölümler','Coins':'Coin','Livello':'Seviye','Progressi':'İlerleme','Crea Account':'Hesap oluştur','Accedi':'Giriş','Registrati':'Kayıt','Esci':'Çıkış'});

  // Basic aliases for the short gameplay labels.
  const gameplay = {'💥 Split':'💥 Split','🥏 Feed':'🥏 Feed','🦠 Virus':'🦠 Virus','🎨 Skin':'🎨 Skin','🖱️ Mouse = muoviti':'🖱️ Mouse = move','⌨️ Spazio = split':'⌨️ Space = split','⌨️ W = feed':'⌨️ W = feed','⌨️ Q = virus':'⌨️ Q = virus','⌨️ ESC = Menu Utente':'⌨️ ESC = User Menu'};
  Object.keys(PAIR).forEach(l => Object.assign(PAIR[l], gameplay));

  let current = localStorage.getItem(STORAGE_KEY) || SOURCE;
  let observer = null;
  let applying = false;
  const originalNodes = new WeakMap();
  let remoteCache = {};
  try { remoteCache = JSON.parse(localStorage.getItem(CACHE_KEY) || '{}') || {}; } catch (_) {}

  function norm(v){ return String(v ?? '').replace(/\s+/g,' ').trim(); }
  function esc(v){ return String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
  function getFlag(code){return FLAGS[code] || '🌐';}
  function langName(code){return NAME_BY_CODE[code] || code;}
  function isValid(code){return LANGS.some(x=>x[0]===code)||EXTRA.includes(code)||code==='it';}

  function peelPrefix(text){
    const s = norm(text);
    const m = s.match(/^((?:[^\p{L}\p{N}])+)(.*)$/u);
    return m ? [m[1],m[2]] : ['',s];
  }

  function translateKnown(text, lang){
    const src = norm(text);
    if (!src || lang === SOURCE) return src;
    const dict = PAIR[lang] || PAIR.en || {};
    if (dict[src]) return dict[src];
    const [prefix,body] = peelPrefix(src);
    if (dict[body]) return prefix + dict[body];
    // A few phrase aliases that commonly occur in generated controls.
    const low = body.toLowerCase();
    const found = Object.keys(dict).find(k=>k.toLowerCase()===low);
    return found ? prefix + dict[found] : src;
  }

  async function remoteTranslate(text,lang){
    if (!text || lang===SOURCE) return text;
    const k = lang+'|'+text;
    if (remoteCache[k]) return remoteCache[k];
    try {
      const url = 'https://translate.googleapis.com/translate_a/single?client=gtx&sl=it&tl='+encodeURIComponent(lang)+'&dt=t&q='+encodeURIComponent(text);
      const r = await fetch(url,{cache:'force-cache',mode:'cors'});
      if (!r.ok) throw new Error('HTTP '+r.status);
      const d = await r.json();
      const out = Array.isArray(d?.[0]) ? d[0].map(x=>x?.[0]||'').join('') : '';
      if (out && out !== text) {
        remoteCache[k]=out;
        try{localStorage.setItem(CACHE_KEY,JSON.stringify(remoteCache));}catch(_){ }
        return out;
      }
    } catch (_) {}
    return text;
  }

  function closestSafe(node, selector){
    if (!node) return null;
    if (node.nodeType === 1 && typeof node.closest === 'function') return node.closest(selector);
    const parent = node.parentElement;
    return parent && typeof parent.closest === 'function' ? parent.closest(selector) : null;
  }

  function collectNodes(){
    const roots = [document.body];
    const nodes=[];
    const seen = new Set();
    for(const root of roots){
      const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);
      let n;
      while((n=walker.nextNode())){
        if(seen.has(n)) continue;
        const p=n.parentElement;
        if(!p) continue;
        if(closestSafe(p,'script,style,noscript,canvas,textarea,input,.zl-no-translate,[contenteditable="true"]')) continue;
        if(p.tagName==='OPTION') continue;
        const value=norm(n.textContent);
        if(!value || value.length>240) continue;
        seen.add(n); nodes.push(n);
      }
    }
    return nodes;
  }

  async function translateNode(node){
    const p=node.parentElement;
    if(!p) return;
    const original = node.parentElement?.dataset?.zlOrigText && node.parentElement.childNodes.length===1 ? node.parentElement.dataset.zlOrigText : (node.dataset?.zlOrigText || node.textContent);
    const src=norm(original);
    if(!src) return;
    const known=translateKnown(src,current);
    if(known!==src){node.textContent=known;return;}
    if(current!==SOURCE){
      const out=await remoteTranslate(src,current);
      if(out && out!==src && node.isConnected) node.textContent=out;
    }
  }

  async function apply(){
    if(applying) return;
    applying=true;
    try{
      document.documentElement.lang=current;
      document.documentElement.dir = current==='ar'||current==='he'||current==='fa'||current==='ur' ? 'rtl' : 'ltr';
      // Restore tracked element originals and text-node originals first, so A -> B never translates translated text.
      document.querySelectorAll('[data-zl-orig-text]').forEach(el=>{ if(el.dataset.zlOrigText!=null) el.textContent=el.dataset.zlOrigText; });
      const nodes=collectNodes();
      for(const n of nodes){ if(!originalNodes.has(n)) originalNodes.set(n,n.textContent); }
      // Explicit data-i18n elements are deterministic and fast.
      document.querySelectorAll('[data-i18n]').forEach(el=>{
        if(!el.dataset.zlOrigText) el.dataset.zlOrigText=el.textContent;
        const src=norm(el.dataset.i18n || el.dataset.zlOrigText);
        const known=translateKnown(src,current);
        el.textContent=known;
      });
      const pending=[];
      for(const n of nodes){
        if(!n || typeof n.textContent !== 'string') continue;
        if(closestSafe(n,'[data-i18n]')) continue;
        const src=norm(originalNodes.get(n) ?? n.textContent);
        const known=translateKnown(src,current);
        if(known!==src) n.textContent=known;
        else if(current!==SOURCE) pending.push([n,src]);
      }
      for(let i=0;i<pending.length;i+=8){
        await Promise.all(pending.slice(i,i+8).map(async ([n,src])=>{const out=await remoteTranslate(src,current);if(out!==src&&n.isConnected)n.textContent=out;}));
      }
      // Inputs / buttons / options.
      document.querySelectorAll('input[placeholder],textarea[placeholder],button[title]').forEach(el=>{
        if(el.placeholder){ if(!el.dataset.zlOrigPlaceholder) el.dataset.zlOrigPlaceholder=el.placeholder; }
        if(el.title){ if(!el.dataset.zlOrigTitle) el.dataset.zlOrigTitle=el.title; }
      });
      for(const el of document.querySelectorAll('input[placeholder],textarea[placeholder],button[title]')){
        if(el.dataset.zlOrigPlaceholder){const src=norm(el.dataset.zlOrigPlaceholder);el.placeholder=translateKnown(src,current);}
        if(el.dataset.zlOrigTitle){const src=norm(el.dataset.zlOrigTitle);el.title=translateKnown(src,current);}
      }
      document.querySelectorAll('select option').forEach(o=>{
        if(!o.dataset.zlOrigText)o.dataset.zlOrigText=o.textContent;
        const src=norm(o.dataset.zlOrigText);o.textContent=translateKnown(src,current);
      });
      document.title=translateKnown('ZeroLegend — Portale & Gioco .io',current);
      document.querySelectorAll('select[data-zl-lang-select]').forEach(s=>s.value=current);
    } finally { applying=false; }
  }

  function populate(select){
    if(!select || select.dataset.zlReady) return;
    select.dataset.zlReady='1';
    const allCodes=[...new Set([...LANGS.map(x=>x[0]),...EXTRA])];
    select.innerHTML='<option value="" disabled>'+getFlag(current)+' '+esc(langName(current))+'</option>'+allCodes.map(code=>{
      const label=langName(code);
      return '<option value="'+esc(code)+'">'+getFlag(code)+' '+esc(label)+'</option>';
    }).join('');
    select.value=isValid(current)?current:'it';
    select.setAttribute('data-zl-lang-select','1');
    select.addEventListener('change',async()=>{
      const next=select.value;
      if(!isValid(next)) return;
      current=next;
      localStorage.setItem(STORAGE_KEY,current);
      document.querySelectorAll('select[data-zl-lang-select]').forEach(s=>s.value=current);
      await apply();
      window.dispatchEvent(new CustomEvent('zl-language-changed',{detail:{lang:current}}));
      showToast(getFlag(current)+' '+langName(current));
    });
  }

  function addSelectors(){
    document.querySelectorAll('select.zl-language-select,#zl-language-main,#zl-language-settings').forEach(populate);
    const pane=document.querySelector('.zl-tab-pane[data-pane="settings"]');
    if(pane && !document.getElementById('zl-language-settings-wrap')){
      const wrap=document.createElement('div');
      wrap.id='zl-language-settings-wrap';wrap.className='zl-language-box';
      wrap.innerHTML='<div class="zl-language-head"><div><b>🌐 <span data-i18n="Lingua">Lingua</span></b><small data-i18n="Scegli la lingua del gioco">Scegli la lingua del gioco</small></div><select id="zl-language-settings" class="zl-language-select"></select></div><div class="zl-note" data-i18n="Traduzione completa interfaccia">Traduzione completa interfaccia</div>';
      pane.prepend(wrap);
      populate(wrap.querySelector('select'));
    }
  }

  function showToast(text){
    let t=document.getElementById('zl-i18n-toast');
    if(!t){t=document.createElement('div');t.id='zl-i18n-toast';Object.assign(t.style,{position:'fixed',left:'50%',bottom:'28px',transform:'translateX(-50%)',zIndex:'200000',padding:'10px 16px',borderRadius:'12px',background:'rgba(8,15,27,.94)',border:'1px solid rgba(64,220,255,.5)',color:'#fff',font:'600 14px system-ui',boxShadow:'0 12px 35px rgba(0,0,0,.4)',pointerEvents:'none',transition:'opacity .2s'});document.body.appendChild(t);}
    t.textContent='🌐 '+text;t.style.opacity='1';clearTimeout(t._tm);t._tm=setTimeout(()=>t.style.opacity='0',1200);
  }

  function init(){
    addSelectors();
    apply();
    if(observer) observer.disconnect();
    observer=new MutationObserver(muts=>{
      if(applying) return;
      const ignored=['#game','#hud','#stats','#killfeed','#chat','#leaderboard','#minimap'];
      const relevant=muts.some(m=>{
        if(!m.addedNodes?.length) return false;
        for(const n of m.addedNodes){
          const el=n.nodeType===1?n:n.parentElement;
          if(!el) continue;
          if(closestSafe(el,ignored.join(','))) continue;
          return true;
        }
        return false;
      });
      if(relevant){addSelectors();clearTimeout(init.timer);init.timer=setTimeout(apply,120);}
    });
    observer.observe(document.body,{childList:true,subtree:true});
  }

  window.ZLI18n={getLanguage:()=>current,setLanguage:async l=>{if(!isValid(l))return false;current=l;localStorage.setItem(STORAGE_KEY,l);await apply();return true;},refresh:apply,flags:FLAGS,languages:LANGS.concat(EXTRA.map(c=>[c,getFlag(c),c])),labelFor:c=>getFlag(c)+' '+langName(c)};
  document.addEventListener('DOMContentLoaded',init,{once:true});
})();
