<?php
declare(strict_types=1);
header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
header('Pragma: no-cache');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');
$origin = trim((string)($_SERVER['HTTP_ORIGIN'] ?? ''));
if ($origin !== '') { header('Access-Control-Allow-Origin: '.$origin); header('Vary: Origin'); }
else { header('Access-Control-Allow-Origin: *'); }
if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'OPTIONS') { http_response_code(204); exit; }

require_once __DIR__ . '/db-config.php';

const MAX_SKIN_BYTES = 52428800; // 50 MiB
const CHUNK_BYTES = 524288;      // 512 KiB per request
const MAX_DIMENSION = 2048;
const MAX_NAME = 64;
const MAX_VERIFY_BYTES = 2097152; // inspect up to first 2 MiB for image headers

function out(array $d, int $status=200): void {
    header('Content-Type: application/json; charset=utf-8');
    http_response_code($status);
    echo json_encode($d, JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES);
    exit;
}

function req(): array {
    $raw = file_get_contents('php://input');
    if (is_string($raw) && $raw !== '') {
        $j = json_decode($raw, true);
        if (is_array($j)) return $j;
    }
    return is_array($_POST) ? $_POST : [];
}

function table_exists(string $name): bool {
    $s=db()->prepare("SELECT COUNT(*) FROM information_schema.tables WHERE table_schema=DATABASE() AND table_name=?");
    $s->execute([$name]);
    return (int)$s->fetchColumn()>0;
}

function column_exists(string $table, string $column): bool {
    $s=db()->prepare("SELECT COUNT(*) FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name=? AND column_name=?");
    $s->execute([$table,$column]);
    return (int)$s->fetchColumn()>0;
}

function ensure_schema(): void {
    db()->exec("CREATE TABLE IF NOT EXISTS zl_custom_skins (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      user_id INT UNSIGNED NOT NULL,
      skin_key VARCHAR(64) NOT NULL,
      title VARCHAR(64) NOT NULL DEFAULT 'Skin personalizzata',
      filename VARCHAR(180) NOT NULL,
      url VARCHAR(255) NOT NULL,
      size_bytes BIGINT UNSIGNED NOT NULL,
      mime VARCHAR(80) NOT NULL,
      width SMALLINT UNSIGNED NULL,
      height SMALLINT UNSIGNED NULL,
      active TINYINT(1) NOT NULL DEFAULT 1,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY(id),
      UNIQUE KEY uq_user_skin_key(user_id,skin_key),
      INDEX idx_custom_skins_user(user_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");

    // Compatibility with older installations of zl_custom_skins.
    // Older builds used a simpler schema without skin_key; that caused HTTP 500
    // during finalize when INSERT referenced the missing column.
    $adds = [
      'skin_key' => "ALTER TABLE zl_custom_skins ADD COLUMN skin_key VARCHAR(64) NOT NULL DEFAULT ''",
      'title' => "ALTER TABLE zl_custom_skins ADD COLUMN title VARCHAR(64) NOT NULL DEFAULT 'Skin personalizzata'",
      'filename' => "ALTER TABLE zl_custom_skins ADD COLUMN filename VARCHAR(180) NOT NULL DEFAULT ''",
      'url' => "ALTER TABLE zl_custom_skins ADD COLUMN url VARCHAR(255) NOT NULL DEFAULT ''",
      'size_bytes' => "ALTER TABLE zl_custom_skins ADD COLUMN size_bytes BIGINT UNSIGNED NOT NULL DEFAULT 0",
      'mime' => "ALTER TABLE zl_custom_skins ADD COLUMN mime VARCHAR(80) NOT NULL DEFAULT 'application/octet-stream'",
      'width' => "ALTER TABLE zl_custom_skins ADD COLUMN width SMALLINT UNSIGNED NULL",
      'height' => "ALTER TABLE zl_custom_skins ADD COLUMN height SMALLINT UNSIGNED NULL",
      'active' => "ALTER TABLE zl_custom_skins ADD COLUMN active TINYINT(1) NOT NULL DEFAULT 1",
      'created_at' => "ALTER TABLE zl_custom_skins ADD COLUMN created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP",
    ];
    foreach ($adds as $column=>$sql) {
        if (!column_exists('zl_custom_skins',$column)) { try { db()->exec($sql); } catch(Throwable $e) {} }
    }
    // Best-effort compatibility index; do not add a UNIQUE index because old rows
    // may all have the empty default skin_key.
    try { db()->exec("ALTER TABLE zl_custom_skins ADD INDEX idx_custom_skins_key (skin_key)"); } catch(Throwable $e) {}
}

function token_user(string $token): ?array {
    $parts=explode('.', trim($token));
    if(count($parts)!==3 || $parts[0]!=='zl1' || !defined('API_SECRET') || API_SECRET==='') return null;
    $expected=rtrim(strtr(base64_encode(hash_hmac('sha256',$parts[1],(string)API_SECRET,true)), '+/', '-_'), '=');
    if(!hash_equals($expected,$parts[2])) return null;
    $b=$parts[1]; $pad=strlen($b)%4; if($pad) $b.=str_repeat('=',4-$pad);
    $json=base64_decode(strtr($b,'-_','+/'),true); $payload=is_string($json)?json_decode($json,true):null;
    if(!is_array($payload) || (int)($payload['v']??0)!==1 || (int)($payload['exp']??0)<time()) return null;
    $id=(int)($payload['uid']??0); if($id<=0 || !table_exists('users')) return null;
    $s=db()->prepare('SELECT * FROM `users` WHERE id=? LIMIT 1'); $s->execute([$id]); $u=$s->fetch(); return $u?:null;
}
function require_user(string $token): array { $u=token_user($token); if(!$u) out(['ok'=>false,'error'=>'Sessione non valida.'],401); return $u; }
function safe_id(string $id): string { return preg_match('/^[A-Fa-f0-9]{24,64}$/',$id)?$id:''; }
function paths(): array {
    $base=__DIR__.'/uploads/skins';
    $chunks=$base.'/chunks';
    if(!is_dir($base) && !@mkdir($base,0755,true) && !is_dir($base)) out(['ok'=>false,'error'=>'Impossibile creare la cartella skin.'],500);
    if(!is_dir($chunks) && !@mkdir($chunks,0755,true) && !is_dir($chunks)) out(['ok'=>false,'error'=>'Impossibile creare la cartella chunks.'],500);
    return [$base,$chunks];
}
function cleanup_chunks(string $uploadId,int $total): void {
    [, $chunks]=paths();
    for($i=0;$i<$total;$i++){ $p=$chunks.'/'.$uploadId.'.'.$i.'.bin'; if(is_file($p)) @unlink($p); }
    $meta=$chunks.'/'.$uploadId.'.json'; if(is_file($meta)) @unlink($meta);
}

function mime_from_magic(string $sample): array {
    if (substr($sample,0,6)==='GIF87a' || substr($sample,0,6)==='GIF89a') return ['image/gif','gif'];
    if (substr($sample,0,3)==="\xFF\xD8\xFF") return ['image/jpeg','jpg'];
    if (substr($sample,0,8)==="\x89PNG\r\n\x1A\n") return ['image/png','png'];
    if (strlen($sample)>=12 && substr($sample,0,4)==='RIFF' && substr($sample,8,4)==='WEBP') return ['image/webp','webp'];
    if (substr($sample,0,2)==='BM') return ['image/bmp','bmp'];
    if (strlen($sample)>=16 && substr($sample,4,4)==='ftyp') {
        $brands = substr($sample,8,64);
        if (strpos($brands,'avif')!==false || strpos($brands,'avis')!==false || strpos($brands,'mif1')!==false) return ['image/avif','avif'];
    }
    return ['', ''];
}

function read_sample(string $chunks, string $uploadId, int $total): string {
    $sample='';
    $limit=MAX_VERIFY_BYTES;
    for($i=0;$i<$total && strlen($sample)<$limit;$i++){
        $p=$chunks.'/'.$uploadId.'.'.$i.'.bin';
        if(!is_file($p)) break;
        $fh=@fopen($p,'rb'); if(!$fh) break;
        $piece=@fread($fh,$limit-strlen($sample)); @fclose($fh);
        if(is_string($piece)) $sample.=$piece;
    }
    return $sample;
}

function dimensions_from_sample(string $mime, string $sample): array {
    // Best-effort: image headers are usually contained near the beginning.
    if (function_exists('getimagesizefromstring')) {
        $info=@getimagesizefromstring($sample);
        if(is_array($info)) return [(int)($info[0]??0),(int)($info[1]??0)];
    }
    return [0,0];
}

function verify_image_from_chunks(string $chunks,string $uploadId,int $total,int $size): array {
    if($size<=0 || $size>MAX_SKIN_BYTES) out(['ok'=>false,'error'=>'L\'immagine supera il limite di 50 MB.'],413);
    $sample=read_sample($chunks,$uploadId,$total);
    [$mime,$ext]=mime_from_magic($sample);
    if($mime==='') {
        $finfo = function_exists('finfo_open') ? @finfo_open(FILEINFO_MIME_TYPE) : false;
        if($finfo) {
            // fileinfo cannot inspect split files as one stream; keep magic detection authoritative.
            @finfo_close($finfo);
        }
        out(['ok'=>false,'error'=>'Immagine non riconosciuta. Usa JPG, JPEG, PNG, GIF, WebP, AVIF o BMP.'],415);
    }
    [$w,$h]=dimensions_from_sample($mime,$sample);
    if($w<1 || $h<1) {
        // Do not reject a valid format only because the host PHP lacks image decoders.
        $w=null; $h=null;
    } elseif($w>MAX_DIMENSION || $h>MAX_DIMENSION) {
        out(['ok'=>false,'error'=>'Dimensioni massime: '.MAX_DIMENSION.'×'.MAX_DIMENSION.'.'],422);
    }
    return [$size,$w,$h,$mime,$ext];
}

function stream_chunks(string $chunks,string $uploadId,int $total,int $size,string $mime): void {
    while(ob_get_level()>0) @ob_end_clean();
    header('Content-Type: '.$mime);
    header('Content-Length: '.(string)$size);
    header('Cache-Control: public, max-age=31536000, immutable');
    header('X-Content-Type-Options: nosniff');
    if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'HEAD') exit;
    for($i=0;$i<$total;$i++){
        $p=$chunks.'/'.$uploadId.'.'.$i.'.bin';
        if(!is_file($p)) { http_response_code(404); exit; }
        $fh=@fopen($p,'rb'); if(!$fh){ http_response_code(500); exit; }
        while(!feof($fh)){ $buf=fread($fh,1048576); if($buf===false) break; if($buf!=='') echo $buf; }
        fclose($fh);
        flush();
    }
    exit;
}

$body=req();
$action=strtolower(trim((string)($_GET['action'] ?? $body['action'] ?? '')));

// Public image delivery: no login required, but the opaque skin_key is required.
if($action==='serve'){
    ensure_schema();
    $id=(int)($_GET['id'] ?? $body['id'] ?? 0);
    $key=preg_replace('/[^A-Za-z0-9_]/','',(string)($_GET['key'] ?? $body['key'] ?? ''));
    if($id<=0 || $key==='') { http_response_code(400); exit; }
    $s=db()->prepare('SELECT skin_key,url,size_bytes,mime,active FROM zl_custom_skins WHERE id=? LIMIT 1');
    $s->execute([$id]); $row=$s->fetch();
    if(!$row || !(int)$row['active'] || !hash_equals((string)$row['skin_key'],$key)) { http_response_code(404); exit; }
    [, $chunks]=paths();
    $meta = $chunks.'/'.$key.'.json';
    if(!is_file($meta)){ http_response_code(404); exit; }
    $m=json_decode((string)file_get_contents($meta),true);
    if(!is_array($m) || (int)($m['total']??0)<1 || (int)($m['bytes']??0)!=(int)$row['size_bytes']) { http_response_code(404); exit; }
    stream_chunks($chunks,$key,(int)$m['total'],(int)$row['size_bytes'],(string)$row['mime']);
}

if($action==='health') out(['ok'=>true,'max_bytes'=>MAX_SKIN_BYTES,'max_mb'=>50,'chunk_bytes'=>CHUNK_BYTES,'storage'=>'chunked']);
if($action==='dbcheck') {
    $required=['id','user_id','skin_key','title','filename','url','size_bytes','mime','width','height','active','created_at'];
    $missing=[]; foreach($required as $c){ if(!column_exists('zl_custom_skins',$c)) $missing[]=$c; }
    out(['ok'=>empty($missing),'table'=>table_exists('zl_custom_skins'),'missing'=>$missing]);
}

ensure_schema();
$token=(string)($_GET['token'] ?? $body['token'] ?? '');
$u=require_user($token); $uid=(int)$u['id'];

if($action==='list'){
    $uEq=(string)($u['equipped_skin'] ?? 'default');
    $s=db()->prepare('SELECT id,skin_key,title,url,size_bytes,mime,width,height,active,created_at FROM zl_custom_skins WHERE user_id=? ORDER BY id DESC');
    $s->execute([$uid]);
    $rows=$s->fetchAll();
    foreach($rows as &$row){
        $row['id']=(int)$row['id']; $row['size_bytes']=(int)$row['size_bytes'];
        $row['width']=isset($row['width'])?(int)$row['width']:0; $row['height']=isset($row['height'])?(int)$row['height']:0;
        $row['active']=(bool)$row['active'];
        $row['equipped']=($uEq==='custom:'.$row['id'].':'.$row['skin_key']) || ($uEq==='custom_'.$row['skin_key']);
    }
    unset($row);
    out(['ok'=>true,'max_bytes'=>MAX_SKIN_BYTES,'skins'=>$rows,'equipped_skin'=>$uEq]);
}

if($action==='equip'){
    if(($_SERVER['REQUEST_METHOD']??'GET')!=='POST') out(['ok'=>false,'error'=>'Metodo non valido.'],405);
    $id=(int)($body['id']??0);
    if($id<=0) out(['ok'=>false,'error'=>'ID skin non valido.'],400);
    $s=db()->prepare('SELECT id,skin_key,title,url,size_bytes,mime,width,height,active FROM zl_custom_skins WHERE id=? AND user_id=? LIMIT 1');
    $s->execute([$id,$uid]); $skin=$s->fetch();
    if(!$skin || !(int)$skin['active']) out(['ok'=>false,'error'=>'Skin non trovata o non attiva.'],404);
    $skinKey=(string)$skin['skin_key'];
    $eq='custom:'.(int)$skin['id'].':'.$skinKey;
    $up=db()->prepare('UPDATE `users` SET equipped_skin=?, updated_at=CURRENT_TIMESTAMP WHERE id=?');
    try{
        $up->execute([$eq,$uid]);
    }catch(Throwable $e){
        out(['ok'=>false,'error'=>'Impossibile equipaggiare la skin.'],500);
    }
    $skin['id']=(int)$skin['id']; $skin['size_bytes']=(int)$skin['size_bytes']; $skin['width']=isset($skin['width'])?(int)$skin['width']:0; $skin['height']=isset($skin['height'])?(int)$skin['height']:0;
    out(['ok'=>true,'equipped_skin'=>$eq,'skin'=>$skin,'reload_game'=>true]);
}

if($action==='unequip'){
    if(($_SERVER['REQUEST_METHOD']??'GET')!=='POST') out(['ok'=>false,'error'=>'Metodo non valido.'],405);
    $up=db()->prepare("UPDATE `users` SET equipped_skin='default', updated_at=CURRENT_TIMESTAMP WHERE id=?");
    $up->execute([$uid]);
    out(['ok'=>true,'equipped_skin'=>'default','reload_game'=>true]);
}

if($action==='upload_chunk'){
    if(($_SERVER['REQUEST_METHOD']??'GET')!=='POST') out(['ok'=>false,'error'=>'Metodo non valido.'],405);
    $uploadId=safe_id((string)($body['upload_id'] ?? $_POST['upload_id'] ?? ''));
    $idx=(int)($body['chunk_index'] ?? $_POST['chunk_index'] ?? -1);
    $total=(int)($body['total_chunks'] ?? $_POST['total_chunks'] ?? 0);
    $totalBytes=(int)($body['total_bytes'] ?? $_POST['total_bytes'] ?? 0);
    if($uploadId==='' || $idx<0 || $total<1 || $idx>=$total || $totalBytes<1 || $totalBytes>MAX_SKIN_BYTES) out(['ok'=>false,'error'=>'Parametri upload non validi.'],400);
    if(!isset($_FILES['chunk']) || !is_uploaded_file($_FILES['chunk']['tmp_name'])) out(['ok'=>false,'error'=>'Chunk mancante.'],400);
    $err=(int)$_FILES['chunk']['error']; if($err!==UPLOAD_ERR_OK) out(['ok'=>false,'error'=>'Upload chunk fallito (codice '.$err.'). Controlla i limiti PHP del server.'],400);
    $size=(int)$_FILES['chunk']['size']; if($size<1 || $size>CHUNK_BYTES) out(['ok'=>false,'error'=>'Chunk troppo grande.'],413);
    [$base,$chunks]=paths();
    $metaFile=$chunks.'/'.$uploadId.'.json';
    if(is_file($metaFile)){
        $old=json_decode((string)file_get_contents($metaFile),true);
        if(!is_array($old) || (int)($old['uid']??0)!==$uid || (int)($old['total']??0)!==$total || (int)($old['bytes']??0)!==$totalBytes) out(['ok'=>false,'error'=>'Sessione upload non coerente.'],409);
    }
    $part=$chunks.'/'.$uploadId.'.'.$idx.'.bin';
    if(!move_uploaded_file($_FILES['chunk']['tmp_name'],$part)) out(['ok'=>false,'error'=>'Impossibile salvare il chunk.'],500);
    $meta=['uid'=>$uid,'total'=>$total,'bytes'=>$totalBytes,'created'=>time()];
    if(@file_put_contents($metaFile,json_encode($meta,JSON_UNESCAPED_SLASHES))===false) out(['ok'=>false,'error'=>'Impossibile salvare i metadati upload.'],500);
    out(['ok'=>true,'upload_id'=>$uploadId,'chunk_index'=>$idx,'total_chunks'=>$total]);
}

if($action==='finalize'){
    if(($_SERVER['REQUEST_METHOD']??'GET')!=='POST') out(['ok'=>false,'error'=>'Metodo non valido.'],405);
    $uploadId=safe_id((string)($body['upload_id'] ?? ''));
    $title=trim((string)($body['title'] ?? 'Skin personalizzata'));
    if($uploadId==='') out(['ok'=>false,'error'=>'Upload ID non valido.'],400);
    if($title==='') $title='Skin personalizzata';
    $title=function_exists('mb_substr') ? mb_substr($title,0,MAX_NAME) : substr($title,0,MAX_NAME);
    [$base,$chunks]=paths();
    $metaFile=$chunks.'/'.$uploadId.'.json'; if(!is_file($metaFile)) out(['ok'=>false,'error'=>'Sessione upload non trovata.'],404);
    $meta=json_decode((string)file_get_contents($metaFile),true); if(!is_array($meta) || (int)($meta['uid']??0)!==$uid) out(['ok'=>false,'error'=>'Upload non autorizzato.'],403);
    $total=(int)($meta['total']??0); $expected=(int)($meta['bytes']??0); if($total<1 || $expected<1 || $expected>MAX_SKIN_BYTES) out(['ok'=>false,'error'=>'Metadati upload non validi.'],400);
    $sum=0;
    for($i=0;$i<$total;$i++){
        $part=$chunks.'/'.$uploadId.'.'.$i.'.bin';
        if(!is_file($part)) { cleanup_chunks($uploadId,$total); out(['ok'=>false,'error'=>'Chunk mancante: '.$i.' di '.$total.'.'],409); }
        $ps=@filesize($part); if($ps===false || $ps<1 || $ps>CHUNK_BYTES || $sum+$ps>MAX_SKIN_BYTES){ cleanup_chunks($uploadId,$total); out(['ok'=>false,'error'=>'Chunk non valido.'],422); }
        $sum+=(int)$ps;
    }
    if($sum!==$expected){ cleanup_chunks($uploadId,$total); out(['ok'=>false,'error'=>'Dimensione finale non valida: ricevuti '.$sum.' byte, attesi '.$expected.'.'],422); }

    [$bytes,$w,$h,$mime,$ext]=verify_image_from_chunks($chunks,$uploadId,$total,$sum);
    $skinKey='custom_'.bin2hex(random_bytes(12));
    $filename=$skinKey.'.'.$ext;
    $url='/auth/skins.php?action=serve&id=__ID__&key='.$skinKey;

    try{
        db()->beginTransaction();
        // Insert first so we know the numeric id for the final URL.
        $ins=db()->prepare('INSERT INTO zl_custom_skins(user_id,skin_key,title,filename,url,size_bytes,mime,width,height,active) VALUES(?,?,?,?,?,?,?,?,?,1)');
        $ins->execute([$uid,$skinKey,$title,$filename,'', $bytes,$mime,$w,$h]);
        $skinId=(int)db()->lastInsertId();
        $url='/auth/skins.php?action=serve&id='.$skinId.'&key='.$skinKey;
        $up=db()->prepare('UPDATE zl_custom_skins SET url=? WHERE id=?');
        $up->execute([$url,$skinId]);
        db()->commit();
    } catch(Throwable $e){
        if(db()->inTransaction()) db()->rollBack();
        out(['ok'=>false,'error'=>'Impossibile salvare la skin nel database.','detail'=>$e->getMessage()],500);
    }

    $publishedMeta=['uid'=>$uid,'total'=>$total,'bytes'=>$bytes,'created'=>time(),'skin_id'=>$skinId,'mime'=>$mime,'ext'=>$ext];
    if(@file_put_contents($chunks.'/'.$skinKey.'.json',json_encode($publishedMeta,JSON_UNESCAPED_SLASHES))===false){
        // Roll back DB row if manifest cannot be written.
        try{ $d=db()->prepare('DELETE FROM zl_custom_skins WHERE id=? AND user_id=?'); $d->execute([$skinId,$uid]); }catch(Throwable $ignored){}
        cleanup_chunks($uploadId,$total);
        out(['ok'=>false,'error'=>'Impossibile creare il manifest della skin. Controlla i permessi della cartella uploads/skins/chunks.'],500);
    }
    for($i=0;$i<$total;$i++){
        $src=$chunks.'/'.$uploadId.'.'.$i.'.bin'; $dst=$chunks.'/'.$skinKey.'.'.$i.'.bin';
        if(!@rename($src,$dst)){
            // Copy fallback for hosts where rename between handles is restricted.
            if(!@copy($src,$dst)){ cleanup_chunks($uploadId,$total); try{ $d=db()->prepare('DELETE FROM zl_custom_skins WHERE id=? AND user_id=?'); $d->execute([$skinId,$uid]); }catch(Throwable $ignored){} out(['ok'=>false,'error'=>'Impossibile pubblicare il chunk '.$i.'. Controlla i permessi della cartella chunks.'],500); }
            @unlink($src);
        }
    }
    @unlink($metaFile);
    out(['ok'=>true,'skin'=>['id'=>$skinId,'skin_key'=>$skinKey,'title'=>$title,'url'=>$url,'size_bytes'=>$bytes,'mime'=>$mime,'width'=>$w,'height'=>$h]]);
}

if($action==='delete'){
    $id=(int)($body['id']??0); if($id<=0) out(['ok'=>false,'error'=>'ID non valido.'],400);
    $s=db()->prepare('SELECT skin_key FROM zl_custom_skins WHERE id=? AND user_id=? LIMIT 1'); $s->execute([$id,$uid]); $r=$s->fetch(); if(!$r) out(['ok'=>false,'error'=>'Skin non trovata.'],404);
    $key=(string)$r['skin_key']; [, $chunks]=paths();
    db()->beginTransaction();
    try{
        $d=db()->prepare('DELETE FROM zl_custom_skins WHERE id=? AND user_id=?'); $d->execute([$id,$uid]); db()->commit();
        $meta=$chunks.'/'.$key.'.json'; if(is_file($meta)) @unlink($meta);
        for($i=0;$i<200;$i++){ $p=$chunks.'/'.$key.'.'.$i.'.bin'; if(is_file($p)) @unlink($p); else if($i>20) break; }
        out(['ok'=>true]);
    } catch(Throwable $e){ if(db()->inTransaction()) db()->rollBack(); out(['ok'=>false,'error'=>'Impossibile eliminare la skin.'],500); }
}

out(['ok'=>false,'error'=>'Azione non supportata.'],400);
