-- Store FaucetPay payout references and safe failure diagnostics.
-- A payout ID is recorded only after FaucetPay confirms status=200.

ALTER TABLE withdrawals ADD COLUMN faucetpay_payout_id TEXT;
ALTER TABLE withdrawals ADD COLUMN payout_error TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_withdrawals_faucetpay_payout_id
  ON withdrawals(faucetpay_payout_id)
  WHERE faucetpay_payout_id IS NOT NULL;
