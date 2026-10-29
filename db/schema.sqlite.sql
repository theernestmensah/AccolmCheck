-- Accolm Check: SQLite schema (default, no server needed). Same columns as the MySQL schema.
CREATE TABLE IF NOT EXISTS scans (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  public_id TEXT NOT NULL UNIQUE,
  url TEXT NOT NULL,
  final_url TEXT NOT NULL,
  host TEXT NOT NULL,
  page_title TEXT,
  score INTEGER NOT NULL CHECK (score BETWEEN 0 AND 100),
  band TEXT NOT NULL,
  pass_count INTEGER NOT NULL,
  warn_count INTEGER NOT NULL,
  fail_count INTEGER NOT NULL,
  is_demo INTEGER NOT NULL DEFAULT 0,
  result_json TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%d %H:%M:%S','now'))
);
CREATE INDEX IF NOT EXISTS idx_scans_created ON scans(created_at);
CREATE INDEX IF NOT EXISTS idx_scans_host ON scans(host);
CREATE TABLE IF NOT EXISTS findings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  scan_id INTEGER NOT NULL REFERENCES scans(id) ON DELETE CASCADE,
  check_id TEXT NOT NULL,
  principle TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pass','warn','fail')),
  weight INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_findings_scan ON findings(scan_id);
