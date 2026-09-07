# ZeroLegend — ZeroCoins + Stripe

La parte di pagamento usa Stripe Checkout. La sessione Checkout viene creata lato PHP; i Coins vengono accreditati **solo dal webhook Stripe** dopo conferma del pagamento. Stripe documenta la creazione di Checkout Session in `payment` mode e raccomanda la verifica della firma del webhook usando il payload raw, la testata `Stripe-Signature` e il webhook signing secret.

## Configurazione
1. Inserire `STRIPE_SECRET_KEY` e `STRIPE_WEBHOOK_SECRET` in `payments/config.php` (meglio tramite variabili/secret del server se disponibili).
2. Impostare in Stripe il webhook: `https://zerothelegend.gamer.gd/payments/webhook.php`.
3. Importare `auth/migrate.sql`.
4. Testare prima con chiavi `sk_test_...` e webhook di test.
5. Solo dopo la verifica passare alle chiavi live.

Il browser non contiene mai la secret key Stripe. Il prezzo e il numero di Coins sono determinati dal server dal codice del pacchetto.
