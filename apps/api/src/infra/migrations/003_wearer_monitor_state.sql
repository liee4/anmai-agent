CREATE TABLE IF NOT EXISTS wearer_monitor_state (
  wearer_id TEXT PRIMARY KEY,
  fingerprint_json TEXT NOT NULL,
  confirmed_at TEXT NOT NULL,
  recheck_at TEXT NOT NULL,
  recheck_count INTEGER NOT NULL DEFAULT 0,
  normal_since TEXT
);
