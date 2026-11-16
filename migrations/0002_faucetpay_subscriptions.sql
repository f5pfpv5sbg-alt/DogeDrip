-- The two columns below were applied directly to the production D1 database
-- before this migration was committed:
-- subscription_orders.merchant_amount
-- subscription_orders.merchant_currency
-- subscriptions.payment_order_id
-- This migration adds the uniqueness guard used by the verified callback.
CREATE UNIQUE INDEX IF NOT EXISTS idx_subscriptions_payment_order
  ON subscriptions(payment_order_id)
  WHERE payment_order_id IS NOT NULL;
