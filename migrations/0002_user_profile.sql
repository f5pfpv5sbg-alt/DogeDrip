ALTER TABLE users ADD COLUMN username TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username_unique
ON users(username COLLATE NOCASE)
WHERE username IS NOT NULL AND username != '';
