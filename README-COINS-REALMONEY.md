# ZeroLegend — ZeroCoins con denaro reale

## In-game Shop
Gli acquisti di oggetti (`skin`, boost, shield, badge) usano `auth/economy.php` come fonte autorevole: il saldo viene decrementato in MySQL in una transazione e l'inventario viene aggiornato in `zl_inventory`.

## Acquisto ZeroCoins
Il Menu Utente > Shop ora mostra 4 pacchetti:
- 1.000 ZC — €0,99
- 5.500 ZC — €4,99
- 12.000 ZC — €9,99
- 30.000 ZC — €19,99

Il pulsante chiama `payments/create-checkout.php`; la secret key Stripe resta lato server. I Coins NON vengono accreditati dalla pagina di ritorno: vengono accreditati solo dal webhook dopo conferma del pagamento.

## Stripe
Impostare in `payments/config.php`:
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`

Webhook da configurare nel Dashboard Stripe:
`https://zerothelegend.gamer.gd/payments/webhook.php`

Testare prima con chiavi `sk_test_...` e un webhook di test, poi sostituire con le chiavi live.
