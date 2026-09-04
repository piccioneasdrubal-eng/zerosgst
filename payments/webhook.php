<?php
declare(strict_types=1);
http_response_code(200);
require_once __DIR__ . '/../auth/db-config.php';
require_once __DIR__ . '/config.php';
$payload=file_get_contents('php://input'); $sig=(string)($_SERVER['HTTP_STRIPE_SIGNATURE']??'');
function bad(): never { http_response_code(400); echo 'invalid'; exit; }
if(!STRIPE_WEBHOOK_SECRET || STRIPE_WEBHOOK_SECRET==='INSERISCI_STRIPE_WEBHOOK_SECRET') bad();
$parts=[]; foreach(explode(',',$sig) as $x){[$k,$v]=array_pad(explode('=',$x,2),2,''); $parts[$k][]=$v;}
$ts=(int)($parts['t'][0]??0); $v1s=$parts['v1']??[]; if(!$ts||abs(time()-$ts)>300)bad();
$expected=hash_hmac('sha256',$ts.'.'.$payload,STRIPE_WEBHOOK_SECRET); $valid=false; foreach($v1s as $v1){if(hash_equals($expected,$v1)){$valid=true;break;}} if(!$valid)bad();
$event=json_decode($payload,true); if(!is_array($event))bad(); $type=(string)($event['type']??'');
if(!in_array($type,['checkout.session.completed','checkout.session.async_payment_succeeded'],true)){echo 'ignored';exit;}
$s=$event['data']['object']??[]; if(!is_array($s))bad(); if(($s['payment_status']??'')!=='paid' && $type==='checkout.session.completed'){echo 'pending';exit;}
$sessionId=(string)($s['id']??''); $eventId=(string)($event['id']??''); if(!$sessionId||!$eventId){echo 'missing';exit;}
$db=db(); $db->beginTransaction(); try{
  $q=$db->prepare('SELECT * FROM zl_coin_orders WHERE stripe_session_id=? FOR UPDATE'); $q->execute([$sessionId]); $o=$q->fetch(); if(!$o){$db->rollBack();echo 'unknown';exit;}
  if(($o['status']??'')==='paid'){ $db->rollBack(); echo 'ok'; exit; }
  $meta=$s['metadata']??[]; $userId=(int)($o['user_id']??0); $coins=(int)($o['coins']??0); if($coins<=0||$userId<=0){$db->rollBack();bad();}
  $db->prepare('UPDATE users SET coins=coins+?,updated_at=CURRENT_TIMESTAMP WHERE id=?')->execute([$coins,$userId]);
  $ref='stripe:'.$sessionId; $db->prepare("CREATE TABLE IF NOT EXISTS zl_coin_ledger (id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,user_id INT UNSIGNED NOT NULL,kind VARCHAR(30) NOT NULL,amount INT NOT NULL,reason VARCHAR(120) NOT NULL,ref_id VARCHAR(120) NULL,created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,PRIMARY KEY(id),UNIQUE KEY uq_ref(ref_id),INDEX idx_ledger_user(user_id)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");
  try{$db->prepare('INSERT INTO zl_coin_ledger(user_id,kind,amount,reason,ref_id) VALUES(?,?,?,?,?)')->execute([$userId,'purchase',$coins,'stripe:'.$o['package_id'],$ref]);}catch(Throwable $e){}
  $db->prepare('UPDATE zl_coin_orders SET status=?,stripe_payment_intent=?,webhook_event_id=?,paid_at=CURRENT_TIMESTAMP WHERE id=?')->execute(['paid',(string)($s['payment_intent']??''),$eventId,(int)$o['id']]);
  $db->commit(); echo 'ok';
}catch(Throwable $e){if($db->inTransaction())$db->rollBack();http_response_code(500);echo 'error';}
