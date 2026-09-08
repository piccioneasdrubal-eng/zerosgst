-- ZeroLegend role normalization
-- Canonical roles: admin, moderator, vip, user, normal_user
-- Run once on the same database used by auth/auth.php.

UPDATE zl_users SET role='admin'
WHERE LOWER(TRIM(role)) IN ('owner','administrator','administratoro','admin');

UPDATE zl_users SET role='moderator'
WHERE LOWER(TRIM(role)) IN ('moderator','mod','staff');

UPDATE zl_users SET role='vip'
WHERE LOWER(TRIM(role)) IN ('vip','premium');

UPDATE zl_users SET role='normal_user'
WHERE LOWER(TRIM(role)) IN ('normal_user','normal-user','normal user','guest','member');

UPDATE zl_users SET role='user'
WHERE role IS NULL OR TRIM(role)='' OR LOWER(TRIM(role)) NOT IN ('admin','moderator','vip','user','normal_user');

-- Verify:
SELECT role, COUNT(*) AS total
FROM zl_users
GROUP BY role
ORDER BY role;
