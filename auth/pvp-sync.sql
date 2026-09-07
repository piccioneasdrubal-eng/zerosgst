-- ZeroLegend Phase 2: persistent PvP stats
-- auth.php creates this schema automatically via ensure_profile_schema().
-- This file is provided for manual DB inspection/import if desired.
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
  PRIMARY KEY (user_id),
  INDEX idx_stats_kills (kills),
  INDEX idx_stats_elo (elo)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
