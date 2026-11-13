# DogeDrip
DOGEDRIP - Dogecoin Faucet Platform


## API rate limiting

Sensitive API actions use an atomic D1 fixed-window counter. Authenticated routes are keyed by a SHA-256 hash of the Firebase UID and route, so users behind the same NAT/IP do not share a limit. The public referral validator uses a SHA-256 hash of Cloudflare's trusted `CF-Connecting-IP`. Raw UIDs and IP addresses are not stored in the rate-limit table.

| Endpoint | Limit | Window | Key |
|---|---:|---:|---|
| `POST /api/security/register` | 5 | 1 hour | Client IP |
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

## Cloudflare Turnstile

The frontend uses the public Turnstile site key for the `dogedrip.pages.dev` hostname. The Worker verifies each protected action with Cloudflare Siteverify and fails closed if the secret is missing or verification fails.

Before deploying this branch, add the Turnstile **Secret Key** to the `dogedrip-api` Worker as a secret binding named exactly `TURNSTILE_SECRET_KEY`:

1. Open Cloudflare Dashboard → **Workers & Pages** → **dogedrip-api**.
2. Open **Settings** → **Variables and Secrets**.
3. Add a variable of type **Secret**, with name `TURNSTILE_SECRET_KEY` and the Secret Key from the `DogeDrip Protection` widget.
4. Save and deploy the Worker.

Never put the Secret Key in `App.jsx`, `index.html`, GitHub, or a `VITE_*` frontend variable. The public Site Key is intentionally present in the frontend. The widget hostname must include `dogedrip.pages.dev`.

Protected actions and their Turnstile action names:

| API action | Turnstile action |
|---|---|
| `POST /api/security/register` | `register` |
| `POST /api/claim` | `claim` |
| `POST /api/wheel/spin` | `wheel_spin` |
| `POST /api/wheel/buy` | `wheel_buy` |
| `POST /api/streak/checkin` | `daily_streak` |
| `POST /api/withdrawals` | `withdrawal_create` |

The Worker validates the Siteverify success flag, exact hostname, action, and a five-minute challenge age. Siteverify enforces token single-use. A missing secret or Siteverify outage returns HTTP 503; invalid, expired, or mismatched tokens are rejected.
