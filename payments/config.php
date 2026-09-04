<?php
declare(strict_types=1);
// Configurazione Stripe. INSERISCI LE TUE CHIAVI NEL FILE, NON NEL JAVASCRIPT.
define('STRIPE_SECRET_KEY', 'INSERISCI_STRIPE_SECRET_KEY');
define('STRIPE_WEBHOOK_SECRET', 'INSERISCI_STRIPE_WEBHOOK_SECRET');
define('PAYMENT_CURRENCY', 'eur');
define('PORTAL_BASE_URL', 'https://zerothelegend.gamer.gd');
function coin_packages(): array { return [
  'zc_1000'=>['coins'=>1000,'amount'=>99,'name'=>'1.000 ZeroCoins'],
  'zc_5500'=>['coins'=>5500,'amount'=>499,'name'=>'5.500 ZeroCoins'],
  'zc_12000'=>['coins'=>12000,'amount'=>999,'name'=>'12.000 ZeroCoins'],
  'zc_30000'=>['coins'=>30000,'amount'=>1999,'name'=>'30.000 ZeroCoins'],
]; }
