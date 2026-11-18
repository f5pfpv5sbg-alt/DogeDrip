import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const worker = await readFile(new URL("../worker.js", import.meta.url), "utf8");
const app = await readFile(new URL("../App.jsx", import.meta.url), "utf8");

function section(source, start, end) {
  const a = source.indexOf(start);
  const b = source.indexOf(end, a);
  assert.ok(a >= 0 && b > a, "finance audit section must exist");
  return source.slice(a, b);
}

test("finance audit checks pending PTC views against the pending reserve", () => {
  const route = section(worker, "// ADMIN: READ-ONLY FINANCIAL INTEGRITY AUDIT", "// ADMIN: DAILY STATS");
  assert.ok(route.includes("FROM ptc_views v"));
  assert.ok(route.includes("ptc_settlement_items"));
  assert.ok(route.includes("pending_reserve_matches_views"));
  assert.ok(route.includes("reserve_pending_koinu"));
  assert.ok(route.includes("reserve_available_koinu"));
  assert.ok(route.includes("reserve_locked_koinu"));
});

test("finance audit detects PTC settlements missing ledger entries and item total mismatches", () => {
  const route = section(worker, "// ADMIN: READ-ONLY FINANCIAL INTEGRITY AUDIT", "// ADMIN: DAILY STATS");
  assert.ok(route.includes("settlements_without_ledger_count"));
  assert.ok(route.includes("transaction_type = 'ptc_reward'"));
  assert.ok(route.includes("reference_type = 'ptc_settlement'"));
  assert.ok(route.includes("settlement_item_mismatches"));
  assert.ok(route.includes("ps.amount_koinu"));
  assert.ok(route.includes("ps.views_count"));
});

test("admin finance audit displays PTC reserve and settlement integrity statuses", () => {
  assert.ok(app.includes("PTC Pending Rewards"));
  assert.ok(app.includes("PTC Reserve Match"));
  assert.ok(app.includes("PTC Settlements Missing Ledger"));
  assert.ok(app.includes("PTC Settlement Mismatches"));
  assert.ok(app.includes("faucetPayCoverageDifferenceDoge"));
  assert.ok(app.includes("Recorded liabilities and earmarked reserves"));
  assert.ok(app.includes("This is a snapshot comparison, not profit"));
});
