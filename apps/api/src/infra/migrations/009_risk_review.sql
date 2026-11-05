CREATE TABLE risk_review_state (
  wearer_id TEXT PRIMARY KEY,
  generation INTEGER NOT NULL,
  status TEXT NOT NULL,
  provider TEXT NOT NULL,
  decision TEXT,
  reason TEXT,
  deadline_at TEXT,
  fallback_reason TEXT,
  last_risk_json TEXT,
  last_sample_json TEXT,
  updated_at TEXT NOT NULL
);
CREATE TABLE risk_review_audit (
  id TEXT PRIMARY KEY,
  wearer_id TEXT NOT NULL,
  generation INTEGER NOT NULL,
  provider TEXT NOT NULL,
  decision TEXT,
  reason TEXT,
  fallback_reason TEXT,
  input_hash TEXT NOT NULL,
  created_at TEXT NOT NULL
);
