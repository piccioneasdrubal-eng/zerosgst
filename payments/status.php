<?php
declare(strict_types=1);
header('Content-Type: application/json; charset=utf-8'); header('Cache-Control: no-store');
require_once __DIR__ . '/../auth/db-config.php'; require_once __DIR__ . '/config.php';
function out(array $d,int $s=200):void{http_response_code($s);echo json_encode($d,JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES);exit;}
function b64u(string $s):string{return rtrim(strtr(base64_encode($s),'+/','-_'),'=');} function b64d(string $s){$p=strlen($s)%4;if($p)$s.=str_repeat('=',4-$p);return base64_decode(strtr($s,'-_','+/'),true);}
function user(string $t):?array{if(!defined('API_SECRET')||!API_SECRET)return null;$p=explode('.',trim($t));if(count($p)!==3||$p[0]!=='zl1')return null;if(!hash_equals(b64u(hash_hmac('sha256',$p[1],API_SECRET,true)),$p[2]))return null;$j=b64d($p[1]);$x=json_decode((string)$j,true);if(!is_array($x)||(int)($x['exp']??0)<time())return null;$q=db()->prepare('SELECT * FROM users WHERE id=? LIMIT 1');$q->execute([(int)($x['uid']??0)]);return$q->fetch()?:null;}
$token=(string)($_GET['token']??'');$sid=(string)($_GET['session_id']??'');$u=user($token);if(!$u)out(['ok'=>false,'error'=>'Sessione non valida.'],401);if(!$sid)out(['ok'=>false,'error'=>'session_id mancante.'],400);
$q=db()->prepare('SELECT id,package_id,coins,amount_cents,currency,status,created_at,paid_at FROM zl_coin_orders WHERE stripe_session_id=? AND user_id=? LIMIT 1');$q->execute([$sid,(int)$u['id']]);$o=$q->fetch();if(!$o)out(['ok'=>false,'error'=>'Ordine non trovato.'],404);out(['ok'=>true,'order'=>$o,'coins'=>(int)$u['coins']]);
