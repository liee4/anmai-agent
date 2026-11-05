CREATE TABLE older_cycle_summaries (
  wearer_id TEXT NOT NULL,
  cycle_id TEXT NOT NULL,
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL,
  valid_days INTEGER NOT NULL,
  facts_json TEXT NOT NULL,
  PRIMARY KEY(wearer_id, cycle_id)
);
