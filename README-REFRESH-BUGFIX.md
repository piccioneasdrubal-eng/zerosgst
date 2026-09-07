# ZeroLegend Refresh Bugfix — 2026-09-04

Fixed `ReferenceError: refresh is not defined` in `user-menu.js`.

Changes:
- Replaced the undefined `refresh()` calls with `refreshProfile()`.
- Menu open now refreshes the authenticated profile safely.
- Mode switching refreshes the profile safely.
- Initial menu build refreshes the profile safely.
- JavaScript syntax checked with Node.js.

Upload/replace `user-menu.js` in the site's `htdocs` and hard-refresh the browser.
