# Integrazione sito ZeroLegend

Il sito PHP/statico va nella cartella `website/`.

Imposta in `game-config.js` l'URL pubblico del backend Node, ad esempio:

```js
window.GAME_CONFIG = {
  GAME_SERVER_URL: 'https://game.example.com',
  AUTH_API_URL: 'https://zerothelegend.gamer.gd/auth/auth.php',
  ALLOW_GUEST: false
};
```

Il browser non contiene `API_SECRET`.
