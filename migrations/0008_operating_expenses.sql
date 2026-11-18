-- Admin-managed operating expenses.
-- Only records marked verified with evidence are included in financial reports.
CREATE TABLE IF NOT EXISTS operating_expenses (
  id TEXT PRIMARY KEY,
  category TEXT NOT NULL CHECK (category IN ('hosting', 'infrastructure', 'advertising', 'payment_fees', 'software', 'other')),
  description TEXT NOT NULL CHECK (length(description) BETWEEN 3 AND 240),
  amount_cents INTEGER NOT NULL CHECK (amount_cents > 0 AND amount_cents <= 1000000000),
  currency TEXT NOT NULL DEFAULT 'EUR' CHECK (currency = 'EUR'),
  evidence_reference TEXT,
  verification_status TEXT NOT NULL DEFAULT 'unverified'
    CHECK (verification_status IN ('unverified', 'verified')),
  created_by TEXT NOT NULL,
  verified_by TEXT,
  verified_at TEXT,
  expense_date TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (
    (verification_status = 'verified' AND evidence_reference IS NOT NULL
      AND length(trim(evidence_reference)) BETWEEN 3 AND 240
      AND verified_by IS NOT NULL AND verified_at IS NOT NULL)
    OR verification_status = 'unverified'
  ),
  FOREIGN KEY (created_by) REFERENCES users(uid),
  FOREIGN KEY (verified_by) REFERENCES users(uid)
);

CREATE INDEX IF NOT EXISTS idx_operating_expenses_date_status
  ON operating_expenses(expense_date, verification_status);

CREATE INDEX IF NOT EXISTS idx_operating_expenses_created
  ON operating_expenses(created_at DESC);
