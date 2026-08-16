-- HNSChat local test schema reconstructed from server-master.zip and web-master.zip.
-- It is NOT an original upstream schema dump. It is intentionally permissive for local testing.
SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS sessions (
  ai BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  id VARCHAR(64) NOT NULL,
  pubkey TEXT NULL,
  seen JSON NOT NULL DEFAULT (JSON_OBJECT()),
  push JSON NOT NULL DEFAULT (JSON_ARRAY()),
  PRIMARY KEY (ai),
  UNIQUE KEY uq_sessions_id (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS domains (
  ai BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  id VARCHAR(64) NOT NULL,
  domain VARCHAR(255) NOT NULL,
  type VARCHAR(32) NOT NULL DEFAULT 'handshake',
  session VARCHAR(64) NOT NULL,
  created BIGINT UNSIGNED NOT NULL DEFAULT 0,
  tld VARCHAR(255) GENERATED ALWAYS AS (SUBSTRING_INDEX(domain, '.', -1)) STORED,
  avatar TEXT NULL,
  bio TEXT NULL,
  address TEXT NULL,
  locked TINYINT(1) NOT NULL DEFAULT 0,
  deleted TINYINT(1) NOT NULL DEFAULT 0,
  admin TINYINT(1) NOT NULL DEFAULT 0,
  claimed TINYINT(1) NOT NULL DEFAULT 1,
  PRIMARY KEY (ai),
  UNIQUE KEY uq_domains_id (id),
  KEY idx_domains_domain (domain),
  KEY idx_domains_session (session),
  KEY idx_domains_tld (tld)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS conversations (
  ai BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  id VARCHAR(64) NOT NULL,
  users JSON NOT NULL,
  PRIMARY KEY (ai),
  UNIQUE KEY uq_conversations_id (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS channels (
  ai BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  id VARCHAR(64) NOT NULL,
  name VARCHAR(255) NOT NULL,
  public TINYINT(1) NOT NULL DEFAULT 1,
  adminonly TINYINT(1) NOT NULL DEFAULT 0,
  tldadmin TINYINT(1) NOT NULL DEFAULT 0,
  admins JSON NOT NULL DEFAULT (JSON_ARRAY()),
  fee DECIMAL(20,8) NOT NULL DEFAULT 0,
  created BIGINT UNSIGNED NOT NULL DEFAULT 0,
  hidden TINYINT(1) NOT NULL DEFAULT 0,
  sort INT UNSIGNED NOT NULL DEFAULT 0,
  color VARCHAR(7) NULL,
  tx TEXT NULL,
  activated TINYINT(1) NOT NULL DEFAULT 1,
  registry VARCHAR(64) NULL,
  slds TINYINT(1) NOT NULL DEFAULT 0,
  hip2 TINYINT(1) NOT NULL DEFAULT 0,
  pinned VARCHAR(64) NULL,
  PRIMARY KEY (ai),
  UNIQUE KEY uq_channels_id (id),
  UNIQUE KEY uq_channels_name (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS messages (
  ai BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  id VARCHAR(64) NOT NULL,
  time BIGINT UNSIGNED NOT NULL,
  user VARCHAR(64) NOT NULL,
  conversation VARCHAR(64) NOT NULL,
  message LONGTEXT NOT NULL,
  reply TEXT NULL,
  replying VARCHAR(64) NULL,
  reactions JSON NOT NULL DEFAULT (JSON_OBJECT()),
  PRIMARY KEY (ai),
  UNIQUE KEY uq_messages_id (id),
  KEY idx_messages_conversation_ai (conversation, ai),
  KEY idx_messages_time (time)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS uploads (
  ai BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  type VARCHAR(64) NOT NULL,
  id VARCHAR(64) NOT NULL,
  name TEXT NOT NULL,
  size BIGINT UNSIGNED NOT NULL DEFAULT 0,
  session VARCHAR(64) NOT NULL,
  created BIGINT UNSIGNED NOT NULL DEFAULT 0,
  PRIMARY KEY (ai),
  UNIQUE KEY uq_uploads_id (id),
  KEY idx_uploads_session (session)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS previews (
  ai BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  id VARCHAR(64) NOT NULL,
  link TEXT NOT NULL,
  title TEXT NULL,
  description TEXT NULL,
  image LONGTEXT NULL,
  video LONGTEXT NULL,
  PRIMARY KEY (ai),
  UNIQUE KEY uq_previews_id (id),
  KEY idx_previews_link (link(191))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- One immediately usable room for the local test.
INSERT IGNORE INTO channels
(id, name, public, tldadmin, admins, fee, created, hidden, activated, slds, hip2)
VALUES
('general1', 'general', 1, 0, JSON_ARRAY(), 0, UNIX_TIMESTAMP(), 0, 1, 0, 0);

CREATE TABLE IF NOT EXISTS accounts (
  ai BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  username VARCHAR(255) NOT NULL,
  namespace VARCHAR(32) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  session VARCHAR(64) NOT NULL,
  domain_id VARCHAR(64) NOT NULL,
  role VARCHAR(32) NOT NULL DEFAULT 'user',
  created BIGINT UNSIGNED NOT NULL DEFAULT 0,
  disabled TINYINT(1) NOT NULL DEFAULT 0,
  PRIMARY KEY (ai),
  UNIQUE KEY uq_accounts_name (username, namespace),
  UNIQUE KEY uq_accounts_domain_id (domain_id),
  KEY idx_accounts_session (session)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
