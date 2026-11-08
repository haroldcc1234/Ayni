CREATE TABLE IF NOT EXISTS territories (
  district TEXT PRIMARY KEY,
  crisis INTEGER NOT NULL DEFAULT 0 CHECK (crisis IN (0,1))
);
CREATE TABLE IF NOT EXISTS members (
  id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE, dni_hash TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL, district TEXT NOT NULL REFERENCES territories(district),
  profile TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS member_sector ON members(district);
CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY, member_id TEXT NOT NULL REFERENCES members(id), expires TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS records (
  district TEXT NOT NULL REFERENCES territories(district), entity TEXT NOT NULL,
  id TEXT NOT NULL, version INTEGER NOT NULL, body TEXT NOT NULL,
  PRIMARY KEY (district, entity, id)
);
CREATE TABLE IF NOT EXISTS sync_receipts (
  member_id TEXT NOT NULL REFERENCES members(id), operation_id TEXT NOT NULL, result TEXT NOT NULL,
  PRIMARY KEY (member_id,operation_id)
);
CREATE TABLE IF NOT EXISTS admin_audit (
  id TEXT PRIMARY KEY, actor TEXT NOT NULL, target TEXT NOT NULL, action TEXT NOT NULL, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS secrets (name TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS push_devices (
 token TEXT PRIMARY KEY, member_id TEXT NOT NULL REFERENCES members(id), session_hash TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS push_deliveries (
 id TEXT PRIMARY KEY, token TEXT NOT NULL REFERENCES push_devices(token) ON DELETE CASCADE,
 district TEXT NOT NULL, alert_id TEXT NOT NULL, member_id TEXT NOT NULL,
 state TEXT NOT NULL, ticket TEXT, due BIGINT NOT NULL, attempts INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS due_push ON push_deliveries(state,due);
CREATE TABLE IF NOT EXISTS points_ledger (
 member_id TEXT NOT NULL REFERENCES members(id), event_id TEXT NOT NULL, amount INTEGER NOT NULL,
 label TEXT NOT NULL, recorded_at TEXT NOT NULL, listing_id TEXT, PRIMARY KEY(member_id,event_id)
);

CREATE TABLE IF NOT EXISTS email_challenges (
 email TEXT NOT NULL, purpose TEXT NOT NULL, digest TEXT NOT NULL, expires BIGINT NOT NULL,
 sent BIGINT NOT NULL, attempts INTEGER NOT NULL, PRIMARY KEY(email,purpose)
);
