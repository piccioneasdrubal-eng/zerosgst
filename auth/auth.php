<?php
declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
header('Pragma: no-cache');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, X-Api-Secret');

$origin = isset($_SERVER['HTTP_ORIGIN']) ? trim((string)$_SERVER['HTTP_ORIGIN']) : '';
if ($origin !== '') {
    header('Access-Control-Allow-Origin: ' . $origin);
    header('Vary: Origin');
} else {
    header('Access-Control-Allow-Origin: *');
}

if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'OPTIONS') {
    http_response_code(204);
    exit;
}

require_once __DIR__ . '/db-config.php';

function respond(array $data, int $status = 200): void {
    http_response_code($status);
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function request_body(): array {
    $raw = file_get_contents('php://input');
    if (is_string($raw) && $raw !== '') {
        $decoded = json_decode($raw, true);
        if (is_array($decoded)) return $decoded;
    }
    return is_array($_POST) ? $_POST : [];
}

function table_exists(string $table): bool {
    $st = db()->prepare("SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = ?");
    $st->execute([$table]);
    return (int)$st->fetchColumn() > 0;
}

function column_exists(string $table, string $column): bool {
    $st = db()->prepare("SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ?");
    $st->execute([$table, $column]);
    return (int)$st->fetchColumn() > 0;
}

function ensure_auth_schema(): string {
    // Usa la tabella `users` del database già esistente del progetto.
    // Solo se non esiste, crea una tabella di fallback `zl_users`.
    if (table_exists('users')) {
        // Le colonne che risultano presenti nel DB del progetto vengono mantenute.
        // Aggiungiamo solo quelle indispensabili se un'installazione è più vecchia.
        $alter = [];
        if (!column_exists('users', 'username')) $alter[] = "ADD COLUMN username VARCHAR(80) NULL AFTER id";
        if (!column_exists('users', 'email')) $alter[] = "ADD COLUMN email VARCHAR(190) NULL AFTER username";
        if (!column_exists('users', 'password_hash')) $alter[] = "ADD COLUMN password_hash VARCHAR(255) NULL AFTER email";
        if (!column_exists('users', 'provider')) $alter[] = "ADD COLUMN provider VARCHAR(30) NOT NULL DEFAULT 'local' AFTER password_hash";
        if (!column_exists('users', 'role')) $alter[] = "ADD COLUMN role VARCHAR(20) NOT NULL DEFAULT 'user' AFTER provider";
        if (!column_exists('users', 'level')) $alter[] = "ADD COLUMN level INT NOT NULL DEFAULT 1";
        if (!column_exists('users', 'xp')) $alter[] = "ADD COLUMN xp INT NOT NULL DEFAULT 0";
        if (!column_exists('users', 'coins')) $alter[] = "ADD COLUMN coins INT NOT NULL DEFAULT 1000";
        if (!column_exists('users', 'skins')) $alter[] = "ADD COLUMN skins TEXT NULL";
        if (!column_exists('users', 'equipped_skin')) $alter[] = "ADD COLUMN equipped_skin VARCHAR(80) NOT NULL DEFAULT 'default'";
        if (!column_exists('users', 'created_at')) $alter[] = "ADD COLUMN created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP";
        if (!column_exists('users', 'updated_at')) $alter[] = "ADD COLUMN updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP";
        foreach ($alter as $sql) {
            try { db()->exec('ALTER TABLE users ' . $sql); } catch (Throwable $e) { /* compatibilità con DB già completi */ }
        }
        return 'users';
    }

    db()->exec("CREATE TABLE IF NOT EXISTS zl_users (
        id INT UNSIGNED NOT NULL AUTO_INCREMENT,
        username VARCHAR(80) NOT NULL,
        email VARCHAR(190) NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        provider VARCHAR(30) NOT NULL DEFAULT 'local',
        role VARCHAR(20) NOT NULL DEFAULT 'user',
        level INT NOT NULL DEFAULT 1,
        xp INT NOT NULL DEFAULT 0,
        coins INT NOT NULL DEFAULT 1000,
        skins TEXT NULL,
        equipped_skin VARCHAR(80) NOT NULL DEFAULT 'default',
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        UNIQUE KEY uq_zl_users_email (email)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");
    return 'zl_users';
}

function users_query_fields(string $table): string {
    return "id, username, email, password_hash, provider, role, level, xp, coins, skins, equipped_skin, created_at, updated_at";
}

function fetch_user_by_email(string $email, string $table): ?array {
    $st = db()->prepare("SELECT " . users_query_fields($table) . " FROM `$table` WHERE LOWER(TRIM(email)) = LOWER(TRIM(?)) LIMIT 1");
    $st->execute([$email]);
    $row = $st->fetch();
    return $row ?: null;
}

function fetch_user_by_id(int $id, string $table): ?array {
    $st = db()->prepare("SELECT " . users_query_fields($table) . " FROM `$table` WHERE id = ? LIMIT 1");
    $st->execute([$id]);
    $row = $st->fetch();
    return $row ?: null;
}

function public_user(array $u): array {
    $role = (string)($u['role'] ?? 'user');
    return [
        'id' => (int)($u['id'] ?? 0),
        'username' => (string)($u['username'] ?? ''),
        'email' => (string)($u['email'] ?? ''),
        'name' => (string)($u['username'] ?? ''),
        'role' => $role,
        'is_admin' => in_array(strtolower($role), ['admin', 'owner'], true) ? 1 : 0,
        'level' => (int)($u['level'] ?? 1),
        'xp' => (int)($u['xp'] ?? 0),
        'coins' => (int)($u['coins'] ?? 1000),
        'skins' => (string)($u['skins'] ?? '["default"]'),
        'equipped_skin' => (string)($u['equipped_skin'] ?? 'default'),
    ];
}

function b64u_encode(string $s): string { return rtrim(strtr(base64_encode($s), '+/', '-_'), '='); }
function b64u_decode(string $s) {
    $pad = strlen($s) % 4;
    if ($pad) $s .= str_repeat('=', 4 - $pad);
    return base64_decode(strtr($s, '-_', '+/'), true);
}

function make_token(int $userId): string {
    if (!defined('API_SECRET') || API_SECRET === '') throw new RuntimeException('API_SECRET non configurato.');
    $now = time();
    $payload = ['v'=>1,'uid'=>$userId,'iat'=>$now,'exp'=>$now + 30*86400,'nonce'=>bin2hex(random_bytes(12))];
    $body = b64u_encode((string)json_encode($payload, JSON_UNESCAPED_SLASHES));
    $sig = b64u_encode(hash_hmac('sha256', $body, (string)API_SECRET, true));
    return 'zl1.' . $body . '.' . $sig;
}

function token_user(string $token, string $table): ?array {
    $parts = explode('.', trim($token));
    if (count($parts) !== 3 || $parts[0] !== 'zl1') return null;
    if (!defined('API_SECRET') || API_SECRET === '') return null;
    $expected = b64u_encode(hash_hmac('sha256', $parts[1], (string)API_SECRET, true));
    if (!hash_equals($expected, $parts[2])) return null;
    $json = b64u_decode($parts[1]);
    if ($json === false) return null;
    $payload = json_decode($json, true);
    if (!is_array($payload) || (int)($payload['v'] ?? 0) !== 1) return null;
    if ((int)($payload['exp'] ?? 0) < time()) return null;
    return fetch_user_by_id((int)($payload['uid'] ?? 0), $table);
}


function ensure_profile_schema(): void {
    db()->exec("CREATE TABLE IF NOT EXISTS zl_player_stats (
      user_id INT UNSIGNED NOT NULL,
      matches INT NOT NULL DEFAULT 0,
      kills INT NOT NULL DEFAULT 0,
      deaths INT NOT NULL DEFAULT 0,
      best_mass INT NOT NULL DEFAULT 0,
      best_rank INT NULL,
      play_seconds INT NOT NULL DEFAULT 0,
      elo INT NOT NULL DEFAULT 1000,
      kill_streak INT NOT NULL DEFAULT 0,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (user_id),
      INDEX idx_stats_kills (kills),
      INDEX idx_stats_elo (elo)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");
    db()->exec("CREATE TABLE IF NOT EXISTS zl_daily_progress (
      user_id INT UNSIGNED NOT NULL,
      day_key DATE NOT NULL,
      kills INT NOT NULL DEFAULT 0,
      matches INT NOT NULL DEFAULT 0,
      best_mass INT NOT NULL DEFAULT 0,
      coins_earned INT NOT NULL DEFAULT 0,
      claimed_kills3 TINYINT(1) NOT NULL DEFAULT 0,
      claimed_play1 TINYINT(1) NOT NULL DEFAULT 0,
      claimed_mass500 TINYINT(1) NOT NULL DEFAULT 0,
      last_total_kills INT NOT NULL DEFAULT 0,
      last_total_matches INT NOT NULL DEFAULT 0,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (user_id, day_key)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");
}

function ensure_player_row(int $userId): void {
    ensure_profile_schema();
    $st = db()->prepare("INSERT IGNORE INTO zl_player_stats (user_id) VALUES (?)");
    $st->execute([$userId]);
    $st = db()->prepare("INSERT IGNORE INTO zl_daily_progress (user_id, day_key) VALUES (?, CURRENT_DATE)");
    $st->execute([$userId]);
}

function fetch_player_stats(int $userId): array {
    ensure_player_row($userId);
    $st = db()->prepare("SELECT user_id,matches,kills,deaths,best_mass,best_rank,play_seconds,elo,kill_streak,updated_at FROM zl_player_stats WHERE user_id=? LIMIT 1");
    $st->execute([$userId]);
    $row = $st->fetch();
    return $row ?: ['user_id'=>$userId,'matches'=>0,'kills'=>0,'deaths'=>0,'best_mass'=>0,'best_rank'=>null,'play_seconds'=>0,'elo'=>1000,'kill_streak'=>0];
}

function fetch_daily(int $userId): array {
    ensure_player_row($userId);
    $st = db()->prepare("SELECT day_key,kills,matches,best_mass,coins_earned,claimed_kills3,claimed_play1,claimed_mass500 FROM zl_daily_progress WHERE user_id=? AND day_key=CURRENT_DATE LIMIT 1");
    $st->execute([$userId]);
    $row = $st->fetch() ?: ['day_key'=>date('Y-m-d'),'kills'=>0,'matches'=>0,'best_mass'=>0,'coins_earned'=>0,'claimed_kills3'=>0,'claimed_play1'=>0,'claimed_mass500'=>0];
    $k=(int)$row['kills']; $m=(int)$row['matches']; $mass=(int)$row['best_mass'];
    return [
      'date'=>(string)$row['day_key'],
      'rewards'=>[
        ['id'=>'kills3','label'=>'Fai 3 uccisioni','progress'=>$k,'target'=>3,'reward'=>150,'claimed'=>(bool)$row['claimed_kills3']],
        ['id'=>'play1','label'=>'Gioca 1 partita','progress'=>$m,'target'=>1,'reward'=>75,'claimed'=>(bool)$row['claimed_play1']],
        ['id'=>'mass500','label'=>'Raggiungi 500 massa','progress'=>$mass,'target'=>500,'reward'=>100,'claimed'=>(bool)$row['claimed_mass500']],
      ],
      'coins_earned'=>(int)$row['coins_earned']
    ];
}

function fetch_custom_skins_for_user(int $userId, string $equipped): array {
    if (!table_exists('zl_custom_skins')) return [];
    try {
        $st=db()->prepare('SELECT id,skin_key,title,url,size_bytes,mime,width,height,active,created_at FROM zl_custom_skins WHERE user_id=? ORDER BY id DESC');
        $st->execute([$userId]);
        $rows=$st->fetchAll();
        foreach($rows as &$row){
            $row['id']=(int)$row['id']; $row['size_bytes']=(int)$row['size_bytes'];
            $row['width']=isset($row['width'])?(int)$row['width']:0; $row['height']=isset($row['height'])?(int)$row['height']:0;
            $row['active']=(bool)$row['active'];
            $row['equipped']=($equipped==='custom:'.$row['id'].':'.$row['skin_key']) || ($equipped==='custom_'.$row['skin_key']);
        }
        unset($row);
        return $rows;
    } catch(Throwable $e) { return []; }
}

function fetch_equipped_custom_skin(int $userId, string $equipped): ?array {
    if (!table_exists('zl_custom_skins') || $equipped==='default' || $equipped==='') return null;
    try {
        $id=0; $key='';
        if (preg_match('/^custom:(\d+):([A-Za-z0-9_]+)$/',$equipped,$m)) { $id=(int)$m[1]; $key=(string)$m[2]; }
        elseif (preg_match('/^custom_([A-Za-z0-9_]+)$/',$equipped,$m)) { $key=(string)$m[1]; }
        if ($id>0) {
            $st=db()->prepare('SELECT id,skin_key,title,url,size_bytes,mime,width,height,active FROM zl_custom_skins WHERE id=? AND user_id=? LIMIT 1');
            $st->execute([$id,$userId]);
        } else {
            $st=db()->prepare('SELECT id,skin_key,title,url,size_bytes,mime,width,height,active FROM zl_custom_skins WHERE skin_key=? AND user_id=? LIMIT 1');
            $st->execute([$key,$userId]);
        }
        $row=$st->fetch();
        if(!$row || !(int)$row['active']) return null;
        $row['id']=(int)$row['id']; $row['size_bytes']=(int)$row['size_bytes'];
        $row['width']=isset($row['width'])?(int)$row['width']:0; $row['height']=isset($row['height'])?(int)$row['height']:0;
        $row['active']=true;
        return $row;
    } catch(Throwable $e) { return null; }
}

function public_full_user(array $u, string $table): array {
    $out = public_user($u);
    $equipped=(string)($u['equipped_skin'] ?? 'default');
    $out['custom_skins']=fetch_custom_skins_for_user((int)$u['id'],$equipped);
    $out['custom_skin']=fetch_equipped_custom_skin((int)$u['id'],$equipped);
    if($out['custom_skin']) { $out['custom_skin_url']=(string)$out['custom_skin']['url']; $out['custom_skin_mime']=(string)$out['custom_skin']['mime']; $out['custom_skin_title']=(string)$out['custom_skin']['title']; } else { $out['custom_skin_url']=''; $out['custom_skin_mime']=''; $out['custom_skin_title']=''; }
    $stats = fetch_player_stats((int)$u['id']);
    $daily = fetch_daily((int)$u['id']);
    $xp = max((int)($u['xp'] ?? 0), ((int)$stats['kills'] * 100) + ((int)$stats['matches'] * 25) + intdiv((int)$stats['best_mass'], 10));
    $level = max(1, (int)($u['level'] ?? 1), (int)floor(sqrt(max(0, $xp) / 100)) + 1);
    $out['xp'] = $xp;
    $out['level'] = $level;
    $out['stats'] = [
      'matches'=>(int)$stats['matches'], 'kills'=>(int)$stats['kills'], 'deaths'=>(int)$stats['deaths'],
      'best_mass'=>(int)$stats['best_mass'], 'best_rank'=>$stats['best_rank'] === null ? null : (int)$stats['best_rank'],
      'play_seconds'=>(int)$stats['play_seconds'], 'elo'=>(int)$stats['elo'], 'kill_streak'=>(int)$stats['kill_streak']
    ];
    $out['daily'] = $daily;
    $out['joined_at'] = (string)($u['created_at'] ?? '');
    $out['next_level_xp'] = $level * $level * 100;
    $out['level_start_xp'] = max(0, ($level-1)*($level-1)*100);
    $out['progress_pct'] = (int)max(0,min(100, (($xp-$out['level_start_xp']) / max(1,$out['next_level_xp']-$out['level_start_xp']))*100));
    return $out;
}

function sync_player_stats(int $userId, array $incoming): array {
    ensure_player_row($userId);
    $matches=max(0,(int)($incoming['matches'] ?? 0));
    $kills=max(0,(int)($incoming['kills'] ?? 0));
    $deaths=max(0,(int)($incoming['deaths'] ?? 0));
    $bestMass=max(0,(int)($incoming['bestMass'] ?? $incoming['best_mass'] ?? 0));
    $bestRank=(int)($incoming['bestRank'] ?? $incoming['best_rank'] ?? 0);
    $playSeconds=max(0,(int)($incoming['playSeconds'] ?? $incoming['play_seconds'] ?? 0));
    $st=db()->prepare("SELECT matches,kills,best_mass,best_rank FROM zl_player_stats WHERE user_id=? LIMIT 1");
    $st->execute([$userId]); $old=$st->fetch() ?: [];
    $matches=max($matches,(int)($old['matches']??0));
    $kills=max($kills,(int)($old['kills']??0));
    $bestMass=max($bestMass,(int)($old['best_mass']??0));
    $bestRank=$bestRank>0 ? (int)$old['best_rank']>0 ? min($bestRank,(int)$old['best_rank']) : $bestRank : ((int)($old['best_rank']??0));
    $elo=(int)($incoming['elo'] ?? 1000); $elo=max(0,min(5000,$elo));
    $streak=max(0,(int)($incoming['killStreak'] ?? $incoming['kill_streak'] ?? 0));
    $st=db()->prepare("UPDATE zl_player_stats SET matches=?,kills=?,deaths=?,best_mass=?,best_rank=?,play_seconds=?,elo=?,kill_streak=? WHERE user_id=?");
    $st->execute([$matches,$kills,$deaths,$bestMass,$bestRank ?: null,$playSeconds,$elo,$streak,$userId]);
    $day=db()->prepare("SELECT last_total_kills,last_total_matches,kills,matches FROM zl_daily_progress WHERE user_id=? AND day_key=CURRENT_DATE LIMIT 1");
    $day->execute([$userId]); $d=$day->fetch() ?: ['last_total_kills'=>0,'last_total_matches'=>0,'kills'=>0,'matches'=>0];
    $dk=max(0,$kills-(int)$d['last_total_kills']);
    $dm=max(0,$matches-(int)$d['last_total_matches']);
    $dailyKills=(int)$d['kills']+$dk; $dailyMatches=(int)$d['matches']+$dm;
    $up=db()->prepare("INSERT INTO zl_daily_progress (user_id,day_key,kills,matches,best_mass,last_total_kills,last_total_matches) VALUES (?,CURRENT_DATE,?,?,?,?,?) ON DUPLICATE KEY UPDATE kills=VALUES(kills),matches=VALUES(matches),best_mass=GREATEST(best_mass,VALUES(best_mass)),last_total_kills=VALUES(last_total_kills),last_total_matches=VALUES(last_total_matches)");
    $up->execute([$userId,$dailyKills,$dailyMatches,$bestMass,$kills,$matches]);
    $xp=$kills*100+$matches*25+intdiv($bestMass,10);
    $level=max(1,(int)floor(sqrt($xp/100))+1);
    $q=db()->prepare("UPDATE `".$GLOBALS['_zl_auth_table']."` SET xp=GREATEST(xp,?), level=GREATEST(level,?), updated_at=CURRENT_TIMESTAMP WHERE id=?");
    $q->execute([$xp,$level,$userId]);
    return public_full_user(fetch_user_by_id($userId,$GLOBALS['_zl_auth_table']),$GLOBALS['_zl_auth_table']);
}

function claim_daily_reward(int $userId, string $id): array {
    ensure_player_row($userId);
    $daily=fetch_daily($userId);
    $map=['kills3'=>['index'=>0,'field'=>'claimed_kills3'],'play1'=>['index'=>1,'field'=>'claimed_play1'],'mass500'=>['index'=>2,'field'=>'claimed_mass500']];
    if (!isset($map[$id])) respond(['ok'=>false,'error'=>'Missione non valida.'],400);
    $mission=$daily['rewards'][$map[$id]['index']];
    if ($mission['claimed']) respond(['ok'=>false,'error'=>'Ricompensa già riscossa.'],409);
    if ((int)$mission['progress'] < (int)$mission['target']) respond(['ok'=>false,'error'=>'Missione non completata.'],409);
    db()->beginTransaction();
    try {
      $field=$map[$id]['field']; $up=db()->prepare("UPDATE zl_daily_progress SET `$field`=1, coins_earned=coins_earned+? WHERE user_id=? AND day_key=CURRENT_DATE AND `$field`=0"); $up->execute([(int)$mission['reward'],$userId]);
      $coins=db()->prepare("UPDATE `".$GLOBALS['_zl_auth_table']."` SET coins=coins+?, updated_at=CURRENT_TIMESTAMP WHERE id=?"); $coins->execute([(int)$mission['reward'],$userId]);
      db()->commit();
    } catch(Throwable $e) { db()->rollBack(); throw $e; }
    $u=fetch_user_by_id($userId,$GLOBALS['_zl_auth_table']);
    return public_full_user($u,$GLOBALS['_zl_auth_table']);
}

function make_unique_username(string $name, string $table): string {
    $base = preg_replace('/[^a-zA-Z0-9_\-]/u', '', str_replace(' ', '_', $name));
    $base = trim((string)$base, '_-');
    if ($base === '') $base = 'Player';
    $base = substr($base, 0, 50);
    $candidate = $base;
    $i = 1;
    $st = db()->prepare("SELECT id FROM `$table` WHERE LOWER(username) = LOWER(?) LIMIT 1");
    while (true) {
        $st->execute([$candidate]);
        if (!$st->fetch()) return $candidate;
        $i++;
        $candidate = substr($base, 0, max(1, 50 - strlen((string)$i) - 1)) . '_' . $i;
        if ($i > 9999) throw new RuntimeException('Impossibile generare username univoco.');
    }
}

try {
    $table = ensure_auth_schema();
    $GLOBALS['_zl_auth_table'] = $table;
    ensure_profile_schema();
    $method = strtoupper((string)($_SERVER['REQUEST_METHOD'] ?? 'GET'));

    if ($method === 'GET') {
        if (isset($_GET['health'])) {
            db()->query('SELECT 1');
            $emailCol = column_exists($table, 'email');
            respond([
                'ok'=>true,
                'service'=>'auth',
                'database'=>'ok',
                'table'=>$table,
                'schema'=>'ok',
                'email_column'=>$emailCol,
                'pdo_mysql'=>extension_loaded('pdo_mysql'),
                'php'=>PHP_VERSION,
            ]);
        }
        respond(['ok'=>true, 'service'=>'auth', 'table'=>$table]);
    }

    if ($method !== 'POST') respond(['ok'=>false,'error'=>'Method not allowed'],405);

    $body = request_body();
    $action = strtolower(trim((string)($body['action'] ?? '')));

    if ($action === 'register') {
        $email = strtolower(trim((string)($body['email'] ?? '')));
        $name = trim((string)($body['name'] ?? ''));
        $password = (string)($body['password'] ?? '');

        if (!filter_var($email, FILTER_VALIDATE_EMAIL)) respond(['ok'=>false,'error'=>'Email non valida.'],400);
        if (strlen($name) < 2 || strlen($name) > 40) respond(['ok'=>false,'error'=>'Nome non valido.'],400);
        if (strlen($password) < 8) respond(['ok'=>false,'error'=>'La password deve contenere almeno 8 caratteri.'],400);

        $existing = fetch_user_by_email($email, $table);
        if ($existing) respond(['ok'=>false,'code'=>'EMAIL_EXISTS','error'=>'Questa email è già registrata nel database.'],409);

        $username = make_unique_username($name, $table);
        $hash = password_hash($password, PASSWORD_DEFAULT);
        if ($hash === false) throw new RuntimeException('Impossibile generare hash password.');

        $skins = '["default"]';
        $st = db()->prepare("INSERT INTO `$table` (username,email,password_hash,provider,role,level,xp,coins,skins,equipped_skin) VALUES (?, ?, ?, 'local', 'user', 1, 0, 1000, ?, 'default')");
        $st->execute([$username,$email,$hash,$skins]);
        $id = (int)db()->lastInsertId();
        $user = fetch_user_by_id($id, $table);
        if (!$user) throw new RuntimeException('Utente creato ma non recuperabile dal database.');
        respond(['ok'=>true,'token'=>make_token($id),'user'=>public_full_user($user,$table)]);
    }

    if ($action === 'login') {
        $email = strtolower(trim((string)($body['email'] ?? '')));
        $password = (string)($body['password'] ?? '');
        if ($email === '' || $password === '') respond(['ok'=>false,'error'=>'Inserisci email e password.'],400);
        $user = fetch_user_by_email($email,$table);
        if (!$user || !password_verify($password,(string)$user['password_hash'])) respond(['ok'=>false,'error'=>'Credenziali non valide.'],401);
        respond(['ok'=>true,'token'=>make_token((int)$user['id']),'user'=>public_full_user($user,$table)]);
    }

    if ($action === 'me') {
        $user = token_user((string)($body['token'] ?? ''),$table);
        if (!$user) respond(['ok'=>false,'error'=>'Sessione non valida o scaduta.'],401);
        respond(['ok'=>true,'user'=>public_full_user($user,$table)]);
    }

    if ($action === 'verify') {
        $givenSecret = (string)($_SERVER['HTTP_X_API_SECRET'] ?? '');
        if (!defined('API_SECRET') || API_SECRET === '' || !hash_equals((string)API_SECRET,$givenSecret)) respond(['ok'=>false,'error'=>'Unauthorized'],403);
        $user = token_user((string)($body['token'] ?? ''),$table);
        if (!$user) respond(['ok'=>false,'error'=>'Token non valido o scaduto.'],401);
        respond(['ok'=>true,'user'=>public_full_user($user,$table)]);
    }


    if ($action === 'sync_stats') {
        $user = token_user((string)($body['token'] ?? ''),$table);
        if (!$user) respond(['ok'=>false,'error'=>'Sessione non valida o scaduta.'],401);
        $updated = sync_player_stats((int)$user['id'], is_array($body['stats'] ?? null) ? $body['stats'] : []);
        respond(['ok'=>true,'user'=>$updated]);
    }

    if ($action === 'claim_daily') {
        $user = token_user((string)($body['token'] ?? ''),$table);
        if (!$user) respond(['ok'=>false,'error'=>'Sessione non valida o scaduta.'],401);
        $updated = claim_daily_reward((int)$user['id'], strtolower(trim((string)($body['mission'] ?? ''))));
        respond(['ok'=>true,'user'=>$updated]);
    }

    // ===== SHOP AUTENTICATO (usa la stessa verifica token del portale) =====
    $shopCatalog = [
      'skin_galaxy'=>['name'=>'Skin Galassia','price'=>300,'type'=>'skin'],
      'skin_cyber'=>['name'=>'Skin Cyberpunk','price'=>500,'type'=>'skin'],
      'boost_speed_60'=>['name'=>'Boost Velocità 60s','price'=>200,'type'=>'consumable'],
      'boost_mass_60'=>['name'=>'Boost Massa 60s','price'=>400,'type'=>'consumable'],
      'shield_pack'=>['name'=>'Shield Pack','price'=>250,'type'=>'consumable'],
      'bounty_badge'=>['name'=>'Bounty Badge','price'=>350,'type'=>'consumable'],
      'coin_boost_2x_60'=>['name'=>'x2 Coins 60s','price'=>350,'type'=>'consumable'],
      'starter_bundle'=>['name'=>'Starter Bundle','price'=>600,'type'=>'consumable'],
    ];
    if (in_array($action, ['shop_wallet','shop_catalog','shop_inventory','shop_history','shop_purchase','shop_equip','shop_unequip'], true)) {
        $user = token_user((string)($body['token'] ?? ''), $table);
        if (!$user) respond(['ok'=>false,'error'=>'Sessione non valida o scaduta.'],401);
        $uid=(int)$user['id'];
        db()->exec("CREATE TABLE IF NOT EXISTS zl_inventory (user_id INT UNSIGNED NOT NULL,item_id VARCHAR(80) NOT NULL,qty INT NOT NULL DEFAULT 1,equipped TINYINT(1) NOT NULL DEFAULT 0,updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,PRIMARY KEY(user_id,item_id),INDEX idx_inv_user(user_id)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");
        db()->exec("CREATE TABLE IF NOT EXISTS zl_coin_ledger (id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,user_id INT UNSIGNED NOT NULL,kind VARCHAR(30) NOT NULL,amount INT NOT NULL,reason VARCHAR(120) NOT NULL,ref_id VARCHAR(120) NULL,created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,PRIMARY KEY(id),UNIQUE KEY uq_ref(ref_id),INDEX idx_ledger_user(user_id)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");
        $walletFn = static function(int $id) use ($table): array {
          $u=fetch_user_by_id($id,$table); if(!$u) respond(['ok'=>false,'error'=>'Utente non trovato.'],404);
          $st=db()->prepare('SELECT item_id,qty,equipped FROM zl_inventory WHERE user_id=? AND qty>0 ORDER BY item_id'); $st->execute([$id]);
          $inventory=[]; $equipped=(string)($u['equipped_skin'] ?? 'default');
          while($r=$st->fetch()){
            for($i=0;$i<(int)$r['qty'] && count($inventory)<200;$i++) $inventory[]=(string)$r['item_id'];
            if((int)$r['equipped']===1) $equipped=(string)$r['item_id'];
          }
          if(!$inventory) $inventory=['skin_default'];
          return ['coins'=>(int)($u['coins']??0),'inventory'=>$inventory,'equippedSkin'=>$equipped];
        };
        if ($action==='shop_wallet' || $action==='shop_inventory') respond(['ok'=>true,'wallet'=>$walletFn($uid),'catalog'=>$action==='shop_wallet' ? $shopCatalog : null]);
        if ($action==='shop_catalog') respond(['ok'=>true,'catalog'=>$shopCatalog]);
        if ($action==='shop_history') {
          $q=db()->prepare('SELECT kind,amount,reason,ref_id,created_at FROM zl_coin_ledger WHERE user_id=? ORDER BY id DESC LIMIT 100'); $q->execute([$uid]);
          respond(['ok'=>true,'history'=>$q->fetchAll(),'wallet'=>$walletFn($uid)]);
        }
        if ($action==='shop_unequip') {
          $q=db()->prepare("UPDATE `{$table}` SET equipped_skin='default',updated_at=CURRENT_TIMESTAMP WHERE id=?"); $q->execute([$uid]);
          db()->prepare('UPDATE zl_inventory SET equipped=0 WHERE user_id=?')->execute([$uid]);
          respond(['ok'=>true,'equipped_skin'=>'default','wallet'=>$walletFn($uid)]);
        }
        if ($action==='shop_equip') {
          $item=trim((string)($body['item_id'] ?? $body['itemId'] ?? ''));
          $q=db()->prepare('SELECT qty FROM zl_inventory WHERE user_id=? AND item_id=? AND qty>0 LIMIT 1'); $q->execute([$uid,$item]);
          if(!$q->fetch()) respond(['ok'=>false,'error'=>'Oggetto non posseduto.'],404);
          db()->prepare('UPDATE zl_inventory SET equipped=0 WHERE user_id=?')->execute([$uid]);
          db()->prepare('UPDATE zl_inventory SET equipped=1 WHERE user_id=? AND item_id=?')->execute([$uid,$item]);
          $q=db()->prepare("UPDATE `{$table}` SET equipped_skin=?,updated_at=CURRENT_TIMESTAMP WHERE id=?"); $q->execute([$item,$uid]);
          respond(['ok'=>true,'equipped_skin'=>$item,'wallet'=>$walletFn($uid)]);
        }
        if ($action==='shop_purchase') {
          $item=trim((string)($body['item_id'] ?? $body['itemId'] ?? ''));
          if(!isset($shopCatalog[$item])) respond(['ok'=>false,'error'=>'Oggetto non valido.'],400);
          $price=(int)$shopCatalog[$item]['price'];
          db()->beginTransaction();
          try{
            $u=fetch_user_by_id($uid,$table); if(!$u) throw new RuntimeException('Utente non trovato.');
            $lock=db()->prepare('SELECT coins FROM `'.$table.'` WHERE id=? FOR UPDATE'); $lock->execute([$uid]); $coins=(int)$lock->fetchColumn();
            $own=db()->prepare('SELECT qty FROM zl_inventory WHERE user_id=? AND item_id=? FOR UPDATE'); $own->execute([$uid,$item]); $owned=$own->fetch();
            if($shopCatalog[$item]['type']==='skin' && $owned){ db()->rollBack(); respond(['ok'=>false,'error'=>'Oggetto già posseduto.'],409); }
            if($coins<$price){ db()->rollBack(); respond(['ok'=>false,'error'=>'ZeroCoins insufficienti.','wallet'=>['coins'=>$coins]],409); }
            $new=$coins-$price; db()->prepare('UPDATE `'.$table.'` SET coins=?,updated_at=CURRENT_TIMESTAMP WHERE id=?')->execute([$new,$uid]);
            db()->prepare('INSERT INTO zl_inventory(user_id,item_id,qty,equipped) VALUES(?,?,1,?) ON DUPLICATE KEY UPDATE qty=qty+1')->execute([$uid,$item,0]);
            if($shopCatalog[$item]['type']==='skin'){
              db()->prepare('UPDATE zl_inventory SET equipped=0 WHERE user_id=?')->execute([$uid]);
              db()->prepare('UPDATE zl_inventory SET equipped=1 WHERE user_id=? AND item_id=?')->execute([$uid,$item]);
              db()->prepare('UPDATE `'.$table.'` SET equipped_skin=?,updated_at=CURRENT_TIMESTAMP WHERE id=?')->execute([$item,$uid]);
            }
            $ref='shop:'.bin2hex(random_bytes(12)); db()->prepare('INSERT INTO zl_coin_ledger(user_id,kind,amount,reason,ref_id) VALUES(?,?,?,?,?)')->execute([$uid,'spend',-$price,'shop:'.$item,$ref]);
            db()->commit(); respond(['ok'=>true,'item'=>$shopCatalog[$item],'wallet'=>$walletFn($uid),'price_paid'=>$price]);
          }catch(Throwable $e){ if(db()->inTransaction()) db()->rollBack(); error_log('[ZeroLegend shop] '.$e->getMessage()); respond(['ok'=>false,'error'=>'Acquisto non riuscito.'],500); }
        }
    }

    if ($action === 'logout') respond(['ok'=>true]);

    respond(['ok'=>false,'error'=>'Azione sconosciuta.'],400);
} catch (PDOException $e) {
    error_log('[ZeroLegend auth PDO] ' . $e->getMessage());
    respond(['ok'=>false,'code'=>'DB_ERROR','error'=>'Errore database. Controlla la connessione MySQL e importa auth/migrate.sql.'],500);
} catch (Throwable $e) {
    error_log('[ZeroLegend auth] ' . $e->getMessage());
    $debug = isset($_GET['debug']) && $_GET['debug'] === '1';
    respond(['ok'=>false,'code'=>'AUTH_ERROR','error'=>$debug ? $e->getMessage() : 'Errore interno del servizio auth.'],500);
}
