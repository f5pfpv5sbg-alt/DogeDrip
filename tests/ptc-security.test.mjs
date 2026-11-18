import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [worker, migration] = await Promise.all([
  readFile(new URL("../worker.js", import.meta.url), "utf8"),
  readFile(new URL("../migrations/0007_ptc_ads.sql", import.meta.url), "utf8")
]);

test("PTC migration creates an isolated reserve, campaign, funding and view ledger", () => {
  for (const table of ["ptc_reserve", "ptc_funding_events", "ptc_campaigns", "ptc_views"]) {
    assert.ok(migration.includes(`CREATE TABLE IF NOT EXISTS ${table} (`), `missing ${table}`);
  }
  assert.match(migration, /available_koinu INTEGER NOT NULL DEFAULT 0 CHECK \(available_koinu >= 0\)/);
  assert.match(migration, /locked_koinu INTEGER NOT NULL DEFAULT 0 CHECK \(locked_koinu >= 0\)/);
  assert.match(migration, /pending_koinu INTEGER NOT NULL DEFAULT 0 CHECK \(pending_koinu >= 0\)/);
  assert.match(migration, /UNIQUE \(uid, campaign_id, utc_date\)/);
  assert.match(migration, /view_token_hash TEXT NOT NULL UNIQUE/);
});

test("PTC user routes authenticate, rate-limit and require server-timed completion", () => {
  for (const [path, method] of [
    ["/api/ptc/ads", "GET"],
    ["/api/ptc/history", "GET"],
    ["/api/ptc/start", "POST"],
    ["/api/ptc/complete", "POST"]
  ]) {
    const start = worker.indexOf(`if (path === "${path}" && method === "${method}")`);
    assert.ok(start >= 0, `missing ${method} ${path}`);
    const route = worker.slice(start, start + 1400);
    assert.match(route, /authenticate\(request\)/);
    assert.match(route, /enforceRateLimit\(/);
  }
  assert.match(worker, /verifyTurnstileToken\(body\.turnstileToken, request, env, "ptc_complete"\)/);
  assert.match(worker, /started_at <= datetime\('now', '-' \|\| \([\s\S]{0,120}duration_seconds/);
  assert.match(worker, /UNIQUE \(uid, campaign_id, utc_date\)/);
});

test("PTC rewards remain pending and are never added to the withdrawable user balance", () => {
  const start = worker.indexOf('if (path === "/api/ptc/complete" && method === "POST")');
  const end = worker.indexOf("// PTC ADS: ADMIN CAMPAIGNS", start);
  const route = worker.slice(start, end);
  assert.ok(start >= 0 && end > start);
  assert.match(route, /pending_koinu = pending_koinu \+/);
  assert.match(route, /reward_status: "pending_not_withdrawable"/);
  assert.doesNotMatch(route, /UPDATE users[\s\S]{0,100}balance_koinu/);
});

test("PTC admin funding and campaign controls require database-backed admin authorization", () => {
  for (const path of [
    "/api/admin/ptc",
    "/api/admin/ptc/fund",
    "/api/admin/ptc/campaigns"
  ]) {
    const start = worker.indexOf(`if (path === "${path}"`);
    assert.ok(start >= 0, `missing admin route ${path}`);
    const route = worker.slice(start, start + 900);
    assert.match(route, /authenticate\(request\)/);
    assert.match(route, /requireAdmin\(user, env\)/);
  }
  assert.match(worker, /externally_verified !== true/);
  assert.match(worker, /payment_verified !== true/);
  assert.match(worker, /available_koinu >= \?/);
  assert.match(worker, /locked_koinu = locked_koinu \+ \?/);
});
