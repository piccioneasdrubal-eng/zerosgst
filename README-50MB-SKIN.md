# ZeroLegend — upload skin fino a 50 MB su InfinityFree

Il caricamento usa chunk da 512 KiB. La skin non viene salvata come un singolo file da 50 MB: InfinityFree impone un limite sui singoli file (attualmente 10 MB per gli altri file), quindi i chunk vengono conservati separatamente e `auth/skins.php?action=serve` li serve come un’unica immagine al browser. citeturn887995search0turn887995search1

Formati: JPG/JPEG, PNG, GIF, WebP, AVIF, BMP.

Limite applicativo: 50 MiB per immagine.
Chunk: 512 KiB.

Importante: crea/carica la cartella `auth/uploads/skins/chunks/`. Ogni singolo chunk resta molto sotto il limite di file del provider.

## Diagnostica
Apri `https://zerothelegend.gamer.gd/auth/skins.php?action=health` per verificare che il limite sia 50 MiB e che lo storage sia `chunked`.

La finalizzazione ora non crea mai un singolo file superiore a 10 MB: registra la skin nel DB e conserva i blocchi separati, poi li serve tramite l'endpoint `action=serve`. Questo evita il limite per-file dell'hosting gratuito InfinityFree. citeturn887995search0turn887995search1
