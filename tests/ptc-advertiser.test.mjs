import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [worker, migration, app] = await Promise.all([
  readFile(new URL("../worker.js", import.meta.url), "utf8"),
  readFile(new URL("../migrations/0010_ptc_advertiser_requests.sql", import.meta.url), "utf8"),
  readFile(new URL("../App.jsx", import.meta.url), "utf8")
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
  assert.match(routes, /WHERE r\.advertiser_uid = \?/);
  assert.match(routes, /email_verified/);
  assert.match(routes, /validatePublicHttpUrl\(body\.target_url/);
  assert.match(routes, /duration < 10 \|\| duration > 180/);
  assert.match(routes, /requestedBudget > reward \* maxViews/);
});

test("admin advertiser quotes must cover one view and stay within the maximum campaign budget", () => {
  const start = worker.indexOf('if (status === "awaiting_payment")');
  const end = worker.indexOf('if (status === "rejected")', start);
  assert.ok(start >= 0 && end > start);
  const route = worker.slice(start, end);
  assert.match(route, /SELECT reward_koinu, max_views FROM ptc_advertiser_requests/);
  assert.match(route, /quote < minimumBudget/);
  assert.match(route, /quote > maximumBudget/);
  assert.match(route, /Number\.isSafeInteger\(quote\)/);
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
  assert.ok(routes.includes('const advertiserPaymentMatch = path.match(/^\\/api\\/ptc\\/advertiser\\/requests\\/(\\d+)\\/payment$/);'));
  assert.ok(routes.includes('const adminPtcRequestMatch = path.match(/^\\/api\\/admin\\/ptc\\/advertiser-requests\\/(\\d+)$/);'));
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


test("advertiser tools load inside the unified PTC panel without a separate navigation destination", () => {
  assert.match(app, /setActiveTab\('ptc'\)/);
  assert.match(app, /activeTab === 'ptc'/);
  assert.match(app, /ptcPanelMode === 'advertiser'/);
  assert.match(app, /activeTab !== 'ptc' \|\| ptcPanelMode !== 'advertiser'/);
  assert.doesNotMatch(app, /setActiveTab\('advertiser'\)/);
  assert.doesNotMatch(app, /activeTab === 'advertiser'/);
});

test("admin campaign activation locks reserve atomically and never activates without sufficient reserve", () => {
  const start = worker.indexOf('const ptcCampaignMatch = path.match');
  const end = worker.indexOf('if (path === "/api/ptc/advertiser/requests" && method === "GET")', start);
  assert.ok(start >= 0 && end > start);
  const route = worker.slice(start, end);
  assert.match(route, /requireAdmin\(user, env\)/);
  assert.match(route, /available_koinu = available_koinu - \?/);
  assert.match(route, /locked_koinu = locked_koinu \+ \?/);
  assert.match(route, /available_koinu >= \?/);
  assert.match(route, /status = 'pending_review'/);
  assert.match(route, /status = 'paused'/);
  assert.match(route, /status = 'completed'/);
  assert.match(route, /locked_koinu >= \?/);
});


test("PTC is a single role-aware destination for users, advertisers and admins", () => {
  assert.match(app, /setActiveTab\('ptc'\)/);
  assert.match(app, /ptcPanelMode === 'user'/);
  assert.match(app, /ptcPanelMode === 'advertiser'/);
  assert.match(app, /isDemoAdmin && \(/);
  assert.doesNotMatch(app, /setActiveTab\('advertiser'\)/);
  assert.doesNotMatch(app, /activeTab === 'advertiser'/);
});

test("PTC heading and description change for each panel role", () => {
  assert.match(app, /PTC Administration/);
  assert.match(app, /Advertiser PTC/);
  assert.match(app, /Paid To Click/);
  assert.match(app, /Create sponsored campaigns, submit payment references and track your campaign performance/);
  assert.match(app, /Advertise on DogeDrip/);
  assert.doesNotMatch(app, /Advertiser Dashboard/);
});

test("public Advertise With Us page explains the reviewed campaign and funding process", async () => {
  const page = await readFile(new URL("../public/advertise.html", import.meta.url), "utf8");
  assert.match(page, /PTC Sponsored Campaigns/);
  assert.match(page, /Sponsored Banner Placements/);
  assert.match(page, /Review &amp; quote|Review & quote/);
  assert.match(page, /Payment verification/);
  assert.match(page, /campaign funding/);
  assert.match(page, /do not promise fixed traffic, conversions or results/);
  assert.ok(page.includes('href="/">Open DogeDrip to advertise</a>'));
  assert.doesNotMatch(page, /open=ptc-advertise/);
  assert.ok(!page.includes("support.dogedrip@gmail.com"));
});
