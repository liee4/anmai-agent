ALTER TABLE minute_vitals ADD COLUMN local_date TEXT;
UPDATE minute_vitals SET local_date = substr(minute_at, 1, 10) WHERE local_date IS NULL;
CREATE INDEX IF NOT EXISTS idx_minute_vitals_local_day ON minute_vitals(wearer_id, local_date);
