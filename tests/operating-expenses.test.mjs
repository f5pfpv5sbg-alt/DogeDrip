import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const worker = await readFile(new URL("../worker.js", import.meta.url), "utf8");
const app = await readFile(new URL("../App.jsx", import.meta.url), "utf8");
const migration = await readFile(new URL("../migrations/0008_operating_expenses.sql", import.meta.url), "utf8");

test("operating expenses are stored in EUR cents and default to unverified", () => {
  assert.match(migration, /amount_cents INTEGER NOT NULL CHECK \(amount_cents > 0/);
  assert.match(migration, /currency TEXT NOT NULL DEFAULT 'EUR' CHECK \(currency = 'EUR'\)/);
  assert.match(migration, /verification_status TEXT NOT NULL DEFAULT 'unverified'/);
  assert.match(migration, /evidence_reference IS NOT NULL/);
  assert.match(migration, /verified_by IS NOT NULL AND verified_at IS NOT NULL/);
  assert.match(migration, /idx_operating_expenses_date_status/);
});

test("only authenticated admins can create and verify expenses", () => {
  const routes = worker.slice(worker.indexOf("// ADMIN: OPERATING EXPENSES"), worker.indexOf("// ADMIN: READ-ONLY FINANCIAL INTEGRITY AUDIT"));
  assert.match(routes, /authenticate\(request\)/);
  assert.match(routes, /requireAdmin\(user, env\)/);
  assert.match(routes, /admin_expenses_create/);
  assert.match(routes, /admin_expenses_verify/);
  assert.match(routes, /amountCents < 1/);
  assert.match(routes, /amountCents > 1000000000/);
  assert.match(routes, /categories\.has\(category\)/);
  assert.match(routes, /UPDATE operating_expenses[\s\S]*verification_status = 'verified'/);
  assert.match(routes, /WHERE id = \? AND verification_status = 'unverified'/);
  assert.match(routes, /evidenceReference\.length < 3/);
});

test("daily report includes only verified expenses and never claims full platform profit", () => {
  const stats = worker.slice(worker.indexOf("async function getAdminDailyStats"), worker.indexOf("function validatePublicHttpUrl("));
  assert.match(stats, /FROM operating_expenses[\s\S]*verification_status = 'verified'[\s\S]*date\(expense_date\) = \?/);
  assert.match(stats, /expense_tracking_available/);
  assert.match(stats, /verified_subscription_net_after_expenses_eur_cents/);
  assert.match(stats, /profit_koinu: null/);
  assert.match(stats, /external_doge_revenue_verified: false/);
});

test("admin dashboard requires a receipt reference before verifying and clearly labels partial net", () => {
  assert.match(app, /Operating Expenses/);
  assert.match(app, /Add unverified expense/);
  assert.match(app, /Receipt \/ transaction reference/);
  assert.match(app, /Verify expense/);
  assert.match(app, /Partial net only; excludes unverified ad income and other costs/);
  assert.match(app, /Migration required/);
});
