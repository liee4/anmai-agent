CREATE TABLE IF NOT EXISTS demo_sessions (
  id TEXT PRIMARY KEY,
  wearer_id TEXT NOT NULL UNIQUE,
  mode TEXT NOT NULL DEFAULT 'fake' CHECK (mode IN ('fake','deepseek')),
  calls INTEGER NOT NULL DEFAULT 0,
  access_hash TEXT NOT NULL,
  created_at TEXT NOT NULL
);
