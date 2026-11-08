CREATE TABLE IF NOT EXISTS board_records (
  district TEXT NOT NULL REFERENCES territories(district),
  record_key TEXT NOT NULL,
  body TEXT NOT NULL,
  PRIMARY KEY (district, record_key)
);
CREATE TABLE IF NOT EXISTS board_receipts (
  actor_id TEXT NOT NULL REFERENCES members(id),
  command_id TEXT NOT NULL,
  PRIMARY KEY (actor_id, command_id)
);
