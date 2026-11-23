import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";

const migration = await readFile(
  new URL("../migrations/0012_owner_payout_ledger.sql", import.meta.url),
  "utf8"
);

test("owner payout migration follows all existing migrations without a numbering collision", async () => {
  const files = await readdir(new URL("../migrations/", import.meta.url));
  assert.ok(files.includes("0008_operating_expenses.sql"));
  assert.ok(files.includes("0011_unique_ptc_campaign_payment_reference.sql"));
  assert.ok(files.includes("0012_owner_payout_ledger.sql"));
  assert.equal(files.includes("0008_owner_payout_ledger.sql"), false);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS owner_profit_ledger/);
});

test("owner payout reserve is isolated, empty, and disabled by default", () => {
  assert.match(migration, /CREATE TABLE IF NOT EXISTS owner_payout_reserve/);
  assert.match(migration, /available_koinu INTEGER NOT NULL DEFAULT 0 CHECK \(available_koinu >= 0\)/);
  assert.match(migration, /locked_koinu INTEGER NOT NULL DEFAULT 0 CHECK \(locked_koinu >= 0\)/);
  assert.match(migration, /payouts_enabled INTEGER NOT NULL DEFAULT 0 CHECK \(payouts_enabled IN \(0, 1\)\)/);
  assert.match(migration, /VALUES \(1, 0, 0, 0\)/);
  assert.doesNotMatch(migration, /REFERENCES (users|withdrawals)/i);
});

test("owner profit ledger stores currencies separately in their smallest units", () => {
  assert.match(migration, /currency TEXT NOT NULL CHECK \(currency IN \('DOGE', 'EUR', 'USDT'\)\)/);
  assert.match(migration, /amount_minor INTEGER NOT NULL CHECK \(amount_minor > 0\)/);
  assert.match(migration, /Different currencies are never added together or implicitly converted/);
  assert.match(migration, /verified INTEGER NOT NULL DEFAULT 0 CHECK \(verified IN \(0, 1\)\)/);
  assert.match(migration, /UNIQUE \(source_type, source_id\)/);
  assert.match(migration, /length\(trim\(source_id\)\) BETWEEN 1 AND 160/);
  assert.match(migration, /verified = 0 OR verified_at IS NOT NULL/);
  assert.match(migration, /length\(note\) <= 240/);
  assert.doesNotMatch(migration, /ptc_revenue/);
  const ledgerTable = migration.slice(
    migration.indexOf("CREATE TABLE IF NOT EXISTS owner_profit_ledger"),
    migration.indexOf("CREATE INDEX IF NOT EXISTS idx_owner_profit_ledger_verified_created")
  );
  assert.doesNotMatch(ledgerTable, /amount_koinu/);
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
  assert.match(worker, /function requireOwner\(user, env\)/);
  assert.match(worker, /typeof env\.OWNER_UID === "string"/);
  assert.match(worker, /user\.sub !== ownerUid/);
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

test("owner finance reports each currency independently and never converts implicitly", () => {
  const routeStart = worker.indexOf('path === "/api/owner/finance"');
  const routeEnd = worker.indexOf("// OWNER: PAGINATED PROFIT LEDGER HISTORY", routeStart);
  const route = worker.slice(routeStart, routeEnd);
  assert.match(route, /GROUP BY currency/);
  assert.match(route, /currencyTotals\[currency\]/);
  assert.match(route, /conversion_applied: false/);
  assert.match(route, /currency === "DOGE" \? "koinu" : currency === "EUR" \? "cents" : "micro-USDT"/);
  assert.match(route, /owner_payout_reserve:[\s\S]*currency: "DOGE"/);
  assert.match(route, /user_withdrawal_liabilities:[\s\S]*currency: "DOGE"/);
  assert.doesNotMatch(route, /exchange_rate|convertCurrency|wallet_address|FAUCETPAY_API_KEY|BINANCE_API_KEY/i);
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
  assert.match(route, /rawBeforeId/);
  assert.match(route, /beforeId !== null/);
  assert.match(route, /WHERE id < \?/);
  assert.match(route, /next_before_id/);
  assert.doesNotMatch(route, /wallet_address|destination_address|INSERT INTO|UPDATE\s+owner_payouts/i);
});

test("owner endpoints fail closed with a controlled service error when migration is missing", () => {
  assert.match(worker, /Owner payout history is not initialized yet/);
  assert.match(worker, /Owner finance tables are unavailable/);
  assert.match(worker, /Owner ledger table is unavailable/);
  assert.match(worker, /Owner payout table is unavailable/);
});

test("owner finance validates currency totals and DOGE reserves as safe integers", () => {
  assert.match(worker, /verified_revenue_minor/);
  assert.match(worker, /verified_expenses_minor/);
  assert.match(worker, /unverified_entries_minor/);
  assert.match(worker, /availableReserve, lockedReserve, userLiabilities, totalLedgerEntries\]\.every\(Number\.isSafeInteger\)/);
});
