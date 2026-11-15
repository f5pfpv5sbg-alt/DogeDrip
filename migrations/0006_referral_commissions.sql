-- Dedicated, pre-funded reserve for referral commissions.
-- Starts empty and disabled so existing Faucet liabilities are never used.
CREATE TABLE IF NOT EXISTS referral_reserve (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  available_koinu INTEGER NOT NULL DEFAULT 0 CHECK (available_koinu >= 0),
  payouts_enabled INTEGER NOT NULL DEFAULT 0 CHECK (payouts_enabled IN (0, 1)),
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT OR IGNORE INTO referral_reserve (id, available_koinu, payouts_enabled)
VALUES (1, 0, 0);

CREATE TABLE IF NOT EXISTS referral_commissions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  claim_id INTEGER NOT NULL UNIQUE,
  referred_uid TEXT NOT NULL,
  referrer_uid TEXT NOT NULL,
  amount_koinu INTEGER NOT NULL CHECK (amount_koinu > 0),
  rate_bps INTEGER NOT NULL CHECK (rate_bps = 1500),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (claim_id) REFERENCES claims(id) ON DELETE CASCADE,
  FOREIGN KEY (referred_uid) REFERENCES users(uid) ON DELETE CASCADE,
  FOREIGN KEY (referrer_uid) REFERENCES users(uid) ON DELETE CASCADE,
  CHECK (referred_uid != referrer_uid)
);

CREATE INDEX IF NOT EXISTS idx_referral_commissions_referrer_created
  ON referral_commissions(referrer_uid, id DESC);

CREATE INDEX IF NOT EXISTS idx_referral_commissions_referred_created
  ON referral_commissions(referred_uid, id DESC);
