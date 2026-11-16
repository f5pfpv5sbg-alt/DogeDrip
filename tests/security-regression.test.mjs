import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [worker, app, wheelMigration, referralMigration] = await Promise.all([
  readFile(new URL("../worker.js", import.meta.url), "utf8"),
  readFile(new URL("../App.jsx", import.meta.url), "utf8"),
  readFile(new URL("../migrations/0005_lucky_wheel.sql", import.meta.url), "utf8"),
  readFile(new URL("../migrations/0006_referral_commissions.sql", import.meta.url), "utf8")
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


test("withdrawal creation debits the balance, inserts a pending request and records its ledger entry atomically", () => {
  const start = worker.indexOf('if (path === "/api/withdrawals" && method === "POST")');
  const end = worker.indexOf('// ADMIN:', start);
  const route = worker.slice(start, end);
  assert.ok(start >= 0 && end > start, "withdrawal creation route must exist");
  assert.match(route, /await env\.DB\.batch\(\[/);
  assert.match(route, /UPDATE users[\s\S]{0,180}balance_koinu = balance_koinu - \?[\s\S]{0,100}balance_koinu >= \?/);
  assert.match(route, /INSERT INTO withdrawals[\s\S]{0,240}status[\s\S]{0,120}'pending'/);
  assert.match(route, /INSERT INTO ledger_transactions[\s\S]{0,700}'withdrawal',[\s\S]{0,100}-\?/);
  assert.match(route, /results\[0\]\.meta\.changes !== 1[\s\S]{0,160}results\[2\]\.meta\.changes !== 1/);
});

test("finance audit separately detects missing withdrawal debits and rejected-withdrawal refunds", () => {
  const start = worker.indexOf('if (path === "/api/admin/finance/audit" && method === "GET")');
  const end = worker.indexOf("// ADMIN: DAILY STATS", start);
  const route = worker.slice(start, end);
  assert.ok(start >= 0 && end > start, "finance audit route must exist");
  assert.match(route, /withdrawalsWithoutDebitLedger/);
  assert.match(route, /rejectedWithoutRefundLedger/);
  assert.match(route, /lt\.reference_type = 'withdrawal'/);
  assert.match(route, /lt\.reference_id = CAST\(w\.id AS TEXT\)/);
  assert.match(route, /lt\.amount_koinu = -w\.amount_koinu/);
  assert.match(route, /lt\.transaction_type = 'withdrawal_refund'/);
  assert.match(route, /lt\.amount_koinu = w\.amount_koinu/);
  assert.match(route, /without_debit_ledger_count: Number\(withdrawalsWithoutDebitLedger\?\.count \|\| 0\)/);
  assert.match(route, /rejected_without_refund_ledger_count: Number\(rejectedWithoutRefundLedger\?\.count \|\| 0\)/);
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
  assert.match(route, /referral_commissions_without_ledger_count/);
  assert.match(route, /referral_ledger_without_commission_count/);
  assert.match(route, /lt\.uid = c\.uid/);
  assert.match(route, /lt\.transaction_type = 'claim'/);
  assert.match(route, /reference_type = 'claim'/);
  assert.match(route, /lt\.amount_koinu = c\.amount_koinu/);
  assert.match(route, /lt\.idempotency_key = 'claim:' \|\| c\.uid \|\| ':' \|\| c\.request_id/);
  assert.match(route, /reference_type = 'referral_commission'/);
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
  assert.ok(app.includes("Referral Commissions Missing Ledger"));
  assert.ok(app.includes("Referral Ledger Without Commission"));
  assert.ok(app.includes("Legacy Approved"));
});


test("referral links prefill registration and expose a shareable link", () => {
  assert.match(app, /new URLSearchParams\(window\.location\.search\)/);
  assert.match(app, /params\.get\('ref'\)/);
  assert.match(app, /setRegRefCode\(code\)/);
  assert.match(app, /setAuthMode\('register'\)/);
  assert.ok(app.includes("navigator.clipboard.writeText(referralUrl)"));
  assert.ok(app.includes("Your Referral Link"));
  assert.ok(app.includes("dogedrip_referral_attribution"));
  assert.ok(app.includes("30 * 24 * 60 * 60 * 1000"));
  assert.ok(app.includes("pendingReferralRef.current = code"));
});

test("referral dashboard endpoint is implemented and authenticated on both sides", () => {
  assert.ok(app.includes("apiRequest('/api/referrals')"));
  const start = worker.indexOf('if (path === "/api/referrals" && method === "GET")');
  const end = worker.indexOf("// LUCKY WHEEL ROUTES", start);
  assert.ok(start >= 0 && end > start, "referral API route must exist");
  assert.ok(worker.slice(start, end).includes("authenticate(request)"));
  assert.match(worker.slice(start, end), /invited_count: Number\(invited\?\.total \|\| 0\)/);
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

test("Lucky Wheel spin sends the JSON payload required by the Worker", () => {
  assert.match(app, /JSON\.stringify\(\{\s*request_id:\s*wheelSpinRequestIdRef\.current,\s*turnstileToken:\s*securityTokens\.wheel_spin\s*\}\)/);
  const start = worker.indexOf('if (path === "/api/wheel/spin" && method === "POST")');
  const end = worker.indexOf('if (path === "/api/wheel/buy" && method === "POST")', start);
  const route = worker.slice(start, end);
  assert.ok(start >= 0 && end > start, "wheel spin route must exist");
  assert.match(route, /const body = await readJson\(request\)/);
  assert.match(route, /verifyTurnstileToken\(body\.turnstileToken, request, env, "wheel_spin"\)/);
  assert.match(route, /handleWheelSpin\(env, user\.sub, body\)/);
});

test("Lucky Wheel retries retain spin and purchase idempotency keys after failed responses", () => {
  const spinStart = app.indexOf("const handleWheelSpin = async");
  const spinEnd = app.indexOf("const handleBuyPack = async", spinStart);
  const spinHandler = app.slice(spinStart, spinEnd);
  assert.ok(spinStart >= 0 && spinEnd > spinStart);
  const spinCatch = spinHandler.slice(spinHandler.indexOf("} catch (error)"));
  assert.match(spinCatch, /Keep the same request ID after any failed response/);
  assert.doesNotMatch(spinCatch, /wheelSpinRequestIdRef\.current\s*=\s*null/);

  const buyStart = app.indexOf("const handleBuyPack = async");
  const buyEnd = app.indexOf("const showStreakMessage", buyStart);
  const buyHandler = app.slice(buyStart, buyEnd);
  assert.ok(buyStart >= 0 && buyEnd > buyStart);
  const buyCatch = buyHandler.slice(buyHandler.indexOf("} catch (error)"));
  assert.match(buyCatch, /Keep the same request ID after any failed response/);
  assert.doesNotMatch(buyCatch, /wheelBuyRequestRef\.current\s*=\s*null/);
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
  assert.match(wheelMigration, /probability_weight INTEGER NOT NULL CHECK \(probability_weight >= 0\)/);
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


test("Faucet claim IDs survive uncertain failures and are cleared only after confirmation or a 4xx rejection", () => {
  assert.ok(app.includes("sessionStorage.getItem(claimRequestStorageKey)"));
  assert.ok(app.includes("sessionStorage.setItem(claimRequestStorageKey, claimRequestIdRef.current)"));
  assert.ok(app.includes("typeof error.status === 'number' && error.status < 500"));
  assert.ok(app.includes("Keep the same ID after network/5xx failures"));
  assert.ok(app.includes("window.sessionStorage.removeItem(claimRequestStorageKey)"));
});

test("Faucet claim button does not describe the live D1 reward ledger as a demo", () => {
  assert.ok(!app.includes("DOGE (Demo)"));
});


test("Daily streak reward is manual and never triggered by a regular Faucet claim", () => {
  const claimStart = app.indexOf("const handleClaim = async () =>");
  const streakHandlerStart = app.indexOf("const handleStreakCheckin = async () =>");
  assert.ok(claimStart >= 0 && streakHandlerStart > claimStart);
  const claimHandler = app.slice(claimStart, streakHandlerStart);
  assert.ok(claimHandler.includes("apiRequest('/api/streak')"));
  assert.ok(!claimHandler.includes("apiRequest('/api/streak/checkin'"));
  assert.match(app, /onClick=\{handleStreakCheckin\}/);
  assert.match(app, /Claim your daily streak reward manually once each UTC day/);
  assert.match(app, /Regular Faucet Claims do not collect this bonus/);
});

test("Faucet dashboard avoids duplicate reward, wallet balance, and daily claim counters", () => {
  const faucetStart = app.indexOf("{activeTab === 'faucet' && (");
  const wheelStart = app.indexOf("{activeTab === 'wheel' && (", faucetStart);
  assert.ok(faucetStart >= 0 && wheelStart > faucetStart);
  const faucetPanel = app.slice(faucetStart, wheelStart);

  for (const label of [
    'label="Reward / Claim"',
    'label="Balance"',
    'label="Claims Used Today"',
    'Simulated Testnet Reward',
    'REWARD CLAIMED!'
  ]) {
    assert.ok(!faucetPanel.includes(label), `Faucet panel must not show ${label}`);
  }

  assert.match(faucetPanel, /onClick=\{handleClaim\}/);
  assert.doesNotMatch(faucetPanel, /label="Cooldown"/);
  assert.doesNotMatch(faucetPanel, /label="Daily Limit"/);
  assert.match(faucetPanel, /Cooldown Active: \{cooldownLeft\}s remaining/);
  assert.match(faucetPanel, /label="Daily Reset \(UTC\)"/);
  assert.match(app, /const formatClaimAmount = \(amount\)/);
  assert.match(faucetPanel, /formatClaimAmount\(claimAmount\)/);
  assert.doesNotMatch(faucetPanel, /claimAmount\.toFixed\(6\)/);

  const plansStart = app.indexOf("{activeTab === 'plans' && (");
  const walletStart = app.indexOf("{activeTab === 'wallet' && (", plansStart);
  assert.ok(plansStart >= 0 && walletStart > plansStart);
  const plansPanel = app.slice(plansStart, walletStart);
  assert.ok(!plansPanel.includes("Claims today"));
  assert.ok(!plansPanel.includes("claimsTodayText"));
});


test("referral codes can only be validated for verified referrers", () => {
  const start = worker.indexOf('if (path === "/api/referral/validate" && method === "GET")');
  const end = worker.indexOf("// AUTH SYNC", start);
  assert.ok(start >= 0 && end > start);
  assert.match(worker.slice(start, end), /email_verified = 1/);
  assert.match(worker, /AND email_verified = 1[\s\S]{0,80}AND lower\(email\) != lower\(\?\)/);
});

test("referral commissions use a separate reserve that starts empty and disabled", () => {
  assert.match(referralMigration, /CREATE TABLE IF NOT EXISTS referral_reserve/);
  assert.match(referralMigration, /available_koinu INTEGER NOT NULL DEFAULT 0 CHECK \(available_koinu >= 0\)/);
  assert.match(referralMigration, /payouts_enabled INTEGER NOT NULL DEFAULT 0/);
  assert.match(referralMigration, /VALUES \(1, 0, 0\)/);
  assert.match(referralMigration, /claim_id INTEGER NOT NULL UNIQUE/);
  assert.match(referralMigration, /CHECK \(referred_uid != referrer_uid\)/);
});

test("15 percent referral commission is paid atomically only from funded reserve", () => {
  const start = worker.indexOf('if (path === "/api/claim" && method === "POST")');
  const end = worker.indexOf("// CLAIM HISTORY", start);
  const route = worker.slice(start, end);
  assert.match(route, /CAST\(\(c\.amount_koinu \* 1500\) \/ 10000 AS INTEGER\)/);
  assert.match(route, /reserve\.payouts_enabled = 1/);
  assert.match(route, /reserve\.available_koinu >=/);
  assert.match(route, /r\.email_verified = 1 AND r\.uid != referred\.uid/);
  assert.match(route, /UPDATE referral_reserve[\s\S]*?available_koinu = available_koinu -/);
  assert.match(route, /UPDATE users[\s\S]*?balance_koinu = balance_koinu \+/);
  assert.match(route, /\x27referral_commission\x27/);
  assert.match(route, /referral_claim:\x27 \|\| rc\.claim_id/);
  assert.match(route, /NOT EXISTS \([\s\S]*?lt\.idempotency_key = \x27referral_claim:/);
});

test("referral dashboard is rate-limited and returns commission totals and recent history", () => {
  assert.match(worker, /referralsRead: \{ limit: 60, windowSeconds: 60 \}/);
  const start = worker.indexOf('if (path === "/api/referrals" && method === "GET")');
  const end = worker.indexOf("// LUCKY WHEEL ROUTES", start);
  const route = worker.slice(start, end);
  assert.match(route, /authenticate\(request\)/);
  assert.match(route, /enforceRateLimit\(/);
  assert.match(route, /commission_rate_bps: 1500/);
  assert.match(route, /commission_earned_koinu/);
  assert.match(route, /recent_commissions/);
  assert.ok(app.includes("Total Earned"));
  assert.ok(app.includes("Recent Commissions"));
  assert.ok(app.includes("commissionEnabled"));
});


test("admin daily payouts and profit include paid referral commissions", () => {
  const start = worker.indexOf("async function getAdminDailyStats");
  const end = worker.indexOf("function validatePublicHttpUrl", start);
  const stats = worker.slice(start, end);
  assert.match(stats, /FROM referral_commissions[\s\S]*?WHERE date\(created_at\) = \?/);
  assert.match(stats, /payoutsKoinu = claimsKoinu \+ wheelPrizesKoinu \+ streakKoinu \+ referralCommissionsKoinu/);
  assert.match(stats, /referral_commissions_koinu: referralCommissionsKoinu/);
  assert.match(stats, /referral_available_koinu/);
  assert.ok(app.includes("Referrals"));
});


test("Turnstile is required and action-bound for login, claim, wheel, and withdrawals", () => {
  assert.match(worker, /api\/security\/login/);
  assert.match(worker, /verifyTurnstileToken\(loginBody\.turnstileToken, request, env, "login"\)/);
  for (const action of ["claim", "wheel_spin", "wheel_buy", "withdraw"]) {
    assert.match(worker, new RegExp(`verifyTurnstileToken\\(body\\.turnstileToken, request, env, "${action}"\\)`));
  }
  assert.match(worker, /result\?\.action !== expectedAction/);
  for (const action of ["login", "claim", "wheel_spin", "wheel_buy", "withdraw"]) {
    assert.ok(app.includes(`action="${action}"`), `Missing frontend Turnstile widget for ${action}`);
  }
});


test("admin online users metric is based on verified five-minute heartbeats", () => {
  assert.match(worker, /path === "\/api\/activity\/heartbeat"/);
  assert.match(worker, /RATE_LIMIT_POLICIES\.activityHeartbeat/);
  assert.match(worker, /last_seen_at = CURRENT_TIMESTAMP/);
  assert.match(worker, /last_seen_at >= datetime\('now', '-5 minutes'\)/);
  assert.match(worker, /currently_online: Number\(onlineUsers\?\.total \|\| 0\)/);
  assert.match(app, /api\/activity\/heartbeat/);
  assert.ok(app.includes('label="Currently Online"'));
  assert.match(app, /setInterval\(sendHeartbeat, 120000\)/);
});
