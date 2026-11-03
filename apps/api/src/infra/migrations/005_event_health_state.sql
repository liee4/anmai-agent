CREATE TABLE IF NOT EXISTS event_health_state (
  event_id TEXT PRIMARY KEY REFERENCES emergency_events(event_id),
  last_risk_json TEXT NOT NULL,
  normal_since TEXT
);
