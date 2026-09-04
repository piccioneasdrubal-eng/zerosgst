<?php
declare(strict_types=1);
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');
if (($_SERVER['REQUEST_METHOD'] ?? '') === 'OPTIONS') { http_response_code(204); exit; }
require_once __DIR__ . '/db-config.php';
function outp(array $d,int $s=200): void { http_response_code($s); echo json_encode($d,JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES); exit; }
function bodyp(): array { $raw=file_get_contents('php://input'); $j=is_string($raw)?json_decode($raw,true):null; return is_array($j)?$j:(is_array($_POST)?$_POST:[]); }
function token_user_p(string $token): ?array {
  $p=explode('.',trim($token)); if(count($p)!==3||$p[0]!=='zl1'||!defined('API_SECRET')||API_SECRET==='') return null;
  $b=rtrim(strtr(base64_encode((string)hash_hmac('sha256',$p[1],(string)API_SECRET,true)),'+/','-_'),'='); if(!hash_equals($b,$p[2])) return null;
  $s=strtr($p[1],'-_','+/'); $pad=strlen($s)%4; if($pad)$s.=str_repeat('=',4-$pad); $json=base64_decode($s,true); $x=is_string($json)?json_decode($json,true):null;
  if(!is_array($x)||(int)($x['exp']??0)<time()) return null;
  $st=db()->prepare('SELECT * FROM users WHERE id=? LIMIT 1'); $st->execute([(int)($x['uid']??0)]); return $st->fetch() ?: null;
}
function ensure_pref_schema(): void {
  db()->exec("CREATE TABLE IF NOT EXISTS zl_user_preferences (
    user_id INT UNSIGNED NOT NULL,
    settings_json LONGTEXT NOT NULL,
    keybinds_json LONGTEXT NOT NULL,
    skin_color VARCHAR(20) NOT NULL DEFAULT '#4dd0ff',
    nickname VARCHAR(40) NOT NULL DEFAULT '',
    custom_skin_url VARCHAR(500) NULL,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY(user_id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");
}
try {
  $method=strtoupper((string)($_SERVER['REQUEST_METHOD']??''));
  if($method==='GET') outp(['ok'=>true]);
  if($method!=='POST') outp(['ok'=>false,'error'=>'POST richiesto.'],405);
  $b=bodyp(); $u=token_user_p((string)($b['token']??'')); if(!$u) outp(['ok'=>false,'error'=>'Sessione non valida.'],401);
  ensure_pref_schema();
  $action=strtolower(trim((string)($b['action']??'get'))); $uid=(int)$u['id'];
  $st=db()->prepare('SELECT * FROM zl_user_preferences WHERE user_id=? LIMIT 1'); $st->execute([$uid]); $row=$st->fetch() ?: null;
  if(!$row){
    $row=['settings_json'=>json_encode([],JSON_UNESCAPED_UNICODE),'keybinds_json'=>json_encode([],JSON_UNESCAPED_UNICODE),'skin_color'=>'#4dd0ff','nickname'=>(string)($u['username']??''),'custom_skin_url'=>null];
    db()->prepare('INSERT IGNORE INTO zl_user_preferences(user_id,settings_json,keybinds_json,skin_color,nickname,custom_skin_url) VALUES(?,?,?,?,?,?)')->execute([$uid,$row['settings_json'],$row['keybinds_json'],$row['skin_color'],$row['nickname'],$row['custom_skin_url']]);
  }
  if($action==='get'){
    outp(['ok'=>true,'preferences'=>[
      'settings'=>json_decode((string)$row['settings_json'],true) ?: [],
      'keybinds'=>json_decode((string)$row['keybinds_json'],true) ?: [],
      'skinColor'=>(string)$row['skin_color'], 'nickname'=>(string)$row['nickname'], 'customSkinUrl'=>$row['custom_skin_url']
    ]]);
  }
  if($action==='save'){
    $settings=$b['settings']??[]; $keybinds=$b['keybinds']??[];
    if(!is_array($settings)||!is_array($keybinds)) outp(['ok'=>false,'error'=>'Preferenze non valide.'],400);
    $cleanSettings=[]; foreach($settings as $k=>$v){ if(is_string($k)&&strlen($k)<=40 && is_bool($v)) $cleanSettings[$k]=$v; }
    $allowed=['split','feed','virus']; $cleanKeys=[]; foreach($allowed as $k){$v=$keybinds[$k]??null;if(is_string($v)&&strlen($v)<=20)$cleanKeys[$k]=$v;}
    $color=(string)($b['skinColor']??$row['skin_color']); if(!preg_match('/^#[0-9a-fA-F]{6}$/',$color))$color=(string)$row['skin_color'];
    $nick=trim((string)($b['nickname']??$row['nickname'])); $nick=mb_substr($nick,0,40);
    $st=db()->prepare('INSERT INTO zl_user_preferences(user_id,settings_json,keybinds_json,skin_color,nickname,custom_skin_url) VALUES(?,?,?,?,?,?) ON DUPLICATE KEY UPDATE settings_json=VALUES(settings_json),keybinds_json=VALUES(keybinds_json),skin_color=VALUES(skin_color),nickname=VALUES(nickname)');
    $st->execute([$uid,json_encode($cleanSettings,JSON_UNESCAPED_UNICODE),json_encode($cleanKeys,JSON_UNESCAPED_UNICODE),$color,$nick,$row['custom_skin_url']??null]);
    outp(['ok'=>true,'savedAt'=>time()]);
  }
  outp(['ok'=>false,'error'=>'Azione non supportata.'],400);
} catch(Throwable $e){ error_log('[ZeroLegend prefs] '.$e->getMessage()); outp(['ok'=>false,'error'=>'Errore salvataggio preferenze.'],500); }
