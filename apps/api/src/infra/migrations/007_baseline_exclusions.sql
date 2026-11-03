CREATE TABLE IF NOT EXISTS baseline_exclusions (
  wearer_id TEXT NOT NULL,
  start_minute TEXT NOT NULL,
  end_minute TEXT NOT NULL,
  reason TEXT NOT NULL,
  PRIMARY KEY (wearer_id, start_minute, end_minute, reason)
);
CREATE INDEX IF NOT EXISTS idx_baseline_exclusions_wearer_range ON baseline_exclusions(wearer_id, start_minute, end_minute);
ALTER TABLE baseline_versions ADD COLUMN invalidated_at TEXT;
