CREATE TABLE IF NOT EXISTS user_daily_activity (
  utc_date TEXT NOT NULL,
  uid TEXT NOT NULL,
  session_count INTEGER NOT NULL DEFAULT 1 CHECK (session_count >= 1),
  first_seen_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_seen_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (utc_date, uid),
  FOREIGN KEY (uid) REFERENCES users(uid) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_user_daily_activity_uid_date
  ON user_daily_activity(uid, utc_date DESC);
