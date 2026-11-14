import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [worker, app, wheelMigration] = await Promise.all([
  readFile(new URL("../worker.js", import.meta.url), "utf8"),
  readFile(new URL("../App.jsx", import.meta.url), "utf8"),
  readFile(new URL("../migrations/0005_lucky_wheel.sql", import.meta.url), "utf8")
]);

test("authenticated API requests require a verified Firebase email by default", () => {
  assert.match(worker, /options\.requireVerifiedEmail !== false\s*&&\s*user\.email_verified !== true/);
  const bypasses = worker.match(/requireVerifiedEmail:\s*false/g) || [];
  assert.equal(bypasses.length, 1, "only account synchronization may bypass verification");
  assert.match(worker, /path === "\/api\/auth\/sync"[\s\S]{0,180}requireVerifiedEmail:\s*false/);
});

test("profile reads require verified email", () => {
  assert.match(worker, /if \(path === "\/api\/profile" && method === "GET"\) \{\s*const user = await authenticate\(request\);/);
});

test("registration is rate-limited by Cloudflare client IP", () => {
  assert.match(worker, /registration:\s*\{\s*limit:\s*5,\s*windowSeconds:\s*3600\s*\}/);
  assert.match(worker, /path === "\/api\/security\/register"[\s\S]{0,500}CF-Connecting-IP[\s\S]{0,700}enforceRateLimit/);
  assert.match(app, /\/api\/security\/register/);
});

test("reward endpoints authenticate before changing account value", () => {
  assert.match(worker, /path === "\/api\/claim" && method === "POST"[\s\S]{0,180}authenticate\(request\)/);
  assert.match(worker, /path === "\/api\/wheel\/spin" && method === "POST"[\s\S]{0,180}authenticate\(request\)/);
  assert.match(worker, /path === "\/api\/streak\/checkin" && method === "POST"[\s\S]{0,180}authenticate\(request\)/);
});


test("registration sends a Firebase one-time email verification action link", () => {
  assert.match(app, /await sendEmailVerification\(credential\.user\)/);
  assert.match(app, /Verification email sent\. Check your inbox and spam folder\./);
  assert.match(app, /Your account was created, but Firebase could not send the verification email/);
});

test("verification resend is throttled in the client and Firebase rate-limit errors are handled", () => {
  assert.match(app, /verificationResendSeconds > 0\) return/);
  assert.match(app, /setVerificationResendSeconds\(60\)/);
  assert.match(app, /auth\/too-many-requests/);
});

test("verification status is refreshed from Firebase before unlocking the account", () => {
  assert.match(app, /await firebaseUser\.reload\(\)/);
  assert.match(app, /!refreshedUser\.emailVerified/);
  assert.match(app, /await refreshedUser\.getIdToken\(true\)/);
  assert.match(app, /setAuthSyncRetry\(value => value \+ 1\)/);
});

test("unverified users are shown the verification gate and cannot save profile changes", () => {
  assert.match(app, /Email verification required/);
  assert.match(app, /disabled=\{profileSaving \|\| !apiReady \|\| !firebaseUser\?\.emailVerified\}/);
});


test("FaucetPay payouts are disabled unless an explicit server-side flag is enabled", () => {
  assert.match(worker, /env\.FAUCETPAY_PAYOUTS_ENABLED !== "true"/);
  assert.match(worker, /env\.FAUCETPAY_API_KEY/);
  assert.doesNotMatch(worker, /FAUCETPAY_API_KEY\s*=\s*["']/);
});

test("FaucetPay payout calls stay server-side and use DOGE smallest-unit amounts", () => {
  assert.match(worker, /https:\/\/faucetpay\.io\/api\/v1\//);
  assert.match(worker, /faucetPayRequest\(env, "send"/);
  assert.match(worker, /amount:\s*String\(Number\(withdrawal\.amount_koinu\)\)/);
  assert.match(worker, /to:\s*withdrawal\.wallet_address/);
  assert.match(worker, /currency:\s*"DOGE"/);
});

test("FaucetPay payouts lock pending withdrawals before sending and prevent automatic retries on uncertain results", () => {
  assert.match(worker, /SET status = 'processing'[\s\S]{0,180}WHERE id = \?[\s\S]{0,80}AND status = 'pending'/);
  assert.match(worker, /status = 'payment_unknown'/);
  assert.match(worker, /Check FaucetPay payout history before any retry/);
  assert.match(worker, /status = 'paid'[\s\S]{0,180}faucetpay_payout_id = \?/);
});

test("FaucetPay payout IDs are persisted in the withdrawals schema", () => {
  assert.match(worker, /w\.faucetpay_payout_id/);
  assert.match(worker, /reconcile/);
});



test("FaucetPay status endpoint is admin-only and exposes only configuration booleans", () => {
  assert.ok(worker.includes('if (path === "/api/admin/faucetpay/status" && method === "GET")'));
  assert.ok(worker.includes('configured: typeof env.FAUCETPAY_API_KEY === "string" && env.FAUCETPAY_API_KEY.length > 0'));
  assert.ok(worker.includes('payouts_enabled: env.FAUCETPAY_PAYOUTS_ENABLED === "true"'));
  assert.match(worker, /requireAdmin\(user, env\)/);
});

test("admin UI never treats uncertain or legacy-approved withdrawals as paid", () => {
  assert.ok(app.includes("w.status === 'approved' ? 'legacy-approved' : w.status"));
  assert.ok(app.includes("w.status === 'payment_unknown' ? ("));
  assert.ok(app.includes("w.status === 'paid'"));
  assert.ok(app.includes("Payment confirmed"));
});

test("manual FaucetPay reconciliation requires explicit admin confirmation", () => {
  assert.ok(app.includes("window.confirm(confirmation)"));
  assert.ok(app.includes("handleAdminReconcile(w.id, 'paid')"));
  assert.ok(app.includes("handleAdminReconcile(w.id, 'not_paid')"));
  assert.ok(app.includes("Check FaucetPay payout history before choosing"));
  assert.ok(app.includes("faucetpay_payout_id: payoutId"));
});


test("financial audit endpoint is admin-only and performs read-only integrity checks", () => {
  const start = worker.indexOf('if (path === "/api/admin/finance/audit" && method === "GET")');
  const end = worker.indexOf("// ADMIN: DAILY STATS", start);
  assert.ok(start >= 0 && end > start, "financial audit route must exist");
  const route = worker.slice(start, end);
  assert.match(route, /authenticate\(request\)/);
  assert.match(route, /requireAdmin\(user, env\)/);
  assert.match(route, /users_with_balance_without_ledger/);
  assert.match(route, /claims_without_ledger_count/);
  assert.match(route, /reference_type = 'claim'/);
  assert.match(route, /user_balance_mismatches/);
  assert.match(route, /arithmetic_mismatches/);
  assert.match(route, /legacy_approved_without_payout_id_count/);
  assert.match(route, /external_funding_verified: false/);
  assert.doesNotMatch(route, /\b(?:INSERT INTO|UPDATE\s+users|UPDATE\s+withdrawals|DELETE FROM)\b/i);
});

test("Admin dashboard displays financial integrity warnings without changing balances", () => {
  assert.ok(app.includes("Run financial audit"));
  assert.ok(app.includes("Financial integrity audit"));
  assert.ok(app.includes("External reserve funding: NOT VERIFIED"));
  assert.ok(app.includes("Unledgered Accounts"));
  assert.ok(app.includes("Claims Missing Ledger"));
  assert.ok(app.includes("Legacy Approved"));
});


test("referral dashboard endpoint is implemented and authenticated on both sides", () => {
  assert.ok(app.includes("apiRequest('/api/referrals')"));
  const start = worker.indexOf('if (path === "/api/referrals" && method === "GET")');
  const end = worker.indexOf("// LUCKY WHEEL ROUTES", start);
  assert.ok(start >= 0 && end > start, "referral API route must exist");
  assert.ok(worker.slice(start, end).includes("authenticate(request)"));
  assert.match(worker.slice(start, end), /invited_count: invitedCount/);
});

test("Lucky Wheel frontend endpoints have matching authenticated Worker routes", () => {
  const routes = [
    ["/api/wheel/state", "GET"],
    ["/api/wheel/spin", "POST"],
    ["/api/wheel/buy", "POST"],
    ["/api/wheel/history", "GET"]
  ];
  for (const [endpoint, method] of routes) {
    assert.ok(app.includes(endpoint), `frontend must call ${endpoint}`);
    assert.ok(worker.includes(`path === "${endpoint}" && method === "${method}"`), `Worker must expose ${endpoint}`);
  }
  for (const endpoint of ["/api/wheel/spin", "/api/wheel/buy"]) {
    const start = worker.indexOf(`path === "${endpoint}"`);
    const route = worker.slice(start, start + 350);
    assert.ok(route.includes("authenticate(request)"));
  }
});

test("Lucky Wheel migration creates every persistence table and keeps payouts disabled by default", () => {
  for (const table of [
    "wheel_prizes",
    "wheel_reserve",
    "wheel_daily_usage",
    "wheel_spin_inventory",
    "wheel_spins",
    "wheel_purchases"
  ]) {
    assert.ok(wheelMigration.includes(`CREATE TABLE IF NOT EXISTS ${table} (`), `missing ${table} table`);
  }
  assert.match(wheelMigration, /available_koinu INTEGER NOT NULL DEFAULT 0/);
  assert.match(wheelMigration, /locked_koinu INTEGER NOT NULL DEFAULT 0/);
  assert.match(wheelMigration, /payouts_enabled INTEGER NOT NULL DEFAULT 0/);
  assert.ok(wheelMigration.includes("VALUES (1, 0, 0, 0)"));
  assert.ok(wheelMigration.includes("UNIQUE (uid, request_id)"));
});


test("Worker applies restrictive security headers to JSON and preflight responses", () => {
  for (const header of [
    '"X-Content-Type-Options": "nosniff"',
    '"X-Frame-Options": "DENY"',
    '"Referrer-Policy": "no-referrer"',
    '"Permissions-Policy": "camera=(), microphone=(), geolocation=()"',
    '"Content-Security-Policy": "default-src \'none\'; frame-ancestors \'none\'; base-uri \'none\'"',
    '"Strict-Transport-Security": "max-age=31536000; includeSubDomains"'
  ]) {
    assert.ok(worker.includes(header), `missing security header: ${header}`);
  }
  assert.match(worker, /headers:\s*\{ \.\.\.JSON_HEADERS, \.\.\.cors \}/);
  assert.match(worker, /headers: JSON_HEADERS/);
});

test("Lucky Wheel read endpoints are authenticated and rate-limited", () => {
  assert.match(worker, /wheelRead:\s*\{ limit: 120, windowSeconds: 60 \}/);
  for (const endpoint of ["/api/wheel/state", "/api/wheel/history"]) {
    const start = worker.indexOf(`path === "${endpoint}"`);
    assert.ok(start >= 0, `missing ${endpoint}`);
    const route = worker.slice(start, start + 550);
    assert.ok(route.includes("authenticate(request)"), `${endpoint} must authenticate`);
    assert.ok(route.includes('"wheel_read"'), `${endpoint} must be rate-limited`);
    assert.ok(route.includes("enforceRateLimit("), `${endpoint} must call rate limiter`);
  }
});

test("Scheduled cleanup removes expired rate-limit buckets and old daily activity", () => {
  assert.match(worker, /async scheduled\(controller, env, ctx\)/);
  assert.match(worker, /ctx\.waitUntil\(/);
  assert.match(worker, /DELETE FROM api_rate_limits[\s\S]{0,100}updated_at < datetime\('now', '-1 day'\)/);
  assert.match(worker, /DELETE FROM user_daily_activity[\s\S]{0,100}utc_date < date\('now', '-90 days'\)/);
  assert.match(worker, /Promise\.allSettled\(/);
});
