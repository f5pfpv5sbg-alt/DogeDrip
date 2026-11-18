-- Prevent one advertiser payment reference from funding multiple PTC campaigns.
-- Existing references were checked for duplicates before this migration.
CREATE UNIQUE INDEX IF NOT EXISTS idx_ptc_campaigns_payment_reference_unique
  ON ptc_campaigns(advertiser_payment_reference);
