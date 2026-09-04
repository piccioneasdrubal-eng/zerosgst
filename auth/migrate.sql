-- ZeroLegend Auth migration
-- Usa la tabella `users` già presente nel database del progetto quando esiste.
-- Non cancella dati esistenti.

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

-- IMPORTANTE:
-- Nel tuo database esiste già la tabella `users` con email/password_hash/username/role/level/xp/coins.
-- Il nuovo auth.php la usa direttamente e non usa `zl_users` quando `users` esiste.


CREATE TABLE IF NOT EXISTS zl_player_stats (
  user_id INT UNSIGNED NOT NULL,
  matches INT NOT NULL DEFAULT 0,
  kills INT NOT NULL DEFAULT 0,
  deaths INT NOT NULL DEFAULT 0,
  best_mass INT NOT NULL DEFAULT 0,
  best_rank INT NULL,
  play_seconds INT NOT NULL DEFAULT 0,
  elo INT NOT NULL DEFAULT 1000,
  kill_streak INT NOT NULL DEFAULT 0,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS zl_daily_progress (
  user_id INT UNSIGNED NOT NULL,
  day_key DATE NOT NULL,
  kills INT NOT NULL DEFAULT 0,
  matches INT NOT NULL DEFAULT 0,
  best_mass INT NOT NULL DEFAULT 0,
  coins_earned INT NOT NULL DEFAULT 0,
  claimed_kills3 TINYINT(1) NOT NULL DEFAULT 0,
  claimed_play1 TINYINT(1) NOT NULL DEFAULT 0,
  claimed_mass500 TINYINT(1) NOT NULL DEFAULT 0,
  last_total_kills INT NOT NULL DEFAULT 0,
  last_total_matches INT NOT NULL DEFAULT 0,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, day_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


CREATE TABLE IF NOT EXISTS zl_inventory (
  user_id INT UNSIGNED NOT NULL,
  item_id VARCHAR(80) NOT NULL,
  qty INT NOT NULL DEFAULT 1,
  equipped TINYINT(1) NOT NULL DEFAULT 0,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, item_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS zl_coin_orders (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id INT UNSIGNED NOT NULL,
  package_id VARCHAR(40) NOT NULL,
  coins INT NOT NULL,
  amount_cents INT NOT NULL,
  currency VARCHAR(10) NOT NULL,
  stripe_session_id VARCHAR(255) NULL,
  stripe_payment_intent VARCHAR(255) NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'pending',
  webhook_event_id VARCHAR(255) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  paid_at TIMESTAMP NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_zl_coin_orders_session (stripe_session_id),
  UNIQUE KEY uq_zl_coin_orders_event (webhook_event_id),
  INDEX idx_zl_coin_orders_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS zl_coin_ledger (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id INT UNSIGNED NOT NULL,
  kind VARCHAR(30) NOT NULL,
  amount INT NOT NULL,
  reason VARCHAR(120) NOT NULL,
  ref_id VARCHAR(120) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_zl_coin_ledger_ref (ref_id),
  INDEX idx_zl_coin_ledger_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


CREATE TABLE IF NOT EXISTS zl_custom_skins (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id INT UNSIGNED NOT NULL,
  skin_key VARCHAR(64) NOT NULL,
  title VARCHAR(64) NOT NULL DEFAULT 'Skin personalizzata',
  filename VARCHAR(180) NOT NULL,
  url VARCHAR(255) NOT NULL,
  size_bytes INT UNSIGNED NOT NULL,
  mime VARCHAR(80) NOT NULL,
  width SMALLINT UNSIGNED NULL,
  height SMALLINT UNSIGNED NULL,
  active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_user_skin_key (user_id, skin_key),
  INDEX idx_custom_skins_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Legacy compatibility (execute manually if needed):
-- ALTER TABLE zl_custom_skins ADD COLUMN skin_key VARCHAR(64) NOT NULL DEFAULT '';
