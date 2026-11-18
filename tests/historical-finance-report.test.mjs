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
  assert.match(route, /authenticate\\(request\\)/);
  assert.match(route, /requireAdmin\\(user, env\\)/);
  assert.match(route, /admin_finance_report/);
  assert.match(route, /isValidDate\\(startDate\\)/);
  assert.match(route, /isValidDate\\(endDate\\)/);
  assert.match(route, /startDate > endDate/);
  assert.match(route, /dayCount > 366/);
});

test("historical report counts only provider-verified subscriptions and evidence-verified expenses", () => {
  const route = section(worker, "// ADMIN: HISTORICAL FINANCIAL REPORT", "// ADMIN: OPERATING EXPENSES");
  assert.match(route, /FROM subscription_orders[\\s\\S]*status = 'paid'[\\s\\S]*provider = 'faucetpay'[\\s\\S]*provider_transaction_id IS NOT NULL[\\s\\S]*paid_at IS NOT NULL/);
  assert.match(route, /FROM operating_expenses[\\s\\S]*verification_status = 'verified'/);
  assert.match(route, /partial_subscription_net_eur_cents/);
  assert.match(route, /total_profit_eur_cents: null/);
});

test("PTC funding and current user liabilities are separated from revenue and profit", () => {
  const route = section(worker, "// ADMIN: HISTORICAL FINANCIAL REPORT", "// ADMIN: OPERATING EXPENSES");
  assert.match(route, /FROM ptc_funding_events/);
  assert.match(route, /gross advertiser funding; not profit or free cash/);
  assert.match(route, /current_liabilities_snapshot/);
  assert.match(route, /user_balances_koinu/);
  assert.match(route, /pending_withdrawals_koinu/);
  assert.match(route, /ptc_reserve_pending_koinu/);
  assert.match(route, /profit_status: "not_calculated_incomplete_revenue_and_cost_reconciliation"/);
});
