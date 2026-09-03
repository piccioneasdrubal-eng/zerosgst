-- ============================================================
--  agar-server — migrazione auth tokens
--  Esegui questo file in phpMyAdmin (InfinityFree) UNA volta.
--  Aggiunge la tabella per i token di sessione del gioco.
-- ============================================================

CREATE TABLE IF NOT EXISTS auth_tokens (
  id         INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id    INT UNSIGNED NOT NULL,
  token      VARCHAR(64) NOT NULL UNIQUE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_auth_tokens_user (user_id),
  INDEX idx_auth_tokens_token (token)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
