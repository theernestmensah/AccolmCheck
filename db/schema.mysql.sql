-- Accolm Check: MySQL schema (MySQL 8+)
CREATE DATABASE IF NOT EXISTS accolmcheck CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE accolmcheck;

CREATE TABLE IF NOT EXISTS scans (
  id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  public_id     CHAR(12)      NOT NULL UNIQUE,       -- random id used in share links
  url           VARCHAR(2048) NOT NULL,              -- address the user typed (after validation)
  final_url     VARCHAR(2048) NOT NULL,              -- address after redirects
  host          VARCHAR(255)  NOT NULL,
  page_title    VARCHAR(200)  NULL,
  score         TINYINT UNSIGNED NOT NULL,           -- 0 to 100
  band          VARCHAR(20)   NOT NULL,              -- good | mid | low
  pass_count    TINYINT UNSIGNED NOT NULL,
  warn_count    TINYINT UNSIGNED NOT NULL,
  fail_count    TINYINT UNSIGNED NOT NULL,
  is_demo       TINYINT(1)    NOT NULL DEFAULT 0,
  result_json   MEDIUMTEXT    NOT NULL,              -- full findings, for the report page
  created_at    DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_scans_created (created_at),
  INDEX idx_scans_host (host)
);

CREATE TABLE IF NOT EXISTS findings (
  id         INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  scan_id    INT UNSIGNED NOT NULL,
  check_id   VARCHAR(40)  NOT NULL,
  principle  VARCHAR(40)  NOT NULL,
  status     ENUM('pass','warn','fail') NOT NULL,
  weight     TINYINT UNSIGNED NOT NULL,
  CONSTRAINT fk_findings_scan FOREIGN KEY (scan_id) REFERENCES scans(id) ON DELETE CASCADE,
  INDEX idx_findings_scan (scan_id)
);
