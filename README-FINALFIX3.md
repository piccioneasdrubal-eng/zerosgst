ZEROLEGEND FINALFIX3

Fixes for the reported console errors:
- user-menu.js provides a safe refresh() compatibility alias.
- i18n.js never calls .closest() on Text nodes; parentElement is used safely.
- i18n MutationObserver ignores the rapidly changing game HUD/canvas to stop repeated apply() errors and performance spam.
- index.html cache-busting bumped to finalfix3.

Deploy index.html, user-menu.js and i18n.js, then hard refresh with Ctrl+Shift+R.
