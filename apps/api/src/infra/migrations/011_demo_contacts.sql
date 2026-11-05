CREATE TABLE demo_contacts (
  wearer_id TEXT NOT NULL,
  contact_id TEXT NOT NULL,
  role TEXT NOT NULL,
  label TEXT NOT NULL,
  outcome TEXT NOT NULL DEFAULT 'deliver',
  PRIMARY KEY(wearer_id, contact_id)
);
CREATE TABLE contact_deliveries (
  idempotency_key TEXT PRIMARY KEY,
  event_id TEXT NOT NULL REFERENCES emergency_events(event_id),
  contact_id TEXT NOT NULL,
  phase TEXT NOT NULL,
  status TEXT NOT NULL,
  attempts INTEGER NOT NULL,
  retry_at TEXT,
  updated_at TEXT NOT NULL,
  payload_json TEXT NOT NULL
);
CREATE INDEX idx_contact_deliveries_event ON contact_deliveries(event_id);
