import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const migration = await readFile(
  new URL("../migrations/0007_owner_payout_ledger.sql", import.meta.url),
  "utf8"
);

test("owner payout reserve is isolated, empty, and disabled by default", () => {
  assert.match(migration, /CREATE TABLE IF NOT EXISTS owner_payout_reserve/);
  assert.match(migration, /available_koinu INTEGER NOT NULL DEFAULT 0 CHECK \(available_koinu >= 0\)/);
  assert.match(migration, /locked_koinu INTEGER NOT NULL DEFAULT 0 CHECK \(locked_koinu >= 0\)/);
  assert.match(migration, /payouts_enabled INTEGER NOT NULL DEFAULT 0 CHECK \(payouts_enabled IN \(0, 1\)\)/);
  assert.match(migration, /VALUES \(1, 0, 0, 0\)/);
  assert.doesNotMatch(migration, /REFERENCES (users|withdrawals)/i);
});

test("owner profit ledger accepts only positive, explicitly verified revenue or expense entries", () => {
  assert.match(migration, /entry_type TEXT NOT NULL CHECK \(entry_type IN \('revenue', 'expense'\)\)/);
  assert.match(migration, /amount_koinu INTEGER NOT NULL CHECK \(amount_koinu > 0\)/);
  assert.match(migration, /verified INTEGER NOT NULL DEFAULT 0 CHECK \(verified IN \(0, 1\)\)/);
  assert.match(migration, /UNIQUE \(source_type, source_id\)/);
  assert.match(migration, /source_type IN \('ad_revenue', 'subscription_revenue', 'ptc_revenue', 'sponsored_revenue', 'operating_expense', 'manual_adjustment'\)/);
});

test("owner payout history cannot store raw wallet addresses and restricts providers and states", () => {
  assert.match(migration, /provider TEXT NOT NULL CHECK \(provider IN \('faucetpay', 'binance'\)\)/);
  assert.match(migration, /destination_last4 TEXT NOT NULL/);
  assert.doesNotMatch(migration, /wallet_address\s+TEXT/i);
  assert.match(migration, /'pending', 'processing', 'payment_unknown', 'paid', 'failed', 'cancelled'/);
  assert.match(migration, /provider_payout_id TEXT UNIQUE/);
  assert.match(migration, /request_id TEXT NOT NULL UNIQUE/);
});


const worker = await readFile(
  new URL("../worker.js", import.meta.url),
  "utf8"
);

test("owner finance endpoint is fail-closed and checks the dedicated owner UID", () => {
  assert.match(worker, /path === "\/api\/owner\/finance" && method === "GET"/);
  assert.match(worker, /typeof env\.OWNER_UID !== "string"/);
  assert.match(worker, /user\.sub !== env\.OWNER_UID\.trim\(\)/);
  assert.match(worker, /Owner access denied/);
});

test("owner finance endpoint keeps user withdrawal liabilities separate", () => {
  const routeStart = worker.indexOf('path === "/api/owner/finance"');
  const routeEnd = worker.indexOf("// ADMIN: DAILY STATS", routeStart);
  assert.ok(routeStart >= 0 && routeEnd > routeStart);
  const route = worker.slice(routeStart, routeEnd);
  assert.match(route, /FROM withdrawals/);
  assert.match(route, /user_withdrawal_liabilities_koinu/);
  assert.match(route, /user_funds_available_for_owner_payout: false/);
  assert.match(route, /owner_payouts_enabled: false/);
  assert.doesNotMatch(route, /UPDATE\s+(users|withdrawals)/i);
});

test("owner finance route exposes totals only and never exposes wallet or provider secrets", () => {
  const routeStart = worker.indexOf('path === "/api/owner/finance"');
  const routeEnd = worker.indexOf("// ADMIN: DAILY STATS", routeStart);
  const route = worker.slice(routeStart, routeEnd);
  assert.match(route, /verified_revenue_koinu/);
  assert.match(route, /verified_expenses_koinu/);
  assert.match(route, /verified_net_profit_koinu/);
  assert.doesNotMatch(route, /wallet_address|FAUCETPAY_API_KEY|BINANCE_API_KEY/i);
});


test("owner ledger history is owner-only, read-only, and paginated with bounded limits", () => {
  const start = worker.indexOf('path === "/api/owner/ledger"');
  const end = worker.indexOf('path === "/api/owner/payouts"', start);
  assert.ok(start >= 0 && end > start);
  const route = worker.slice(start, end);
  assert.match(route, /await requireOwner\(user, env\)/);
  assert.match(route, /limit > 100/);
  assert.match(route, /before_id/);
  assert.match(route, /ORDER BY id DESC/);
  assert.doesNotMatch(route, /INSERT INTO|UPDATE\s+owner_profit_ledger|DELETE FROM/i);
});

test("owner payout history is read-only and never returns a raw destination address", () => {
  const start = worker.indexOf('path === "/api/owner/payouts"');
  const end = worker.indexOf("// ADMIN: DAILY STATS", start);
  assert.ok(start >= 0 && end > start);
  const route = worker.slice(start, end);
  assert.match(route, /await requireOwner\(user, env\)/);
  assert.match(route, /destination_last4/);
  assert.match(route, /limit > 100/);
  assert.doesNotMatch(route, /wallet_address|destination_address|INSERT INTO|UPDATE\s+owner_payouts/i);
});
