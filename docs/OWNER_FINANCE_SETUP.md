# Owner finance and payout ledger setup

This feature is intentionally read-only. It does not send DOGE, create payouts, or move user funds.

## Prerequisites

- Deploy and validate this branch in a non-production Worker environment first.
- Confirm the Firebase account that owns the platform and obtain its Firebase Authentication UID from the trusted Firebase console.
- Do not use an email address, display name, or client-side admin flag as the owner identity.
- Keep the production payout switch disabled. This migration initializes it to `0`.

## Owner access

Configure `OWNER_UID` as a Cloudflare Worker secret (preferred) or a protected environment variable for the target environment. Its value must be the exact Firebase Auth UID of the platform owner.

Never put the UID in frontend code, a public Pages variable, a commit, a URL, or a support message. The owner routes fail closed if the setting is absent or does not match the authenticated Firebase token subject.

## Database migration

The owner ledger migration is `migrations/0012_owner_payout_ledger.sql`. It follows the existing migration sequence through `0011_unique_ptc_campaign_payment_reference.sql`; do not rename it to an earlier number.

Before applying it to production:

1. Back up the target D1 database.
2. Apply it to a disposable or staging D1 database first.
3. Confirm the migration creates the three owner tables and initializes `owner_payout_reserve` with zero available funds, zero locked funds, and `payouts_enabled = 0`.
4. Confirm existing user balances, withdrawals, and PTC campaign balances are unchanged.
5. Only then schedule a separately reviewed production migration.

Do not run this migration against production as part of a preview deployment.

## Read-only endpoints

All routes require a valid Firebase ID token and the exact `OWNER_UID` match.

- `GET /api/owner/finance` — verified totals grouped by currency, separate DOGE reserve, and user withdrawal liabilities.
- `GET /api/owner/ledger?limit=50` — ledger history. Limits are 1–100.
- `GET /api/owner/ledger?limit=50&before_id=123` — next ledger page.
- `GET /api/owner/payouts?limit=50` — payout history. Limits are 1–100.
- `GET /api/owner/payouts?limit=50&before_id=123` — next payout-history page.

Use the returned `next_before_id` as the next request's `before_id`. Do not increment IDs or use offsets.

## Accounting rules

- DOGE is stored in koinu, EUR in cents, and USDT in micro-USDT.
- Values in different currencies must never be added without a separately verified FX conversion.
- Only independently verified settlement events may be recorded as verified revenue.
- PTC advertiser funds are ring-fenced for campaign delivery and user rewards; they are not owner profit.
- User withdrawal liabilities remain separate from owner funds.
- Do not book client-submitted payment references as revenue.

## Payouts remain disabled

There is deliberately no owner payout creation endpoint in this phase. Do not set `payouts_enabled` to `1`, create manual payout rows, or transfer funds through these read-only routes.

A later payout release requires, at minimum, verified DOGE-only owner funds, reconciliation against user liabilities, provider API integration, idempotent request handling, uncertain-payment reconciliation, and a separate security review.
