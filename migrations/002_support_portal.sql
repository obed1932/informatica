-- Aplicar SOLO si otc_public_requests ya existía con el esquema anterior.
-- Respaldar la base antes. No ejecutar además de schema.sql en una base nueva.
ALTER TABLE otc_public_requests
  ADD COLUMN technician_local_id INT UNSIGNED NULL AFTER order_code,
  ADD KEY ix_otc_technician (technician_local_id, state, published_at);

CREATE TABLE IF NOT EXISTS otc_cloud_users (
  local_user_id INT UNSIGNED PRIMARY KEY,
  username VARCHAR(50) NOT NULL,
  display_name VARCHAR(200) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role VARCHAR(12) NOT NULL DEFAULT 'TECH',
  active TINYINT(1) NOT NULL DEFAULT 1,
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  UNIQUE KEY uq_otc_cloud_username (username),
  CONSTRAINT ck_otc_cloud_role CHECK (role IN ('TECH','ADMIN'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS otc_cloud_sessions (
  session_sha256 CHAR(64) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
  local_user_id INT UNSIGNED NOT NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  expires_at DATETIME(6) NOT NULL,
  KEY ix_otc_cloud_session_expiry (expires_at),
  CONSTRAINT fk_otc_cloud_session_user FOREIGN KEY (local_user_id)
    REFERENCES otc_cloud_users(local_user_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS otc_qr_audit (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  request_uuid CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  local_user_id INT UNSIGNED NOT NULL,
  action VARCHAR(24) NOT NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  KEY ix_otc_qr_audit_request (request_uuid, created_at),
  CONSTRAINT fk_otc_qr_audit_request FOREIGN KEY (request_uuid)
    REFERENCES otc_public_requests(request_uuid) ON DELETE RESTRICT,
  CONSTRAINT fk_otc_qr_audit_user FOREIGN KEY (local_user_id)
    REFERENCES otc_cloud_users(local_user_id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
