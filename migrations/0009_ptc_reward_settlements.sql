-- Idempotent settlement of completed PTC rewards into user balances.
-- Each completed view can be settled exactly once.
CREATE TABLE IF NOT EXISTS ptc_settlements (
  id TEXT PRIMARY KEY,
  uid TEXT NOT NULL,
  amount_koinu INTEGER NOT NULL CHECK (amount_koinu > 0),
  views_count INTEGER NOT NULL CHECK (views_count > 0),
  settled_by TEXT NOT NULL,
  idempotency_key TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (uid) REFERENCES users(uid),
  FOREIGN KEY (settled_by) REFERENCES users(uid)
);

CREATE TABLE IF NOT EXISTS ptc_settlement_items (
  view_id INTEGER PRIMARY KEY,
  settlement_id TEXT NOT NULL,
  uid TEXT NOT NULL,
  amount_koinu INTEGER NOT NULL CHECK (amount_koinu > 0),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (view_id) REFERENCES ptc_views(id),
  FOREIGN KEY (settlement_id) REFERENCES ptc_settlements(id),
  FOREIGN KEY (uid) REFERENCES users(uid)
);

CREATE INDEX IF NOT EXISTS idx_ptc_settlements_uid_created
  ON ptc_settlements(uid, created_at DESC);
