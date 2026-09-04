<?php
declare(strict_types=1);
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');
if (($_SERVER['REQUEST_METHOD'] ?? '') === 'OPTIONS') { http_response_code(204); exit; }
require_once __DIR__ . '/db-config.php';
function oute(array $d,int $s=200): void { http_response_code($s); echo json_encode($d,JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES); exit; }
function bodye(): array { $raw=file_get_contents('php://input'); $j=is_string($raw)?json_decode($raw,true):null; return is_array($j)?$j:(is_array($_POST)?$_POST:[]); }
function token_user_e(string $token): ?array { $p=explode('.',trim($token)); if(count($p)!==3||$p[0]!=='zl1'||!defined('API_SECRET')||API_SECRET==='')return null; $sig=rtrim(strtr(base64_encode((string)hash_hmac('sha256',$p[1],(string)API_SECRET,true)),'+/','-_'),'='); if(!hash_equals($sig,$p[2]))return null; $b=$p[1]; $b.=str_repeat('=',(4-strlen($b)%4)%4); $x=json_decode((string)base64_decode(strtr($b,'-_','+/'),true),true); if(!is_array($x)||(int)($x['exp']??0)<time())return null; $st=db()->prepare('SELECT * FROM users WHERE id=? LIMIT 1'); $st->execute([(int)($x['uid']??0)]); return $st->fetch()?:null; }
function ensure_e(): void { db()->exec("CREATE TABLE IF NOT EXISTS zl_inventory (user_id INT UNSIGNED NOT NULL,item_id VARCHAR(80) NOT NULL,qty INT NOT NULL DEFAULT 1,equipped TINYINT(1) NOT NULL DEFAULT 0,updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,PRIMARY KEY(user_id,item_id)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"); db()->exec("CREATE TABLE IF NOT EXISTS zl_coin_ledger (id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,user_id INT UNSIGNED NOT NULL,kind VARCHAR(30) NOT NULL,amount INT NOT NULL,reason VARCHAR(120) NOT NULL,ref_id VARCHAR(120) NULL,created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,PRIMARY KEY(id),UNIQUE KEY uq_ref(ref_id),INDEX idx_user(user_id)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"); }
$b=bodye(); $u=token_user_e((string)($b['token']??'')); if(!$u)oute(['ok'=>false,'error'=>'Sessione non valida.'],401); ensure_e(); $action=strtolower(trim((string)($b['action']??'wallet'))); $uid=(int)$u['id'];
$catalog=[
 'skin_galaxy'=>['name'=>'Skin Galassia','price'=>300,'type'=>'skin'],
 'skin_cyber'=>['name'=>'Skin Cyberpunk','price'=>500,'type'=>'skin'],
 'boost_speed_60'=>['name'=>'Boost Velocità 60s','price'=>200,'type'=>'consumable'],
 'boost_mass_60'=>['name'=>'Boost Massa 60s','price'=>400,'type'=>'consumable'],
 'shield_pack'=>['name'=>'Shield Pack','price'=>250,'type'=>'consumable'],
 'bounty_badge'=>['name'=>'Bounty Badge','price'=>350,'type'=>'consumable'],
];
function user_wallet_e(int $uid): array { $c=(int)db()->query('SELECT coins FROM users WHERE id='.(int)$uid)->fetchColumn(); $st=db()->prepare('SELECT item_id,qty,equipped FROM zl_inventory WHERE user_id=? AND qty>0 ORDER BY item_id');$st->execute([$uid]);$items=[];$eq='default';while($r=$st->fetch()){for($i=0;$i<(int)$r['qty']&&count($items)<100;$i++)$items[]=$r['item_id'];if((int)$r['equipped']===1)$eq=$r['item_id'];}return ['coins'=>$c,'inventory'=>$items,'equippedSkin'=>$eq]; }
if($action==='wallet')oute(['ok'=>true,'wallet'=>user_wallet_e($uid)]);
if($action==='buy'){
 $item=(string)($b['item_id']??''); if(!isset($catalog[$item]))oute(['ok'=>false,'error'=>'Oggetto non valido.'],400); $price=(int)$catalog[$item]['price']; db()->beginTransaction();
 try{
  $s=db()->prepare('SELECT coins FROM users WHERE id=? FOR UPDATE');$s->execute([$uid]);$coins=(int)$s->fetchColumn();
  $owned=db()->prepare('SELECT qty FROM zl_inventory WHERE user_id=? AND item_id=? FOR UPDATE');$owned->execute([$uid,$item]);$own=$owned->fetch();
  if($catalog[$item]['type']==='skin'&&$own){db()->rollBack();oute(['ok'=>false,'error'=>'Oggetto già posseduto.'],409);} if($coins<$price){db()->rollBack();oute(['ok'=>false,'error'=>'ZeroCoins insufficienti.','wallet'=>['coins'=>$coins]],409);} $new=$coins-$price;
  db()->prepare('UPDATE users SET coins=?,updated_at=CURRENT_TIMESTAMP WHERE id=?')->execute([$new,$uid]);
  db()->prepare('INSERT INTO zl_inventory(user_id,item_id,qty,equipped) VALUES(?,?,1,?) ON DUPLICATE KEY UPDATE qty=qty+1')->execute([$uid,$item,$catalog[$item]['type']==='skin'?1:0]);
  if($catalog[$item]['type']==='skin') db()->prepare("UPDATE zl_inventory SET equipped=CASE WHEN item_id=? THEN 1 ELSE 0 END WHERE user_id=?")->execute([$item,$uid]);
  db()->prepare('INSERT INTO zl_coin_ledger(user_id,kind,amount,reason,ref_id) VALUES(?,?,?,?,?)')->execute([$uid,'spend',-$price,'shop:'.$item,'webshop:'.bin2hex(random_bytes(10))]);
  db()->commit(); oute(['ok'=>true,'item'=>$catalog[$item],'wallet'=>user_wallet_e($uid)]);
 }catch(Throwable $e){if(db()->inTransaction())db()->rollBack();oute(['ok'=>false,'error'=>'Acquisto non riuscito.'],500);}
}
if($action==='equip'){
 $item=(string)($b['item_id']??''); $st=db()->prepare('SELECT qty FROM zl_inventory WHERE user_id=? AND item_id=? AND qty>0');$st->execute([$uid,$item]); if(!$st->fetch())oute(['ok'=>false,'error'=>'Skin non posseduta.'],409); db()->prepare('UPDATE zl_inventory SET equipped=0 WHERE user_id=?')->execute([$uid]); db()->prepare('UPDATE zl_inventory SET equipped=1 WHERE user_id=? AND item_id=?')->execute([$uid,$item]); $skin=preg_replace('/^skin_/','',$item); db()->prepare('UPDATE users SET equipped_skin=?,updated_at=CURRENT_TIMESTAMP WHERE id=?')->execute([$skin,$uid]);oute(['ok'=>true,'wallet'=>user_wallet_e($uid)]);
}
if($action==='unequip'){db()->prepare('UPDATE zl_inventory SET equipped=0 WHERE user_id=?')->execute([$uid]);db()->prepare("UPDATE users SET equipped_skin='default',updated_at=CURRENT_TIMESTAMP WHERE id=?")->execute([$uid]);oute(['ok'=>true,'wallet'=>user_wallet_e($uid)]);}
oute(['ok'=>false,'error'=>'Azione non supportata.'],400);
