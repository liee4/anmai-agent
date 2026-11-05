ALTER TABLE minute_vitals ADD COLUMN aggregation_version INTEGER NOT NULL DEFAULT 1;
CREATE UNIQUE INDEX IF NOT EXISTS idx_anomaly_snippet_event_at ON anomaly_snippets(event_id, at);
