CREATE TABLE IF NOT EXISTS simulated_deliveries (
  idempotency_key TEXT PRIMARY KEY,
  event_id TEXT NOT NULL REFERENCES emergency_events(event_id),
  recipient TEXT NOT NULL,
  kind TEXT NOT NULL,
  status TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);
