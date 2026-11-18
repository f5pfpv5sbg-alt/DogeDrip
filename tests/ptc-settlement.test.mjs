import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const worker = await readFile(new URL("../worker.js", import.meta.url), "utf8");
const app = await readFile(new URL("../App.jsx", import.meta.url), "utf8");
const migration = await readFile(new URL("../migrations/0009_ptc_reward_settlements.sql", import.meta.url), "utf8");

function section(source, start, end) {
  const a = source.indexOf(start);
  const b = source.indexOf(end, a);
  assert.ok(a >= 0 && b > a, "expected source section is present");
  return source.slice(a, b);
}

test("PTC settlement schema prevents a view from being settled twice", () => {
  assert.match(migration, /CREATE TABLE IF NOT EXISTS ptc_settlements/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS ptc_settlement_items/);
  assert.match(migration, /view_id INTEGER PRIMARY KEY/);
  assert.match(migration, /FOREIGN KEY \(view_id\) REFERENCES ptc_views\(id\)/);
  assert.match(migration, /idempotency_key TEXT NOT NULL UNIQUE/);
});

test("admin PTC pending list excludes already settled view IDs", () => {
  const route = section(worker, 'if (path === "/api/admin/ptc" && method === "GET")', 'if (path === "/api/admin/ptc/settle"');
  assert.match(route, /pending_settlements/);
  assert.match(route, /v\.status = 'completed'/);
  assert.match(route, /NOT EXISTS[\s\S]*ptc_settlement_items si WHERE si\.view_id = v\.id/);
  assert.match(route, /GROUP BY v\.uid/);
});

test("PTC settlement is admin-only and atomically debits pending reserve, credits user and writes ledger", () => {
  const route = section(worker, 'if (path === "/api/admin/ptc/settle" && method === "POST")', 'if (path === "/api/admin/ptc/fund"');
  assert.match(route, /authenticate\(request\)/);
  assert.match(route, /requireAdmin\(user, env\)/);
  assert.match(route, /admin_ptc/);
  assert.match(route, /ptc_reserve/);
  assert.match(route, /COALESCE\([\s\S]*SELECT pending_koinu FROM ptc_reserve/);
  assert.match(route, /pending_koinu = pending_koinu -/);
  assert.match(route, /balance_koinu = balance_koinu \+/);
  assert.match(route, /INSERT INTO ledger_transactions/);
  assert.match(route, /'ptc_reward'/);
  assert.match(route, /ptc_settlement_items/);
  assert.match(route, /results\\[1\\]/);
  assert.match(route, /abs\(-9223372036854775808\)/);
  assert.match(route, /Settlement could not be completed/);
});

test("admin UI requires explicit confirmation and shows settlement only when pending reserve covers it", () => {
  assert.match(app, /Pending reward settlement/);
  assert.match(app, /window\.confirm\([\s\S]*will add the reward to the user's withdrawable balance/);
  assert.match(app, /amount_koinu\) <= Number\(adminPtcData\?\.reserve\?\.pending_koinu/);
  assert.match(app, /Settle rewards/);
  assert.match(app, /Reserve insufficient/);
});
