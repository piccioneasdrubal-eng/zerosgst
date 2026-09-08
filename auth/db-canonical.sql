-- ZeroLegend DB canonicalizzazione utenti
-- Database target: la tabella utenti unica è `zl_users`.
-- NON creare una tabella `users` separata.

CREATE TABLE IF NOT EXISTS zl_users (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  username VARCHAR(80) NOT NULL,
  email VARCHAR(190) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  provider VARCHAR(30) NOT NULL DEFAULT 'local',
  role VARCHAR(20) NOT NULL DEFAULT 'user',
  level INT NOT NULL DEFAULT 1,
  xp INT NOT NULL DEFAULT 0,
  coins INT NOT NULL DEFAULT 1000,
  skins TEXT NULL,
  equipped_skin VARCHAR(80) NOT NULL DEFAULT 'default',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_zl_users_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

UPDATE zl_users SET role='admin' WHERE LOWER(TRIM(role)) IN ('owner','administrator','administratoro','admin');
UPDATE zl_users SET role='moderator' WHERE LOWER(TRIM(role)) IN ('moderator','mod','staff');
UPDATE zl_users SET role='vip' WHERE LOWER(TRIM(role)) IN ('vip','premium');
UPDATE zl_users SET role='normal_user' WHERE LOWER(TRIM(role)) IN ('normal_user','normal-user','normal user','guest','member');
UPDATE zl_users SET role='user' WHERE role IS NULL OR TRIM(role)='' OR LOWER(TRIM(role)) NOT IN ('admin','moderator','vip','user','normal_user');

SELECT role, COUNT(*) AS totale FROM zl_users GROUP BY role ORDER BY role;
