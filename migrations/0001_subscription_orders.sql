-- Premium/VIP checkout orders. This table does not activate subscriptions.
-- A subscription may only be activated after the provider callback is independently verified.
CREATE TABLE IF NOT EXISTS subscription_orders (
  id TEXT PRIMARY KEY,
  firebase_uid TEXT NOT NULL,
  plan TEXT NOT NULL CHECK (plan IN ('PREMIUM', 'VIP')),
  billing_period TEXT NOT NULL CHECK (billing_period IN ('monthly', 'yearly')),
  amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
  currency TEXT NOT NULL DEFAULT 'EUR' CHECK (currency = 'EUR'),
  provider TEXT NOT NULL CHECK (provider IN ('faucetpay')),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'paid', 'failed', 'expired')),
  provider_transaction_id TEXT UNIQUE,
  idempotency_key TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  paid_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (firebase_uid) REFERENCES users(uid) ON DELETE CASCADE,
  CHECK (
    (status = 'paid' AND provider_transaction_id IS NOT NULL AND paid_at IS NOT NULL)
    OR status != 'paid'
  )
);

CREATE INDEX IF NOT EXISTS idx_subscription_orders_uid_created
  ON subscription_orders(firebase_uid, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_subscription_orders_status_expiry
  ON subscription_orders(status, expires_at);

CREATE UNIQUE INDEX IF NOT EXISTS idx_subscription_orders_provider_tx
  ON subscription_orders(provider, provider_transaction_id)
  WHERE provider_transaction_id IS NOT NULL;
