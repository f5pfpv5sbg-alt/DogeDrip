CREATE TABLE IF NOT EXISTS advertising_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  uid TEXT NOT NULL,
  business_name TEXT NOT NULL,
  contact_email TEXT NOT NULL,
  website_url TEXT NOT NULL,
  banner_image_url TEXT NOT NULL,
  placement TEXT NOT NULL CHECK (placement IN ('top', 'bottom')),
  duration_days INTEGER NOT NULL CHECK (duration_days IN (7, 14, 30)),
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'pending_review'
    CHECK (status IN ('pending_review', 'awaiting_payment', 'payment_submitted', 'active', 'rejected')),
  quoted_price_eur REAL,
  payment_reference TEXT,
  active_until TEXT,
  processed_by TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (uid) REFERENCES users(uid)
);

CREATE INDEX IF NOT EXISTS idx_advertising_requests_uid_created
  ON advertising_requests(uid, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_advertising_requests_status_placement
  ON advertising_requests(status, placement, id DESC);
