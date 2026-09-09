<?php
/** ZeroLegend DB config — configurazione per hosting PHP/InfinityFree. */
define('DB_HOST', 'sql313.infinityfree.com');
define('DB_NAME', 'if0_42182483_mtmaster');
define('DB_USER', 'if0_42182483');
define('DB_PASS', 'R3bxf6zvnv0');
// Secret condiviso con il backend Node. Mantieni questo identico al valore del backend.
define('API_SECRET', 'agar-zero-secret-2026');

// URL del backend Node (stesso server WebSocket del gioco) usato per inoltrare eventi
// in tempo reale al portale (coins aggiornati, ban/mute, feed admin). Deve puntare
// all'host HTTP(S) del processo backend/server.js (es. https://xxx.onrender.com),
// NON al dominio PHP: il notify arriva sull'endpoint POST /api/portal/notify.
// Se lasciato vuoto, le notifiche realtime vengono semplicemente saltate (nessun errore bloccante).
// Su InfinityFree non è comodo impostare variabili d'ambiente: se getenv() non trova nulla,
// usa lo stesso host del backend Node già configurato in auth/ws-config.php (wss -> https).
define('PORTAL_NOTIFY_URL', getenv('PORTAL_NOTIFY_URL') ?: 'https://zerosgst-2hqr.onrender.com');
define('PORTAL_NOTIFY_SECRET', getenv('PORTAL_NOTIFY_SECRET') ?: API_SECRET);

// Inoltra un evento "fire and forget" al backend Node (realtime portale). Condivisa da
// auth.php ed economy.php. Non deve MAI bloccare o far fallire la richiesta principale:
// timeout breve, errori ignorati in silenzio.
function notify_portal(string $event, int $userId, array $payload = []): void {
    if (PORTAL_NOTIFY_URL === '') return;
    $body = json_encode(['event' => $event, 'userId' => $userId, 'payload' => $payload], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    $ctx = stream_context_create(['http' => [
        'method' => 'POST',
        'header' => "Content-Type: application/json\r\nX-Api-Secret: " . PORTAL_NOTIFY_SECRET . "\r\n",
        'content' => $body,
        'timeout' => 2,
        'ignore_errors' => true,
    ]]);
    try { @file_get_contents(rtrim(PORTAL_NOTIFY_URL, '/') . '/api/portal/notify', false, $ctx); } catch (Throwable $e) { /* best-effort */ }
}

date_default_timezone_set('Europe/Rome');

function db(): PDO {
    static $pdo = null;
    if ($pdo instanceof PDO) return $pdo;
    if (!extension_loaded('pdo_mysql')) throw new RuntimeException('Estensione PHP pdo_mysql non disponibile sul server.');
    $dsn = 'mysql:host=' . DB_HOST . ';dbname=' . DB_NAME . ';charset=utf8mb4';
    $pdo = new PDO($dsn, DB_USER, DB_PASS, [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES => false,
        PDO::ATTR_TIMEOUT => 8,
    ]);
    return $pdo;
}
