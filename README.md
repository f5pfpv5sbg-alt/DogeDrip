# DogeDrip
DOGEDRIP - Dogecoin Faucet Platform


## API rate limiting

Sensitive API actions use an atomic D1 fixed-window counter. Authenticated routes are keyed by a SHA-256 hash of the Firebase UID and route, so users behind the same NAT/IP do not share a limit. The public referral validator uses a SHA-256 hash of Cloudflare's trusted `CF-Connecting-IP`. Raw UIDs and IP addresses are not stored in the rate-limit table.

| Endpoint | Limit | Window | Key |
|---|---:|---:|---|
| `POST /api/auth/sync` | 10 | 60 seconds | Firebase UID |
| `POST /api/claim` | 20 | 60 seconds | Firebase UID |
| `POST /api/wheel/spin` | 15 | 60 seconds | Firebase UID |
| `POST /api/wheel/buy` | 5 | 60 seconds | Firebase UID |
| `POST /api/streak/checkin` | 3 | 60 seconds | Firebase UID |
| `POST /api/withdrawals` | 3 | 1 hour | Firebase UID |
| `GET /api/referral/validate` | 30 | 60 seconds | Client IP |
| `GET /api/admin/stats` and `GET /api/admin/withdrawals` | 60 | 60 seconds | Admin UID |
| `POST /api/admin/withdrawals/:id/approve` | 5 | 60 seconds | Admin UID |
| `POST /api/admin/withdrawals/:id/reject` | 10 | 60 seconds | Admin UID |

Limits are fixed windows and return HTTP 429 with `retry_after` when exceeded. The D1 upsert is atomic; if rate-limit storage is unavailable, protected requests fail closed with HTTP 503. The table contains only hashed keys and is periodically cleaned of entries older than one day. D1 adds one write per protected request; at higher traffic, evaluate a Durable Object or Cloudflare edge rate-limiting rules to reduce D1 write load. These limits are abuse controls, not a substitute for Turnstile, authentication, idempotency, or business-level claim/withdrawal rules.

## User profiles

User profile data is stored in D1. Firebase Authentication remains the identity provider. The authenticated profile API exposes account ID, email, account creation date, email-verification state, plan, and referral details. Users may update only their username; email, UID, role, balance, plan, referral code, and verification state are server-controlled.

The D1 migration in `migrations/0002_user_profile.sql` adds the username column and a case-insensitive unique index. Usernames are 3–20 characters, limited to ASCII letters, numbers, and underscores. Profile reads are available to authenticated users so they can see their verification status; profile updates require a verified email.
