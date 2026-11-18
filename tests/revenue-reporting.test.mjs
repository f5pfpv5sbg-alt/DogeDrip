import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const worker = await readFile(new URL("../worker.js", import.meta.url), "utf8");
const app = await readFile(new URL("../App.jsx", import.meta.url), "utf8");

function section(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  assert.notEqual(start, -1, `missing start marker: ${startMarker}`);
  const end = source.indexOf(endMarker, start);
  assert.ok(end > start, `missing end marker: ${endMarker}`);
  return source.slice(start, end);
}

test("daily subscription revenue counts only paid FaucetPay orders with a verified transaction and paid timestamp", () => {
  const stats = section(worker, "async function getAdminDailyStats(env)", "function validatePublicHttpUrl(");
  const query = section(
    stats,
    "SELECT\n        COALESCE(SUM(amount_cents), 0) AS total_cents",
    "    `).bind(today).first(),"
  );
  assert.match(query, /FROM subscription_orders/);
  assert.match(query, /status = 'paid'/);
  assert.match(query, /provider = 'faucetpay'/);
  assert.match(query, /provider_transaction_id IS NOT NULL/);
  assert.match(query, /paid_at IS NOT NULL/);
  assert.match(query, /date\(paid_at\) = \?/);
  assert.match(query, /plan = 'PREMIUM'/);
  assert.match(query, /plan = 'VIP'/);
});

test("revenue reporting exposes EUR cents and separates Premium from VIP without treating DOGE purchases as revenue", () => {
  const stats = section(worker, "async function getAdminDailyStats(env)", "function validatePublicHttpUrl(");
  assert.match(stats, /verified_subscription_revenue_eur_cents:/);
  assert.match(stats, /verified_subscription_revenue_eur:/);
  assert.match(stats, /verified_subscription_orders_today:/);
  assert.match(stats, /subscription_revenue_breakdown_eur_cents:/);
  assert.match(stats, /subscription_revenue_verification_status: "faucetpay_callback_verified"/);
  assert.match(stats, /profit_koinu: null/);
  assert.match(stats, /external_doge_revenue_verified: false/);
});

test("admin UI labels manual advertising values as unverified and subscription revenue as provider-verified", () => {
  assert.match(app, /Ad Campaign Value Today \(Unverified\)/);
  assert.match(app, /Verified Premium \+ VIP Revenue Today/);
  assert.match(app, /FaucetPay-verified payments/);
  assert.match(app, /Only provider-verified paid orders are counted/);
});

test("PTC advertiser funding is reported separately from reserve liabilities and is not labeled profit", () => {
  const stats = section(worker, "async function getAdminDailyStats(env)", "function validatePublicHttpUrl(");
  assert.match(stats, /FROM ptc_funding_events[\\s\\S]*date\\(created_at\\) = \\?/);
  assert.match(stats, /ptc_advertiser_funding_today_koinu/);
  assert.match(stats, /ptc_funding_verification_status: "admin_confirmed_external_reference"/);
  assert.match(stats, /ptc_reserve:[\\s\\S]*available_koinu:[\\s\\S]*locked_koinu:[\\s\\S]*pending_koinu:/);
  assert.match(stats, /profit_koinu: null/);
  assert.match(app, /PTC Advertiser Funding Today/);
  assert.match(app, /PTC Reserve \/ Pending Rewards/);
});
