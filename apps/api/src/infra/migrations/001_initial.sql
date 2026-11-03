CREATE TABLE IF NOT EXISTS schema_migrations (
  version INTEGER PRIMARY KEY,
  applied_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS import_batches (
  id TEXT PRIMARY KEY,
  wearer_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  input_hash TEXT UNIQUE,
  result_json TEXT
);

CREATE TABLE IF NOT EXISTS minute_vitals (
  wearer_id TEXT NOT NULL,
  minute_at TEXT NOT NULL,
  context TEXT NOT NULL,
  heart_rate REAL,
  spo2 REAL,
  systolic_bp REAL,
  diastolic_bp REAL,
  sample_count INTEGER NOT NULL,
  baseline_eligible INTEGER NOT NULL,
  exclusion_reasons_json TEXT NOT NULL,
  PRIMARY KEY (wearer_id, minute_at, context)
);

CREATE TABLE IF NOT EXISTS ingested_samples (
  wearer_id TEXT NOT NULL,
  sampled_at TEXT NOT NULL,
  sample_json TEXT NOT NULL,
  PRIMARY KEY (wearer_id, sampled_at)
);

CREATE TABLE IF NOT EXISTS daily_summaries (
  wearer_id TEXT NOT NULL,
  date TEXT NOT NULL,
  summary_json TEXT NOT NULL,
  PRIMARY KEY (wearer_id, date)
);

CREATE TABLE IF NOT EXISTS baseline_state (
  wearer_id TEXT PRIMARY KEY,
  status TEXT NOT NULL,
  paused_at TEXT,
  pause_reason TEXT,
  active_version INTEGER
);

CREATE TABLE IF NOT EXISTS baseline_versions (
  wearer_id TEXT NOT NULL,
  version INTEGER NOT NULL,
  cycle_id TEXT NOT NULL,
  published_at TEXT NOT NULL,
  expires_at TEXT,
  baseline_json TEXT NOT NULL,
  PRIMARY KEY (wearer_id, version)
);

CREATE TABLE IF NOT EXISTS baseline_attempts (
  id TEXT PRIMARY KEY,
  wearer_id TEXT NOT NULL,
  cycle_id TEXT NOT NULL,
  attempt INTEGER NOT NULL,
  request_json TEXT NOT NULL,
  response_json TEXT,
  validation_json TEXT,
  created_at TEXT NOT NULL,
  UNIQUE (wearer_id, cycle_id, attempt)
);

CREATE TABLE IF NOT EXISTS emergency_events (
  event_id TEXT PRIMARY KEY,
  wearer_id TEXT NOT NULL,
  state TEXT NOT NULL,
  state_version INTEGER NOT NULL,
  event_json TEXT NOT NULL,
  deadline_at TEXT,
  created_at TEXT NOT NULL,
  closed_at TEXT
);

CREATE TABLE IF NOT EXISTS event_timeline (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL REFERENCES emergency_events(event_id),
  at TEXT NOT NULL,
  kind TEXT NOT NULL,
  detail_json TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS anomaly_snippets (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL REFERENCES emergency_events(event_id),
  at TEXT NOT NULL,
  sample_json TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS deadlines (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL REFERENCES emergency_events(event_id),
  kind TEXT NOT NULL,
  due_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
);

CREATE INDEX IF NOT EXISTS idx_deadlines_due ON deadlines(status, due_at);
CREATE INDEX IF NOT EXISTS idx_events_active ON emergency_events(wearer_id, closed_at);
CREATE UNIQUE INDEX IF NOT EXISTS idx_one_active_event_per_wearer ON emergency_events(wearer_id) WHERE closed_at IS NULL;
