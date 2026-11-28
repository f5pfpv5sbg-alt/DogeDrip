import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [worker, app] = await Promise.all([
  readFile(new URL("../worker.js", import.meta.url), "utf8"),
  readFile(new URL("../App.jsx", import.meta.url), "utf8")
]);

function section(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  assert.notEqual(start, -1, `missing start marker: ${startMarker}`);
  const end = source.indexOf(endMarker, start);
  assert.ok(end > start, `missing end marker: ${endMarker}`);
  return source.slice(start, end);
}

test("unverified Firebase users are blocked from protected API routes", () => {
  assert.match(worker, /options\.requireVerifiedEmail !== false/);
  assert.match(worker, /user\.email_verified !== true/);
  assert.match(worker, /new HttpError\(403, "EMAIL_NOT_VERIFIED"\)/);

  const authSync = section(
    worker,
    'if (path === "/api/auth/sync" && method === "POST")',
    'if (path === "/api/profile"'
  );
  assert.match(authSync, /requireVerifiedEmail: false/);
});

test("registration sends Firebase verification and supports resend and refresh", () => {
  assert.match(app, /await sendEmailVerification\(credential\.user\)/);
  assert.match(app, /const handleResendVerification = async/);
  assert.match(app, /await sendEmailVerification\(firebaseUser\)/);
  assert.match(app, /await firebaseUser\.reload\(\)/);
  assert.match(app, /refreshedUser\.emailVerified/);
  assert.match(app, /await refreshedUser\.getIdToken\(true\)/);
});

test("Faucet claim requires verified auth, rate limiting and a valid Turnstile token", () => {
  const claim = section(
    worker,
    'if (path === "/api/claim" && method === "POST")',
    'if (path === "/api/claims"'
  );
  assert.match(claim, /await authenticate\(request\)/);
  assert.match(claim, /enforceRateLimit\([\s\S]*?RATE_LIMIT_POLICIES\.claim/);
  assert.match(claim, /verifyTurnstileToken\(body\.turnstileToken, request, env, "claim"\)/);
});

test("claim reward is decided server-side with cooldown and daily limit predicates", () => {
  const claim = section(
    worker,
    'if (path === "/api/claim" && method === "POST")',
    'if (path === "/api/claims"'
  );
  assert.match(claim, /const plan = await getUserPlan\(env, user\.sub\)/);
  assert.match(claim, /balance_koinu = balance_koinu \+ \?/);
  assert.match(claim, /last_claim_at <= datetime\('now', \?\)/);
  assert.match(claim, /date\(claims\.claimed_at\) = date\('now'\)/);
  assert.match(claim, /\) < \?/);
  assert.doesNotMatch(claim, /body\.(?:amount|reward|balance)_koinu/);
});

test("claim retries are idempotent and request IDs are strictly validated", () => {
  assert.match(worker, /function getRequestId\(body\)/);
  assert.match(worker, /\^\[A-Za-z0-9_-\]\{8,64\}\$/);
  assert.match(worker, /async function getExistingClaim\(env, uid, requestId\)/);
  const claim = section(
    worker,
    'if (path === "/api/claim" && method === "POST")',
    'if (path === "/api/claims"'
  );
  assert.match(claim, /getExistingClaim\(env, user\.sub, requestId\)/);
  assert.match(claim, /buildClaimResponse\(env, user\.sub, plan, existing, true\)/);
  assert.match(claim, /env\.DB\.batch\(\[/);
});

test("Turnstile validation checks success, expected action and allowed hostname", () => {
  const verifier = section(
    worker,
    "function verifyTurnstileToken(",
    "function getTrustedClientIp("
  );
  assert.match(verifier, /result\?\.success !== true/);
  assert.match(verifier, /result\?\.action !== expectedAction/);
  assert.match(verifier, /allowedHostnames\.has\(result\?\.hostname\)/);
});

test("D1 is the single authoritative user profile store", () => {
  assert.doesNotMatch(app, /firebase\/firestore|getFirestore|dbStore|setDoc\(|getDoc\(/);
  assert.match(app, /fallbackProfile\.username = syncData\.username/);
  assert.match(app, /apiRequest\('\/api\/profile'/);
  assert.match(app, /apiRequest\('\/api\/profile',\s*\{\s*method: 'PUT'/);
});

test("registration username remains available until D1 auth sync completes", () => {
  const syncStart = app.indexOf("const syncResponse = await fetch(`${API_URL}/api/auth/sync`");
  const syncSuccess = app.indexOf("pendingUsernameRef.current = '';", syncStart);
  const registrationReset = app.indexOf("pendingUsernameRef.current = '';", app.indexOf("const handleRegister"));
  assert.ok(syncStart >= 0, "auth listener must call the D1 sync endpoint");
  assert.ok(syncSuccess > syncStart, "pending username must clear only after successful D1 sync");
  assert.equal(registrationReset, -1, "registration must not clear username before auth sync");
});
