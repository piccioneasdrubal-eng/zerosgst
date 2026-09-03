<?php
/**
 * db-config.php — configurazione DB per le API auth.
 *
 * Su hosting PHP puoi lasciare i fallback qui sotto; su un ambiente con
 * variabili d'ambiente imposta DB_HOST, DB_NAME, DB_USER, DB_PASS e API_SECRET.
 */

$env = static function (string $name, string $fallback = ''): string {
    $value = getenv($name);
    return ($value !== false && $value !== '') ? $value : $fallback;
};

define('DB_HOST', $env('DB_HOST', 'sql313.infinityfree.com'));
define('DB_NAME', $env('DB_NAME', 'if0_42182483_mtmaster'));
define('DB_USER', $env('DB_USER', 'if0_42182483'));
define('DB_PASS', $env('DB_PASS', 'R3bxf6zvnv0'));
define('API_SECRET', $env('API_SECRET', 'agar-zero-secret-2026'));

date_default_timezone_set('Europe/Rome');

function db(): PDO {
    static $pdo = null;
    if ($pdo === null) {
        $dsn = 'mysql:host=' . DB_HOST . ';dbname=' . DB_NAME . ';charset=utf8mb4';
        $options = [
            PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES   => false,
            PDO::ATTR_TIMEOUT            => 5,
        ];
        $pdo = new PDO($dsn, DB_USER, DB_PASS, $options);
    }
    return $pdo;
}
