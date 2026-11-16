-- FaucetPay Merchant checkout metadata and subscription idempotency.
ALTER TABLE subscription_orders ADD COLUMN merchant_amount TEXT;
ALTER TABLE subscription_orders ADD COLUMN merchant_currency TEXT NOT NULL DEFAULT 'USDT';
ALTER TABLE subscriptions ADD COLUMN payment_order_id TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_subscriptions_payment_order
  ON subscriptions(payment_order_id)
  WHERE payment_order_id IS NOT NULL;
