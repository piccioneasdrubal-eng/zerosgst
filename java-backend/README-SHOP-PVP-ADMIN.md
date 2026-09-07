# ZeroLegend Java — Shop / PvP / Admin port

## Shop / Economy
The Java WebSocket now accepts feature messages with `category: "shop"` or `"economy"` and proxies persistent wallet/catalog/inventory/history/purchase/equip operations to the existing PHP `economy.php` using the authenticated session token.

Realtime-only operations include coin gifts, loot boxes, item upgrades, battle-pass progress/claim and referral codes.

Environment:
- `ECONOMY_API_URL` — default `https://zerothelegend.gamer.gd/auth/economy.php`

## PvP
Supported realtime feature actions:
- `rankedQueueJoin`
- `rankedQueueLeave`
- `seasonLadderGet`
- `matchHistoryGet`
- `mvpAward`
- `winStreakRewardClaim`

The existing collision/split/eject/virus/godmode loop remains server authoritative.

## Admin
Admin is determined from the authenticated PHP user (`is_admin=1`, role `admin`, or role `owner`). Admin feature actions include:
- list/get
- kick/ban/unban
- mute/unmute
- freeze/unfreeze
- setMass/setCoins
- teleport/heal/kill/respawn
- setTeam/setColor
- broadcast
- spawnBots/removeBots
- pause/resume/resetMatch

No admin action is accepted from a non-admin WebSocket session.

## Important
Persistent balances and owned shop items remain authoritative in PHP/MySQL. The Java process must not be treated as the permanent source of wallet data. On shop wallet/equip/purchase calls the Java process forwards the user's signed session token to PHP.
