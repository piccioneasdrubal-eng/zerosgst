<?php
declare(strict_types=1);
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');

// Unico punto di configurazione del WebSocket: il client non deve chiedere
// all'utente di inserire manualmente l'indirizzo del server.
$ws = getenv('ZEROLEGEND_WS_URL') ?: 'wss://counted-mitchell-advocacy-registrar.trycloudflare.com';
$ws = trim($ws);
if (!preg_match('/^wss?:\/\/[^\s]+$/i', $ws)) {
    $ws = 'wss://counted-mitchell-advocacy-registrar.trycloudflare.com';
}
echo json_encode([
    'ok' => true,
    'wsUrl' => rtrim($ws, '/'),
    'source' => 'zerolegend-auto-config',
], JSON_UNESCAPED_SLASHES);
