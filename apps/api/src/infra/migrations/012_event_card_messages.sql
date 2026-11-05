CREATE TABLE event_card_samples (
  event_id TEXT PRIMARY KEY REFERENCES emergency_events(event_id),
  samples_json TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE event_messages (
  event_id TEXT NOT NULL REFERENCES emergency_events(event_id),
  state TEXT NOT NULL,
  provider TEXT NOT NULL,
  status TEXT NOT NULL,
  bundle_json TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY(event_id, state)
);
