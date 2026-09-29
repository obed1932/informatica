-- MariaDB 11.x / MySQL 8.x. Ejecutar SOLO en la base OTC del hosting.
-- No contiene credenciales ni crea usuarios de base de datos.
CREATE TABLE IF NOT EXISTS otc_public_requests (
  request_uuid CHAR(36) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
  order_uuid CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  order_code VARCHAR(60) NOT NULL,
  technician_local_id INT UNSIGNED NULL,
  document_version INT UNSIGNED NOT NULL,
  document_sha256 CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  token_sha256 CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  snapshot_json JSON NOT NULL,
  state VARCHAR(24) NOT NULL DEFAULT 'PENDING',
  published_at DATETIME(6) NOT NULL,
  expires_at DATETIME(6) NOT NULL,
  viewed_at DATETIME(6) NULL,
  resolved_at DATETIME(6) NULL,
  UNIQUE KEY uq_otc_token (token_sha256),
  UNIQUE KEY uq_otc_order_version (order_uuid, document_version),
  KEY ix_otc_pending (state, expires_at),
  KEY ix_otc_technician (technician_local_id, state, published_at),
  CONSTRAINT ck_otc_request_state CHECK (state IN ('PENDING','CONFORME','RECHAZADA','ANULADA')),
  CONSTRAINT ck_otc_expiry CHECK (expires_at > published_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

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

CREATE TABLE IF NOT EXISTS otc_public_decisions (
  request_uuid CHAR(36) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
  event_uuid CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  signer_name VARCHAR(200) NOT NULL,
  signer_is_third_party TINYINT(1) NOT NULL DEFAULT 0,
  accepted TINYINT(1) NOT NULL,
  signature_png MEDIUMBLOB NOT NULL,
  signature_sha256 CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  signed_at DATETIME(6) NOT NULL,
  ip_sha256 CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NULL,
  user_agent VARCHAR(500) NULL,
  UNIQUE KEY uq_otc_event (event_uuid),
  CONSTRAINT fk_otc_decision_request FOREIGN KEY (request_uuid)
    REFERENCES otc_public_requests(request_uuid) ON DELETE RESTRICT,
  CONSTRAINT ck_otc_accepted CHECK (accepted = 1)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS otc_public_outbox (
  event_uuid CHAR(36) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
  request_uuid CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  payload_json JSON NOT NULL,
  state VARCHAR(20) NOT NULL DEFAULT 'PENDING',
  attempts INT UNSIGNED NOT NULL DEFAULT 0,
  last_error VARCHAR(250) NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  sent_at DATETIME(6) NULL,
  KEY ix_otc_outbox_pending (state, created_at),
  CONSTRAINT fk_otc_outbox_request FOREIGN KEY (request_uuid)
    REFERENCES otc_public_requests(request_uuid) ON DELETE RESTRICT,
  CONSTRAINT ck_otc_outbox_state CHECK (state IN ('PENDING','SENT'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
