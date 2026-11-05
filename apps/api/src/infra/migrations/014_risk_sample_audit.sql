CREATE TABLE IF NOT EXISTS risk_sample_audit (
  wearer_id TEXT NOT NULL,
  sampled_at TEXT NOT NULL,
  source TEXT NOT NULL,
  reason TEXT NOT NULL,
  risk_reasons_json TEXT NOT NULL,
  sample_json TEXT NOT NULL,
  PRIMARY KEY (wearer_id, sampled_at, reason)
);
CREATE INDEX IF NOT EXISTS idx_risk_sample_audit_wearer_time ON risk_sample_audit(wearer_id, sampled_at);
