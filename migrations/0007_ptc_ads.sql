-- PTC campaigns use a dedicated DOGE reserve.
-- Funds are manually verified by an administrator before they can be allocated.
-- Completed view rewards remain pending and are NOT added to withdrawable user balances.

CREATE TABLE IF NOT EXISTS ptc_reserve (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  available_koinu INTEGER NOT NULL DEFAULT 0 CHECK (available_koinu >= 0),
  locked_koinu INTEGER NOT NULL DEFAULT 0 CHECK (locked_koinu >= 0),
  pending_koinu INTEGER NOT NULL DEFAULT 0 CHECK (pending_koinu >= 0),
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT OR IGNORE INTO ptc_reserve (id, available_koinu, locked_koinu, pending_koinu)
VALUES (1, 0, 0, 0);

CREATE TABLE IF NOT EXISTS ptc_funding_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  admin_uid TEXT NOT NULL,
  amount_koinu INTEGER NOT NULL CHECK (amount_koinu > 0),
  external_reference TEXT NOT NULL UNIQUE,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (admin_uid) REFERENCES users(uid)
);

CREATE TABLE IF NOT EXISTS ptc_campaigns (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL CHECK (length(title) BETWEEN 3 AND 80),
  description TEXT NOT NULL CHECK (length(description) BETWEEN 10 AND 500),
  advertiser_name TEXT NOT NULL CHECK (length(advertiser_name) BETWEEN 2 AND 80),
  target_url TEXT NOT NULL,
  reward_koinu INTEGER NOT NULL CHECK (reward_koinu BETWEEN 1 AND 100000000),
  duration_seconds INTEGER NOT NULL CHECK (duration_seconds BETWEEN 10 AND 180),
  max_views INTEGER NOT NULL CHECK (max_views BETWEEN 1 AND 10000000),
  total_budget_koinu INTEGER NOT NULL CHECK (total_budget_koinu > 0),
  remaining_budget_koinu INTEGER NOT NULL CHECK (remaining_budget_koinu >= 0),
  views_completed INTEGER NOT NULL DEFAULT 0 CHECK (views_completed >= 0),
  status TEXT NOT NULL DEFAULT 'pending_review'
    CHECK (status IN ('pending_review', 'active', 'paused', 'completed', 'rejected')),
  advertiser_payment_reference TEXT NOT NULL,
  payment_verified_by TEXT NOT NULL,
  payment_verified_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (payment_verified_by) REFERENCES users(uid),
  FOREIGN KEY (created_by) REFERENCES users(uid),
  CHECK (remaining_budget_koinu <= total_budget_koinu),
  CHECK (views_completed <= max_views)
);

CREATE INDEX IF NOT EXISTS idx_ptc_campaigns_status_created
  ON ptc_campaigns(status, created_at DESC);

CREATE TABLE IF NOT EXISTS ptc_views (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  uid TEXT NOT NULL,
  campaign_id INTEGER NOT NULL,
  utc_date TEXT NOT NULL,
  view_token_hash TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'started'
    CHECK (status IN ('started', 'completed', 'expired')),
  reward_koinu INTEGER NOT NULL DEFAULT 0 CHECK (reward_koinu >= 0),
  started_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at TEXT,
  FOREIGN KEY (uid) REFERENCES users(uid),
  FOREIGN KEY (campaign_id) REFERENCES ptc_campaigns(id),
  UNIQUE (uid, campaign_id, utc_date)
);

CREATE INDEX IF NOT EXISTS idx_ptc_views_uid_created
  ON ptc_views(uid, id DESC);

CREATE INDEX IF NOT EXISTS idx_ptc_views_campaign_status
  ON ptc_views(campaign_id, status, id DESC);
