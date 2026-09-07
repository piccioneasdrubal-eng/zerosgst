ZEROLEGEND AUTH — FIX DEFINITIVO

1. Carica la cartella website/ nella root pubblica del sito.
2. L'endpoint corretto è /auth/auth.php.
3. Verifica:
   https://zerothelegend.gamer.gd/auth/auth.php?health=1
4. Deve rispondere con JSON e "database":"ok".
5. auth.php crea automaticamente la tabella users se manca e aggiunge alcune colonne mancanti.
6. Esegui comunque migrate.sql una volta per avere lo schema completo.

La API usa token firmati (non richiede la tabella auth_tokens per login/me/verify), quindi la registrazione non fallisce se la tabella token non è stata importata.
