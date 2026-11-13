-- Lucky Wheel persistence and reserve accounting.
-- The reserve starts empty and disabled: payouts cannot begin until DOGE is
-- explicitly funded and the owner enables wheel payouts.

CREATE TABLE IF NOT EXISTS wheel_prizes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  prize_key TEXT NOT NULL UNIQUE,
  amount_koinu INTEGER NOT NULL CHECK (amount_koinu >= 0),
  probability_weight INTEGER NOT NULL CHECK (probability_weight > 0),
  display_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS wheel_reserve (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  available_koinu INTEGER NOT NULL DEFAULT 0 CHECK (available_koinu >= 0),
  locked_koinu INTEGER NOT NULL DEFAULT 0 CHECK (locked_koinu >= 0),
  payouts_enabled INTEGER NOT NULL DEFAULT 0 CHECK (payouts_enabled IN (0, 1)),
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT OR IGNORE INTO wheel_reserve (
  id,
  available_koinu,
  locked_koinu,
  payouts_enabled
) VALUES (1, 0, 0, 0);

CREATE TABLE IF NOT EXISTS wheel_daily_usage (
  uid TEXT NOT NULL,
  utc_date TEXT NOT NULL,
  free_spins_used INTEGER NOT NULL DEFAULT 0 CHECK (free_spins_used >= 0),
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (uid, utc_date),
  FOREIGN KEY (uid) REFERENCES users(uid) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS wheel_spin_inventory (
  uid TEXT PRIMARY KEY,
  paid_spins INTEGER NOT NULL DEFAULT 0 CHECK (paid_spins >= 0),
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (uid) REFERENCES users(uid) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS wheel_spins (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  uid TEXT NOT NULL,
  request_id TEXT NOT NULL,
  spin_type TEXT NOT NULL CHECK (spin_type IN ('free', 'paid')),
  prize_key TEXT NOT NULL,
  prize_koinu INTEGER NOT NULL CHECK (prize_koinu >= 0),
  utc_date TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (uid, request_id),
  FOREIGN KEY (uid) REFERENCES users(uid) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_wheel_spins_uid_created
  ON wheel_spins(uid, id DESC);

CREATE INDEX IF NOT EXISTS idx_wheel_spins_utc_date
  ON wheel_spins(utc_date);

CREATE TABLE IF NOT EXISTS wheel_purchases (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  uid TEXT NOT NULL,
  request_id TEXT NOT NULL,
  package_spins INTEGER NOT NULL CHECK (package_spins > 0),
  cost_koinu INTEGER NOT NULL CHECK (cost_koinu > 0),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (uid, request_id),
  FOREIGN KEY (uid) REFERENCES users(uid) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_wheel_purchases_uid_created
  ON wheel_purchases(uid, id DESC);
