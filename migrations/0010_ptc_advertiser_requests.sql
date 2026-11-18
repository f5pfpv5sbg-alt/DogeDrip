-- PTC advertiser self-service campaign requests.
-- Advertisers submit campaign details; admins quote, verify payment, and create funded campaigns.
CREATE TABLE IF NOT EXISTS ptc_advertiser_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  advertiser_uid TEXT NOT NULL,
  advertiser_email TEXT NOT NULL,
  advertiser_name TEXT NOT NULL CHECK (length(advertiser_name) BETWEEN 2 AND 80),
  title TEXT NOT NULL CHECK (length(title) BETWEEN 3 AND 80),
  description TEXT NOT NULL CHECK (length(description) BETWEEN 10 AND 500),
  target_url TEXT NOT NULL,
  reward_koinu INTEGER NOT NULL CHECK (reward_koinu BETWEEN 1 AND 100000000),
  duration_seconds INTEGER NOT NULL CHECK (duration_seconds BETWEEN 10 AND 180),
  max_views INTEGER NOT NULL CHECK (max_views BETWEEN 1 AND 10000000),
  requested_budget_koinu INTEGER NOT NULL CHECK (requested_budget_koinu > 0),
  quoted_budget_koinu INTEGER,
  payment_reference TEXT,
  status TEXT NOT NULL DEFAULT 'pending_review'
    CHECK (status IN ('pending_review', 'awaiting_payment', 'payment_submitted', 'approved', 'rejected')),
  campaign_id INTEGER UNIQUE,
  admin_note TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (advertiser_uid) REFERENCES users(uid),
  FOREIGN KEY (campaign_id) REFERENCES ptc_campaigns(id),
  CHECK (requested_budget_koinu <= reward_koinu * max_views),
  CHECK (quoted_budget_koinu IS NULL OR quoted_budget_koinu <= reward_koinu * max_views)
);

CREATE INDEX IF NOT EXISTS idx_ptc_advertiser_requests_owner
  ON ptc_advertiser_requests(advertiser_uid, id DESC);
CREATE INDEX IF NOT EXISTS idx_ptc_advertiser_requests_status
  ON ptc_advertiser_requests(status, id DESC);

CREATE UNIQUE INDEX IF NOT EXISTS idx_ptc_advertiser_payment_reference_unique
  ON ptc_advertiser_requests(payment_reference)
  WHERE payment_reference IS NOT NULL AND payment_reference != '';
