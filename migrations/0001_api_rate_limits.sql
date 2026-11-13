CREATE TABLE IF NOT EXISTS api_rate_limits (
  bucket_hash TEXT PRIMARY KEY,
  window_start INTEGER NOT NULL,
  hits INTEGER NOT NULL CHECK (hits >= 1),
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_api_rate_limits_updated_at
ON api_rate_limits(updated_at);
