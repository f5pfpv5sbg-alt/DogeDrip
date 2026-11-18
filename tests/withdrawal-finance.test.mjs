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

test("withdrawal creation authenticates, rate-limits, verifies CAPTCHA and validates amount and DOGE address", () => {
  const route = section(
    worker,
    'if (path === "/api/withdrawals" && method === "POST")',
    "// USER WITHDRAWAL HISTORY"
  );
  assert.match(route, /await authenticate\(request\)/);
  assert.match(route, /RATE_LIMIT_POLICIES\.withdrawalCreate/);
  assert.match(route, /verifyTurnstileToken\(body\.turnstileToken, request, env, "withdraw"\)/);
  assert.match(route, /Number\.isSafeInteger\(amount\)/);
  assert.match(route, /amount < MIN_WITHDRAWAL_KOINU/);
  assert.match(route, /await isValidDogeAddress\(wallet\)/);
  assert.match(route, /status = 'pending'/);
  assert.match(route, /balance_koinu = balance_koinu - \?/);
  assert.match(route, /'withdrawal'/);
  assert.match(route, /env\.DB\.batch\(\[/);
  assert.doesNotMatch(route, /body\.(?:balance|reward)_koinu/);
});

test("a user cannot open a second pending withdrawal and failed debits cannot create requests", () => {
  const route = section(
    worker,
    'if (path === "/api/withdrawals" && method === "POST")',
    "// USER WITHDRAWAL HISTORY"
  );
  assert.match(route, /WHERE uid = \?\s+AND status = 'pending'/);
  assert.match(route, /AND balance_koinu >= \?/);
  assert.match(route, /AND NOT EXISTS \([\s\S]*?status = 'pending'/);
  assert.match(route, /results\[0\]\.meta\.changes !== 1/);
  assert.match(route, /Withdrawal transaction could not be confirmed/);
});

test("automated FaucetPay payouts remain disabled unless explicitly enabled", () => {
  const route = section(
    worker,
    "const approveMatch = path.match(",
    "// ADMIN: RECONCILE AN UNCERTAIN FAUCETPAY RESULT"
  );
  assert.match(route, /requireAdmin\(user, env\)/);
  assert.match(route, /env\.FAUCETPAY_PAYOUTS_ENABLED !== "true"/);
  assert.match(route, /status = 'processing'[\s\S]*?WHERE id = \?[\s\S]*?AND status = 'pending'/);
  assert.match(route, /status = 'payment_unknown'/);
  assert.match(route, /Check FaucetPay payout history before any retry/);
  assert.match(route, /status = 'paid'[\s\S]*?faucetpay_payout_id = \?/);
});

test("uncertain payout reconciliation requires a verified numeric payout ID or an explicit not-paid resolution", () => {
  const route = section(
    worker,
    "const reconcileMatch = path.match(",
    "// ADMIN: REJECT WITHDRAWAL + REFUND + LEDGER"
  );
  assert.match(route, /resolution === "paid"/);
  assert.match(route, /!\/\^\d\{1,32\}\$\//);
  assert.match(route, /status IN \('processing', 'payment_unknown'\)/);
  assert.match(route, /resolution === "not_paid"/);
  assert.match(route, /SET status = 'pending'/);
  assert.doesNotMatch(route, /balance_koinu = balance_koinu \+/);
});

test("rejecting a pending withdrawal refunds once and records a refund ledger entry", () => {
  const route = section(
    worker,
    "// ADMIN: REJECT WITHDRAWAL + REFUND + LEDGER",
    "return json({\n    success: false,\n    message: \"Endpoint not found\""
  );
  assert.match(route, /WHERE id = \?[\s\S]*?AND status = 'pending'/);
  assert.match(route, /status = 'rejected'/);
  assert.match(route, /balance_koinu = balance_koinu \+ \(/);
  assert.match(route, /'withdrawal_refund'/);
  assert.match(route, /'withdrawal_refund:' \|\| w\.id/);
  assert.match(route, /results\[0\]\.meta\.changes !== 1/);
});

test("finance audit treats pending, processing, payment_unknown and ambiguous legacy approvals as outstanding liabilities", () => {
  const route = section(
    worker,
    'if (path === "/api/admin/finance/audit" && method === "GET")',
    "\n  }\n\n  return json({\n    success: false,"
  );
  assert.match(route, /const outstandingStatuses = \["pending", "processing", "payment_unknown"\]/);
  assert.match(route, /legacyApprovedOutstanding/);
  assert.match(route, /outstanding_withdrawals_koinu: outstanding/);
  assert.match(route, /status = 'paid'[\s\S]*faucetpay_payout_id IS NULL/);
  assert.match(route, /status = 'processing'[\s\S]*datetime\(COALESCE\(processed_at, created_at\)\)/);
  assert.match(route, /status = 'payment_unknown'/);
  assert.match(route, /GROUP BY faucetpay_payout_id[\s\S]*HAVING COUNT\(\*\) > 1/);
  assert.match(route, /paid_without_payout_id_count/);
  assert.match(route, /stale_processing_count/);
  assert.match(route, /payment_unknown_count/);
  assert.match(route, /duplicate_payout_id_groups/);
  assert.match(route, /without_debit_ledger_count/);
  assert.match(route, /rejected_without_refund_ledger_count/);
  assert.match(route, /faucet_available_koinu/);
  assert.match(route, /paid_spin_reserve_backed/);
  assert.match(route, /requireAdmin\(user, env\)/);
});
