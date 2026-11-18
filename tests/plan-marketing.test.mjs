import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [app, worker] = await Promise.all([
  readFile(new URL("../App.jsx", import.meta.url), "utf8"),
  readFile(new URL("../worker.js", import.meta.url), "utf8")
]);

test("subscription cards only advertise implemented plan limits and rewards", () => {
  const catalogStart = app.indexOf("const PLAN_CATALOG = [");
  const catalogEnd = app.indexOf("const ADVERTISING_PLAN_CATALOG", catalogStart);
  assert.ok(catalogStart >= 0 && catalogEnd > catalogStart);
  const catalog = app.slice(catalogStart, catalogEnd);

  for (const unsupported of [
    "Return Bonuses",
    "Missions & Challenges",
    "Premium Daily Bonus",
    "Weekly Bonus",
    "Ad-free experience",
    "Extended Earnings History",
    "VIP Daily Chest",
    "VIP Daily & Weekly Bonuses",
    "Priority Support",
    "Exclusive Lucky Wheel Rewards",
    "Advanced Statistics"
  ]) {
    assert.ok(!catalog.includes(unsupported), `unimplemented benefit is advertised: ${unsupported}`);
  }

  const plans = {
    FREE: { amount: 50000, cooldown: 50, daily: 50 },
    PREMIUM: { amount: 100000, cooldown: 45, daily: 50 },
    VIP: { amount: 150000, cooldown: 0, daily: 100 }
  };

  for (const [name, plan] of Object.entries(plans)) {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const workerBlock = worker.match(new RegExp(escaped + ":\\s*\\{([\\s\\S]*?)\\n  \\}"));
    assert.ok(workerBlock, `missing Worker plan config: ${name}`);
    assert.match(workerBlock[1], new RegExp(`amount_koinu: ${plan.amount}\\b`));
    assert.match(workerBlock[1], new RegExp(`cooldown_seconds: ${plan.cooldown}\\b`));
    assert.match(workerBlock[1], new RegExp(`daily_limit: ${plan.daily}\\b`));

    const appBlock = catalog.match(new RegExp(`key: '${name}'([\\s\\S]*?)(?=\\n  \\},|\\n\\];)`));
    assert.ok(appBlock, `missing App plan card: ${name}`);
    assert.match(appBlock[1], new RegExp(`amountKoinu: ${plan.amount}\\b`));
    assert.match(appBlock[1], new RegExp(`cooldownSeconds: ${plan.cooldown}\\b`));
    assert.match(appBlock[1], new RegExp(`dailyLimit: ${plan.daily}\\b`));
  }
});
