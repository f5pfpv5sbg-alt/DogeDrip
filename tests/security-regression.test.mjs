import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [worker, app] = await Promise.all([
  readFile(new URL("../worker.js", import.meta.url), "utf8"),
  readFile(new URL("../App.jsx", import.meta.url), "utf8")
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
