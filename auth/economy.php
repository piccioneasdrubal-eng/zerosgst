<?php
declare(strict_types=1);
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'OPTIONS') { http_response_code(204); exit; }
require_once __DIR__ . '/db-config.php';
function out(array $d,int $s=200): void { http_response_code($s); echo json_encode($d,JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES); exit; }
function body(): array { $r=file_get_contents('php://input'); $j=is_string($r)?json_decode($r,true):null; return is_array($j)?$j:(is_array($_POST)?$_POST:[]); }
function table(string $t): bool { $s=db()->prepare("SELECT COUNT(*) FROM information_schema.tables WHERE table_schema=DATABASE() AND table_name=?"); $s->execute([$t]); return (int)$s->fetchColumn()>0; }
function ensure_column(string $t, string $col, string $def): void { try { db()->exec("ALTER TABLE `$t` ADD COLUMN $col $def"); } catch (Throwable $e) { /* colonna già presente: ignora */ } }
function ensure_schema(): void {
  db()->exec("CREATE TABLE IF NOT EXISTS zl_inventory (user_id INT UNSIGNED NOT NULL,item_id VARCHAR(80) NOT NULL,qty INT NOT NULL DEFAULT 1,equipped TINYINT(1) NOT NULL DEFAULT 0,updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,PRIMARY KEY(user_id,item_id),INDEX idx_inv_user(user_id)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");
  db()->exec("CREATE TABLE IF NOT EXISTS zl_coin_ledger (id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,user_id INT UNSIGNED NOT NULL,kind VARCHAR(30) NOT NULL,amount INT NOT NULL,reason VARCHAR(120) NOT NULL,ref_id VARCHAR(120) NULL,created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,PRIMARY KEY(id),UNIQUE KEY uq_ref(ref_id),INDEX idx_ledger_user(user_id)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");
  // Auto-ripara tabelle già esistenti create da versioni precedenti del codice a cui mancano colonne nuove.
  ensure_column('zl_inventory', 'user_id', "INT UNSIGNED NOT NULL DEFAULT 0");
  ensure_column('zl_inventory', 'item_id', "VARCHAR(80) NOT NULL DEFAULT ''");
  ensure_column('zl_inventory', 'qty', "INT NOT NULL DEFAULT 1");
  ensure_column('zl_inventory', 'equipped', "TINYINT(1) NOT NULL DEFAULT 0");
  ensure_column('zl_inventory', 'updated_at', "TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP");
  ensure_column('zl_coin_ledger', 'user_id', "INT UNSIGNED NOT NULL DEFAULT 0");
  ensure_column('zl_coin_ledger', 'kind', "VARCHAR(30) NOT NULL DEFAULT ''");
  ensure_column('zl_coin_ledger', 'amount', "INT NOT NULL DEFAULT 0");
  ensure_column('zl_coin_ledger', 'reason', "VARCHAR(120) NOT NULL DEFAULT ''");
  ensure_column('zl_coin_ledger', 'ref_id', "VARCHAR(120) NULL");
  ensure_column('zl_coin_ledger', 'created_at', "TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP");
  ensure_column('users', 'coins', "INT NOT NULL DEFAULT 0");
  ensure_column('users', 'equipped_skin', "VARCHAR(80) NOT NULL DEFAULT 'default'");
}
function user_row(int $id): array { $s=db()->prepare("SELECT * FROM `users` WHERE id=? LIMIT 1"); $s->execute([$id]); $u=$s->fetch(); if(!$u) out(['ok'=>false,'error'=>'Utente non trovato.'],404); return $u; }
function wallet(int $uid): array { ensure_schema(); $u=user_row($uid); $s=db()->prepare("SELECT item_id,qty,equipped FROM zl_inventory WHERE user_id=? AND qty>0 ORDER BY item_id"); $s->execute([$uid]); $inv=[]; $eq=(string)($u['equipped_skin'] ?? 'default'); while($r=$s->fetch()){ for($i=0;$i<(int)$r['qty'] && count($inv)<100;$i++) $inv[]=(string)$r['item_id']; if((int)$r['equipped']===1) $eq=(string)$r['item_id']; } if(!$inv) $inv=['skin_default']; return ['coins'=>(int)$u['coins'],'inventory'=>$inv,'equippedSkin'=>$eq]; }

function b64u_encode2(string $s): string { return rtrim(strtr(base64_encode($s), '+/', '-_'), '='); }
function b64u_decode2(string $s) { $pad = strlen($s) % 4; if ($pad) $s .= str_repeat('=', 4 - $pad); return base64_decode(strtr($s, '-_', '+/'), true); }
function token_uid(string $token): int {
  $parts = explode('.', trim($token));
  if(count($parts)!==3 || $parts[0]!=='zl1' || !defined('API_SECRET') || !API_SECRET) return 0;
  $expected=b64u_encode2(hash_hmac('sha256',$parts[1],(string)API_SECRET,true));
  if(!hash_equals($expected,$parts[2])) return 0;
  $json=b64u_decode2($parts[1]); if($json===false) return 0;
  $p=json_decode($json,true); if(!is_array($p) || (int)($p['v']??0)!==1 || (int)($p['exp']??0)<time()) return 0;
  return (int)($p['uid']??0);
}

function require_internal(): void { $given=(string)($_SERVER['HTTP_X_API_SECRET'] ?? ''); if (!defined('API_SECRET') || !API_SECRET || !hash_equals((string)API_SECRET,$given)) out(['ok'=>false,'error'=>'Accesso interno non autorizzato.'],403); }
$body=body(); $action=strtolower(trim((string)($body['action'] ?? ''))); if($action==='buy') $action='purchase_item'; if($action==='health') out(['ok'=>true,'service'=>'economy']);
$tokenUid = token_uid((string)($body['token'] ?? ''));
if($tokenUid>0){ $body['user_id']=$tokenUid; } else { require_internal(); }
if(!table('users')) out(['ok'=>false,'error'=>'Tabella users non trovata.'],500);
$uid=(int)($body['user_id'] ?? 0); if($uid<=0) out(['ok'=>false,'error'=>'user_id non valido.'],400);
$catalog=[
 'skin_galaxy'=>['name'=>'Skin Galassia','price'=>300,'type'=>'skin'],
 'skin_cyber'=>['name'=>'Skin Cyberpunk','price'=>500,'type'=>'skin'],
 'boost_speed_60'=>['name'=>'Boost Velocità 60s','price'=>200,'type'=>'consumable'],
 'boost_mass_60'=>['name'=>'Boost Massa 60s','price'=>400,'type'=>'consumable'],
 'shield_pack'=>['name'=>'Shield Pack','price'=>250,'type'=>'consumable'],
 'bounty_badge'=>['name'=>'Bounty Badge','price'=>350,'type'=>'consumable'],
 'coin_boost_2x_60'=>['name'=>'x2 Coins 60s','price'=>350,'type'=>'consumable'],
 'starter_bundle'=>['name'=>'Starter Bundle','price'=>600,'type'=>'consumable'],
];
if($action==='wallet') out(['ok'=>true,'wallet'=>wallet($uid)]);

if($action==='catalog') out(['ok'=>true,'catalog'=>$catalog]);
if($action==='inventory') out(['ok'=>true,'wallet'=>wallet($uid)]);
if($action==='history') {
  ensure_schema(); $q=db()->prepare("SELECT kind,amount,reason,ref_id,created_at FROM zl_coin_ledger WHERE user_id=? ORDER BY id DESC LIMIT 100"); $q->execute([$uid]);
  out(['ok'=>true,'history'=>$q->fetchAll()]);
}
if($action==='equip' || $action==='unequip') {
  ensure_schema();
  if($action==='unequip') {
    $q=db()->prepare("UPDATE users SET equipped_skin='default', updated_at=CURRENT_TIMESTAMP WHERE id=?"); $q->execute([$uid]);
    out(['ok'=>true,'equipped_skin'=>'default','wallet'=>wallet($uid)]);
  }
  $item=trim((string)($body['item_id'] ?? $body['itemId'] ?? ''));
  $q=db()->prepare("SELECT qty FROM zl_inventory WHERE user_id=? AND item_id=? LIMIT 1"); $q->execute([$uid,$item]);
  if(!$q->fetch()) out(['ok'=>false,'error'=>'Oggetto non posseduto.'],404);
  $u=db()->prepare("UPDATE users SET equipped_skin=?, updated_at=CURRENT_TIMESTAMP WHERE id=?"); $u->execute([$item,$uid]);
  $e=db()->prepare("UPDATE zl_inventory SET equipped=0 WHERE user_id=?"); $e->execute([$uid]);
  $e=db()->prepare("UPDATE zl_inventory SET equipped=1 WHERE user_id=? AND item_id=?"); $e->execute([$uid,$item]);
  out(['ok'=>true,'equipped_skin'=>$item,'wallet'=>wallet($uid)]);
}
if($action==='purchase_item'){
  $item=trim((string)($body['item_id'] ?? $body['itemId'] ?? '')); if(!isset($catalog[$item])) out(['ok'=>false,'error'=>'Oggetto non valido.'],400);
  $price=(int)$catalog[$item]['price']; ensure_schema(); db()->beginTransaction();
  try{
    $u=user_row($uid);
    $s=db()->prepare("SELECT qty FROM zl_inventory WHERE user_id=? AND item_id=? FOR UPDATE"); $s->execute([$uid,$item]); $owned=$s->fetch();
    if($catalog[$item]['type']==='skin' && $owned){ db()->rollBack(); out(['ok'=>false,'error'=>'Oggetto già posseduto.'],409); }
    $c=db()->prepare("SELECT coins FROM users WHERE id=? FOR UPDATE"); $c->execute([$uid]); $coins=(int)$c->fetchColumn();
    if($coins<$price){ db()->rollBack(); out(['ok'=>false,'error'=>'ZeroCoins insufficienti.','wallet'=>['coins'=>$coins]],409); }
    $new=$coins-$price; $up=db()->prepare("UPDATE users SET coins=?,updated_at=CURRENT_TIMESTAMP WHERE id=?"); $up->execute([$new,$uid]);
    $ins=db()->prepare("INSERT INTO zl_inventory(user_id,item_id,qty,equipped) VALUES(?,?,1,?) ON DUPLICATE KEY UPDATE qty=qty+1,equipped=VALUES(equipped)"); $ins->execute([$uid,$item,$catalog[$item]['type']==='skin'?1:0]);
    $ref='shop:'.bin2hex(random_bytes(12)); $lg=db()->prepare("INSERT INTO zl_coin_ledger(user_id,kind,amount,reason,ref_id) VALUES(?,?,?,?,?)"); $lg->execute([$uid,'spend',-$price,'shop:'.$item,$ref]);
    db()->commit(); out(['ok'=>true,'item'=>$catalog[$item],'wallet'=>wallet($uid)+['price_paid'=>$price]]);
  }catch(Throwable $e){ if(db()->inTransaction()) db()->rollBack(); out(['ok'=>false,'error'=>'Acquisto non riuscito.'],500); }
}
out(['ok'=>false,'error'=>'Azione non supportata.'],400);
