# ZeroLegend final fix

Shop purchases now use the signed auth token directly against the MySQL economy endpoint, while WebSocket feature results are promise-based. Admin/owner accounts are authorized by their database role without ADMIN_TOKEN. W/Feed ejects a pellet outside the cell, gives it velocity/friction, and temporarily excludes the owner from immediate pickup so the pellet is visibly launched. Multilanguage support is preserved.
