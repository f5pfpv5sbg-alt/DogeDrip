-- Owner payout accounting foundation.
-- This migration intentionally starts with payouts disabled and a zero reserve.
-- No user-withdrawal funds are shared with this owner-only ledger.

CREATE TABLE IF NOT EXISTS owner_profit_ledger (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source_type TEXT NOT NULL CHECK (
    source_type IN ('ad_revenue', 'subscription_revenue', 'ptc_revenue', 'sponsored_revenue', 'operating_expense', 'manual_adjustment')
  ),
  source_id TEXT NOT NULL,
  entry_type TEXT NOT NULL CHECK (entry_type IN ('revenue', 'expense')),
  -- amount_minor is stored in the smallest unit for currency:
  -- DOGE = koinu (1 DOGE = 100,000,000), EUR = cents, USDT = micro-USDT.
  -- Different currencies are never added together or implicitly converted.
  currency TEXT NOT NULL CHECK (currency IN ('DOGE', 'EUR', 'USDT')),
  amount_minor INTEGER NOT NULL CHECK (amount_minor > 0),
  verified INTEGER NOT NULL DEFAULT 0 CHECK (verified IN (0, 1)),
  note TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  verified_at TEXT,
  CHECK (
    source_type = 'manual_adjustment' OR
    (source_type = 'operating_expense' AND entry_type = 'expense') OR
    (source_type IN ('ad_revenue', 'subscription_revenue', 'ptc_revenue', 'sponsored_revenue') AND entry_type = 'revenue')
  ),
  UNIQUE (source_type, source_id)
);

CREATE INDEX IF NOT EXISTS idx_owner_profit_ledger_verified_created
  ON owner_profit_ledger(verified, created_at);

CREATE TABLE IF NOT EXISTS owner_payout_reserve (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  available_koinu INTEGER NOT NULL DEFAULT 0 CHECK (available_koinu >= 0),
  locked_koinu INTEGER NOT NULL DEFAULT 0 CHECK (locked_koinu >= 0),
  payouts_enabled INTEGER NOT NULL DEFAULT 0 CHECK (payouts_enabled IN (0, 1)),
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT OR IGNORE INTO owner_payout_reserve (
  id, available_koinu, locked_koinu, payouts_enabled
) VALUES (1, 0, 0, 0);

CREATE TABLE IF NOT EXISTS owner_payouts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  request_id TEXT NOT NULL UNIQUE,
  provider TEXT NOT NULL CHECK (provider IN ('faucetpay', 'binance')),
  destination_last4 TEXT NOT NULL CHECK (length(destination_last4) BETWEEN 1 AND 4),
  amount_koinu INTEGER NOT NULL CHECK (amount_koinu > 0),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (
    status IN ('pending', 'processing', 'payment_unknown', 'paid', 'failed', 'cancelled')
  ),
  provider_payout_id TEXT UNIQUE,
  payout_error TEXT,
  requested_by TEXT NOT NULL,
  processed_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_owner_payouts_status_created
  ON owner_payouts(status, created_at DESC);
