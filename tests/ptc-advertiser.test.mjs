import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [worker, migration] = await Promise.all([
  readFile(new URL("../worker.js", import.meta.url), "utf8"),
  readFile(new URL("../migrations/0010_ptc_advertiser_requests.sql", import.meta.url), "utf8")
]);

test("PTC advertiser requests are stored separately from funded campaigns", () => {
  assert.match(migration, /CREATE TABLE IF NOT EXISTS ptc_advertiser_requests/);
  assert.match(migration, /advertiser_uid TEXT NOT NULL/);
  assert.match(migration, /status IN \('pending_review', 'awaiting_payment', 'payment_submitted', 'approved', 'rejected'\)/);
  assert.match(migration, /campaign_id INTEGER UNIQUE/);
  assert.match(migration, /idx_ptc_advertiser_requests_owner/);
  assert.match(migration, /idx_ptc_advertiser_requests_status/);
});

test("advertisers can only read their own requests and submit valid campaign details", () => {
  const start = worker.indexOf('if (path === "/api/ptc/advertiser/requests" && method === "GET")');
  const end = worker.indexOf('const advertiserPaymentMatch', start);
  assert.ok(start >= 0 && end > start);
  const routes = worker.slice(start, end);
  assert.match(routes, /authenticate\(request\)/);
  assert.match(routes, /WHERE advertiser_uid = \?/);
  assert.match(routes, /email_verified/);
  assert.match(routes, /validatePublicHttpUrl\(body\.target_url/);
  assert.match(routes, /duration < 10 \|\| duration > 180/);
  assert.match(routes, /requestedBudget > reward \* maxViews/);
});

test("advertiser payment references are owner-scoped and admin approval is verified", () => {
  const start = worker.indexOf('const advertiserPaymentMatch');
  const end = worker.indexOf("// ADVERTISING: USER REQUESTS AND LIVE PLACEMENTS", start);
  assert.ok(start >= 0 && end > start);
  const routes = worker.slice(start, end);
  assert.match(routes, /WHERE id = \? AND advertiser_uid = \? AND status = 'awaiting_payment'/);
  assert.match(routes, /requireAdmin\(user, env\)/);
  assert.match(routes, /body\.payment_verified !== true/);
  assert.match(routes, /payment_reference/);
  assert.match(routes, /campaign_id IS NULL/);
});

test("advertiser dashboard exposes campaign analytics only through owner-scoped requests", () => {
  const start = worker.indexOf('if (path === "/api/ptc/advertiser/requests" && method === "GET")');
  const end = worker.indexOf('if (path === "/api/ptc/advertiser/requests" && method === "POST")', start);
  assert.ok(start >= 0 && end > start);
  const route = worker.slice(start, end);
  assert.match(route, /LEFT JOIN ptc_campaigns c ON c\.id = r\.campaign_id/);
  assert.match(route, /WHERE r\.advertiser_uid = \?/);
  assert.match(route, /campaign_views_completed/);
  assert.match(route, /campaign_remaining_budget_koinu/);
  assert.match(route, /campaign_spent_koinu/);
});
