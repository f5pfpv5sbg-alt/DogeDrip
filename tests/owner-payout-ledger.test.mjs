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
