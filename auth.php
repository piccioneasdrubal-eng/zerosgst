<?php
/**
 * auth.php — API di autenticazione per agar-server (v3)
 * ----------------------------------------------
 * Da caricare su InfinityFree (gamer.gd) nella cartella /auth/ (o /zero/auth/).
 * Il game server Node.js su Render chiama queste API via HTTP con un
 * token segreto condiviso (API_SECRET) per validare i giocatori.
 *
 * Endpoint (tutti POST):
 *   action=register  { email, password, name }  -> crea utente + trial
 *   action=login     { email, password }        -> restituisce token di sessione
 *   action=logout    { token }
 *   action=verify    { token }                  -> valida token, restituisce utente+premium
 *
 * Risposta JSON: { ok: true/false, error?, user?, premium?, is_admin? }
 */

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, X-Api-Secret');
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(204); exit; }
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    echo json_encode(['ok' => false, 'error' => 'Method not allowed']);
    exit;
}

// Carica la config del database (stesso DB InfinityFree già in uso)
require_once __DIR__ . '/db-config.php';

function respond($data, int $code = 200): void {
    http_response_code($code);
    echo json_encode($data);
    exit;
}

// Token segreto condiviso con il game server (a prova di chiamate esterne indesiderate)
// Definito in db-config.php
if (!defined('API_SECRET') || API_SECRET === '') {
    respond(['ok' => false, 'error' => 'API_SECRET not configured'], 500);
}

$body = json_decode(file_get_contents('php://input'), true);
if (!is_array($body)) $body = $_POST;

$action = $body['action'] ?? '';

// ===== helper sessione (token -> sessione DB) =====
// Usa una tabella auth_tokens per token persistenti (sopravvivono a sessioni PHP)
function token_generate(): string {
    return bin2hex(random_bytes(32));
}
function token_store(int $userId): string {
    $token = token_generate();
    $st = db()->prepare('INSERT INTO auth_tokens (user_id, token, created_at) VALUES (?, ?, NOW())');
    $st->execute([$userId, $token]);
    return $token;
}
function token_lookup(string $token): ?array {
    $st = db()->prepare(
        'SELECT u.id, u.email, u.full_name, u.is_admin, u.trial_ends_at, t.token
         FROM auth_tokens t JOIN users u ON u.id = t.user_id
         WHERE t.token = ? LIMIT 1'
    );
    $st->execute([$token]);
    $r = $st->fetch();
    return $r ?: null;
}
function is_premium(?array $u): bool {
    if (!$u) return false;
    if (!empty($u['is_admin'])) return true; // admin = sempre premium
    // licenza attiva (trial/active) non scaduta
    $st = db()->prepare(
        'SELECT COUNT(*) AS c FROM licenses
         WHERE user_id = ? AND status IN (\'trial\',\'active\')
           AND (ends_at IS NULL OR ends_at > NOW())'
    );
    $st->execute([$u['id']]);
    $r = $st->fetch();
    return ($r && (int)$r['c'] > 0);
}

try {
switch ($action) {
    // ---------- REGISTER ----------
    case 'register': {
        $email    = trim($body['email'] ?? '');
        $password = $body['password'] ?? '';
        $name     = trim($body['name'] ?? '');

        if (!filter_var($email, FILTER_VALIDATE_EMAIL)) respond(['ok' => false, 'error' => 'Email non valida'], 400);
        if (strlen($password) < 8) respond(['ok' => false, 'error' => 'Password troppo corta (min 8 caratteri)'], 400);

        $st = db()->prepare('SELECT id FROM users WHERE email = ?');
        $st->execute([$email]);
        if ($st->fetch()) respond(['ok' => false, 'error' => 'Email già registrata'], 409);

        $hash = password_hash($password, PASSWORD_DEFAULT);
        $st = db()->prepare('INSERT INTO users (email, password_hash, full_name) VALUES (?, ?, ?)');
        $st->execute([$email, $hash, $name]);
        $uid = (int) db()->lastInsertId();

        // trial di 7 giorni
        $ends = date('Y-m-d H:i:s', strtotime('+7 days'));
        db()->prepare(
            'INSERT INTO licenses (user_id, plan_id, status, started_at, ends_at)
             SELECT ?, MIN(id), \'trial\', NOW(), ?
             FROM plans WHERE service_id IN (SELECT id FROM services WHERE is_paid = 1)'
        )->execute([$uid, $ends]);
        db()->prepare('UPDATE users SET trial_ends_at = ? WHERE id = ?')->execute([$ends, $uid]);

        $token = token_store($uid);
        $premium = is_premium(['id' => $uid, 'is_admin' => 0]);
        respond(['ok' => true, 'token' => $token, 'user' => ['id' => $uid, 'email' => $email, 'name' => $name, 'is_admin' => 0], 'premium' => $premium]);
        break;
    }

    // ---------- LOGIN ----------
    case 'login': {
        $email    = trim($body['email'] ?? '');
        $password = $body['password'] ?? '';

        $st = db()->prepare('SELECT * FROM users WHERE email = ?');
        $st->execute([$email]);
        $user = $st->fetch();
        if (!$user || !password_verify($password, $user['password_hash'])) {
            respond(['ok' => false, 'error' => 'Credenziali non valide'], 401);
        }

        $token = token_store((int)$user['id']);
        $premium = is_premium($user);
        respond(['ok' => true, 'token' => $token, 'user' => ['id' => (int)$user['id'], 'email' => $user['email'], 'name' => $user['full_name'], 'is_admin' => (int)$user['is_admin']], 'premium' => $premium]);
        break;
    }

    // ---------- LOGOUT ----------
    case 'logout': {
        $token = $body['token'] ?? '';
        if ($token) {
            db()->prepare('DELETE FROM auth_tokens WHERE token = ?')->execute([$token]);
        }
        respond(['ok' => true]);
        break;
    }

    // ---------- VERIFY (validazione token) ----------
    case 'verify': {
        // richiede il segreto condiviso
        $secret = $_SERVER['HTTP_X_API_SECRET'] ?? ($body['api_secret'] ?? '');
        if (!hash_equals(API_SECRET, $secret)) {
            respond(['ok' => false, 'error' => 'Unauthorized'], 403);
        }
        $token = $body['token'] ?? '';
        if (!$token) respond(['ok' => false, 'error' => 'Token mancante'], 400);
        $u = token_lookup($token);
        if (!$u) respond(['ok' => false, 'error' => 'Token non valido o scaduto'], 401);
        $premium = is_premium($u);
        respond(['ok' => true, 'user' => ['id' => (int)$u['id'], 'email' => $u['email'], 'name' => $u['full_name'], 'is_admin' => (int)$u['is_admin']], 'premium' => $premium]);
        break;
    }

    default:
        respond(['ok' => false, 'error' => 'Azione sconosciuta'], 400);
}
} catch (Throwable $e) {
    error_log('auth.php: ' . $e->getMessage());
    respond(['ok' => false, 'error' => 'Errore interno del servizio'], 500);
}
