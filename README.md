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

## Referral and Lucky Wheel APIs

The authenticated referral dashboard reads `GET /api/referrals`. The public referral-code validator uses `GET /api/referral/validate`.

### Referral commissions

Verified referrals earn the referrer 15% of each successful Faucet claim. Referral attribution is immutable after the account's first D1 synchronization; self-referrals and unverified referrers are rejected. Commission credits are written in the same atomic D1 batch as the referred user's claim, referrer balance update, reserve deduction, and ledger transaction. Each claim can create at most one commission.

Referral rewards use a dedicated `referral_reserve`, separate from the Faucet reserve and user withdrawal liabilities. Migration `0006_referral_commissions.sql` creates this reserve with zero DOGE and commissions disabled. Apply migrations before deploying the Worker:

```bash
npx wrangler d1 migrations apply dogedrip-db --remote
```

Do not enable commissions until DOGE has actually been deposited into the platform's referral payout funding account and the amount has been reconciled. Example only: after confirming a deposit of 1 DOGE, the owner can enable a 1 DOGE referral reserve in the D1 console:

```sql
UPDATE referral_reserve
SET available_koinu = available_koinu + 100000000,
    payouts_enabled = 1,
    updated_at = CURRENT_TIMESTAMP
WHERE id = 1;
```

The value is in koinu (100,000,000 = 1 DOGE). To pause new commissions without deleting history:

```sql
UPDATE referral_reserve
SET payouts_enabled = 0, updated_at = CURRENT_TIMESTAMP
WHERE id = 1;
```

Only fund this reserve with DOGE held separately for referral rewards. Never transfer user withdrawal liabilities or Faucet reserve funds into it.

The Lucky Wheel uses these authenticated Worker routes:

- `GET /api/wheel/state` — prizes, available spins, account balance, and reserve status.
- `POST /api/wheel/spin` — performs an idempotent server-side spin.
- `POST /api/wheel/buy` — purchases a spin package using the user's D1 balance.
- `GET /api/wheel/history` — returns the latest spins and purchases.

### Lucky Wheel D1 setup

Apply the schema migration to the production D1 database:

```bash
npx wrangler d1 migrations apply dogedrip-db --remote
```

Migration `0005_lucky_wheel.sql` creates the prize, reserve, usage, inventory, spin, and purchase tables. It creates the reserve with zero DOGE and `payouts_enabled = 0`. It intentionally does not invent prize amounts or fund the reserve. Before enabling spins, the owner must add approved prize rows to `wheel_prizes`, fund `wheel_reserve.available_koinu` with DOGE actually held for wheel payouts, and only then set `payouts_enabled = 1`. Paid-spin purchases lock enough reserve for the maximum possible prize on every purchased spin; do not reduce the locked reserve while those spins remain unused.

The migration is safe to apply before funding: the wheel remains unavailable until valid prizes and a funded, enabled reserve exist.
