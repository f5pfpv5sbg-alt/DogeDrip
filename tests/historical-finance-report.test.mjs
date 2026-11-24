import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const worker = await readFile(new URL("../worker.js", import.meta.url), "utf8");

function section(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  assert.notEqual(start, -1, `missing start marker: ${startMarker}`);
  const end = source.indexOf(endMarker, start);
  assert.ok(end > start, `missing end marker: ${endMarker}`);
  return source.slice(start, end);
}

test("historical finance report is admin-only, rate-limited, and date-range bounded", () => {
  const route = section(worker, "// ADMIN: HISTORICAL FINANCIAL REPORT", "// ADMIN: OPERATING EXPENSES");
  assert.ok(route.includes("authenticate(request)"));
  assert.ok(route.includes("requireAdmin(user, env)"));
  assert.ok(route.includes("admin_finance_report"));
  assert.ok(route.includes(String.raw`/^\d{4}-\d{2}-\d{2}$/`));
  assert.ok(route.includes("startDate > endDate"));
  assert.ok(route.includes("endDate > getUtcDate()"));
  assert.ok(route.includes("dayCount > 366"));
});

test("historical report counts only provider-verified subscriptions and evidence-verified expenses", () => {
  const route = section(worker, "// ADMIN: HISTORICAL FINANCIAL REPORT", "// ADMIN: OPERATING EXPENSES");
  assert.ok(route.includes("FROM subscription_orders"));
  assert.ok(route.includes("status = 'paid'"));
  assert.ok(route.includes("provider = 'faucetpay'"));
  assert.ok(route.includes("provider_transaction_id IS NOT NULL"));
  assert.ok(route.includes("paid_at IS NOT NULL"));
  assert.ok(route.includes("FROM operating_expenses"));
  assert.ok(route.includes("verification_status = 'verified'"));
  assert.ok(route.includes("partial_subscription_net_eur_cents"));
  assert.ok(route.includes("total_profit_eur_cents: null"));
});

test("PTC funding and current user liabilities are separated from revenue and profit", () => {
  const route = section(worker, "// ADMIN: HISTORICAL FINANCIAL REPORT", "// ADMIN: OPERATING EXPENSES");
  assert.ok(route.includes("FROM ptc_funding_events"));
  assert.ok(route.includes("gross advertiser funding; not profit or free cash"));
  assert.ok(route.includes("current_liabilities_snapshot"));
  assert.ok(route.includes("user_balances_koinu"));
  assert.ok(route.includes("pending_withdrawals_koinu"));
  assert.ok(route.includes("ptc_reserve_pending_koinu"));
  assert.ok(route.includes("profit_status: \"not_calculated_incomplete_revenue_and_cost_reconciliation\""));
  assert.ok(route.includes("status IN ('pending', 'processing', 'payment_unknown')"));
  assert.ok(route.includes("id NOT IN (1, 2)"));
  assert.ok(route.includes("(status = 'approved' AND faucetpay_payout_id IS NULL)"));
  assert.ok(route.includes("status = 'paid'"));
  assert.ok(route.includes("trim(faucetpay_payout_id) = ''"));
  assert.ok(route.includes("outstanding_withdrawals_koinu"));
  assert.ok(route.includes("faucetpay_payout_id IS NULL"));
});
