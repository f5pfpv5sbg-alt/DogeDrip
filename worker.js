const PROJECT_ID = "dogedrip-3ebda";

const GOOGLE_KEYS_URL =
  "https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com";

const MIN_WITHDRAWAL_KOINU = 100000000;

const MAX_REQUEST_BODY_BYTES = 16384;
const MAX_FIREBASE_TOKEN_LENGTH = 8192;

const PLAN_CONFIG = {
  FREE: {
    amount_koinu: 50000,
    cooldown_seconds: 50,
    daily_limit: 50,
    free_wheel_spins: 1
  },
  PREMIUM: {
    amount_koinu: 100000,
    cooldown_seconds: 45,
    daily_limit: 50,
    free_wheel_spins: 2
  },
  VIP: {
    amount_koinu: 150000,
    cooldown_seconds: 0,
    daily_limit: 100,
    free_wheel_spins: 3
  }
};

const WHEEL_PACKAGES = [
  { id: "1", spins: 1, price_koinu: 180000 },
  { id: "5", spins: 5, price_koinu: 850000 },
  { id: "10", spins: 10, price_koinu: 1600000 },
  { id: "25", spins: 25, price_koinu: 3750000 }
];

const ALLOWED_ORIGINS = ["https://dogedrip.pages.dev"];

function isAllowedOrigin(origin) {
  if (!origin) return true;
  if (ALLOWED_ORIGINS.includes(origin)) return true;

  try {
    const url = new URL(origin);
    return (
      url.protocol === "https:" &&
      url.hostname.endsWith(".dogedrip.pages.dev") &&
      url.hostname.split(".").length === 4 &&
      url.port === ""
    );
  } catch {
    return false;
  }
}

const REF_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const REF_CODE_REGEX = /^DOGE[A-HJ-NP-Z2-9]{6}$/;
const BASE58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

const JSON_HEADERS = {
  "Content-Type": "application/json",
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "no-referrer",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
  "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'; base-uri 'none'",
  "Strict-Transport-Security": "max-age=31536000; includeSubDomains"
};

class HttpError extends Error {
  constructor(status, message, extra = {}) {
    super(message);
    this.status = status;
    this.extra = extra;
  }
}

function corsHeaders(request) {
  const origin = request.headers.get("Origin");

  const headers = {
    "Vary": "Origin",
    "Access-Control-Allow-Methods": "GET, POST, PUT, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Max-Age": "86400"
  };

  if (isAllowedOrigin(origin) && origin) {
    headers["Access-Control-Allow-Origin"] = origin;
  }

  return headers;
}

function decodeBase64Url(value) {
  const base64 = value
    .replace(/-/g, "+")
    .replace(/_/g, "/")
    .padEnd(Math.ceil(value.length / 4) * 4, "=");

  return Uint8Array.from(atob(base64), c => c.charCodeAt(0));
}

function formatDoge(koinu) {
  return (Number(koinu) / 100000000)
    .toFixed(8)
    .replace(/\.?0+$/, "");
}

// ==========================================
// FIREBASE TOKEN VERIFICATION
// ==========================================

let cachedKeys = null;
let cachedKeysAt = 0;

async function getGoogleKeys(force = false) {
  const now = Date.now();

  if (!force && cachedKeys && now - cachedKeysAt < 3600000) {
    return cachedKeys;
  }

  const res = await fetch(GOOGLE_KEYS_URL, {
    cf: { cacheTtl: 3600, cacheEverything: true }
  });

  if (!res.ok) {
    throw new HttpError(503, "Could not retrieve Firebase keys");
  }

  const keySet = await res.json();

  if (!Array.isArray(keySet.keys)) {
    throw new HttpError(503, "Could not retrieve Firebase keys");
  }

  cachedKeys = keySet.keys;
  cachedKeysAt = now;

  return cachedKeys;
}

async function verifyFirebaseToken(token) {
  if (
    typeof token !== "string" ||
    !token ||
    token.length > MAX_FIREBASE_TOKEN_LENGTH
  ) {
    throw new HttpError(401, "Invalid Firebase token");
  }

  let parts;
  let tokenHeader;
  let claims;

  try {
    parts = token.split(".");

    if (parts.length !== 3) {
      throw new Error("Invalid token");
    }

    tokenHeader = JSON.parse(
      new TextDecoder().decode(decodeBase64Url(parts[0]))
    );

    claims = JSON.parse(
      new TextDecoder().decode(decodeBase64Url(parts[1]))
    );
  } catch {
    throw new HttpError(401, "Invalid token");
  }

  const now = Math.floor(Date.now() / 1000);

  if (
    !tokenHeader ||
    typeof tokenHeader !== "object" ||
    !claims ||
    typeof claims !== "object" ||
    tokenHeader.alg !== "RS256" ||
    typeof tokenHeader.kid !== "string" ||
    !tokenHeader.kid ||
    claims.aud !== PROJECT_ID ||
    claims.iss !== `https://securetoken.google.com/${PROJECT_ID}` ||
    typeof claims.sub !== "string" ||
    !claims.sub ||
    claims.sub.length > 128 ||
    typeof claims.email !== "string" ||
    !claims.email ||
    !Number.isFinite(claims.exp) ||
    !Number.isFinite(claims.iat) ||
    !Number.isFinite(claims.auth_time) ||
    claims.exp <= now ||
    claims.iat > now ||
    claims.auth_time > now ||
    claims.iat < now - 3600 ||
    claims.auth_time > claims.iat
  ) {
    throw new HttpError(401, "Invalid Firebase token");
  }

  let keys = await getGoogleKeys();
  let jwk = keys.find(key => key.kid === tokenHeader.kid);

  if (!jwk) {
    keys = await getGoogleKeys(true);
    jwk = keys.find(key => key.kid === tokenHeader.kid);
  }

  if (!jwk) {
    throw new HttpError(401, "Signing key not found");
  }

  let valid = false;

  try {
    const publicKey = await crypto.subtle.importKey(
      "jwk",
      jwk,
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
      false,
      ["verify"]
    );

    valid = await crypto.subtle.verify(
      "RSASSA-PKCS1-v1_5",
      publicKey,
      decodeBase64Url(parts[2]),
      new TextEncoder().encode(`${parts[0]}.${parts[1]}`)
    );
  } catch {
    valid = false;
  }

  if (!valid) {
    throw new HttpError(401, "Invalid token signature");
  }

  return claims;
}

// By default, every authenticated API route requires verified email.
// Only /api/auth/sync is allowed to work before email verification.
async function authenticate(request, options = {}) {
  const authorization = request.headers.get("Authorization");

  if (
    typeof authorization !== "string" ||
    !authorization.startsWith("Bearer ")
  ) {
    throw new HttpError(401, "Authentication required");
  }

  const token = authorization.slice(7).trim();

  if (!token || token.length > MAX_FIREBASE_TOKEN_LENGTH) {
    throw new HttpError(401, "Invalid authentication token");
  }

  const user = await verifyFirebaseToken(token);

  if (
    options.requireVerifiedEmail !== false &&
    user.email_verified !== true
  ) {
    throw new HttpError(403, "EMAIL_NOT_VERIFIED");
  }

  return user;
}

async function requireAdmin(user, env) {
  const account = await env.DB.prepare(`
    SELECT uid, email, role
    FROM users
    WHERE uid = ?
  `).bind(user.sub).first();

  if (
    !account ||
    account.role !== "admin" ||
    (account.email || "").toLowerCase() !== user.email.toLowerCase()
  ) {
    throw new HttpError(403, "Admin access denied");
  }

  return account;
}

const RATE_LIMIT_POLICIES = Object.freeze({
  registration: { limit: 5, windowSeconds: 3600 },
  referralValidate: { limit: 30, windowSeconds: 60 },
  referralsRead: { limit: 60, windowSeconds: 60 },
  authSync: { limit: 10, windowSeconds: 60 },
  activityHeartbeat: { limit: 5, windowSeconds: 60 },
  claim: { limit: 20, windowSeconds: 60 },
  wheelRead: { limit: 120, windowSeconds: 60 },
  wheelSpin: { limit: 15, windowSeconds: 60 },
  wheelBuy: { limit: 5, windowSeconds: 60 },
  streakCheckin: { limit: 3, windowSeconds: 60 },
  withdrawalCreate: { limit: 3, windowSeconds: 3600 },
  subscriptionCreate: { limit: 5, windowSeconds: 3600 },
  adCreate: { limit: 3, windowSeconds: 86400 },
  adPaymentReference: { limit: 5, windowSeconds: 86400 },
  adminRead: { limit: 60, windowSeconds: 60 },
  adminReject: { limit: 10, windowSeconds: 60 },
  adminApprove: { limit: 5, windowSeconds: 60 },
  ptcRead: { limit: 60, windowSeconds: 60 },
  ptcStart: { limit: 10, windowSeconds: 60 },
  ptcComplete: { limit: 10, windowSeconds: 60 },
  adminPtc: { limit: 30, windowSeconds: 60 }
});

async function enforceRateLimit(env, identity, route, policy) {
  if (
    !env.DB ||
    typeof identity !== "string" ||
    !identity ||
    !policy ||
    !Number.isSafeInteger(policy.limit) ||
    !Number.isSafeInteger(policy.windowSeconds) ||
    policy.limit < 1 ||
    policy.windowSeconds < 1
  ) {
    throw new HttpError(503, "Rate limiting is temporarily unavailable.");
  }

  const nowSeconds = Math.floor(Date.now() / 1000);
  const windowStart = Math.floor(nowSeconds / policy.windowSeconds) * policy.windowSeconds;
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(`${route}:${identity}`)
  );
  const bucketHash = Array.from(
    new Uint8Array(digest),
    byte => byte.toString(16).padStart(2, "0")
  ).join("");

  let row;

  try {
    row = await env.DB.prepare(`
      INSERT INTO api_rate_limits (bucket_hash, window_start, hits)
      VALUES (?, ?, 1)
      ON CONFLICT(bucket_hash) DO UPDATE SET
        hits = CASE
          WHEN api_rate_limits.window_start = excluded.window_start
          THEN api_rate_limits.hits + 1
          ELSE 1
        END,
        window_start = excluded.window_start,
        updated_at = CURRENT_TIMESTAMP
      RETURNING hits
    `).bind(bucketHash, windowStart).first();
  } catch (error) {
    console.error("Rate limit storage error:", error);
    throw new HttpError(503, "Rate limiting is temporarily unavailable. Please try again.");
  }

  const hits = Number(row?.hits);

  if (!Number.isSafeInteger(hits) || hits < 1) {
    throw new HttpError(503, "Rate limiting is temporarily unavailable.");
  }

  if (hits > policy.limit) {
    const retryAfter = Math.max(
      1,
      windowStart + policy.windowSeconds - nowSeconds
    );

    throw new HttpError(
      429,
      "Too many requests. Please try again later.",
      { retry_after: retryAfter }
    );
  }

  if (Math.random() < 0.005) {
    try {
      await env.DB.prepare(`
        DELETE FROM api_rate_limits
        WHERE updated_at < datetime('now', '-1 day')
      `).run();
    } catch (error) {
      console.warn("Rate limit cleanup skipped:", error);
    }
  }
}

async function readJson(request) {
  const contentLength = Number(request.headers.get("Content-Length") || 0);

  if (
    Number.isFinite(contentLength) &&
    contentLength > MAX_REQUEST_BODY_BYTES
  ) {
    throw new HttpError(413, "Request body too large");
  }

  let raw;

  try {
    raw = await request.text();
  } catch {
    throw new HttpError(400, "Invalid request body");
  }

  if (
    !raw ||
    new TextEncoder().encode(raw).length > MAX_REQUEST_BODY_BYTES
  ) {
    throw new HttpError(413, "Request body too large");
  }

  try {
    const data = JSON.parse(raw);

    if (data && typeof data === "object" && !Array.isArray(data)) {
      return data;
    }
  } catch {
    // Invalid JSON
  }

  throw new HttpError(400, "Invalid request body");
}

function generateRefCode() {
  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);

  let code = "DOGE";

  for (const b of bytes) {
    code += REF_ALPHABET[b % 32];
  }

  return code;
}

// ==========================================
// DOGE ADDRESS VALIDATION
// ==========================================

async function isValidDogeAddress(address) {
  if (
    typeof address !== "string" ||
    address.length < 26 ||
    address.length > 35
  ) {
    return false;
  }

  let num = 0n;

  for (const ch of address) {
    const idx = BASE58.indexOf(ch);

    if (idx === -1) return false;

    num = num * 58n + BigInt(idx);
  }

  let hex = num.toString(16);

  if (hex.length % 2) {
    hex = "0" + hex;
  }

  const bytes = [];

  if (num > 0n) {
    for (let i = 0; i < hex.length; i += 2) {
      bytes.push(parseInt(hex.slice(i, i + 2), 16));
    }
  }

  let leadingZeros = 0;

  for (const ch of address) {
    if (ch === "1") leadingZeros++;
    else break;
  }

  const decoded = new Uint8Array(leadingZeros + bytes.length);
  decoded.set(bytes, leadingZeros);

  if (decoded.length !== 25) return false;

  const payload = decoded.slice(0, 21);
  const checksum = decoded.slice(21);

  const hash1 = await crypto.subtle.digest("SHA-256", payload);
  const hash2 = new Uint8Array(
    await crypto.subtle.digest("SHA-256", hash1)
  );

  for (let i = 0; i < 4; i++) {
    if (hash2[i] !== checksum[i]) return false;
  }

  return payload[0] === 0x1e || payload[0] === 0x16;
}

// ==========================================
// USER PLAN
// ==========================================

async function getUserPlan(env, uid) {
  const subscription = await env.DB.prepare(`
    SELECT plan
    FROM subscriptions
    WHERE firebase_uid = ?
      AND status = 'active'
      AND datetime(expiration_date) > datetime('now')
    ORDER BY
      CASE plan
        WHEN 'VIP' THEN 0
        WHEN 'PREMIUM' THEN 1
        ELSE 2
      END,
      datetime(expiration_date) DESC
    LIMIT 1
  `).bind(uid).first();

  if (!subscription) {
    return {
      name: "FREE",
      ...PLAN_CONFIG.FREE
    };
  }

  const planName = String(subscription.plan).toUpperCase();
  const config = PLAN_CONFIG[planName];

  if (!config) {
    throw new HttpError(500, "Invalid subscription plan configuration");
  }

  return {
    name: planName,
    ...config
  };
}

// ==========================================
// ACCOUNT INFORMATION
// ==========================================

async function getAccount(env, uid, plan = PLAN_CONFIG.FREE) {
  return env.DB.prepare(`
    SELECT
      balance_koinu,
      last_claim_at,
      CASE
        WHEN last_claim_at IS NULL THEN 0
        ELSE MAX(
          0,
          ? - (
            CAST(strftime('%s', 'now') AS INTEGER) -
            CAST(strftime('%s', last_claim_at) AS INTEGER)
          )
        )
      END AS cooldown_remaining,
      (
        SELECT COUNT(*)
        FROM claims
        WHERE claims.uid = users.uid
          AND date(claims.claimed_at) = date('now')
      ) AS daily_claims_used
    FROM users
    WHERE uid = ?
  `).bind(plan.cooldown_seconds, uid).first();
}

// ==========================================
// USER SYNCHRONIZATION
// ==========================================

async function syncUser(env, user, referredByCode, requestedUsername) {
  const existingUsername = await env.DB.prepare(`
    SELECT uid FROM users
    WHERE username = ? COLLATE NOCASE AND uid != ?
    LIMIT 1
  `).bind(requestedUsername, user.sub).first();

  if (existingUsername) {
    throw new HttpError(409, "That username is already taken. Please choose another one.");
  }

  let referrerCode = null;

  if (referredByCode) {
    const referrer = await env.DB.prepare(`
      SELECT ref_code
      FROM users
      WHERE ref_code = ?
        AND uid != ?
        AND email_verified = 1
        AND lower(email) != lower(?)
    `).bind(referredByCode, user.sub, user.email).first();

    referrerCode = referrer ? referrer.ref_code : null;
  }

  let synchronized = false;

  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      await env.DB.prepare(`
        INSERT INTO users (
          uid,
          email,
          username,
          ref_code,
          referred_by,
          email_verified,
          email_verified_at
        )
        VALUES (
          ?, ?, ?, ?, ?, ?,
          CASE WHEN ? = 1 THEN CURRENT_TIMESTAMP ELSE NULL END
        )
        ON CONFLICT(uid) DO UPDATE SET
          email = excluded.email,
          username = COALESCE(users.username, excluded.username),
          ref_code = COALESCE(users.ref_code, excluded.ref_code),
          email_verified = excluded.email_verified,
          email_verified_at = CASE
            WHEN excluded.email_verified = 1
              THEN COALESCE(users.email_verified_at, CURRENT_TIMESTAMP)
            ELSE NULL
          END
      `).bind(
        user.sub,
        user.email,
        requestedUsername,
        generateRefCode(),
        referrerCode,
        user.email_verified === true ? 1 : 0,
        user.email_verified === true ? 1 : 0
      ).run();

      synchronized = true;
      break;
    } catch (error) {
      if (!String(error.message).includes("UNIQUE")) {
        throw error;
      }
    }
  }

  if (!synchronized) {
    throw new HttpError(500, "Could not generate a unique referral code");
  }

  return env.DB.prepare(`
    SELECT username, ref_code, referred_by, plan, created_at, email_verified, email_verified_at
    FROM users
    WHERE uid = ?
  `).bind(user.sub).first();
}

// ==========================================
// GENERAL HELPERS
// ==========================================

function getUtcDate() {
  return new Date().toISOString().slice(0, 10);
}

// ==========================================
// DAILY STREAK
// ==========================================

const STREAK_REWARDS = {
  1: 1000,
  2: 2000,
  3: 3000,
  4: 4000,
  5: 5000,
  6: 6000,
  7: 7000
};

function getPreviousUtcDate(today) {
  const date = new Date(`${today}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
}

async function getStreakInfo(env, uid) {
  const today = getUtcDate();
  const yesterday = getPreviousUtcDate(today);

  const row = await env.DB.prepare(`
    SELECT
      u.balance_koinu,
      s.current_day,
      s.last_checkin_date,
      s.total_rewards_koinu
    FROM users u
    LEFT JOIN daily_streaks s ON s.uid = u.uid
    WHERE u.uid = ?
  `).bind(uid).first();

  if (!row) {
    throw new HttpError(404, "User not found");
  }

  const storedDay = Number(row.current_day || 0);
  const lastDate = row.last_checkin_date || null;
  const checkedInToday = lastDate === today;

  const activeDay =
    lastDate === today || lastDate === yesterday
      ? storedDay
      : 0;

  const nextDay =
    lastDate === yesterday
      ? (activeDay >= 7 ? 1 : activeDay + 1)
      : 1;

  return {
    current_day: activeDay,
    next_day: checkedInToday ? 0 : nextDay,
    last_checkin_date: lastDate,
    checked_in_today: checkedInToday,
    can_checkin: !checkedInToday,
    next_reward_koinu: checkedInToday
      ? 0
      : STREAK_REWARDS[nextDay],
    total_rewards_koinu: Number(row.total_rewards_koinu || 0),
    balance_koinu: Number(row.balance_koinu)
  };
}

async function handleStreakCheckin(env, uid) {
  const today = getUtcDate();
  const yesterday = getPreviousUtcDate(today);

  const current = await getStreakInfo(env, uid);

  if (current.checked_in_today) {
    return {
      success: true,
      already_checked_in: true,
      reward_koinu: 0,
      reward_doge: 0,
      ...current
    };
  }

  const idempotencyKey = `daily_streak:${uid}:${today}`;

  const rewardSql = `
    CASE current_day
      WHEN 1 THEN 1000
      WHEN 2 THEN 2000
      WHEN 3 THEN 3000
      WHEN 4 THEN 4000
      WHEN 5 THEN 5000
      WHEN 6 THEN 6000
      WHEN 7 THEN 7000
    END
  `;

  const statements = [
    env.DB.prepare(`
      INSERT INTO daily_streaks (
        uid,
        current_day,
        last_checkin_date,
        total_rewards_koinu
      )
      VALUES (?, 1, ?, 0)

      ON CONFLICT(uid) DO UPDATE SET
        current_day = CASE
          WHEN daily_streaks.last_checkin_date = ?
            THEN CASE
              WHEN daily_streaks.current_day >= 7 THEN 1
              ELSE daily_streaks.current_day + 1
            END
          ELSE 1
        END,
        last_checkin_date = excluded.last_checkin_date,
        updated_at = CURRENT_TIMESTAMP

      WHERE daily_streaks.last_checkin_date IS NULL
         OR daily_streaks.last_checkin_date < excluded.last_checkin_date
    `).bind(uid, today, yesterday),

    env.DB.prepare(`
      UPDATE users
      SET balance_koinu = balance_koinu + (
        SELECT ${rewardSql}
        FROM daily_streaks
        WHERE uid = ?
          AND last_checkin_date = ?
      )
      WHERE uid = ?
        AND changes() = 1
        AND EXISTS (
          SELECT 1
          FROM daily_streaks
          WHERE uid = ?
            AND last_checkin_date = ?
        )
    `).bind(uid, today, uid, uid, today),

    env.DB.prepare(`
      UPDATE daily_streaks
      SET
        total_rewards_koinu = total_rewards_koinu + (
          SELECT ${rewardSql}
          FROM daily_streaks
          WHERE uid = ?
            AND last_checkin_date = ?
        ),
        updated_at = CURRENT_TIMESTAMP
      WHERE uid = ?
        AND last_checkin_date = ?
        AND changes() = 1
    `).bind(uid, today, uid, today),

    env.DB.prepare(`
      INSERT INTO ledger_transactions (
        uid,
        transaction_type,
        amount_koinu,
        balance_before_koinu,
        balance_after_koinu,
        reference_type,
        reference_id,
        idempotency_key
      )
      SELECT
        u.uid,
        'daily_streak',
        CASE s.current_day
          WHEN 1 THEN 1000
          WHEN 2 THEN 2000
          WHEN 3 THEN 3000
          WHEN 4 THEN 4000
          WHEN 5 THEN 5000
          WHEN 6 THEN 6000
          WHEN 7 THEN 7000
        END,
        u.balance_koinu - CASE s.current_day
          WHEN 1 THEN 1000
          WHEN 2 THEN 2000
          WHEN 3 THEN 3000
          WHEN 4 THEN 4000
          WHEN 5 THEN 5000
          WHEN 6 THEN 6000
          WHEN 7 THEN 7000
        END,
        u.balance_koinu,
        'daily_streak',
        ?,
        ?
      FROM users u
      JOIN daily_streaks s ON s.uid = u.uid
      WHERE u.uid = ?
        AND s.last_checkin_date = ?
        AND changes() = 1
    `).bind(today, idempotencyKey, uid, today),

    env.DB.prepare(`
      SELECT CASE
        WHEN changes() = 1 THEN 1
        ELSE abs(-9223372036854775808)
      END
    `)
  ];

  try {
    await env.DB.batch(statements);
  } catch (error) {
    const latest = await getStreakInfo(env, uid);

    if (latest.checked_in_today) {
      return {
        success: true,
        already_checked_in: true,
        reward_koinu: 0,
        reward_doge: 0,
        ...latest
      };
    }

    console.error("Daily streak transaction failed:", error);
    throw new HttpError(500, "Daily streak check-in failed");
  }

  const result = await getStreakInfo(env, uid);
  const reward = STREAK_REWARDS[result.current_day];

  return {
    success: true,
    already_checked_in: false,
    streak_day: result.current_day,
    reward_koinu: reward,
    reward_doge: reward / 100000000,
    ...result
  };
}

function getRequestId(body) {
  const id = body?.request_id;

  if (
    typeof id !== "string" ||
    !/^[A-Za-z0-9_-]{8,64}$/.test(id)
  ) {
    throw new HttpError(400, "Valid request_id is required");
  }

  return id;
}

async function getExistingClaim(env, uid, requestId) {
  return env.DB.prepare(`
    SELECT id, amount_koinu, request_id, claimed_at
    FROM claims
    WHERE uid = ? AND request_id = ?
  `).bind(uid, requestId).first();
}

async function buildClaimResponse(env, uid, plan, claim, replayed) {
  const account = await getAccount(env, uid, plan);

  if (!account) {
    throw new HttpError(404, "User not found");
  }

  const dailyUsed = Number(account.daily_claims_used || 0);

  return {
    success: true,
    replayed,
    message: replayed ? "Claim was already processed" : "Claim successful",
    claim: {
      id: claim.id,
      amount_koinu: Number(claim.amount_koinu),
      claimed_at: claim.claimed_at
    },
    plan: plan.name,
    amount_koinu: Number(claim.amount_koinu),
    balance_koinu: Number(account.balance_koinu),
    last_claim_at: account.last_claim_at,
    cooldown_seconds: plan.cooldown_seconds,
    cooldown_remaining: Number(account.cooldown_remaining),
    daily_claims_used: dailyUsed,
    daily_limit: plan.daily_limit,
    daily_claims_remaining: Math.max(0, plan.daily_limit - dailyUsed)
  };
}

// ==========================================
// LUCKY WHEEL HELPERS
// ==========================================

function selectWeightedPrize(prizes) {
  const valid = prizes.filter(
    p =>
      Number.isSafeInteger(Number(p.amount_koinu)) &&
      Number(p.amount_koinu) >= 0 &&
      Number.isSafeInteger(Number(p.probability_weight)) &&
      Number(p.probability_weight) >= 0
  );

  if (valid.length !== prizes.length) {
    throw new HttpError(503, "Wheel prize configuration unavailable");
  }

  const totalWeight = valid.reduce(
    (sum, p) => sum + Number(p.probability_weight),
    0
  );

  if (
    !Number.isSafeInteger(totalWeight) ||
    totalWeight <= 0 ||
    totalWeight > 4294967296
  ) {
    throw new HttpError(503, "Wheel prize configuration unavailable");
  }

  const range = 4294967296;
  const limit = Math.floor(range / totalWeight) * totalWeight;

  let ticket;

  do {
    const random = new Uint32Array(1);
    crypto.getRandomValues(random);
    ticket = random[0];
  } while (ticket >= limit);

  ticket %= totalWeight;

  for (const prize of valid) {
    const weight = Number(prize.probability_weight);

    if (weight <= 0) continue;

    if (ticket < weight) return prize;

    ticket -= weight;
  }

  throw new HttpError(500, "Could not select wheel prize");
}

function getMaxWheelPrize(prizes) {
  const active = prizes.filter(p => Number(p.probability_weight) > 0);

  if (!active.length) {
    throw new HttpError(503, "No active wheel prizes");
  }

  let maxPrize = 0;

  for (const prize of active) {
    const amount = Number(prize.amount_koinu);
    const weight = Number(prize.probability_weight);

    if (
      !Number.isSafeInteger(amount) ||
      amount < 0 ||
      !Number.isSafeInteger(weight) ||
      weight <= 0
    ) {
      throw new HttpError(503, "Invalid wheel prize configuration");
    }

    maxPrize = Math.max(maxPrize, amount);
  }

  if (!Number.isSafeInteger(maxPrize)) {
    throw new HttpError(503, "Invalid maximum wheel prize");
  }

  return maxPrize;
}

async function getWheelConfiguration(env) {
  const result = await env.DB.prepare(`
    SELECT
      id,
      prize_key,
      amount_koinu,
      probability_weight,
      display_order
    FROM wheel_prizes
    ORDER BY display_order ASC
  `).all();

  const prizes = result.results || [];

  if (!prizes.length) {
    throw new HttpError(503, "Wheel prizes are not configured");
  }

  const maxPrize = getMaxWheelPrize(prizes);

  selectWeightedPrize(prizes);

  return { prizes, maxPrize };
}

async function getExistingSpin(env, uid, requestId) {
  return env.DB.prepare(`
    SELECT id, spin_type, prize_key, prize_koinu, created_at
    FROM wheel_spins
    WHERE uid = ? AND request_id = ?
  `).bind(uid, requestId).first();
}

async function getExistingPurchase(env, uid, requestId) {
  return env.DB.prepare(`
    SELECT id, package_spins, cost_koinu, created_at
    FROM wheel_purchases
    WHERE uid = ? AND request_id = ?
  `).bind(uid, requestId).first();
}

function wheelSpinResponse(savedSpin, replayed, data) {
  return {
    success: true,
    replayed,
    spin: {
      id: savedSpin.id,
      spin_type: savedSpin.spin_type,
      prize_key: savedSpin.prize_key,
      amount_koinu: Number(savedSpin.prize_koinu),
      created_at: savedSpin.created_at
    },
    ...data
  };
}

// ==========================================
// LUCKY WHEEL STATE
// ==========================================

async function getWheelData(env, uid, plan) {
  const utcDate = getUtcDate();

  const [configuration, inventory, usage, account, reserve] =
    await Promise.all([
      getWheelConfiguration(env),

      env.DB.prepare(`
        SELECT paid_spins
        FROM wheel_spin_inventory
        WHERE uid = ?
      `).bind(uid).first(),

      env.DB.prepare(`
        SELECT free_spins_used
        FROM wheel_daily_usage
        WHERE uid = ? AND utc_date = ?
      `).bind(uid, utcDate).first(),

      env.DB.prepare(`
        SELECT balance_koinu
        FROM users
        WHERE uid = ?
      `).bind(uid).first(),

      env.DB.prepare(`
        SELECT available_koinu, payouts_enabled, locked_koinu
        FROM wheel_reserve
        WHERE id = 1
      `).first()
    ]);

  if (!account) {
    throw new HttpError(404, "User not found");
  }

  if (!reserve) {
    throw new HttpError(503, "Wheel reserve is not configured");
  }

  const freeUsed = Number(usage?.free_spins_used || 0);
  const freeTotal = Number(plan.free_wheel_spins || 0);
  const freeRemaining = Math.max(0, freeTotal - freeUsed);
  const paidRemaining = Number(inventory?.paid_spins || 0);
  const maxPrize = configuration.maxPrize;
  const available = Number(reserve.available_koinu || 0);
  const locked = Number(reserve.locked_koinu || 0);
  const balance = Number(account.balance_koinu);
  const payoutsEnabled = Number(reserve.payouts_enabled) === 1;

  const canFreeSpin =
    payoutsEnabled &&
    freeRemaining > 0 &&
    available >= maxPrize;

  const canPaidSpin =
    paidRemaining > 0 &&
    locked >= maxPrize;

  const canBuy =
    payoutsEnabled &&
    Number.isSafeInteger(balance) &&
    WHEEL_PACKAGES.some(
      pack =>
        balance >= pack.price_koinu &&
        available >= maxPrize * pack.spins
    );

  return {
    // Keep configured prizes visible, including entries with a 0% chance.
    prizes: configuration.prizes.map(p => ({
        id: p.prize_key,
        label: `${formatDoge(p.amount_koinu)} DOGE`,
        amount_koinu: Number(p.amount_koinu)
      })),
    packs: WHEEL_PACKAGES,
    spins: {
      free_remaining: freeRemaining,
      free_total: freeTotal,
      paid_remaining: paidRemaining,
      total_remaining: freeRemaining + paidRemaining
    },
    can_free_spin: canFreeSpin,
    can_paid_spin: canPaidSpin,
    can_buy: canBuy,
    wheel_enabled: canFreeSpin || canPaidSpin,
    balance_koinu: balance
  };
}

async function handleWheelState(env, uid) {
  const plan = await getUserPlan(env, uid);

  return {
    success: true,
    ...(await getWheelData(env, uid, plan))
  };
}

// ==========================================
// LUCKY WHEEL SPIN
// ==========================================

async function handleWheelSpin(env, uid, body) {
  const requestId = getRequestId(body);
  const plan = await getUserPlan(env, uid);

  const existing = await getExistingSpin(env, uid, requestId);

  if (existing) {
    return wheelSpinResponse(
      existing,
      true,
      await getWheelData(env, uid, plan)
    );
  }

  const before = await getWheelData(env, uid, plan);

  let spinType;

  if (before.can_free_spin) {
    spinType = "free";
  } else if (before.can_paid_spin) {
    spinType = "paid";
  } else if (before.spins.free_remaining > 0) {
    throw new HttpError(503, "Free wheel temporarily unavailable");
  } else if (before.spins.paid_remaining > 0) {
    throw new HttpError(503, "Paid spins are not sufficiently backed");
  } else {
    throw new HttpError(409, "No spins remaining");
  }

  const configuration = await getWheelConfiguration(env);
  const prize = selectWeightedPrize(configuration.prizes);
  const amount = Number(prize.amount_koinu);
  const maxPrize = configuration.maxPrize;
  const utcDate = getUtcDate();

  if (
    !Number.isSafeInteger(amount) ||
    amount < 0 ||
    amount > maxPrize
  ) {
    throw new HttpError(503, "Invalid wheel prize amount");
  }

  const statements = [];

  if (spinType === "free") {
    statements.push(
      env.DB.prepare(`
        UPDATE wheel_reserve
        SET
          available_koinu = available_koinu - ?,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = 1
          AND payouts_enabled = 1
          AND available_koinu >= ?
      `).bind(maxPrize, maxPrize)
    );

    statements.push(
      env.DB.prepare(`
        INSERT INTO wheel_daily_usage (
          uid,
          utc_date,
          free_spins_used
        )
        SELECT ?, ?, 1
        WHERE changes() = 1
          AND ? > COALESCE(
            (
              SELECT free_spins_used
              FROM wheel_daily_usage
              WHERE uid = ? AND utc_date = ?
            ),
            0
          )
        ON CONFLICT(uid, utc_date)
        DO UPDATE SET
          free_spins_used = wheel_daily_usage.free_spins_used + 1,
          updated_at = CURRENT_TIMESTAMP
        WHERE wheel_daily_usage.free_spins_used < ?
      `).bind(
        uid,
        utcDate,
        plan.free_wheel_spins,
        uid,
        utcDate,
        plan.free_wheel_spins
      )
    );
  } else {
    statements.push(
      env.DB.prepare(`
        UPDATE wheel_reserve
        SET
          locked_koinu = locked_koinu - ?,
          available_koinu = available_koinu + ?,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = 1
          AND locked_koinu >= ?
      `).bind(
        maxPrize,
        maxPrize - amount,
        maxPrize
      )
    );

    statements.push(
      env.DB.prepare(`
        UPDATE wheel_spin_inventory
        SET
          paid_spins = paid_spins - 1,
          updated_at = CURRENT_TIMESTAMP
        WHERE uid = ?
          AND paid_spins > 0
          AND changes() = 1
      `).bind(uid)
    );
  }

  statements.push(
    env.DB.prepare(`
      INSERT INTO wheel_spins (
        uid,
        request_id,
        spin_type,
        prize_key,
        prize_koinu,
        utc_date
      )
      SELECT ?, ?, ?, ?, ?, ?
      WHERE changes() = 1
    `).bind(
      uid,
      requestId,
      spinType,
      prize.prize_key,
      amount,
      utcDate
    )
  );

  statements.push(
    env.DB.prepare(`
      UPDATE users
      SET balance_koinu = balance_koinu + ?
      WHERE uid = ?
        AND changes() = 1
    `).bind(amount, uid)
  );

  if (spinType === "free") {
    statements.push(
      env.DB.prepare(`
        UPDATE wheel_reserve
        SET
          available_koinu = available_koinu + ?,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = 1
          AND changes() = 1
      `).bind(maxPrize - amount)
    );
  }

  if (amount > 0) {
    statements.push(
      env.DB.prepare(`
        INSERT INTO ledger_transactions (
          uid,
          transaction_type,
          amount_koinu,
          balance_before_koinu,
          balance_after_koinu,
          reference_type,
          reference_id,
          idempotency_key
        )
        SELECT
          u.uid,
          'wheel_prize',
          ?,
          u.balance_koinu - ?,
          u.balance_koinu,
          'wheel_spin',
          CAST(s.id AS TEXT),
          'wheel_spin:' || u.uid || ':' || ?
        FROM users u
        JOIN wheel_spins s
          ON s.uid = u.uid
         AND s.request_id = ?
        WHERE u.uid = ?
          AND changes() = 1
      `).bind(
        amount,
        amount,
        requestId,
        requestId,
        uid
      )
    );
  }

  statements.push(
    env.DB.prepare(`
      SELECT CASE
        WHEN changes() != 1
        THEN abs(-9223372036854775808)
        ELSE 1
      END
    `)
  );

  try {
    await env.DB.batch(statements);
  } catch (error) {
    const concurrentSpin = await getExistingSpin(env, uid, requestId);

    if (concurrentSpin) {
      return wheelSpinResponse(
        concurrentSpin,
        true,
        await getWheelData(env, uid, plan)
      );
    }

    const afterFailure = await getWheelData(env, uid, plan);

    if (
      spinType === "free" &&
      afterFailure.spins.free_remaining <= 0
    ) {
      throw new HttpError(409, "Free spin is no longer available");
    }

    if (
      spinType === "paid" &&
      afterFailure.spins.paid_remaining <= 0
    ) {
      throw new HttpError(409, "No paid spins remaining");
    }

    throw new HttpError(
      409,
      "Spin could not be completed. Please try again."
    );
  }

  const savedSpin = await getExistingSpin(env, uid, requestId);

  if (!savedSpin) {
    throw new HttpError(500, "Spin record could not be confirmed");
  }

  return wheelSpinResponse(
    savedSpin,
    false,
    await getWheelData(env, uid, plan)
  );
}

// ==========================================
// LUCKY WHEEL PURCHASE
// ==========================================

async function handleWheelBuy(env, uid, body) {
  const requestId = getRequestId(body);
  const packId = String(body.pack_id || "");

  const existing = await getExistingPurchase(env, uid, requestId);

  if (existing) {
    const plan = await getUserPlan(env, uid);

    return {
      success: true,
      replayed: true,
      purchase: {
        id: existing.id,
        spins: Number(existing.package_spins),
        price_koinu: Number(existing.cost_koinu),
        created_at: existing.created_at
      },
      ...(await getWheelData(env, uid, plan))
    };
  }

  const pack = WHEEL_PACKAGES.find(p => p.id === packId);

  if (!pack) {
    throw new HttpError(400, "Invalid spin package");
  }

  const configuration = await getWheelConfiguration(env);
  const maxPrize = configuration.maxPrize;
  const requiredReserve = maxPrize * pack.spins;

  if (!Number.isSafeInteger(requiredReserve)) {
    throw new HttpError(400, "Invalid spin package reserve");
  }

  const statements = [
    env.DB.prepare(`
      UPDATE wheel_reserve
      SET
        available_koinu = available_koinu - ?,
        locked_koinu = locked_koinu + ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = 1
        AND payouts_enabled = 1
        AND available_koinu >= ?
    `).bind(
      requiredReserve,
      requiredReserve,
      requiredReserve
    ),

    env.DB.prepare(`
      UPDATE users
      SET balance_koinu = balance_koinu - ?
      WHERE uid = ?
        AND balance_koinu >= ?
        AND changes() = 1
    `).bind(pack.price_koinu, uid, pack.price_koinu),

    env.DB.prepare(`
      INSERT INTO wheel_purchases (
        uid,
        request_id,
        package_spins,
        cost_koinu
      )
      SELECT ?, ?, ?, ?
      WHERE changes() = 1
    `).bind(uid, requestId, pack.spins, pack.price_koinu),

    env.DB.prepare(`
      INSERT INTO wheel_spin_inventory (
        uid,
        paid_spins,
        updated_at
      )
      SELECT ?, ?, CURRENT_TIMESTAMP
      WHERE changes() = 1
      ON CONFLICT(uid)
      DO UPDATE SET
        paid_spins = wheel_spin_inventory.paid_spins + excluded.paid_spins,
        updated_at = CURRENT_TIMESTAMP
    `).bind(uid, pack.spins),

    env.DB.prepare(`
      INSERT INTO ledger_transactions (
        uid,
        transaction_type,
        amount_koinu,
        balance_before_koinu,
        balance_after_koinu,
        reference_type,
        reference_id,
        idempotency_key
      )
      SELECT
        u.uid,
        'wheel_purchase',
        -?,
        u.balance_koinu + ?,
        u.balance_koinu,
        'wheel_purchase',
        CAST(p.id AS TEXT),
        'wheel_purchase:' || u.uid || ':' || ?
      FROM users u
      JOIN wheel_purchases p
        ON p.uid = u.uid
       AND p.request_id = ?
      WHERE u.uid = ?
        AND changes() = 1
    `).bind(
      pack.price_koinu,
      pack.price_koinu,
      requestId,
      requestId,
      uid
    ),

    env.DB.prepare(`
      SELECT CASE
        WHEN changes() != 1
        THEN abs(-9223372036854775808)
        ELSE 1
      END
    `)
  ];

  try {
    await env.DB.batch(statements);
  } catch (error) {
    const concurrentPurchase = await getExistingPurchase(
      env,
      uid,
      requestId
    );

    if (concurrentPurchase) {
      const plan = await getUserPlan(env, uid);

      return {
        success: true,
        replayed: true,
        purchase: {
          id: concurrentPurchase.id,
          spins: Number(concurrentPurchase.package_spins),
          price_koinu: Number(concurrentPurchase.cost_koinu),
          created_at: concurrentPurchase.created_at
        },
        ...(await getWheelData(env, uid, plan))
      };
    }

    const [reserve, account] = await Promise.all([
      env.DB.prepare(`
        SELECT available_koinu, payouts_enabled
        FROM wheel_reserve
        WHERE id = 1
      `).first(),

      env.DB.prepare(`
        SELECT balance_koinu
        FROM users
        WHERE uid = ?
      `).bind(uid).first()
    ]);

    if (!account) {
      throw new HttpError(404, "User not found");
    }

    if (!reserve || Number(reserve.payouts_enabled) !== 1) {
      throw new HttpError(503, "Wheel purchases are temporarily disabled");
    }

    if (Number(reserve.available_koinu) < requiredReserve) {
      throw new HttpError(503, "Insufficient wheel reserve for this package");
    }

    if (Number(account.balance_koinu) < pack.price_koinu) {
      throw new HttpError(400, "Insufficient balance");
    }

    throw new HttpError(
      409,
      "Purchase could not be completed. Please try again."
    );
  }

  const purchase = await getExistingPurchase(env, uid, requestId);

  if (!purchase) {
    throw new HttpError(500, "Purchase could not be confirmed");
  }

  const plan = await getUserPlan(env, uid);

  return {
    success: true,
    replayed: false,
    purchase: {
      id: purchase.id,
      spins: Number(purchase.package_spins),
      price_koinu: Number(purchase.cost_koinu),
      created_at: purchase.created_at
    },
    ...(await getWheelData(env, uid, plan))
  };
}

// ==========================================
// LUCKY WHEEL HISTORY
// ==========================================

async function handleWheelHistory(env, uid) {
  const [spins, purchases] = await Promise.all([
    env.DB.prepare(`
      SELECT
        id,
        prize_koinu AS amount_koinu,
        spin_type AS source,
        created_at
      FROM wheel_spins
      WHERE uid = ?
      ORDER BY id DESC
      LIMIT 50
    `).bind(uid).all(),

    env.DB.prepare(`
      SELECT
        id,
        package_spins AS spins,
        cost_koinu AS price_koinu,
        created_at
      FROM wheel_purchases
      WHERE uid = ?
      ORDER BY id DESC
      LIMIT 50
    `).bind(uid).all()
  ]);

  return {
    success: true,
    spins: spins.results || [],
    purchases: purchases.results || []
  };
}

// ==========================================
// ADMIN DAILY STATS (UTC day)
// ==========================================

async function getAdminDailyStats(env) {
  const today = getUtcDate();

  const [
    claims,
    wheelPrizes,
    wheelBuys,
    streaks,
    referralCommissions,
    wdPending,
    wdRequested,
    wdApproved,
    wdRejected,
    balances,
    activity,
    onlineUsers,
    adRevenue,
    verifiedSubscriptionRevenue,
    ptcFundingToday,
    ptcReserve,
    faucetReserve,
    wheelReserve,
    referralReserve
  ] = await Promise.all([
    env.DB.prepare(`
      SELECT COALESCE(SUM(amount_koinu), 0) AS total, COUNT(*) AS count
      FROM claims
      WHERE date(claimed_at) = ?
    `).bind(today).first(),

    env.DB.prepare(`
      SELECT COALESCE(SUM(prize_koinu), 0) AS total, COUNT(*) AS count
      FROM wheel_spins
      WHERE utc_date = ?
    `).bind(today).first(),

    env.DB.prepare(`
      SELECT COALESCE(SUM(cost_koinu), 0) AS total, COUNT(*) AS count
      FROM wheel_purchases
      WHERE date(created_at) = ?
    `).bind(today).first(),

    env.DB.prepare(`
      SELECT
        COALESCE(SUM(
          CASE current_day
            WHEN 1 THEN 1000
            WHEN 2 THEN 2000
            WHEN 3 THEN 3000
            WHEN 4 THEN 4000
            WHEN 5 THEN 5000
            WHEN 6 THEN 6000
            WHEN 7 THEN 7000
            ELSE 0
          END
        ), 0) AS total,
        COUNT(*) AS count
      FROM daily_streaks
      WHERE last_checkin_date = ?
    `).bind(today).first(),

    env.DB.prepare(`
      SELECT COALESCE(SUM(amount_koinu), 0) AS total, COUNT(*) AS count
      FROM referral_commissions
      WHERE date(created_at) = ?
    `).bind(today).first(),

    env.DB.prepare(`
      SELECT COALESCE(SUM(amount_koinu), 0) AS total, COUNT(*) AS count
      FROM withdrawals
      WHERE status = 'pending'
    `).first(),

    env.DB.prepare(`
      SELECT COALESCE(SUM(amount_koinu), 0) AS total, COUNT(*) AS count
      FROM withdrawals
      WHERE date(created_at) = ?
    `).bind(today).first(),

    env.DB.prepare(`
      SELECT COALESCE(SUM(amount_koinu), 0) AS total, COUNT(*) AS count
      FROM withdrawals
      WHERE status = 'approved'
        AND date(processed_at) = ?
    `).bind(today).first(),

    env.DB.prepare(`
      SELECT COALESCE(SUM(amount_koinu), 0) AS total, COUNT(*) AS count
      FROM withdrawals
      WHERE status = 'rejected'
        AND date(processed_at) = ?
    `).bind(today).first(),

    env.DB.prepare(`
      SELECT COALESCE(SUM(balance_koinu), 0) AS total, COUNT(*) AS count
      FROM users
    `).first(),

    env.DB.prepare(`
      SELECT
        COUNT(*) AS active_users,
        COALESCE(SUM(session_count), 0) AS login_sessions
      FROM user_daily_activity
      WHERE utc_date = ?
    `).bind(today).first(),

    env.DB.prepare(`
      SELECT COUNT(*) AS total
      FROM user_daily_activity
      WHERE utc_date = ?
        AND last_seen_at >= datetime('now', '-5 minutes')
    `).bind(today).first(),

    env.DB.prepare(`
      SELECT
        COALESCE(SUM(quoted_price_eur), 0) AS total,
        COUNT(*) AS count
      FROM advertising_requests
      WHERE status = 'active'
        AND payment_reference IS NOT NULL
        AND quoted_price_eur IS NOT NULL
        AND date(updated_at) = ?
    `).bind(today).first(),

    env.DB.prepare(`
      SELECT
        COALESCE(SUM(amount_cents), 0) AS total_cents,
        COUNT(*) AS orders_count,
        COALESCE(SUM(CASE WHEN plan = 'PREMIUM' THEN amount_cents ELSE 0 END), 0) AS premium_cents,
        COALESCE(SUM(CASE WHEN plan = 'VIP' THEN amount_cents ELSE 0 END), 0) AS vip_cents
      FROM subscription_orders
      WHERE status = 'paid'
        AND provider = 'faucetpay'
        AND provider_transaction_id IS NOT NULL
        AND paid_at IS NOT NULL
        AND date(paid_at) = ?
    `).bind(today).first(),

    env.DB.prepare(`
      SELECT COALESCE(SUM(amount_koinu), 0) AS total, COUNT(*) AS count
      FROM ptc_funding_events
      WHERE date(created_at) = ?
    `).bind(today).first(),

    env.DB.prepare(`
      SELECT available_koinu, locked_koinu, pending_koinu
      FROM ptc_reserve
      WHERE id = 1
    `).first(),

    env.DB.prepare(`
      SELECT available_koinu, payouts_enabled
      FROM faucet_reserve
      WHERE id = 1
    `).first(),

    env.DB.prepare(`
      SELECT available_koinu, locked_koinu, payouts_enabled
      FROM wheel_reserve
      WHERE id = 1
    `).first(),

    env.DB.prepare(`
      SELECT available_koinu, payouts_enabled
      FROM referral_reserve
      WHERE id = 1
    `).first()
  ]);

  let verifiedOperatingExpenses = null;
  let expenseTrackingAvailable = true;
  try {
    verifiedOperatingExpenses = await env.DB.prepare(`
      SELECT COALESCE(SUM(amount_cents), 0) AS total_cents, COUNT(*) AS count
      FROM operating_expenses
      WHERE verification_status = 'verified'
        AND date(expense_date) = ?
    `).bind(today).first();
  } catch {
    expenseTrackingAvailable = false;
  }

  const sumCount = row => ({
    koinu: Number(row?.total || 0),
    count: Number(row?.count || 0)
  });

  // Requires users.created_at. If the column does not exist yet,
  // the value is returned as null instead of failing the whole request.
  let registeredToday = null;

  try {
    const row = await env.DB.prepare(`
      SELECT COUNT(*) AS total
      FROM users
      WHERE date(created_at) = ?
    `).bind(today).first();

    registeredToday = Number(row?.total || 0);
  } catch {
    registeredToday = null;
  }

  const claimsKoinu = Number(claims?.total || 0);
  const wheelPrizesKoinu = Number(wheelPrizes?.total || 0);
  const streakKoinu = Number(streaks?.total || 0);
  const referralCommissionsKoinu = Number(referralCommissions?.total || 0);
  const wheelPurchaseVolumeKoinu = Number(wheelBuys?.total || 0);
  const rewardsCreditedKoinu =
    claimsKoinu + wheelPrizesKoinu + streakKoinu + referralCommissionsKoinu;

  return {
    success: true,
    date: today,
    registered_today: registeredToday,
    active_users_today: Number(activity?.active_users || 0),
    currently_online: Number(onlineUsers?.total || 0),
    login_sessions_today: Number(activity?.login_sessions || 0),
    ad_campaign_value_eur: Number(adRevenue?.total || 0),
    ad_campaigns_activated_today: Number(adRevenue?.count || 0),
    ad_payment_verification_status: "manual_review_not_provider_verified",
    verified_subscription_revenue_eur_cents: Number(verifiedSubscriptionRevenue?.total_cents || 0),
    verified_subscription_revenue_eur: Number(verifiedSubscriptionRevenue?.total_cents || 0) / 100,
    verified_subscription_orders_today: Number(verifiedSubscriptionRevenue?.orders_count || 0),
    subscription_revenue_breakdown_eur_cents: {
      premium: Number(verifiedSubscriptionRevenue?.premium_cents || 0),
      vip: Number(verifiedSubscriptionRevenue?.vip_cents || 0)
    },
    subscription_revenue_verification_status: "faucetpay_callback_verified",
    expense_tracking_available: expenseTrackingAvailable,
    verified_operating_expenses_eur_cents: expenseTrackingAvailable ? Number(verifiedOperatingExpenses?.total_cents || 0) : null,
    verified_operating_expenses_count: expenseTrackingAvailable ? Number(verifiedOperatingExpenses?.count || 0) : null,
    verified_subscription_net_after_expenses_eur_cents: expenseTrackingAvailable
      ? Number(verifiedSubscriptionRevenue?.total_cents || 0) - Number(verifiedOperatingExpenses?.total_cents || 0)
      : null,
    expense_verification_status: "admin_verified_with_evidence_reference",
    ptc_advertiser_funding_today_koinu: Number(ptcFundingToday?.total || 0),
    ptc_advertiser_funding_today_count: Number(ptcFundingToday?.count || 0),
    ptc_funding_verification_status: "admin_confirmed_external_reference",
    ptc_reserve: {
      available_koinu: Number(ptcReserve?.available_koinu || 0),
      locked_koinu: Number(ptcReserve?.locked_koinu || 0),
      pending_koinu: Number(ptcReserve?.pending_koinu || 0)
    },
    wheel_purchase_volume_koinu: wheelPurchaseVolumeKoinu,
    rewards_credited_koinu: rewardsCreditedKoinu,
    external_doge_revenue_verified: false,
    profit_koinu: null,
    profit_status: "unavailable_unverified_external_revenue_and_expenses",
    breakdown: {
      claims_koinu: claimsKoinu,
      claims_count: Number(claims?.count || 0),
      wheel_prizes_koinu: wheelPrizesKoinu,
      wheel_spins_count: Number(wheelPrizes?.count || 0),
      streak_koinu: streakKoinu,
      streak_checkins_count: Number(streaks?.count || 0),
      referral_commissions_koinu: referralCommissionsKoinu,
      referral_commissions_count: Number(referralCommissions?.count || 0),
      wheel_purchases_koinu: wheelPurchaseVolumeKoinu,
      wheel_purchases_count: Number(wheelBuys?.count || 0)
    },
    withdrawals: {
      pending: sumCount(wdPending),
      requested_today: sumCount(wdRequested),
      approved_today: sumCount(wdApproved),
      rejected_today: sumCount(wdRejected)
    },
    liability: {
      user_balances_koinu: Number(balances?.total || 0),
      users_count: Number(balances?.count || 0)
    },
    reserves: {
      faucet_available_koinu: Number(faucetReserve?.available_koinu || 0),
      faucet_payouts_enabled: Number(faucetReserve?.payouts_enabled) === 1,
      wheel_available_koinu: Number(wheelReserve?.available_koinu || 0),
      wheel_locked_koinu: Number(wheelReserve?.locked_koinu || 0),
      wheel_payouts_enabled: Number(wheelReserve?.payouts_enabled) === 1,
      referral_available_koinu: Number(referralReserve?.available_koinu || 0),
      referral_payouts_enabled: Number(referralReserve?.payouts_enabled) === 1
    }
  };
}

function validatePublicHttpUrl(value, fieldName) {
  if (typeof value !== "string" || value.length > 2048) {
    throw new HttpError(400, `Invalid ${fieldName}`);
  }

  let parsed;
  try {
    parsed = new URL(value.trim());
  } catch {
    throw new HttpError(400, `Invalid ${fieldName}`);
  }

  const hostname = parsed.hostname.toLowerCase();
  if (
    !["https:", "http:"].includes(parsed.protocol) ||
    parsed.username ||
    parsed.password ||
    !hostname.includes(".") ||
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname.endsWith(".local") ||
    hostname.endsWith(".internal") ||
    /^\d{1,3}(\.\d{1,3}){3}$/.test(hostname) ||
    hostname.includes(":")
  ) {
    throw new HttpError(400, `Only public HTTP or HTTPS URLs are allowed for ${fieldName}`);
  }

  return parsed.toString();
}

// ==========================================
// FAUCETPAY API (DOGE PAYOUTS)
// ==========================================

async function faucetPayRequest(env, endpoint, parameters) {
  const apiKey = typeof env.FAUCETPAY_API_KEY === "string"
    ? env.FAUCETPAY_API_KEY.trim()
    : "";

  if (!apiKey) {
    throw new HttpError(503, "FaucetPay API key is not configured.");
  }

  const form = new URLSearchParams({
    api_key: apiKey,
    ...parameters
  });

  let response;
  try {
    response = await fetch(`https://faucetpay.io/api/v1/${endpoint}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body: form.toString(),
      signal: AbortSignal.timeout(12000)
    });
  } catch {
    throw new HttpError(
      504,
      "FaucetPay did not return a response. The payout result must be checked manually."
    );
  }

  let payload;
  try {
    const raw = await response.text();
    if (!raw || raw.length > 16384) throw new Error("Invalid response size");
    payload = JSON.parse(raw);
  } catch {
    throw new HttpError(
      502,
      "FaucetPay returned an unreadable response. The payout result must be checked manually."
    );
  }

  if (!response.ok || !payload || !Number.isInteger(Number(payload.status))) {
    throw new HttpError(
      502,
      "FaucetPay returned an unexpected response. The payout result must be checked manually."
    );
  }

  return payload;
}

async function verifyTurnstileToken(token, request, env, expectedAction = 'signup') {
  if (typeof env.TURNSTILE_SECRET !== "string" || !env.TURNSTILE_SECRET) {
    throw new HttpError(503, "Security verification is not configured.");
  }

  if (typeof token !== "string" || token.length < 1 || token.length > 2048) {
    throw new HttpError(400, "Complete the security verification and try again.");
  }

  const form = new URLSearchParams();
  form.set("secret", env.TURNSTILE_SECRET);
  form.set("response", token);

  const clientIp = getTrustedClientIp(request);
  if (clientIp) form.set("remoteip", clientIp);

  let response;
  try {
    response = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: form.toString(),
      signal: AbortSignal.timeout(8000)
    });
  } catch {
    throw new HttpError(503, "Security verification is temporarily unavailable.");
  }

  let result;
  try {
    result = await response.json();
  } catch {
    throw new HttpError(503, "Security verification is temporarily unavailable.");
  }

  const allowedHostnames = new Set(["dogedrip.pages.dev", "localhost", "127.0.0.1"]);
  if (
    !response.ok ||
    result?.success !== true ||
    result?.action !== expectedAction ||
    !allowedHostnames.has(result?.hostname)
  ) {
    throw new HttpError(403, "Security verification failed. Please try again.");
  }
}

function getTrustedClientIp(request) {
  const value = request.headers.get("CF-Connecting-IP") || "";
  return value.length <= 45 && /^[0-9a-fA-F:.]+$/.test(value)
    ? value
    : "";
}

const SUBSCRIPTION_PLANS_EUR_CENTS = Object.freeze({ PREMIUM: 299, VIP: 499 });

function parsePositiveMoney(value) {
  if (typeof value !== "string" || !/^\d{1,8}(?:\.\d{1,6})?$/.test(value)) return null;
  const parts = value.split(".");
  return BigInt(parts[0]) * 1000000n + BigInt(((parts[1] || "") + "000000").slice(0, 6));
}

function addUtcMonth(date) {
  const next = new Date(date.getTime());
  const day = next.getUTCDate();
  next.setUTCDate(1);
  next.setUTCMonth(next.getUTCMonth() + 1);
  const lastDay = new Date(Date.UTC(next.getUTCFullYear(), next.getUTCMonth() + 1, 0)).getUTCDate();
  next.setUTCDate(Math.min(day, lastDay));
  return next;
}

async function ensureSubscriptionForPaidOrder(env, order, transactionId) {
  const existing = await env.DB.prepare(
    "SELECT id FROM subscriptions WHERE payment_order_id = ? LIMIT 1"
  ).bind(order.id).first();
  if (existing) return true;

  const expiresAt = addUtcMonth(new Date()).toISOString();
  const result = await env.DB.prepare(
    "INSERT INTO subscriptions (id, firebase_uid, plan, billing_period, status, amount, currency, start_date, expiration_date, cancel_at_period_end, created_at, updated_at, payment_order_id) SELECT ?, ?, ?, ?, 'active', ?, 'EUR', CURRENT_TIMESTAMP, ?, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, ? WHERE EXISTS (SELECT 1 FROM subscription_orders WHERE id = ? AND status = 'paid' AND provider_transaction_id = ?) AND NOT EXISTS (SELECT 1 FROM subscriptions WHERE payment_order_id = ?)"
  ).bind(crypto.randomUUID(), order.firebase_uid, order.plan, order.billing_period, Number(order.amount_cents) / 100, expiresAt, order.id, order.id, transactionId, order.id).run();

  if (Number(result?.meta?.changes || 0) === 1) return true;
  const recovered = await env.DB.prepare(
    "SELECT id FROM subscriptions WHERE payment_order_id = ? LIMIT 1"
  ).bind(order.id).first();
  return Boolean(recovered);
}

async function handleSubscriptionCallback(request, env) {
  const length = Number(request.headers.get("Content-Length") || 0);
  if (length > 8192) throw new HttpError(413, "Callback payload too large");
  const raw = await request.text();
  if (!raw || new TextEncoder().encode(raw).length > 8192) throw new HttpError(400, "Invalid callback payload");

  const form = new URLSearchParams(raw);
  const token = form.get("token");
  const orderId = form.get("custom");
  const callbackTransactionId = String(form.get("transaction_id") || "");
  if (!token || token.length > 256 || !orderId || orderId.length > 80) {
    throw new HttpError(400, "Invalid payment callback");
  }

  const order = await env.DB.prepare(
    "SELECT id, firebase_uid, plan, billing_period, amount_cents, merchant_amount, merchant_currency, status, expires_at, provider_transaction_id FROM subscription_orders WHERE id = ? LIMIT 1"
  ).bind(orderId).first();
  if (!order) throw new HttpError(404, "Subscription order not found");

  // A paid order is already backed by a previously verified provider callback.
  // Recover a missing subscription without reusing FaucetPay's one-time token.
  if (order.status === "paid") {
    if (!/^\\d{1,32}$/.test(callbackTransactionId) || callbackTransactionId !== String(order.provider_transaction_id || "")) {
      throw new HttpError(409, "This order was already paid with another transaction");
    }
    if (await ensureSubscriptionForPaidOrder(env, order, callbackTransactionId)) {
      return { success: true, already_processed: true };
    }
    throw new HttpError(503, "Payment is verified; subscription activation will retry safely");
  }

  if (order.status !== "pending" || Date.parse(order.expires_at) <= Date.now()) {
    throw new HttpError(409, "Subscription order has expired or is no longer payable");
  }
  if (typeof env.FAUCETPAY_MERCHANT_USERNAME !== "string" || !env.FAUCETPAY_MERCHANT_USERNAME.trim()) {
    throw new HttpError(503, "Merchant payments are not configured");
  }

  let response;
  try {
    response = await fetch("https://faucetpay.io/merchant/get-payment/" + encodeURIComponent(token), {
      method: "GET",
      signal: AbortSignal.timeout(10000)
    });
  } catch {
    throw new HttpError(503, "Payment verification is temporarily unavailable");
  }

  let verified;
  try {
    const text = await response.text();
    if (!response.ok || !text || text.length > 8192) throw new Error("Invalid provider response");
    verified = JSON.parse(text);
  } catch {
    throw new HttpError(503, "Could not verify the payment with FaucetPay");
  }
  if (verified?.valid !== true) throw new HttpError(400, "FaucetPay did not verify this payment");

  const expectedAmount = parsePositiveMoney(String(order.merchant_amount || ""));
  const receivedAmount = parsePositiveMoney(String(verified.amount1 || ""));
  const transactionId = String(verified.transaction_id || "");
  if (
    String(verified.merchant_username || "").trim().toLowerCase() !== env.FAUCETPAY_MERCHANT_USERNAME.trim().toLowerCase() ||
    String(verified.custom || "") !== order.id ||
    !/^\\d{1,32}$/.test(transactionId) ||
    !expectedAmount || !receivedAmount || receivedAmount !== expectedAmount ||
    String(verified.currency1 || "").toUpperCase() !== order.merchant_currency ||
    callbackTransactionId !== transactionId
  ) {
    throw new HttpError(400, "Verified payment does not match this subscription order");
  }

  const expiresAt = addUtcMonth(new Date()).toISOString();
  const statements = [
    env.DB.prepare(
      "UPDATE subscription_orders SET status = 'paid', provider_transaction_id = ?, paid_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND status = 'pending' AND datetime(expires_at) > datetime('now')"
    ).bind(transactionId, order.id),
    env.DB.prepare(
      "INSERT INTO subscriptions (id, firebase_uid, plan, billing_period, status, amount, currency, start_date, expiration_date, cancel_at_period_end, created_at, updated_at, payment_order_id) SELECT ?, ?, ?, ?, 'active', ?, 'EUR', CURRENT_TIMESTAMP, ?, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, ? WHERE EXISTS (SELECT 1 FROM subscription_orders WHERE id = ? AND status = 'paid' AND provider_transaction_id = ?) AND NOT EXISTS (SELECT 1 FROM subscriptions WHERE payment_order_id = ?)"
    ).bind(crypto.randomUUID(), order.firebase_uid, order.plan, order.billing_period, Number(order.amount_cents) / 100, expiresAt, order.id, order.id, transactionId, order.id)
  ];

  try {
    const results = await env.DB.batch(statements);
    if (Number(results?.[0]?.meta?.changes || 0) === 1 && Number(results?.[1]?.meta?.changes || 0) === 1) {
      return { success: true, activated: true };
    }

    const latestOrder = await env.DB.prepare(
      "SELECT id, firebase_uid, plan, billing_period, amount_cents, status, provider_transaction_id FROM subscription_orders WHERE id = ? LIMIT 1"
    ).bind(order.id).first();
    if (
      latestOrder?.status === "paid" &&
      latestOrder.provider_transaction_id === transactionId &&
      await ensureSubscriptionForPaidOrder(env, latestOrder, transactionId)
    ) {
      return { success: true, already_processed: true };
    }
    throw new HttpError(409, "Payment order could not be finalized");
  } catch (error) {
    if (error instanceof HttpError) throw error;
    console.error("Subscription activation failed:", error);
    throw new HttpError(503, "Payment verified but subscription activation needs retry");
  }
}

// ==========================================
// MAIN API ROUTES
// ==========================================

async function handleRequest(request, env, json) {
  const url = new URL(request.url);
  const path = url.pathname;
  const method = request.method;

  // Verify every FaucetPay callback with its one-time server-side token.
  if (path === "/api/payments/faucetpay/callback" && method === "POST") {
    return json(await handleSubscriptionCallback(request, env));
  }

  // Create a monthly Premium/VIP checkout order.
  if (path === "/api/subscriptions/checkout" && method === "POST") {
    const user = await authenticate(request);
    await enforceRateLimit(env, user.sub, "subscription_create", RATE_LIMIT_POLICIES.subscriptionCreate);
    const body = await readJson(request);
    const plan = typeof body.plan === "string" ? body.plan.toUpperCase() : "";
    if (!Object.prototype.hasOwnProperty.call(SUBSCRIPTION_PLANS_EUR_CENTS, plan)) {
      throw new HttpError(400, "Choose a valid subscription plan");
    }
    if (typeof env.FAUCETPAY_MERCHANT_USERNAME !== "string" || !env.FAUCETPAY_MERCHANT_USERNAME.trim()) {
      throw new HttpError(503, "Premium payments are not configured yet");
    }
    const merchantAmount = String(plan === "PREMIUM" ? env.FAUCETPAY_PREMIUM_USDT || "" : env.FAUCETPAY_VIP_USDT || "");
    if (!parsePositiveMoney(merchantAmount)) throw new HttpError(503, "Subscription price is not configured correctly");
    const account = await env.DB.prepare(
      "SELECT uid FROM users WHERE uid = ? AND email_verified = 1"
    ).bind(user.sub).first();
    if (!account) throw new HttpError(403, "Verified account required");

    const orderId = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();
    await env.DB.prepare(
      "INSERT INTO subscription_orders (id, firebase_uid, plan, billing_period, amount_cents, currency, provider, status, idempotency_key, expires_at, merchant_amount, merchant_currency) VALUES (?, ?, ?, 'monthly', ?, 'EUR', 'faucetpay', 'pending', ?, ?, ?, 'USDT')"
    ).bind(orderId, user.sub, plan, SUBSCRIPTION_PLANS_EUR_CENTS[plan], "subscription:" + user.sub + ":" + orderId, expiresAt, merchantAmount).run();

    const site = "https://dogedrip.pages.dev";
    return json({
      success: true,
      order_id: orderId,
      expires_at: expiresAt,
      checkout: {
        action: "https://faucetpay.io/merchant/webscr",
        method: "POST",
        fields: {
          merchant_username: env.FAUCETPAY_MERCHANT_USERNAME.trim(),
          item_description: "DogeDrip " + plan + " monthly subscription",
          amount1: merchantAmount,
          currency1: "USDT",
          currency2: "USDT",
          custom: orderId,
          callback_url: "https://dogedrip-api.f5pfpv5sbg.workers.dev/api/payments/faucetpay/callback",
          success_url: site + "/?subscription=success&order=" + encodeURIComponent(orderId),
          cancel_url: site + "/?subscription=cancelled&order=" + encodeURIComponent(orderId)
        }
      }
    });
  }

  // HEALTH CHECK

  if (path === "/api/health" && method === "GET") {
    try {
      await env.DB.prepare("SELECT 1").first();

      return json({
        success: true,
        message: "DogeDrip API is connected",
        database: "connected"
      });
    } catch {
      return json({
        success: false,
        error: "Database connection failed"
      }, 500);
    }
  }

  // PUBLIC REGISTRATION RATE LIMIT
  // Limits account creation attempts by Cloudflare-verified client IP.
  if (path === "/api/security/register" && method === "POST") {
    const clientIp = request.headers.get("CF-Connecting-IP");

    if (!clientIp) {
      throw new HttpError(503, "Registration security is temporarily unavailable.");
    }

    await enforceRateLimit(
      env,
      `ip:${clientIp}`,
      "registration",
      RATE_LIMIT_POLICIES.registration
    );

    const registrationBody = await readJson(request);
    await verifyTurnstileToken(registrationBody.turnstileToken, request, env, "signup");

    return json({ success: true });
  }

  // PUBLIC LOGIN RATE LIMIT + TURNSTILE
  if (path === "/api/security/login" && method === "POST") {
    const clientIp = request.headers.get("CF-Connecting-IP");
    if (!clientIp) throw new HttpError(503, "Login security is temporarily unavailable.");
    await enforceRateLimit(env, `ip:${clientIp}`, "login_security", {
      limit: 20,
      windowSeconds: 60
    });
    const loginBody = await readJson(request);
    await verifyTurnstileToken(loginBody.turnstileToken, request, env, "login");
    return json({ success: true });
  }

  // REFERRAL VALIDATION

  if (path === "/api/referral/validate" && method === "GET") {
    const clientIp = request.headers.get("CF-Connecting-IP");

    if (!clientIp) {
      throw new HttpError(503, "Rate limiting is temporarily unavailable.");
    }

    await enforceRateLimit(
      env,
      `ip:${clientIp}`,
      "referral_validate",
      RATE_LIMIT_POLICIES.referralValidate
    );

    const code = (url.searchParams.get("code") || "").trim();

    if (!REF_CODE_REGEX.test(code)) {
      return json({ success: true, valid: false });
    }

    const row = await env.DB.prepare(`
      SELECT 1 AS ok
      FROM users
      WHERE ref_code = ?
        AND email_verified = 1
    `).bind(code).first();

    return json({
      success: true,
      valid: Boolean(row)
    });
  }

  // AUTH SYNC
  // Unverified users may synchronize their account only.
  // All benefit-related routes still require verified email.

  if (path === "/api/auth/sync" && method === "POST") {
    const user = await authenticate(request, {
      requireVerifiedEmail: false
    });

    await enforceRateLimit(
      env,
      `uid:${user.sub}`,
      "auth_sync",
      RATE_LIMIT_POLICIES.authSync
    );

    const body = await readJson(request);

    const rawRef =
      typeof body.referred_by === "string"
        ? body.referred_by.trim().toUpperCase()
        : "";

    const rawUsername = typeof body.username === "string" ? body.username.trim() : "";
    const requestedUsername = /^[A-Za-z0-9_]{3,20}$/.test(rawUsername)
      ? rawUsername
      : (user.email ? user.email.split("@")[0].slice(0, 20) : "User");

    const profile = await syncUser(
      env,
      user,
      REF_CODE_REGEX.test(rawRef) ? rawRef : null,
      requestedUsername
    );

    if (user.email_verified === true) {
      await env.DB.prepare(`
        INSERT INTO user_daily_activity (
          utc_date,
          uid,
          session_count,
          first_seen_at,
          last_seen_at
        )
        VALUES (date('now'), ?, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        ON CONFLICT(utc_date, uid) DO UPDATE SET
          session_count = user_daily_activity.session_count + 1,
          last_seen_at = CURRENT_TIMESTAMP
      `).bind(user.sub).run();

      if (Math.random() < 0.005) {
        await env.DB.prepare(`
          DELETE FROM user_daily_activity
          WHERE utc_date < date('now', '-90 days')
        `).run().catch(error => {
          console.warn("Daily activity cleanup skipped:", error);
        });
      }
    }

    return json({
      success: true,
      message: "User synchronized successfully",
      uid: user.sub,
      ref_code: profile.ref_code,
      referred_by: profile.referred_by,
      plan: profile.plan || "FREE",
      username: profile.username || requestedUsername,
      created_at: profile.created_at,
      email_verified: user.email_verified === true,
      email_verified_at: profile.email_verified_at
    });
  }

  // VERIFIED USER ACTIVITY HEARTBEAT
  if (path === "/api/activity/heartbeat" && method === "POST") {
    const user = await authenticate(request);
    await enforceRateLimit(
      env,
      `uid:${user.sub}`,
      "activity_heartbeat",
      RATE_LIMIT_POLICIES.activityHeartbeat
    );

    await env.DB.prepare(`
      INSERT INTO user_daily_activity (
        utc_date,
        uid,
        session_count,
        first_seen_at,
        last_seen_at
      )
      VALUES (date('now'), ?, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      ON CONFLICT(utc_date, uid) DO UPDATE SET
        last_seen_at = CURRENT_TIMESTAMP
    `).bind(user.sub).run();

    return json({ success: true });
  }

  // USER PROFILE
  if (path === "/api/profile" && method === "GET") {
    const user = await authenticate(request);
    const profile = await env.DB.prepare(`
      SELECT username, created_at, email_verified_at, plan, ref_code, referred_by
      FROM users WHERE uid = ?
    `).bind(user.sub).first();
    if (!profile) throw new HttpError(404, "User profile not found");
    return json({
      success: true,
      profile: {
        uid: user.sub,
        username: profile.username || "",
        email: user.email,
        created_at: profile.created_at,
        email_verified: user.email_verified === true,
        email_verified_at: profile.email_verified_at,
        plan: profile.plan || "FREE",
        ref_code: profile.ref_code || "",
        referred_by: profile.referred_by || null
      }
    });
  }

  if (path === "/api/profile" && method === "PUT") {
    const user = await authenticate(request);
    await enforceRateLimit(env, `uid:${user.sub}`, "profile_update", {
      limit: 5,
      windowSeconds: 3600
    });
    const body = await readJson(request);
    const username = typeof body.username === "string" ? body.username.trim() : "";
    if (!/^[A-Za-z0-9_]{3,20}$/.test(username)) {
      throw new HttpError(400, "Username must be 3-20 characters using letters, numbers, or underscore.");
    }
    try {
      const result = await env.DB.prepare(`
        UPDATE users SET username = ? WHERE uid = ?
      `).bind(username, user.sub).run();
      if (result.meta.changes !== 1) throw new HttpError(404, "User profile not found");
    } catch (error) {
      if (error instanceof HttpError) throw error;
      if (String(error.message).includes("UNIQUE")) throw new HttpError(409, "That username is already taken.");
      throw error;
    }
    return json({ success: true, profile: { username }, message: "Username updated successfully." });
  }

  // REFERRAL STATS

  if (path === "/api/referrals" && method === "GET") {
    const user = await authenticate(request);

    await enforceRateLimit(
      env,
      `uid:${user.sub}`,
      "referrals_read",
      RATE_LIMIT_POLICIES.referralsRead
    );

    const account = await env.DB.prepare(`
      SELECT ref_code, referred_by FROM users WHERE uid = ?
    `).bind(user.sub).first();

    if (!account) throw new HttpError(404, "User not found");

    const [invited, earned, reserve, recent] = await Promise.all([
      env.DB.prepare(`
        SELECT COUNT(*) AS total FROM users
        WHERE referred_by = ? AND email_verified = 1
      `).bind(account.ref_code).first(),

      env.DB.prepare(`
        SELECT COALESCE(SUM(amount_koinu), 0) AS total
        FROM referral_commissions WHERE referrer_uid = ?
      `).bind(user.sub).first(),

      env.DB.prepare(`
        SELECT payouts_enabled, available_koinu FROM referral_reserve WHERE id = 1
      `).first(),

      env.DB.prepare(`
        SELECT rc.id, rc.amount_koinu, rc.created_at,
          COALESCE(referred.username, 'Referred user') AS referred_username
        FROM referral_commissions rc
        JOIN users referred ON referred.uid = rc.referred_uid
        WHERE rc.referrer_uid = ?
        ORDER BY rc.id DESC LIMIT 20
      `).bind(user.sub).all()
    ]);

    return json({
      success: true,
      ref_code: account.ref_code,
      referred_by: account.referred_by,
      invited_count: Number(invited?.total || 0),
      commission_rate_bps: 1500,
      commission_enabled: Number(reserve?.payouts_enabled) === 1 && Number(reserve?.available_koinu || 0) >= 7500,
      commission_earned_koinu: Number(earned?.total || 0),
      recent_commissions: recent.results || []
    });
  }
  // LUCKY WHEEL ROUTES

  if (path === "/api/wheel/state" && method === "GET") {
    const user = await authenticate(request);

    await enforceRateLimit(
      env,
      `uid:${user.sub}`,
      "wheel_read",
      RATE_LIMIT_POLICIES.wheelRead
    );

    return json(await handleWheelState(env, user.sub));
  }

  if (path === "/api/wheel/spin" && method === "POST") {
    const user = await authenticate(request);

    await enforceRateLimit(
      env,
      `uid:${user.sub}`,
      "wheel_spin",
      RATE_LIMIT_POLICIES.wheelSpin
    );

    const body = await readJson(request);
    await verifyTurnstileToken(body.turnstileToken, request, env, "wheel_spin");

    return json(await handleWheelSpin(env, user.sub, body));
  }

  if (path === "/api/wheel/buy" && method === "POST") {
    const user = await authenticate(request);

    await enforceRateLimit(
      env,
      `uid:${user.sub}`,
      "wheel_buy",
      RATE_LIMIT_POLICIES.wheelBuy
    );

    const body = await readJson(request);
    await verifyTurnstileToken(body.turnstileToken, request, env, "wheel_buy");

    return json(await handleWheelBuy(env, user.sub, body));
  }

  if (path === "/api/wheel/history" && method === "GET") {
    const user = await authenticate(request);

    await enforceRateLimit(
      env,
      `uid:${user.sub}`,
      "wheel_read",
      RATE_LIMIT_POLICIES.wheelRead
    );

    return json(await handleWheelHistory(env, user.sub));
  }

  // ==========================================
  // FAUCET CLAIM + LEDGER + IDEMPOTENCY
  // ==========================================

  if (path === "/api/claim" && method === "POST") {
    const user = await authenticate(request);

    await enforceRateLimit(
      env,
      `uid:${user.sub}`,
      "claim",
      RATE_LIMIT_POLICIES.claim
    );

    const body = await readJson(request);
    await verifyTurnstileToken(body.turnstileToken, request, env, "claim");
    const requestId = getRequestId(body);
    const plan = await getUserPlan(env, user.sub);

    const existing = await getExistingClaim(env, user.sub, requestId);

    if (existing) {
      return json(
        await buildClaimResponse(env, user.sub, plan, existing, true)
      );
    }

    let results;

    try {
      results = await env.DB.batch([
        env.DB.prepare(`
          UPDATE users
          SET
            balance_koinu = balance_koinu + ?,
            last_claim_at = CURRENT_TIMESTAMP
          WHERE uid = ?
            AND (
              last_claim_at IS NULL
              OR last_claim_at <= datetime('now', ?)
            )
            AND (
              SELECT COUNT(*)
              FROM claims
              WHERE claims.uid = users.uid
                AND date(claims.claimed_at) = date('now')
            ) < ?
        `).bind(
          plan.amount_koinu,
          user.sub,
          `-${plan.cooldown_seconds} seconds`,
          plan.daily_limit
        ),

        env.DB.prepare(`
          INSERT INTO claims (uid, amount_koinu, request_id)
          SELECT ?, ?, ?
          WHERE changes() = 1
        `).bind(user.sub, plan.amount_koinu, requestId),

        env.DB.prepare(`
          INSERT INTO ledger_transactions (
            uid,
            transaction_type,
            amount_koinu,
            balance_before_koinu,
            balance_after_koinu,
            reference_type,
            reference_id,
            idempotency_key
          )
          SELECT
            u.uid,
            'claim',
            c.amount_koinu,
            u.balance_koinu - c.amount_koinu,
            u.balance_koinu,
            'claim',
            CAST(c.id AS TEXT),
            'claim:' || u.uid || ':' || c.request_id
          FROM users u
          JOIN claims c
            ON c.uid = u.uid
           AND c.request_id = ?
          WHERE u.uid = ?
            AND changes() = 1
        `).bind(requestId, user.sub),

        env.DB.prepare(`
          SELECT CASE
            WHEN changes() != 1
            THEN abs(-9223372036854775808)
            ELSE 1
          END
        `),

        env.DB.prepare(`
          INSERT INTO referral_commissions (claim_id, referred_uid, referrer_uid, amount_koinu, rate_bps)
          SELECT c.id, c.uid, r.uid,
            CAST((c.amount_koinu * 1500) / 10000 AS INTEGER), 1500
          FROM claims c
          JOIN users referred ON referred.uid = c.uid
          JOIN users r ON r.ref_code = referred.referred_by
            AND r.email_verified = 1 AND r.uid != referred.uid
          JOIN referral_reserve reserve ON reserve.id = 1
            AND reserve.payouts_enabled = 1
          WHERE c.uid = ? AND c.request_id = ?
            AND c.amount_koinu > 0
            AND CAST((c.amount_koinu * 1500) / 10000 AS INTEGER) > 0
            AND reserve.available_koinu >= CAST((c.amount_koinu * 1500) / 10000 AS INTEGER)
            AND changes() = 1
        `).bind(user.sub, requestId),

        env.DB.prepare(`
          UPDATE referral_reserve
          SET available_koinu = available_koinu - (
            SELECT amount_koinu FROM referral_commissions
            WHERE claim_id = (SELECT id FROM claims WHERE uid = ? AND request_id = ?)
          ), updated_at = CURRENT_TIMESTAMP
          WHERE id = 1 AND payouts_enabled = 1 AND changes() = 1
            AND available_koinu >= (
              SELECT amount_koinu FROM referral_commissions
              WHERE claim_id = (SELECT id FROM claims WHERE uid = ? AND request_id = ?)
            )
        `).bind(user.sub, requestId, user.sub, requestId),

        env.DB.prepare(`
          UPDATE users
          SET balance_koinu = balance_koinu + (
            SELECT amount_koinu FROM referral_commissions
            WHERE claim_id = (SELECT id FROM claims WHERE uid = ? AND request_id = ?)
          )
          WHERE uid = (
            SELECT referrer_uid FROM referral_commissions
            WHERE claim_id = (SELECT id FROM claims WHERE uid = ? AND request_id = ?)
          ) AND changes() = 1
        `).bind(user.sub, requestId, user.sub, requestId),

        env.DB.prepare(`
          INSERT INTO ledger_transactions (
            uid, transaction_type, amount_koinu, balance_before_koinu,
            balance_after_koinu, reference_type, reference_id, idempotency_key
          )
          SELECT u.uid, 'referral_commission', rc.amount_koinu,
            u.balance_koinu - rc.amount_koinu, u.balance_koinu,
            'referral_commission', CAST(rc.id AS TEXT),
            'referral_claim:' || rc.claim_id
          FROM referral_commissions rc
          JOIN users u ON u.uid = rc.referrer_uid
          WHERE rc.claim_id = (SELECT id FROM claims WHERE uid = ? AND request_id = ?)
            AND changes() = 1
        `).bind(user.sub, requestId),

        env.DB.prepare(`
          SELECT CASE WHEN EXISTS (
            SELECT 1 FROM referral_commissions rc
            WHERE rc.claim_id = (SELECT id FROM claims WHERE uid = ? AND request_id = ?)
              AND NOT EXISTS (
                SELECT 1 FROM ledger_transactions lt
                WHERE lt.idempotency_key = 'referral_claim:' || rc.claim_id
              )
          ) THEN abs(-9223372036854775808) ELSE 1 END
        `).bind(user.sub, requestId)
      ]);
    } catch (error) {
      const concurrentClaim = await getExistingClaim(
        env,
        user.sub,
        requestId
      );

      if (concurrentClaim) {
        return json(
          await buildClaimResponse(
            env,
            user.sub,
            plan,
            concurrentClaim,
            true
          )
        );
      }

      const errorText = [
        error?.message,
        error?.cause?.message
      ].filter(Boolean).join(" ");

      if (errorText.includes("INSUFFICIENT_FAUCET_RESERVE")) {
        throw new HttpError(
          503,
          "Faucet temporarily unavailable. Please try again later."
        );
      }

      const account = await getAccount(env, user.sub, plan);

      if (!account) {
        throw new HttpError(404, "User not synchronized");
      }

      const dailyUsed = Number(account.daily_claims_used || 0);

      if (dailyUsed >= plan.daily_limit) {
        throw new HttpError(429, "Daily claim limit reached", {
          reason: "daily_limit",
          plan: plan.name,
          daily_claims_used: dailyUsed,
          daily_limit: plan.daily_limit,
          daily_claims_remaining: 0
        });
      }

      if (Number(account.cooldown_remaining) > 0) {
        throw new HttpError(
          429,
          "Cooldown active. Please wait before claiming again.",
          {
            reason: "cooldown",
            plan: plan.name,
            cooldown_remaining: account.cooldown_remaining
          }
        );
      }

      throw new HttpError(
        409,
        "Claim could not be completed. Please try again."
      );
    }

    // The batch is atomic and its last statement aborts it unless every step
    // changed exactly one row. D1 also counts rows changed by triggers (e.g. the
    // faucet_reserve deduction on claims), so meta.changes can legitimately be
    // greater than 1 here. Only treat "no row changed" as a failure.
    if (
      results[0].meta.changes < 1 ||
      results[1].meta.changes < 1 ||
      results[2].meta.changes < 1
    ) {
      throw new HttpError(500, "Claim transaction could not be confirmed");
    }

    const savedClaim = await getExistingClaim(env, user.sub, requestId);

    if (!savedClaim) {
      throw new HttpError(500, "Claim record could not be confirmed");
    }

    return json(
      await buildClaimResponse(
        env,
        user.sub,
        plan,
        savedClaim,
        false
      )
    );
  }

  // CLAIM HISTORY

  if (path === "/api/claims" && method === "GET") {
    const user = await authenticate(request);

    const result = await env.DB.prepare(`
      SELECT id, amount_koinu, claimed_at
      FROM claims
      WHERE uid = ?
      ORDER BY id DESC
      LIMIT 50
    `).bind(user.sub).all();

    return json({
      success: true,
      claims: result.results || []
    });
  }

  // ==========================================
  // DAILY STREAKS
  // ==========================================

  if (path === "/api/streak" && method === "GET") {
    const user = await authenticate(request);

    return json({
      success: true,
      ...(await getStreakInfo(env, user.sub))
    });
  }

  if (path === "/api/streak/checkin" && method === "POST") {
    const user = await authenticate(request);

    await enforceRateLimit(
      env,
      `uid:${user.sub}`,
      "streak_checkin",
      RATE_LIMIT_POLICIES.streakCheckin
    );

    return json(
      await handleStreakCheckin(env, user.sub)
    );
  }

  // BALANCE

  if (path === "/api/balance" && method === "GET") {
    const user = await authenticate(request);
    const plan = await getUserPlan(env, user.sub);
    const account = await getAccount(env, user.sub, plan);

    if (!account) {
      throw new HttpError(404, "User not found");
    }

    const dailyUsed = Number(account.daily_claims_used || 0);

    return json({
      success: true,
      balance_koinu: Number(account.balance_koinu),
      last_claim_at: account.last_claim_at,
      cooldown_remaining: Number(account.cooldown_remaining),
      cooldown_seconds: plan.cooldown_seconds,
      claim_amount_koinu: plan.amount_koinu,
      min_withdrawal_koinu: MIN_WITHDRAWAL_KOINU,
      plan: plan.name,
      daily_claims_used: dailyUsed,
      daily_limit: plan.daily_limit,
      daily_claims_remaining: Math.max(0, plan.daily_limit - dailyUsed)
    });
  }

  // ==========================================
  // CREATE WITHDRAWAL + LEDGER
  // ==========================================

  if (path === "/api/withdrawals" && method === "POST") {
    const user = await authenticate(request);

    await enforceRateLimit(
      env,
      `uid:${user.sub}`,
      "withdrawal_create",
      RATE_LIMIT_POLICIES.withdrawalCreate
    );

    const body = await readJson(request);
    await verifyTurnstileToken(body.turnstileToken, request, env, "withdraw");

    const amount = body.amount_koinu;

    const wallet =
      typeof body.wallet_address === "string"
        ? body.wallet_address.trim()
        : "";

    if (
      !Number.isSafeInteger(amount) ||
      amount < MIN_WITHDRAWAL_KOINU
    ) {
      throw new HttpError(400, "Minimum withdrawal is 1 DOGE");
    }

    if (!(await isValidDogeAddress(wallet))) {
      throw new HttpError(400, "Invalid DOGE wallet address");
    }

    const pending = await env.DB.prepare(`
      SELECT id
      FROM withdrawals
      WHERE uid = ?
        AND status = 'pending'
      LIMIT 1
    `).bind(user.sub).first();

    if (pending) {
      throw new HttpError(
        409,
        "You already have a pending withdrawal request."
      );
    }

    let results;

    try {
      results = await env.DB.batch([
        env.DB.prepare(`
          UPDATE users
          SET balance_koinu = balance_koinu - ?
          WHERE uid = ?
            AND balance_koinu >= ?
        `).bind(amount, user.sub, amount),

        env.DB.prepare(`
          INSERT INTO withdrawals (
            uid,
            amount_koinu,
            wallet_address,
            status
          )
          SELECT ?, ?, ?, 'pending'
          WHERE changes() = 1
            AND NOT EXISTS (
              SELECT 1
              FROM withdrawals
              WHERE uid = ?
                AND status = 'pending'
            )
        `).bind(user.sub, amount, wallet, user.sub),

        env.DB.prepare(`
          INSERT INTO ledger_transactions (
            uid,
            transaction_type,
            amount_koinu,
            balance_before_koinu,
            balance_after_koinu,
            reference_type,
            reference_id,
            idempotency_key
          )
          SELECT
            u.uid,
            'withdrawal',
            -?,
            u.balance_koinu + ?,
            u.balance_koinu,
            'withdrawal',
            CAST(last_insert_rowid() AS TEXT),
            'withdrawal:' || u.uid || ':' || last_insert_rowid()
          FROM users u
          WHERE u.uid = ?
            AND changes() = 1
        `).bind(amount, amount, user.sub),

        env.DB.prepare(`
          SELECT CASE
            WHEN changes() != 1
            THEN abs(-9223372036854775808)
            ELSE 1
          END
        `)
      ]);
    } catch (error) {
      const currentPending = await env.DB.prepare(`
        SELECT id
        FROM withdrawals
        WHERE uid = ?
          AND status = 'pending'
        LIMIT 1
      `).bind(user.sub).first();

      if (currentPending) {
        throw new HttpError(
          409,
          "You already have a pending withdrawal request."
        );
      }

      const account = await getAccount(env, user.sub);

      if (!account) {
        throw new HttpError(404, "User not found");
      }

      if (Number(account.balance_koinu) < amount) {
        throw new HttpError(400, "Insufficient balance");
      }

      throw new HttpError(
        409,
        "Withdrawal request could not be completed."
      );
    }

    if (
      results[0].meta.changes !== 1 ||
      results[1].meta.changes !== 1 ||
      results[2].meta.changes !== 1
    ) {
      throw new HttpError(
        500,
        "Withdrawal transaction could not be confirmed"
      );
    }

    const withdrawal = await env.DB.prepare(`
      SELECT
        id,
        amount_koinu,
        wallet_address,
        status,
        created_at
      FROM withdrawals
      WHERE id = ? AND uid = ?
    `).bind(results[1].meta.last_row_id, user.sub).first();

    if (!withdrawal) {
      throw new HttpError(500, "Withdrawal record could not be confirmed");
    }

    return json({
      success: true,
      message: "Withdrawal request submitted",
      withdrawal
    });
  }

  // USER WITHDRAWAL HISTORY

  if (path === "/api/withdrawals" && method === "GET") {
    const user = await authenticate(request);

    const result = await env.DB.prepare(`
      SELECT
        id,
        amount_koinu,
        wallet_address,
        status,
        created_at
      FROM withdrawals
      WHERE uid = ?
      ORDER BY id DESC
      LIMIT 100
    `).bind(user.sub).all();

    return json({
      success: true,
      withdrawals: result.results || []
    });
  }

  // ==========================================
  // PTC ADS: USER VIEWING AND PENDING REWARDS
  // ==========================================

  if (path === "/api/ptc/ads" && method === "GET") {
    const user = await authenticate(request);
    await enforceRateLimit(env, `uid:${user.sub}`, "ptc_read", RATE_LIMIT_POLICIES.ptcRead);

    const result = await env.DB.prepare(`
      SELECT id, title, description, advertiser_name, target_url,
             reward_koinu, duration_seconds, max_views, views_completed,
             remaining_budget_koinu
      FROM ptc_campaigns
      WHERE status = 'active'
        AND remaining_budget_koinu >= reward_koinu
        AND views_completed < max_views
      ORDER BY id DESC
      LIMIT 50
    `).all();

    return json({ success: true, ads: result.results || [] });
  }

  if (path === "/api/ptc/history" && method === "GET") {
    const user = await authenticate(request);
    await enforceRateLimit(env, `uid:${user.sub}`, "ptc_read", RATE_LIMIT_POLICIES.ptcRead);

    const [history, totals] = await Promise.all([
      env.DB.prepare(`
        SELECT v.id, v.campaign_id, c.title,
               CASE WHEN si.view_id IS NOT NULL THEN 'settled' ELSE v.status END AS status,
               v.reward_koinu, v.started_at, v.completed_at
        FROM ptc_views v
        JOIN ptc_campaigns c ON c.id = v.campaign_id
        LEFT JOIN ptc_settlement_items si ON si.view_id = v.id
        WHERE v.uid = ?
        ORDER BY v.id DESC
        LIMIT 50
      `).bind(user.sub).all(),
      env.DB.prepare(`
        SELECT
          COALESCE(SUM(CASE
            WHEN v.status = 'completed' AND si.view_id IS NULL THEN v.reward_koinu
            ELSE 0
          END), 0) AS pending_koinu,
          COALESCE(SUM(CASE
            WHEN si.view_id IS NOT NULL THEN v.reward_koinu
            ELSE 0
          END), 0) AS settled_koinu,
          COUNT(CASE WHEN v.status = 'completed' AND si.view_id IS NULL THEN 1 END) AS completed_views,
          COUNT(CASE WHEN si.view_id IS NOT NULL THEN 1 END) AS settled_views
        FROM ptc_views v
        LEFT JOIN ptc_settlement_items si ON si.view_id = v.id
        WHERE v.uid = ?
      `).bind(user.sub).first()
    ]);

    return json({
      success: true,
      history: history.results || [],
      pending_reward_koinu: Number(totals?.pending_koinu || 0),
      settled_reward_koinu: Number(totals?.settled_koinu || 0),
      completed_views: Number(totals?.completed_views || 0),
      settled_views: Number(totals?.settled_views || 0),
      reward_status: Number(totals?.pending_koinu || 0) > 0
        ? "pending_not_withdrawable"
        : "settled_rewards_credited_to_balance"
    });
  }

  if (path === "/api/ptc/start" && method === "POST") {
    const user = await authenticate(request);
    await enforceRateLimit(env, `uid:${user.sub}`, "ptc_start", RATE_LIMIT_POLICIES.ptcStart);

    const body = await readJson(request);
    const campaignId = Number(body.campaign_id);
    if (!Number.isSafeInteger(campaignId) || campaignId < 1) {
      throw new HttpError(400, "Invalid PTC campaign.");
    }

    const account = await env.DB.prepare(
      "SELECT uid FROM users WHERE uid = ? AND email_verified = 1"
    ).bind(user.sub).first();
    if (!account) throw new HttpError(403, "Verified account required.");

    const token = crypto.randomUUID();
    const tokenDigest = await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(token)
    );
    const tokenHash = Array.from(new Uint8Array(tokenDigest),
      byte => byte.toString(16).padStart(2, "0")).join("");

    const started = await env.DB.prepare(`
      INSERT INTO ptc_views (uid, campaign_id, utc_date, view_token_hash)
      SELECT ?, c.id, date('now'), ?
      FROM ptc_campaigns c
      WHERE c.id = ?
        AND c.status = 'active'
        AND c.remaining_budget_koinu >= c.reward_koinu
        AND c.views_completed < c.max_views
        AND NOT EXISTS (
          SELECT 1 FROM ptc_views v
          WHERE v.uid = ? AND v.campaign_id = c.id AND v.utc_date = date('now')
        )
      RETURNING id, started_at
    `).bind(user.sub, tokenHash, campaignId, user.sub).first();

    if (!started?.id) {
      throw new HttpError(409, "This ad is unavailable or you have already viewed it today.");
    }

    return json({
      success: true,
      view_id: Number(started.id),
      view_token: token,
      started_at: started.started_at
    }, 201);
  }

  if (path === "/api/ptc/complete" && method === "POST") {
    const user = await authenticate(request);
    await enforceRateLimit(env, `uid:${user.sub}`, "ptc_complete", RATE_LIMIT_POLICIES.ptcComplete);

    const body = await readJson(request);
    await verifyTurnstileToken(body.turnstileToken, request, env, "ptc_complete");

    const viewId = Number(body.view_id);
    const viewToken = typeof body.view_token === "string" ? body.view_token : "";
    if (!Number.isSafeInteger(viewId) || viewId < 1 || !/^[0-9a-f-]{36}$/i.test(viewToken)) {
      throw new HttpError(400, "Invalid PTC view session.");
    }

    const tokenDigest = await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(viewToken)
    );
    const tokenHash = Array.from(new Uint8Array(tokenDigest),
      byte => byte.toString(16).padStart(2, "0")).join("");

    const view = await env.DB.prepare(`
      SELECT v.id, v.status, v.started_at, c.duration_seconds,
             c.reward_koinu, c.status AS campaign_status,
             c.remaining_budget_koinu, c.views_completed, c.max_views
      FROM ptc_views v
      JOIN ptc_campaigns c ON c.id = v.campaign_id
      WHERE v.id = ? AND v.uid = ? AND v.view_token_hash = ?
    `).bind(viewId, user.sub, tokenHash).first();

    if (!view) throw new HttpError(404, "PTC view session not found.");
    if (view.status === "completed") {
      return json({
        success: true,
        already_completed: true,
        reward_koinu: Number(view.reward_koinu),
        reward_status: "pending_not_withdrawable"
      });
    }
    if (view.status !== "started") throw new HttpError(409, "This PTC view session is no longer active.");

    const elapsedSeconds = Math.floor((Date.now() - new Date(view.started_at.replace(" ", "T") + "Z").getTime()) / 1000);
    const requiredSeconds = Number(view.duration_seconds);
    if (!Number.isFinite(elapsedSeconds) || elapsedSeconds < requiredSeconds) {
      throw new HttpError(409, "The viewing timer has not finished.", {
        seconds_remaining: Math.max(1, requiredSeconds - Math.max(0, elapsedSeconds))
      });
    }
    if (view.campaign_status !== "active" ||
        Number(view.remaining_budget_koinu) < Number(view.reward_koinu) ||
        Number(view.views_completed) >= Number(view.max_views)) {
      throw new HttpError(409, "This campaign is no longer available.");
    }

    let results;
    try {
      results = await env.DB.batch([
        env.DB.prepare(`
          UPDATE ptc_views
          SET status = 'completed',
              reward_koinu = (SELECT reward_koinu FROM ptc_campaigns WHERE id = ptc_views.campaign_id),
              completed_at = CURRENT_TIMESTAMP
          WHERE id = ? AND uid = ? AND view_token_hash = ? AND status = 'started'
            AND started_at <= datetime('now', '-' || (
              SELECT duration_seconds FROM ptc_campaigns WHERE id = ptc_views.campaign_id
            ) || ' seconds')
            AND EXISTS (
              SELECT 1 FROM ptc_campaigns c
              WHERE c.id = ptc_views.campaign_id
                AND c.status = 'active'
                AND c.remaining_budget_koinu >= c.reward_koinu
                AND c.views_completed < c.max_views
            )
        `).bind(viewId, user.sub, tokenHash),

        env.DB.prepare(`
          UPDATE ptc_campaigns
          SET remaining_budget_koinu = remaining_budget_koinu - reward_koinu,
              views_completed = views_completed + 1,
              updated_at = CURRENT_TIMESTAMP
          WHERE id = (SELECT campaign_id FROM ptc_views WHERE id = ? AND uid = ? AND status = 'completed')
            AND status = 'active'
            AND remaining_budget_koinu >= reward_koinu
            AND views_completed < max_views
            AND changes() = 1
        `).bind(viewId, user.sub),

        env.DB.prepare(`
          UPDATE ptc_reserve
          SET locked_koinu = locked_koinu - ?,
              pending_koinu = pending_koinu + ?,
              updated_at = CURRENT_TIMESTAMP
          WHERE id = 1 AND locked_koinu >= ? AND changes() = 1
        `).bind(Number(view.reward_koinu), Number(view.reward_koinu), Number(view.reward_koinu)),

        env.DB.prepare(`
          SELECT CASE WHEN changes() != 1
            THEN abs(-9223372036854775808)
            ELSE 1
          END
        `)
      ]);
    } catch (error) {
      const current = await env.DB.prepare(
        "SELECT status, reward_koinu FROM ptc_views WHERE id = ? AND uid = ?"
      ).bind(viewId, user.sub).first();

      if (current?.status === "completed") {
        return json({
          success: true,
          already_completed: true,
          reward_koinu: Number(current.reward_koinu),
          reward_status: "pending_not_withdrawable"
        });
      }
      console.error("PTC completion transaction failed:", error);
      throw new HttpError(409, "PTC reward could not be confirmed. Please retry the same view.");
    }

    if (results[0].meta.changes !== 1 ||
        results[1].meta.changes !== 1 ||
        results[2].meta.changes !== 1) {
      throw new HttpError(409, "PTC reward transaction could not be confirmed.");
    }

    return json({
      success: true,
      reward_koinu: Number(view.reward_koinu),
      reward_status: "pending_not_withdrawable",
      message: "View completed. Reward is pending reserve settlement and is not withdrawable yet."
    });
  }

  // ==========================================
  // PTC ADS: ADMIN CAMPAIGNS AND RESERVE
  // ==========================================

  if (path === "/api/admin/ptc" && method === "GET") {
    const user = await authenticate(request);
    await requireAdmin(user, env);
    await enforceRateLimit(env, `uid:${user.sub}`, "admin_ptc", RATE_LIMIT_POLICIES.adminPtc);

    const [campaigns, reserve, funding, pendingSettlements] = await Promise.all([
      env.DB.prepare(`
        SELECT id, title, advertiser_name, target_url, reward_koinu,
               duration_seconds, max_views, total_budget_koinu,
               remaining_budget_koinu, views_completed, status,
               advertiser_payment_reference, payment_verified_at, created_at
        FROM ptc_campaigns ORDER BY id DESC LIMIT 200
      `).all(),
      env.DB.prepare("SELECT available_koinu, locked_koinu, pending_koinu FROM ptc_reserve WHERE id = 1").first(),
      env.DB.prepare(`
        SELECT id, amount_koinu, external_reference, notes, created_at
        FROM ptc_funding_events ORDER BY id DESC LIMIT 30
      `).all(),
      env.DB.prepare(`
        SELECT v.uid, u.email, u.username,
               COALESCE(SUM(v.reward_koinu), 0) AS amount_koinu,
               COUNT(*) AS views_count
        FROM ptc_views v
        JOIN users u ON u.uid = v.uid
        WHERE v.status = 'completed'
          AND NOT EXISTS (
            SELECT 1 FROM ptc_settlement_items si WHERE si.view_id = v.id
          )
        GROUP BY v.uid
        HAVING SUM(v.reward_koinu) > 0
        ORDER BY amount_koinu DESC
        LIMIT 200
      `).all()
    ]);

    return json({
      success: true,
      campaigns: campaigns.results || [],
      reserve: {
        available_koinu: Number(reserve?.available_koinu || 0),
        locked_koinu: Number(reserve?.locked_koinu || 0),
        pending_koinu: Number(reserve?.pending_koinu || 0)
      },
      funding_events: funding.results || [],
      pending_settlements: pendingSettlements.results || []
    });
  }

  // Settlement is idempotent per completed view and is backed by ptc_reserve.pending_koinu.
  if (path === "/api/admin/ptc/settle" && method === "POST") {
    const user = await authenticate(request);
    const admin = await requireAdmin(user, env);
    await enforceRateLimit(env, `uid:${user.sub}`, "admin_ptc", RATE_LIMIT_POLICIES.adminPtc);

    const body = await readJson(request);
    const uid = typeof body.uid === "string" ? body.uid.trim() : "";
    if (!uid || uid.length > 128) throw new HttpError(400, "Invalid user account.");

    const summary = await env.DB.prepare(`
      SELECT COALESCE(SUM(v.reward_koinu), 0) AS amount_koinu, COUNT(*) AS views_count
      FROM ptc_views v
      WHERE v.uid = ? AND v.status = 'completed'
        AND NOT EXISTS (
          SELECT 1 FROM ptc_settlement_items si WHERE si.view_id = v.id
        )
    `).bind(uid).first();

    const amount = Number(summary?.amount_koinu || 0);
    const viewsCount = Number(summary?.views_count || 0);
    if (!Number.isSafeInteger(amount) || amount <= 0 || !Number.isSafeInteger(viewsCount) || viewsCount <= 0) {
      throw new HttpError(409, "This user has no pending PTC rewards to settle.");
    }

    const settlementId = crypto.randomUUID();
    try {
      const results = await env.DB.batch([
        env.DB.prepare(`
          INSERT INTO ptc_settlements
            (id, uid, amount_koinu, views_count, settled_by, idempotency_key)
          SELECT ?, v.uid, SUM(v.reward_koinu), COUNT(*), ?, ?
          FROM ptc_views v
          WHERE v.uid = ? AND v.status = 'completed'
            AND NOT EXISTS (
              SELECT 1 FROM ptc_settlement_items si WHERE si.view_id = v.id
            )
          GROUP BY v.uid
          HAVING SUM(v.reward_koinu) = ?
             AND COUNT(*) = ?
             AND COALESCE(
               (SELECT pending_koinu FROM ptc_reserve WHERE id = 1),
               -1
             ) >= SUM(v.reward_koinu)
        `).bind(settlementId, admin.uid, `ptc_settlement:${uid}:${settlementId}`, uid, amount, viewsCount),

        env.DB.prepare(`
          INSERT INTO ptc_settlement_items (view_id, settlement_id, uid, amount_koinu)
          SELECT v.id, ?, v.uid, v.reward_koinu
          FROM ptc_views v
          WHERE v.uid = ? AND v.status = 'completed'
            AND NOT EXISTS (
              SELECT 1 FROM ptc_settlement_items si WHERE si.view_id = v.id
            )
            AND EXISTS (
              SELECT 1 FROM ptc_settlements ps
              WHERE ps.id = ? AND ps.uid = v.uid
            )
        `).bind(settlementId, uid, settlementId),

        env.DB.prepare(`
          UPDATE ptc_reserve
          SET pending_koinu = pending_koinu - (
                SELECT amount_koinu FROM ptc_settlements WHERE id = ?
              ),
              updated_at = CURRENT_TIMESTAMP
          WHERE id = 1
            AND pending_koinu >= (SELECT amount_koinu FROM ptc_settlements WHERE id = ?)
            AND changes() = (SELECT views_count FROM ptc_settlements WHERE id = ?)
        `).bind(settlementId, settlementId, settlementId),

        env.DB.prepare(`
          UPDATE users
          SET balance_koinu = balance_koinu + (
                SELECT amount_koinu FROM ptc_settlements WHERE id = ?
              )
          WHERE uid = ?
            AND changes() = 1
            AND EXISTS (SELECT 1 FROM ptc_settlements WHERE id = ?)
        `).bind(settlementId, uid, settlementId),

        env.DB.prepare(`
          INSERT INTO ledger_transactions (
            uid, transaction_type, amount_koinu,
            balance_before_koinu, balance_after_koinu,
            reference_type, reference_id, idempotency_key
          )
          SELECT u.uid, 'ptc_reward', ps.amount_koinu,
                 u.balance_koinu - ps.amount_koinu, u.balance_koinu,
                 'ptc_settlement', ps.id, ps.idempotency_key
          FROM users u
          JOIN ptc_settlements ps ON ps.uid = u.uid
          WHERE u.uid = ? AND ps.id = ? AND changes() = 1
        `).bind(uid, settlementId),

        env.DB.prepare(`
          SELECT CASE WHEN changes() != 1
            THEN abs(-9223372036854775808)
            ELSE 1
          END
        `)
      ]);

      if (
        Number(results[0]?.meta?.changes || 0) !== 1 ||
        Number(results[1]?.meta?.changes || 0) !== viewsCount ||
        Number(results[2]?.meta?.changes || 0) !== 1 ||
        Number(results[3]?.meta?.changes || 0) !== 1 ||
        Number(results[4]?.meta?.changes || 0) !== 1
      ) {
        throw new Error("PTC settlement transaction was not confirmed.");
      }
    } catch (error) {
      console.error("PTC reward settlement failed:", error);
      throw new HttpError(409, "Settlement could not be completed. Pending rewards and balances were not changed.");
    }

    return json({
      success: true,
      settlement_id: settlementId,
      uid,
      amount_koinu: amount,
      views_count: viewsCount,
      status: "settled"
    }, 201);
  }

  if (path === "/api/admin/ptc/fund" && method === "POST") {
    const user = await authenticate(request);
    await requireAdmin(user, env);
    await enforceRateLimit(env, `uid:${user.sub}`, "admin_ptc", RATE_LIMIT_POLICIES.adminPtc);

    const body = await readJson(request);
    const amount = body.amount_koinu;
    const reference = typeof body.external_reference === "string" ? body.external_reference.trim() : "";
    const notes = typeof body.notes === "string" ? body.notes.trim() : "";

    if (!Number.isSafeInteger(amount) || amount < 1 || amount > 1000000000000) {
      throw new HttpError(400, "Enter a valid DOGE reserve amount in koinu.");
    }
    if (reference.length < 6 || reference.length > 120) {
      throw new HttpError(400, "A verified external transaction reference is required.");
    }
    if (body.externally_verified !== true) {
      throw new HttpError(400, "Confirm that the incoming DOGE transaction was checked externally.");
    }
    if (notes.length > 300) throw new HttpError(400, "Notes cannot exceed 300 characters.");

    try {
      const results = await env.DB.batch([
        env.DB.prepare(`
          INSERT INTO ptc_funding_events (admin_uid, amount_koinu, external_reference, notes)
          VALUES (?, ?, ?, ?)
        `).bind(user.sub, amount, reference, notes || null),
        env.DB.prepare(`
          UPDATE ptc_reserve
          SET available_koinu = available_koinu + ?, updated_at = CURRENT_TIMESTAMP
          WHERE id = 1 AND changes() = 1
        `).bind(amount),
        env.DB.prepare("SELECT CASE WHEN changes() != 1 THEN abs(-9223372036854775808) ELSE 1 END")
      ]);
      if (results[0].meta.changes !== 1 || results[1].meta.changes !== 1) {
        throw new Error("PTC reserve funding was not committed.");
      }
    } catch (error) {
      if (String(error?.message || "").includes("UNIQUE")) {
        throw new HttpError(409, "This external funding reference has already been recorded.");
      }
      throw new HttpError(409, "PTC reserve funding could not be confirmed.");
    }

    return json({ success: true, available_koinu_added: amount }, 201);
  }

  if (path === "/api/admin/ptc/campaigns" && method === "POST") {
    const user = await authenticate(request);
    await requireAdmin(user, env);
    await enforceRateLimit(env, `uid:${user.sub}`, "admin_ptc", RATE_LIMIT_POLICIES.adminPtc);

    const body = await readJson(request);
    const title = typeof body.title === "string" ? body.title.trim() : "";
    const description = typeof body.description === "string" ? body.description.trim() : "";
    const advertiser = typeof body.advertiser_name === "string" ? body.advertiser_name.trim() : "";
    const paymentReference = typeof body.advertiser_payment_reference === "string"
      ? body.advertiser_payment_reference.trim() : "";
    const reward = body.reward_koinu;
    const duration = body.duration_seconds;
    const maxViews = body.max_views;
    const budget = body.total_budget_koinu;

    if (title.length < 3 || title.length > 80) throw new HttpError(400, "Campaign title must be 3-80 characters.");
    if (description.length < 10 || description.length > 500) throw new HttpError(400, "Description must be 10-500 characters.");
    if (advertiser.length < 2 || advertiser.length > 80) throw new HttpError(400, "Advertiser name must be 2-80 characters.");
    if (paymentReference.length < 5 || paymentReference.length > 120) throw new HttpError(400, "Verified advertiser payment reference is required.");
    if (body.payment_verified !== true) throw new HttpError(400, "Confirm that advertiser payment was verified.");
    if (!Number.isSafeInteger(reward) || reward < 1 || reward > 100000000) throw new HttpError(400, "Invalid reward amount.");
    if (!Number.isSafeInteger(duration) || duration < 10 || duration > 180) throw new HttpError(400, "Viewing duration must be 10-180 seconds.");
    if (!Number.isSafeInteger(maxViews) || maxViews < 1 || maxViews > 10000000) throw new HttpError(400, "Invalid maximum views.");
    if (!Number.isSafeInteger(budget) || budget < reward || budget > 1000000000000 || budget > reward * maxViews) {
      throw new HttpError(400, "Campaign budget must cover at least one view and cannot exceed reward × max views.");
    }
    const targetUrl = validatePublicHttpUrl(body.target_url, "target URL");

    const inserted = await env.DB.prepare(`
      INSERT INTO ptc_campaigns (
        title, description, advertiser_name, target_url, reward_koinu,
        duration_seconds, max_views, total_budget_koinu,
        remaining_budget_koinu, advertiser_payment_reference,
        payment_verified_by, created_by
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      RETURNING id, status
    `).bind(
      title, description, advertiser, targetUrl, reward, duration,
      maxViews, budget, budget, paymentReference, user.sub, user.sub
    ).first();

    if (!inserted?.id) throw new HttpError(500, "PTC campaign could not be created.");
    return json({ success: true, campaign_id: Number(inserted.id), status: inserted.status }, 201);
  }

  const ptcCampaignMatch = path.match(/^\/api\/admin\/ptc\/campaigns\/(\d+)$/);
  if (ptcCampaignMatch && method === "PUT") {
    const user = await authenticate(request);
    await requireAdmin(user, env);
    await enforceRateLimit(env, `uid:${user.sub}`, "admin_ptc", RATE_LIMIT_POLICIES.adminPtc);

    const campaignId = Number(ptcCampaignMatch[1]);
    const body = await readJson(request);
    const nextStatus = body.status;
    if (!Number.isSafeInteger(campaignId) || campaignId < 1) throw new HttpError(400, "Invalid campaign ID.");

    const campaign = await env.DB.prepare(`
      SELECT id, status, remaining_budget_koinu
      FROM ptc_campaigns WHERE id = ?
    `).bind(campaignId).first();
    if (!campaign) throw new HttpError(404, "PTC campaign not found.");

    if (nextStatus === "active" && campaign.status === "pending_review") {
      const remaining = Number(campaign.remaining_budget_koinu);
      const results = await env.DB.batch([
        env.DB.prepare(`
          UPDATE ptc_reserve
          SET available_koinu = available_koinu - ?,
              locked_koinu = locked_koinu + ?,
              updated_at = CURRENT_TIMESTAMP
          WHERE id = 1 AND available_koinu >= ?
        `).bind(remaining, remaining, remaining),
        env.DB.prepare(`
          UPDATE ptc_campaigns
          SET status = 'active', updated_at = CURRENT_TIMESTAMP
          WHERE id = ? AND status = 'pending_review' AND changes() = 1
        `).bind(campaignId),
        env.DB.prepare("SELECT CASE WHEN changes() != 1 THEN abs(-9223372036854775808) ELSE 1 END")
      ]);
      if (results[0].meta.changes !== 1 || results[1].meta.changes !== 1) {
        throw new HttpError(409, "Insufficient available PTC reserve or campaign status changed.");
      }
      return json({ success: true, status: "active" });
    }

    if (nextStatus === "active" && campaign.status === "paused") {
      const updated = await env.DB.prepare(`
        UPDATE ptc_campaigns SET status = 'active', updated_at = CURRENT_TIMESTAMP
        WHERE id = ? AND status = 'paused' AND remaining_budget_koinu > 0
      `).bind(campaignId).run();
      if (updated.meta.changes !== 1) throw new HttpError(409, "Campaign cannot be reactivated.");
      return json({ success: true, status: "active" });
    }

    if (nextStatus === "paused" && campaign.status === "active") {
      const updated = await env.DB.prepare(`
        UPDATE ptc_campaigns SET status = 'paused', updated_at = CURRENT_TIMESTAMP
        WHERE id = ? AND status = 'active'
      `).bind(campaignId).run();
      if (updated.meta.changes !== 1) throw new HttpError(409, "Campaign status changed.");
      return json({ success: true, status: "paused" });
    }

    if (nextStatus === "completed" && ["active", "paused"].includes(campaign.status)) {
      const remaining = Number(campaign.remaining_budget_koinu);
      const results = await env.DB.batch([
        env.DB.prepare(`
          UPDATE ptc_campaigns
          SET status = 'completed', remaining_budget_koinu = 0, updated_at = CURRENT_TIMESTAMP
          WHERE id = ? AND status IN ('active', 'paused')
        `).bind(campaignId),
        env.DB.prepare(`
          UPDATE ptc_reserve
          SET locked_koinu = locked_koinu - ?,
              available_koinu = available_koinu + ?,
              updated_at = CURRENT_TIMESTAMP
          WHERE id = 1 AND locked_koinu >= ? AND changes() = 1
        `).bind(remaining, remaining, remaining),
        env.DB.prepare("SELECT CASE WHEN changes() != 1 THEN abs(-9223372036854775808) ELSE 1 END")
      ]);
      if (results[0].meta.changes !== 1 || results[1].meta.changes !== 1) {
        throw new HttpError(409, "Campaign could not be completed and its unused budget released.");
      }
      return json({ success: true, status: "completed", released_koinu: remaining });
    }

    if (nextStatus === "rejected" && campaign.status === "pending_review") {
      const updated = await env.DB.prepare(`
        UPDATE ptc_campaigns SET status = 'rejected', updated_at = CURRENT_TIMESTAMP
        WHERE id = ? AND status = 'pending_review'
      `).bind(campaignId).run();
      if (updated.meta.changes !== 1) throw new HttpError(409, "Campaign status changed.");
      return json({ success: true, status: "rejected" });
    }

    throw new HttpError(400, "Unsupported PTC campaign status transition.");
  }

  // ADVERTISING: USER REQUESTS AND LIVE PLACEMENTS

  if (path === "/api/ads" && method === "GET") {
    const user = await authenticate(request);
    const result = await env.DB.prepare(`
      SELECT id, business_name, contact_email, website_url, banner_image_url,
             placement, duration_days, notes, status, quoted_price_eur,
             payment_reference, active_until, created_at, updated_at
      FROM advertising_requests
      WHERE uid = ?
      ORDER BY id DESC
      LIMIT 50
    `).bind(user.sub).all();

    return json({ success: true, requests: result.results || [] });
  }

  if (path === "/api/ads" && method === "POST") {
    const user = await authenticate(request);
    await enforceRateLimit(env, `uid:${user.sub}`, "ad_create", RATE_LIMIT_POLICIES.adCreate);

    const body = await readJson(request);
    const businessName = typeof body.business_name === "string" ? body.business_name.trim() : "";
    const contactEmail = typeof body.contact_email === "string" ? body.contact_email.trim().toLowerCase() : "";
    const notes = typeof body.notes === "string" ? body.notes.trim() : "";
    const placement = body.placement;
    const durationDays = Number(body.duration_days);

    if (businessName.length < 2 || businessName.length > 80) {
      throw new HttpError(400, "Business or project name must be 2-80 characters.");
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail) || contactEmail.length > 254) {
      throw new HttpError(400, "Enter a valid contact email.");
    }
    if (!["top", "bottom"].includes(placement)) {
      throw new HttpError(400, "Choose a valid advertising placement.");
    }
    if (![7, 14, 30].includes(durationDays)) {
      throw new HttpError(400, "Choose a duration of 7, 14, or 30 days.");
    }
    if (notes.length > 500) {
      throw new HttpError(400, "Campaign details cannot exceed 500 characters.");
    }

    const websiteUrl = validatePublicHttpUrl(body.website_url, "website URL");
    const bannerImageUrl = validatePublicHttpUrl(body.banner_image_url, "banner image URL");

    const inserted = await env.DB.prepare(`
      INSERT INTO advertising_requests (
        uid, business_name, contact_email, website_url, banner_image_url,
        placement, duration_days, notes, status
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending_review')
      RETURNING id
    `).bind(
      user.sub, businessName, contactEmail, websiteUrl, bannerImageUrl,
      placement, durationDays, notes || null
    ).first();

    if (!inserted?.id) throw new HttpError(500, "Advertising request could not be saved.");

    return json({ success: true, id: inserted.id, status: "pending_review" }, 201);
  }

  if (path === "/api/ads/placements" && method === "GET") {
    await authenticate(request);
    const result = await env.DB.prepare(`
      SELECT id, business_name, website_url, banner_image_url, placement
      FROM advertising_requests
      WHERE status = 'active'
        AND active_until IS NOT NULL
        AND datetime(active_until) > datetime('now')
      ORDER BY id DESC
    `).all();

    const placements = { top: null, bottom: null };
    for (const ad of (result.results || [])) {
      if (!placements[ad.placement]) placements[ad.placement] = ad;
    }
    return json({ success: true, placements });
  }

  const adPaymentMatch = path.match(/^\/api\/ads\/(\d+)\/payment$/);
  if (adPaymentMatch && method === "POST") {
    const user = await authenticate(request);
    await enforceRateLimit(env, `uid:${user.sub}`, "ad_payment_reference", RATE_LIMIT_POLICIES.adPaymentReference);
    const id = Number(adPaymentMatch[1]);
    const body = await readJson(request);
    const reference = typeof body.payment_reference === "string" ? body.payment_reference.trim() : "";

    if (!Number.isSafeInteger(id) || id < 1) throw new HttpError(400, "Invalid advertising request ID.");
    if (reference.length < 5 || reference.length > 120) throw new HttpError(400, "Payment reference must be 5-120 characters.");

    const updated = await env.DB.prepare(`
      UPDATE advertising_requests
      SET payment_reference = ?, status = 'payment_submitted', updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND uid = ? AND status = 'awaiting_payment'
    `).bind(reference, id, user.sub).run();

    if (updated.meta.changes !== 1) {
      throw new HttpError(409, "This request is not awaiting payment or does not belong to your account.");
    }
    return json({ success: true, status: "payment_submitted" });
  }

  // ADMIN: ADVERTISING REQUESTS

  if (path === "/api/admin/ads" && method === "GET") {
    const user = await authenticate(request);
    await requireAdmin(user, env);
    await enforceRateLimit(env, `uid:${user.sub}`, "admin_ads_read", RATE_LIMIT_POLICIES.adminRead);

    const result = await env.DB.prepare(`
      SELECT a.id, a.uid, u.email AS account_email, a.business_name,
             a.contact_email, a.website_url, a.banner_image_url,
             a.placement, a.duration_days, a.notes, a.status,
             a.quoted_price_eur, a.payment_reference, a.active_until,
             a.created_at, a.updated_at
      FROM advertising_requests a
      LEFT JOIN users u ON u.uid = a.uid
      ORDER BY
        CASE a.status
          WHEN 'pending_review' THEN 0
          WHEN 'payment_submitted' THEN 1
          WHEN 'awaiting_payment' THEN 2
          WHEN 'active' THEN 3
          ELSE 4
        END,
        a.id DESC
      LIMIT 200
    `).all();

    return json({ success: true, requests: result.results || [] });
  }

  const adminAdMatch = path.match(/^\/api\/admin\/ads\/(\d+)$/);
  if (adminAdMatch && method === "PUT") {
    const user = await authenticate(request);
    const admin = await requireAdmin(user, env);
    await enforceRateLimit(env, `uid:${user.sub}`, "admin_ads_update", RATE_LIMIT_POLICIES.adminApprove);

    const id = Number(adminAdMatch[1]);
    const body = await readJson(request);
    const status = body.status;

    if (!Number.isSafeInteger(id) || id < 1) throw new HttpError(400, "Invalid advertising request ID.");

    if (status === "awaiting_payment") {
      const quote = Number(body.quoted_price_eur);
      if (!Number.isFinite(quote) || quote <= 0 || quote > 100000) {
        throw new HttpError(400, "Enter a valid quote in EUR.");
      }
      const updated = await env.DB.prepare(`
        UPDATE advertising_requests
        SET status = 'awaiting_payment', quoted_price_eur = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ? AND status = 'pending_review'
      `).bind(Math.round(quote * 100) / 100, id).run();

      if (updated.meta.changes !== 1) throw new HttpError(409, "Request is no longer awaiting review.");
      return json({ success: true, status });
    }

    if (status === "active") {
      const updated = await env.DB.prepare(`
        UPDATE advertising_requests
        SET status = 'active',
            active_until = datetime('now', '+' || (duration_days + CASE WHEN duration_days = 30 THEN 5 ELSE 0 END) || ' days'),
            processed_by = ?,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ? AND status = 'payment_submitted'
      `).bind(admin.uid, id).run();

      if (updated.meta.changes !== 1) {
        throw new HttpError(409, "Payment must be submitted before the ad can be activated.");
      }
      return json({ success: true, status, active_until: true });
    }

    if (status === "rejected") {
      const updated = await env.DB.prepare(`
        UPDATE advertising_requests
        SET status = 'rejected', processed_by = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ? AND status IN ('pending_review', 'awaiting_payment', 'payment_submitted')
      `).bind(admin.uid, id).run();

      if (updated.meta.changes !== 1) throw new HttpError(409, "Request cannot be rejected in its current status.");
      return json({ success: true, status });
    }

    throw new HttpError(400, "Unsupported advertising request status.");
  }

  // Historical report is UTC-scoped and excludes unverified revenue and unverified expenses.
  // ADMIN: HISTORICAL FINANCIAL REPORT
  if (path === "/api/admin/finance/report" && method === "GET") {
    const user = await authenticate(request);
    await requireAdmin(user, env);
    await enforceRateLimit(
      env,
      `uid:${user.sub}`,
      "admin_finance_report",
      RATE_LIMIT_POLICIES.adminRead
    );

    const reportUrl = new URL(request.url);
    const startDate = reportUrl.searchParams.get("start");
    const endDate = reportUrl.searchParams.get("end");
    const isValidDate = value =>
      typeof value === "string" &&
      /^\d{4}-\d{2}-\d{2}$/.test(value) &&
      Number.isFinite(Date.parse(value + "T00:00:00Z")) &&
      new Date(value + "T00:00:00Z").toISOString().slice(0, 10) === value;

    if (!isValidDate(startDate) || !isValidDate(endDate) || startDate > endDate || endDate > getUtcDate()) {
      throw new HttpError(400, "Provide valid dates; the end date cannot be in the future.");
    }

    const startMs = Date.parse(startDate + "T00:00:00Z");
    const endMs = Date.parse(endDate + "T00:00:00Z");
    const dayCount = Math.floor((endMs - startMs) / 86400000) + 1;
    if (dayCount > 366) {
      throw new HttpError(400, "Financial report range cannot exceed 366 days.");
    }

    const exclusiveEnd = new Date(endMs + 86400000).toISOString().slice(0, 10);
    const startTimestamp = startDate + " 00:00:00";
    const endTimestamp = exclusiveEnd + " 00:00:00";

    const [
      subscriptionRevenue,
      verifiedExpenses,
      ptcFunding,
      userLiabilities,
      pendingWithdrawals,
      ptcReserveSnapshot
    ] = await Promise.all([
      env.DB.prepare(`
        SELECT
          COALESCE(SUM(amount_cents), 0) AS total_cents,
          COUNT(*) AS orders_count,
          COALESCE(SUM(CASE WHEN plan = 'PREMIUM' THEN amount_cents ELSE 0 END), 0) AS premium_cents,
          COALESCE(SUM(CASE WHEN plan = 'VIP' THEN amount_cents ELSE 0 END), 0) AS vip_cents
        FROM subscription_orders
        WHERE status = 'paid'
          AND provider = 'faucetpay'
          AND provider_transaction_id IS NOT NULL
          AND paid_at IS NOT NULL
          AND paid_at >= ? AND paid_at < ?
      `).bind(startTimestamp, endTimestamp).first(),
      env.DB.prepare(`
        SELECT
          COALESCE(SUM(amount_cents), 0) AS total_cents,
          COUNT(*) AS expenses_count
        FROM operating_expenses
        WHERE verification_status = 'verified'
          AND expense_date >= ? AND expense_date <= ?
      `).bind(startDate, endDate).first(),
      env.DB.prepare(`
        SELECT COALESCE(SUM(amount_koinu), 0) AS total_koinu, COUNT(*) AS records_count
        FROM ptc_funding_events
        WHERE created_at >= ? AND created_at < ?
      `).bind(startTimestamp, endTimestamp).first(),
      env.DB.prepare(`
        SELECT COALESCE(SUM(balance_koinu), 0) AS total_koinu, COUNT(*) AS users_count
        FROM users
      `).first(),
      env.DB.prepare(`
        SELECT COALESCE(SUM(amount_koinu), 0) AS total_koinu, COUNT(*) AS withdrawals_count
        FROM withdrawals
        WHERE status IN ('pending', 'processing', 'payment_unknown')
           OR (status = 'approved' AND faucetpay_payout_id IS NULL)
      `).first(),
      env.DB.prepare(`
        SELECT available_koinu, locked_koinu, pending_koinu
        FROM ptc_reserve WHERE id = 1
      `).first()
    ]);

    const revenueCents = Number(subscriptionRevenue?.total_cents || 0);
    const expensesCents = Number(verifiedExpenses?.total_cents || 0);

    return json({
      success: true,
      period: { start: startDate, end: endDate, days: dayCount, timezone: "UTC" },
      verified_subscription_revenue: {
        total_eur_cents: revenueCents,
        premium_eur_cents: Number(subscriptionRevenue?.premium_cents || 0),
        vip_eur_cents: Number(subscriptionRevenue?.vip_cents || 0),
        orders_count: Number(subscriptionRevenue?.orders_count || 0),
        verification: "faucetpay_callback_verified"
      },
      verified_operating_expenses: {
        total_eur_cents: expensesCents,
        count: Number(verifiedExpenses?.expenses_count || 0),
        verification: "admin_verified_with_evidence_reference"
      },
      partial_subscription_net_eur_cents: revenueCents - expensesCents,
      partial_net_warning: "This is not total company profit. It includes only verified Premium/VIP receipts minus verified operating expenses.",
      ptc_advertiser_funding: {
        total_koinu: Number(ptcFunding?.total_koinu || 0),
        count: Number(ptcFunding?.records_count || 0),
        classification: "gross advertiser funding; not profit or free cash"
      },
      current_liabilities_snapshot: {
        user_balances_koinu: Number(userLiabilities?.total_koinu || 0),
        users_count: Number(userLiabilities?.users_count || 0),
        pending_withdrawals_koinu: Number(pendingWithdrawals?.total_koinu || 0),
        pending_withdrawals_count: Number(pendingWithdrawals?.withdrawals_count || 0),
        ptc_reserve_available_koinu: Number(ptcReserveSnapshot?.available_koinu || 0),
        ptc_reserve_locked_koinu: Number(ptcReserveSnapshot?.locked_koinu || 0),
        ptc_reserve_pending_koinu: Number(ptcReserveSnapshot?.pending_koinu || 0),
        as_of: new Date().toISOString()
      },
      total_profit_eur_cents: null,
      profit_status: "not_calculated_incomplete_revenue_and_cost_reconciliation"
    });
  }

  // ADMIN: OPERATING EXPENSES
  if (path === "/api/admin/finance/expenses" && method === "GET") {
    const user = await authenticate(request);
    const admin = await requireAdmin(user, env);
    await enforceRateLimit(env, `uid:${user.sub}`, "admin_expenses_read", RATE_LIMIT_POLICIES.adminRead);

    const rows = await env.DB.prepare(`
      SELECT id, category, description, amount_cents, currency,
             evidence_reference, verification_status, expense_date,
             created_at, created_by, verified_at, verified_by
      FROM operating_expenses
      ORDER BY expense_date DESC, created_at DESC
      LIMIT 100
    `).all();

    return json({ success: true, expenses: rows.results || [] });
  }

  if (path === "/api/admin/finance/expenses" && method === "POST") {
    const user = await authenticate(request);
    const admin = await requireAdmin(user, env);
    await enforceRateLimit(env, `uid:${user.sub}`, "admin_expenses_create", RATE_LIMIT_POLICIES.adminReject);

    const body = await readJson(request);
    const categories = new Set(["hosting", "infrastructure", "advertising", "payment_fees", "software", "other"]);
    const category = typeof body.category === "string" ? body.category : "";
    const description = typeof body.description === "string" ? body.description.trim() : "";
    const amountCents = body.amount_cents;
    const expenseDate = typeof body.expense_date === "string" ? body.expense_date : getUtcDate();

    if (!categories.has(category)) throw new HttpError(400, "Invalid expense category.");
    if (description.length < 3 || description.length > 240) throw new HttpError(400, "Description must be 3–240 characters.");
    if (!Number.isSafeInteger(amountCents) || amountCents < 1 || amountCents > 1000000000) {
      throw new HttpError(400, "Expense amount must be a positive EUR cent value.");
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(expenseDate) || !Number.isFinite(Date.parse(expenseDate + "T00:00:00Z")) ||
        new Date(expenseDate + "T00:00:00Z").toISOString().slice(0, 10) !== expenseDate) {
      throw new HttpError(400, "Invalid expense date.");
    }

    const id = crypto.randomUUID();
    await env.DB.prepare(`
      INSERT INTO operating_expenses
        (id, category, description, amount_cents, currency, verification_status, created_by, expense_date)
      VALUES (?, ?, ?, ?, 'EUR', 'unverified', ?, ?)
    `).bind(id, category, description, amountCents, admin.uid, expenseDate).run();

    return json({ success: true, id, verification_status: "unverified" }, 201);
  }

  const verifyExpenseMatch = path.match(/^\/api\/admin\/finance\/expenses\/([0-9a-f-]{36})\/verify$/i);
  if (verifyExpenseMatch && method === "POST") {
    const user = await authenticate(request);
    const admin = await requireAdmin(user, env);
    await enforceRateLimit(env, `uid:${user.sub}`, "admin_expenses_verify", RATE_LIMIT_POLICIES.adminReject);

    const body = await readJson(request);
    const evidenceReference = typeof body.evidence_reference === "string"
      ? body.evidence_reference.trim()
      : "";
    if (evidenceReference.length < 3 || evidenceReference.length > 240) {
      throw new HttpError(400, "A receipt or transaction reference (3–240 characters) is required.");
    }

    const updated = await env.DB.prepare(`
      UPDATE operating_expenses
      SET evidence_reference = ?, verification_status = 'verified',
          verified_by = ?, verified_at = CURRENT_TIMESTAMP
      WHERE id = ? AND verification_status = 'unverified'
    `).bind(evidenceReference, admin.uid, verifyExpenseMatch[1]).run();

    if (Number(updated?.meta?.changes || 0) !== 1) {
      throw new HttpError(409, "Expense not found or already verified.");
    }
    return json({ success: true, verification_status: "verified" });
  }

  // ADMIN: READ-ONLY FINANCIAL INTEGRITY AUDIT

  if (path === "/api/admin/finance/audit" && method === "GET") {
    const user = await authenticate(request);
    await requireAdmin(user, env);
    await enforceRateLimit(
      env,
      `uid:${user.sub}`,
      "admin_finance_audit",
      RATE_LIMIT_POLICIES.adminRead
    );

    const [
      liability,
      unledgeredBalances,
      claimsWithoutLedger,
      legacyClaimsWithoutLedger,
      referralCommissionsWithoutLedger,
      referralLedgerWithoutCommission,
      wheelPrizesWithoutLedger,
      wheelPurchasesWithoutLedger,
      wheelLedgerWithoutSource,
      dailyStreaksWithoutLedger,
      balanceMismatches,
      arithmeticMismatches,
      ledgerCount,
      withdrawalRows,
      withdrawalsWithoutDebitLedger,
      rejectedWithoutRefundLedger,
      legacyApproved,
      paidWithoutPayoutId,
      staleProcessingWithdrawals,
      paymentUnknownWithdrawals,
      duplicatePayoutIds,
      faucetReserve,
      wheelReserve,
      referralReserve,
      paidWheelSpins,
      maxActiveWheelPrize,
      ptcPendingRewards,
      ptcSettlementsWithoutLedger,
      ptcSettlementMismatches,
      ptcSettledViews,
      ptcReserve
    ] = await Promise.all([
      env.DB.prepare(`
        SELECT COALESCE(SUM(balance_koinu), 0) AS total, COUNT(*) AS users_count
        FROM users
      `).first(),
      env.DB.prepare(`
        SELECT COUNT(*) AS count, COALESCE(SUM(u.balance_koinu), 0) AS total_koinu
        FROM users u
        WHERE u.balance_koinu > 0
          AND NOT EXISTS (
            SELECT 1 FROM ledger_transactions lt WHERE lt.uid = u.uid
          )
      `).first(),
      env.DB.prepare(`
        SELECT COUNT(*) AS count, COALESCE(SUM(c.amount_koinu), 0) AS total_koinu
        FROM claims c
        WHERE c.request_id IS NOT NULL
          AND NOT EXISTS (
          SELECT 1 FROM ledger_transactions lt
          WHERE lt.uid = c.uid
            AND lt.transaction_type = 'claim'
            AND lt.reference_type = 'claim'
            AND lt.reference_id = CAST(c.id AS TEXT)
            AND lt.amount_koinu = c.amount_koinu
            AND lt.idempotency_key = 'claim:' || c.uid || ':' || c.request_id
        )
      `).first(),
      env.DB.prepare(`
        SELECT COUNT(*) AS count, COALESCE(SUM(c.amount_koinu), 0) AS total_koinu
        FROM claims c
        WHERE c.request_id IS NULL
          AND NOT EXISTS (
            SELECT 1 FROM ledger_transactions lt
            WHERE lt.uid = c.uid
              AND lt.transaction_type = 'claim'
              AND lt.reference_type = 'claim'
              AND lt.reference_id = CAST(c.id AS TEXT)
              AND lt.amount_koinu = c.amount_koinu
          )
      `).first(),
      env.DB.prepare(`
        SELECT COUNT(*) AS count, COALESCE(SUM(rc.amount_koinu), 0) AS total_koinu
        FROM referral_commissions rc
        WHERE NOT EXISTS (
          SELECT 1 FROM ledger_transactions lt
          WHERE lt.reference_type = 'referral_commission'
            AND lt.reference_id = CAST(rc.id AS TEXT)
            AND lt.uid = rc.referrer_uid
            AND lt.amount_koinu = rc.amount_koinu
            AND lt.idempotency_key = 'referral_claim:' || rc.claim_id
        )
      `).first(),
      env.DB.prepare(`
        SELECT COUNT(*) AS count, COALESCE(SUM(lt.amount_koinu), 0) AS total_koinu
        FROM ledger_transactions lt
        WHERE lt.transaction_type = 'referral_commission'
          AND NOT EXISTS (
            SELECT 1 FROM referral_commissions rc
            WHERE lt.reference_id = CAST(rc.id AS TEXT)
              AND lt.uid = rc.referrer_uid
              AND lt.amount_koinu = rc.amount_koinu
          )
      `).first(),
      env.DB.prepare(`
        SELECT COUNT(*) AS count, COALESCE(SUM(ws.prize_koinu), 0) AS total_koinu
        FROM wheel_spins ws
        WHERE ws.prize_koinu > 0
          AND NOT EXISTS (
            SELECT 1 FROM ledger_transactions lt
            WHERE lt.uid = ws.uid
              AND lt.transaction_type = 'wheel_prize'
              AND lt.reference_type = 'wheel_spin'
              AND lt.reference_id = CAST(ws.id AS TEXT)
              AND lt.amount_koinu = ws.prize_koinu
              AND lt.idempotency_key = 'wheel_spin:' || ws.uid || ':' || ws.request_id
          )
      `).first(),
      env.DB.prepare(`
        SELECT COUNT(*) AS count, COALESCE(SUM(wp.cost_koinu), 0) AS total_koinu
        FROM wheel_purchases wp
        WHERE NOT EXISTS (
          SELECT 1 FROM ledger_transactions lt
          WHERE lt.uid = wp.uid
            AND lt.transaction_type = 'wheel_purchase'
            AND lt.reference_type = 'wheel_purchase'
            AND lt.reference_id = CAST(wp.id AS TEXT)
            AND lt.amount_koinu = -wp.cost_koinu
            AND lt.idempotency_key = 'wheel_purchase:' || wp.uid || ':' || wp.request_id
        )
      `).first(),
      env.DB.prepare(`
        SELECT COUNT(*) AS count, COALESCE(SUM(lt.amount_koinu), 0) AS total_koinu
        FROM ledger_transactions lt
        WHERE lt.transaction_type IN ('wheel_prize', 'wheel_purchase')
          AND NOT EXISTS (
            SELECT 1 FROM wheel_spins ws
            WHERE lt.transaction_type = 'wheel_prize'
              AND lt.uid = ws.uid
              AND lt.reference_type = 'wheel_spin'
              AND lt.reference_id = CAST(ws.id AS TEXT)
              AND lt.amount_koinu = ws.prize_koinu
          )
          AND NOT EXISTS (
            SELECT 1 FROM wheel_purchases wp
            WHERE lt.transaction_type = 'wheel_purchase'
              AND lt.uid = wp.uid
              AND lt.reference_type = 'wheel_purchase'
              AND lt.reference_id = CAST(wp.id AS TEXT)
              AND lt.amount_koinu = -wp.cost_koinu
          )
      `).first(),
      env.DB.prepare(`
        SELECT COUNT(*) AS count, COALESCE(SUM(
          CASE ds.current_day
            WHEN 1 THEN 1000 WHEN 2 THEN 2000 WHEN 3 THEN 3000
            WHEN 4 THEN 4000 WHEN 5 THEN 5000 WHEN 6 THEN 6000
            WHEN 7 THEN 7000 ELSE 0
          END
        ), 0) AS total_koinu
        FROM daily_streaks ds
        WHERE ds.last_checkin_date IS NOT NULL
          AND NOT EXISTS (
            SELECT 1 FROM ledger_transactions lt
            WHERE lt.uid = ds.uid
              AND lt.transaction_type = 'daily_streak'
              AND lt.reference_type = 'daily_streak'
              AND lt.reference_id = ds.last_checkin_date
              AND lt.amount_koinu = CASE ds.current_day
                WHEN 1 THEN 1000 WHEN 2 THEN 2000 WHEN 3 THEN 3000
                WHEN 4 THEN 4000 WHEN 5 THEN 5000 WHEN 6 THEN 6000
                WHEN 7 THEN 7000 ELSE 0
              END
              AND lt.idempotency_key = 'daily_streak:' || ds.uid || ':' || ds.last_checkin_date
          )
      `).first(),
      env.DB.prepare(`
        SELECT COUNT(*) AS count
        FROM users u
        WHERE EXISTS (
          SELECT 1 FROM ledger_transactions lt WHERE lt.uid = u.uid
        )
          AND u.balance_koinu != (
            SELECT lt.balance_after_koinu
            FROM ledger_transactions lt
            WHERE lt.uid = u.uid
            ORDER BY lt.id DESC
            LIMIT 1
          )
      `).first(),
      env.DB.prepare(`
        SELECT COUNT(*) AS count
        FROM ledger_transactions
        WHERE balance_after_koinu != balance_before_koinu + amount_koinu
      `).first(),
      env.DB.prepare(`SELECT COUNT(*) AS count FROM ledger_transactions`).first(),
      env.DB.prepare(`
        SELECT status, COUNT(*) AS count, COALESCE(SUM(amount_koinu), 0) AS total_koinu
        FROM withdrawals
        GROUP BY status
      `).all(),
      env.DB.prepare(`
        SELECT COUNT(*) AS count, COALESCE(SUM(w.amount_koinu), 0) AS total_koinu
        FROM withdrawals w
        WHERE w.status != 'rejected'
          AND NOT EXISTS (
            SELECT 1
            FROM ledger_transactions lt
            WHERE lt.uid = w.uid
              AND lt.reference_type = 'withdrawal'
              AND lt.reference_id = CAST(w.id AS TEXT)
              AND lt.transaction_type = 'withdrawal'
              AND lt.amount_koinu = -w.amount_koinu
          )
      `).first(),
      env.DB.prepare(`
        SELECT COUNT(*) AS count, COALESCE(SUM(w.amount_koinu), 0) AS total_koinu
        FROM withdrawals w
        WHERE w.status = 'rejected'
          AND NOT EXISTS (
            SELECT 1
            FROM ledger_transactions lt
            WHERE lt.uid = w.uid
              AND lt.reference_type = 'withdrawal'
              AND lt.reference_id = CAST(w.id AS TEXT)
              AND lt.transaction_type = 'withdrawal_refund'
              AND lt.amount_koinu = w.amount_koinu
          )
      `).first(),
      env.DB.prepare(`
        SELECT COUNT(*) AS count, COALESCE(SUM(amount_koinu), 0) AS total_koinu
        FROM withdrawals
        WHERE status = 'approved'
          AND faucetpay_payout_id IS NULL
      `).first(),
      env.DB.prepare(`
        SELECT COUNT(*) AS count, COALESCE(SUM(amount_koinu), 0) AS total_koinu
        FROM withdrawals
        WHERE status = 'paid'
          AND (faucetpay_payout_id IS NULL OR trim(faucetpay_payout_id) = '')
      `).first(),
      env.DB.prepare(`
        SELECT COUNT(*) AS count, COALESCE(SUM(amount_koinu), 0) AS total_koinu
        FROM withdrawals
        WHERE status = 'processing'
          AND datetime(COALESCE(processed_at, created_at)) < datetime('now', '-15 minutes')
      `).first(),
      env.DB.prepare(`
        SELECT COUNT(*) AS count, COALESCE(SUM(amount_koinu), 0) AS total_koinu
        FROM withdrawals
        WHERE status = 'payment_unknown'
      `).first(),
      env.DB.prepare(`
        SELECT COUNT(*) AS count
        FROM (
          SELECT faucetpay_payout_id
          FROM withdrawals
          WHERE faucetpay_payout_id IS NOT NULL
            AND trim(faucetpay_payout_id) != ''
          GROUP BY faucetpay_payout_id
          HAVING COUNT(*) > 1
        )
      `).first(),
      env.DB.prepare(`SELECT available_koinu, payouts_enabled FROM faucet_reserve WHERE id = 1`).first(),
      env.DB.prepare(`SELECT available_koinu, locked_koinu, payouts_enabled FROM wheel_reserve WHERE id = 1`).first(),
      env.DB.prepare(`SELECT available_koinu, payouts_enabled FROM referral_reserve WHERE id = 1`).first(),
      env.DB.prepare(`
        SELECT COALESCE(SUM(paid_spins), 0) AS count
        FROM wheel_spin_inventory
      `).first(),
      env.DB.prepare(`
        SELECT COALESCE(MAX(amount_koinu), 0) AS amount
        FROM wheel_prizes
        WHERE probability_weight > 0
      `).first(),
      env.DB.prepare(`
        SELECT COALESCE(SUM(v.reward_koinu), 0) AS total_koinu, COUNT(*) AS views_count
        FROM ptc_views v
        WHERE v.status = 'completed'
          AND NOT EXISTS (
            SELECT 1 FROM ptc_settlement_items si WHERE si.view_id = v.id
          )
      `).first(),
      env.DB.prepare(`
        SELECT COUNT(*) AS count, COALESCE(SUM(ps.amount_koinu), 0) AS total_koinu
        FROM ptc_settlements ps
        WHERE NOT EXISTS (
          SELECT 1 FROM ledger_transactions lt
          WHERE lt.uid = ps.uid
            AND lt.transaction_type = 'ptc_reward'
            AND lt.reference_type = 'ptc_settlement'
            AND lt.reference_id = ps.id
            AND lt.amount_koinu = ps.amount_koinu
            AND lt.idempotency_key = ps.idempotency_key
        )
      `).first(),
      env.DB.prepare(`
        SELECT COUNT(*) AS count, COALESCE(SUM(ps.amount_koinu), 0) AS total_koinu
        FROM ptc_settlements ps
        WHERE ps.amount_koinu != (
          SELECT COALESCE(SUM(si.amount_koinu), 0)
          FROM ptc_settlement_items si WHERE si.settlement_id = ps.id
        )
        OR ps.views_count != (
          SELECT COUNT(*) FROM ptc_settlement_items si WHERE si.settlement_id = ps.id
        )
      `).first(),
      env.DB.prepare("SELECT COUNT(*) AS count FROM ptc_settlement_items").first(),
      env.DB.prepare("SELECT available_koinu, locked_koinu, pending_koinu FROM ptc_reserve WHERE id = 1").first()
    ]);

    const withdrawalsByStatus = Object.create(null);
    for (const row of withdrawalRows.results || []) {
      withdrawalsByStatus[row.status] = {
        count: Number(row.count || 0),
        total_koinu: Number(row.total_koinu || 0)
      };
    }

    const outstandingStatuses = ["pending", "processing", "payment_unknown"];
    // Legacy "approved" rows without a FaucetPay payout ID are ambiguous:
    // they may still be owed to the user, so reserve them as outstanding.
    const legacyApprovedOutstanding = Number(legacyApproved?.total_koinu || 0);
    const outstanding = outstandingStatuses.reduce((total, status) => {
      return total + Number(withdrawalsByStatus[status]?.total_koinu || 0);
    }, legacyApprovedOutstanding);
    const paidSpinsOutstanding = Number(paidWheelSpins?.count || 0);
    const maxActiveWheelPrizeKoinu = Number(maxActiveWheelPrize?.amount || 0);
    const paidSpinReserveRequiredKoinu =
      paidSpinsOutstanding * maxActiveWheelPrizeKoinu;
    const paidSpinReserveBacked =
      Number(wheelReserve?.locked_koinu || 0) >= paidSpinReserveRequiredKoinu;

    return json({
      success: true,
      checked_at: new Date().toISOString(),
      liabilities: {
        user_balances_koinu: Number(liability?.total || 0),
        users_count: Number(liability?.users_count || 0),
        outstanding_withdrawals_koinu: outstanding
      },
      ledger: {
        transactions_count: Number(ledgerCount?.count || 0),
        users_with_balance_without_ledger: Number(unledgeredBalances?.count || 0),
        unledgered_balance_koinu: Number(unledgeredBalances?.total_koinu || 0),
        claims_without_ledger_count: Number(claimsWithoutLedger?.count || 0),
        claims_without_ledger_koinu: Number(claimsWithoutLedger?.total_koinu || 0),
        legacy_claims_without_ledger_count: Number(legacyClaimsWithoutLedger?.count || 0),
        legacy_claims_without_ledger_koinu: Number(legacyClaimsWithoutLedger?.total_koinu || 0),
        referral_commissions_without_ledger_count: Number(referralCommissionsWithoutLedger?.count || 0),
        referral_commissions_without_ledger_koinu: Number(referralCommissionsWithoutLedger?.total_koinu || 0),
        referral_ledger_without_commission_count: Number(referralLedgerWithoutCommission?.count || 0),
        referral_ledger_without_commission_koinu: Number(referralLedgerWithoutCommission?.total_koinu || 0),
        wheel_prizes_without_ledger_count: Number(wheelPrizesWithoutLedger?.count || 0),
        wheel_prizes_without_ledger_koinu: Number(wheelPrizesWithoutLedger?.total_koinu || 0),
        wheel_purchases_without_ledger_count: Number(wheelPurchasesWithoutLedger?.count || 0),
        wheel_purchases_without_ledger_koinu: Number(wheelPurchasesWithoutLedger?.total_koinu || 0),
        wheel_ledger_without_source_count: Number(wheelLedgerWithoutSource?.count || 0),
        wheel_ledger_without_source_koinu: Number(wheelLedgerWithoutSource?.total_koinu || 0),
        daily_streaks_without_ledger_count: Number(dailyStreaksWithoutLedger?.count || 0),
        daily_streaks_without_ledger_koinu: Number(dailyStreaksWithoutLedger?.total_koinu || 0),
        user_balance_mismatches: Number(balanceMismatches?.count || 0),
        arithmetic_mismatches: Number(arithmeticMismatches?.count || 0)
      },
      withdrawals: {
        by_status: withdrawalsByStatus,
        without_debit_ledger_count: Number(withdrawalsWithoutDebitLedger?.count || 0),
        without_debit_ledger_koinu: Number(withdrawalsWithoutDebitLedger?.total_koinu || 0),
        rejected_without_refund_ledger_count: Number(rejectedWithoutRefundLedger?.count || 0),
        rejected_without_refund_ledger_koinu: Number(rejectedWithoutRefundLedger?.total_koinu || 0),
        legacy_approved_without_payout_id_count: Number(legacyApproved?.count || 0),
        legacy_approved_without_payout_id_koinu: Number(legacyApproved?.total_koinu || 0),
        paid_without_payout_id_count: Number(paidWithoutPayoutId?.count || 0),
        paid_without_payout_id_koinu: Number(paidWithoutPayoutId?.total_koinu || 0),
        stale_processing_count: Number(staleProcessingWithdrawals?.count || 0),
        stale_processing_koinu: Number(staleProcessingWithdrawals?.total_koinu || 0),
        payment_unknown_count: Number(paymentUnknownWithdrawals?.count || 0),
        payment_unknown_koinu: Number(paymentUnknownWithdrawals?.total_koinu || 0),
        duplicate_payout_id_groups: Number(duplicatePayoutIds?.count || 0)
      },
      ptc_rewards: {
        pending_unsettled_koinu: Number(ptcPendingRewards?.total_koinu || 0),
        pending_unsettled_views: Number(ptcPendingRewards?.views_count || 0),
        reserve_available_koinu: Number(ptcReserve?.available_koinu || 0),
        reserve_locked_koinu: Number(ptcReserve?.locked_koinu || 0),
        reserve_pending_koinu: Number(ptcReserve?.pending_koinu || 0),
        pending_reserve_matches_views:
          Number(ptcReserve?.pending_koinu || 0) === Number(ptcPendingRewards?.total_koinu || 0),
        settled_views: Number(ptcSettledViews?.count || 0),
        settlements_without_ledger_count: Number(ptcSettlementsWithoutLedger?.count || 0),
        settlements_without_ledger_koinu: Number(ptcSettlementsWithoutLedger?.total_koinu || 0),
        settlement_item_mismatches: Number(ptcSettlementMismatches?.count || 0),
        settlement_item_mismatch_koinu: Number(ptcSettlementMismatches?.total_koinu || 0)
      },
      reserves: {
        faucet_available_koinu: Number(faucetReserve?.available_koinu || 0),
        faucet_payouts_enabled: Number(faucetReserve?.payouts_enabled) === 1,
        wheel_available_koinu: Number(wheelReserve?.available_koinu || 0),
        wheel_locked_koinu: Number(wheelReserve?.locked_koinu || 0),
        wheel_payouts_enabled: Number(wheelReserve?.payouts_enabled) === 1,
        paid_spins_outstanding: paidSpinsOutstanding,
        paid_spin_reserve_required_koinu: paidSpinReserveRequiredKoinu,
        paid_spin_reserve_backed: paidSpinReserveBacked,
        referral_available_koinu: Number(referralReserve?.available_koinu || 0),
        referral_payouts_enabled: Number(referralReserve?.payouts_enabled) === 1,
        external_funding_verified: false
      }
    });
  }

  // ADMIN: DAILY STATS

  if (path === "/api/admin/stats" && method === "GET") {
    const user = await authenticate(request);
    await requireAdmin(user, env);

    await enforceRateLimit(
      env,
      `uid:${user.sub}`,
      "admin_stats",
      RATE_LIMIT_POLICIES.adminRead
    );

    return json(await getAdminDailyStats(env));
  }

  // ADMIN: LIST WITHDRAWALS

  if (path === "/api/admin/withdrawals" && method === "GET") {
    const user = await authenticate(request);
    await requireAdmin(user, env);

    await enforceRateLimit(
      env,
      `uid:${user.sub}`,
      "admin_withdrawals_read",
      RATE_LIMIT_POLICIES.adminRead
    );

    const result = await env.DB.prepare(`
      SELECT
        w.id,
        w.uid,
        u.email,
        w.amount_koinu,
        w.wallet_address,
        w.status,
        w.faucetpay_payout_id,
        w.payout_error,
        w.created_at
      FROM withdrawals w
      LEFT JOIN users u ON u.uid = w.uid
      ORDER BY
        CASE WHEN w.status = 'pending' THEN 0 ELSE 1 END,
        w.id DESC
      LIMIT 500
    `).all();

    return json({
      success: true,
      withdrawals: result.results || []
    });
  }

  // ADMIN: REPORT FAUCETPAY CONFIGURATION WITHOUT EXPOSING SECRETS

  if (path === "/api/admin/faucetpay/status" && method === "GET") {
    const user = await authenticate(request);
    await requireAdmin(user, env);
    await enforceRateLimit(
      env,
      `uid:${user.sub}`,
      "admin_faucetpay_status",
      RATE_LIMIT_POLICIES.adminRead
    );

    return json({
      success: true,
      configured: typeof env.FAUCETPAY_API_KEY === "string" && env.FAUCETPAY_API_KEY.length > 0,
      payouts_enabled: env.FAUCETPAY_PAYOUTS_ENABLED === "true"
    });
  }

  // ADMIN: READ FAUCETPAY DOGE BALANCE (SAFE, NO PAYOUT)

  if (path === "/api/admin/faucetpay/balance" && method === "GET") {
    const user = await authenticate(request);
    await requireAdmin(user, env);
    await enforceRateLimit(
      env,
      `uid:${user.sub}`,
      "admin_faucetpay_balance",
      RATE_LIMIT_POLICIES.adminRead
    );

    const result = await faucetPayRequest(env, "getbalance", {
      currency: "DOGE"
    });

    if (Number(result.status) !== 200) {
      throw new HttpError(
        502,
        typeof result.message === "string"
          ? result.message.slice(0, 180)
          : "FaucetPay balance check failed."
      );
    }

    const balanceKoinu = Number(result.balance);
    if (!Number.isSafeInteger(balanceKoinu) || balanceKoinu < 0) {
      throw new HttpError(502, "FaucetPay returned an invalid DOGE balance.");
    }

    return json({
      success: true,
      currency: "DOGE",
      balance_koinu: balanceKoinu,
      balance_doge: balanceKoinu / 100000000
    });
  }

  // ADMIN: SEND A DOGE WITHDRAWAL THROUGH FAUCETPAY
  // Disabled unless FAUCETPAY_PAYOUTS_ENABLED=true is set explicitly.

  const approveMatch = path.match(
    /^\/api\/admin\/withdrawals\/(\d+)\/approve$/
  );

  if (approveMatch && method === "POST") {
    const user = await authenticate(request);
    const admin = await requireAdmin(user, env);

    await enforceRateLimit(
      env,
      `uid:${user.sub}`,
      "admin_withdrawal_approve",
      RATE_LIMIT_POLICIES.adminApprove
    );

    if (env.FAUCETPAY_PAYOUTS_ENABLED !== "true") {
      throw new HttpError(
        503,
        "FaucetPay payouts are disabled until integration testing is complete."
      );
    }

    const id = Number(approveMatch[1]);
    if (!Number.isSafeInteger(id) || id < 1) {
      throw new HttpError(400, "Invalid withdrawal ID.");
    }

    const locked = await env.DB.prepare(`
      UPDATE withdrawals
      SET status = 'processing',
          processed_by = ?,
          processed_at = CURRENT_TIMESTAMP,
          payout_error = NULL
      WHERE id = ?
        AND status = 'pending'
    `).bind(admin.uid, id).run();

    if (locked.meta.changes !== 1) {
      throw new HttpError(
        409,
        "Withdrawal is not pending or has already been processed."
      );
    }

    const withdrawal = await env.DB.prepare(`
      SELECT id, amount_koinu, wallet_address, status
      FROM withdrawals
      WHERE id = ?
        AND status = 'processing'
    `).bind(id).first();

    if (
      !withdrawal ||
      !Number.isSafeInteger(Number(withdrawal.amount_koinu)) ||
      Number(withdrawal.amount_koinu) <= 0 ||
      !(await isValidDogeAddress(withdrawal.wallet_address))
    ) {
      await env.DB.prepare(`
        UPDATE withdrawals
        SET status = 'pending',
            processed_by = NULL,
            processed_at = NULL,
            payout_error = 'Withdrawal data failed validation.'
        WHERE id = ?
          AND status = 'processing'
      `).bind(id).run();

      throw new HttpError(409, "Withdrawal data failed validation.");
    }

    let payout;
    try {
      payout = await faucetPayRequest(env, "send", {
        amount: String(Number(withdrawal.amount_koinu)),
        to: withdrawal.wallet_address,
        currency: "DOGE",
        ...(getTrustedClientIp(request)
          ? { ip_address: getTrustedClientIp(request) }
          : {})
      });
    } catch (error) {
      const isUncertain =
        error.status === 504 ||
        (error.status === 502 &&
          /unreadable|unexpected response|must be checked manually/i.test(error.message));

      if (isUncertain) {
        await env.DB.prepare(`
          UPDATE withdrawals
          SET status = 'payment_unknown',
              payout_error = ?
          WHERE id = ?
            AND status = 'processing'
        `).bind(
          "FaucetPay response was uncertain. Check FaucetPay payout history before any retry.",
          id
        ).run();
      } else {
        await env.DB.prepare(`
          UPDATE withdrawals
          SET status = 'pending',
              processed_by = NULL,
              processed_at = NULL,
              payout_error = ?
          WHERE id = ?
            AND status = 'processing'
        `).bind(String(error.message || "FaucetPay request failed").slice(0, 180), id).run();
      }

      throw error;
    }

    if (Number(payout.status) !== 200) {
      const message = typeof payout.message === "string"
        ? payout.message.slice(0, 180)
        : "FaucetPay rejected this payout.";

      await env.DB.prepare(`
        UPDATE withdrawals
        SET status = 'pending',
            processed_by = NULL,
            processed_at = NULL,
            payout_error = ?
        WHERE id = ?
          AND status = 'processing'
      `).bind(message, id).run();

      throw new HttpError(502, message);
    }

    const payoutId = String(payout.payout_id ?? "").trim();
    if (
      String(payout.currency || "").toUpperCase() !== "DOGE" ||
      !/^\d{1,32}$/.test(payoutId)
    ) {
      await env.DB.prepare(`
        UPDATE withdrawals
        SET status = 'payment_unknown',
            payout_error = 'FaucetPay reported success without a valid payout ID. Manual verification required.'
        WHERE id = ?
          AND status = 'processing'
      `).bind(id).run();

      throw new HttpError(
        502,
        "FaucetPay response did not include a valid payout ID. Verify the payout manually."
      );
    }

    const completed = await env.DB.prepare(`
      UPDATE withdrawals
      SET status = 'paid',
          faucetpay_payout_id = ?,
          payout_error = NULL,
          processed_by = ?,
          processed_at = CURRENT_TIMESTAMP
      WHERE id = ?
        AND status = 'processing'
    `).bind(payoutId, admin.uid, id).run();

    if (completed.meta.changes !== 1) {
      throw new HttpError(
        503,
        "FaucetPay may have paid this withdrawal, but DogeDrip could not confirm the database update. Check FaucetPay history before retrying."
      );
    }

    return json({
      success: true,
      message: "DOGE payout completed through FaucetPay.",
      id,
      status: "paid",
      faucetpay_payout_id: payoutId
    });
  }

  // ADMIN: RECONCILE AN UNCERTAIN FAUCETPAY RESULT
  // Admin must inspect FaucetPay payout history before choosing a resolution.

  const reconcileMatch = path.match(
    /^\/api\/admin\/withdrawals\/(\d+)\/reconcile$/
  );

  if (reconcileMatch && method === "POST") {
    const user = await authenticate(request);
    const admin = await requireAdmin(user, env);
    await enforceRateLimit(
      env,
      `uid:${user.sub}`,
      "admin_withdrawal_approve",
      RATE_LIMIT_POLICIES.adminApprove
    );

    const id = Number(reconcileMatch[1]);
    const body = await readJson(request);
    const resolution = body.resolution;

    if (!Number.isSafeInteger(id) || id < 1) {
      throw new HttpError(400, "Invalid withdrawal ID.");
    }

    if (resolution === "paid") {
      const payoutId = typeof body.faucetpay_payout_id === "string"
        ? body.faucetpay_payout_id.trim()
        : "";

      if (!/^\d{1,32}$/.test(payoutId)) {
        throw new HttpError(400, "Enter the payout ID shown in FaucetPay.");
      }

      const result = await env.DB.prepare(`
        UPDATE withdrawals
        SET status = 'paid',
            faucetpay_payout_id = ?,
            payout_error = NULL,
            processed_by = ?,
            processed_at = CURRENT_TIMESTAMP
        WHERE id = ?
          AND (
            status IN ('processing', 'payment_unknown')
            OR (
              status IN ('approved', 'paid')
              AND (faucetpay_payout_id IS NULL OR trim(faucetpay_payout_id) = '')
            )
          )
      `).bind(payoutId, admin.uid, id).run();

      if (result.meta.changes !== 1) {
        throw new HttpError(409, "This withdrawal is not awaiting reconciliation.");
      }

      return json({ success: true, id, status: "paid" });
    }

    if (resolution === "not_paid") {
      const result = await env.DB.prepare(`
        UPDATE withdrawals
        SET status = 'pending',
            faucetpay_payout_id = NULL,
            payout_error = NULL,
            processed_by = NULL,
            processed_at = NULL
        WHERE id = ?
          AND (
            status IN ('processing', 'payment_unknown')
            OR (
              status IN ('approved', 'paid')
              AND (faucetpay_payout_id IS NULL OR trim(faucetpay_payout_id) = '')
            )
          )
      `).bind(id).run();

      if (result.meta.changes !== 1) {
        throw new HttpError(409, "This withdrawal is not awaiting reconciliation.");
      }

      return json({ success: true, id, status: "pending" });
    }

    throw new HttpError(400, "Choose a valid reconciliation result.");
  }

  // ADMIN: REJECT WITHDRAWAL + REFUND + LEDGER

  const rejectMatch = path.match(
    /^\/api\/admin\/withdrawals\/(\d+)\/reject$/
  );

  if (rejectMatch && method === "POST") {
    const user = await authenticate(request);
    const admin = await requireAdmin(user, env);

    await enforceRateLimit(
      env,
      `uid:${user.sub}`,
      "admin_withdrawal_reject",
      RATE_LIMIT_POLICIES.adminReject
    );

    const id = Number(rejectMatch[1]);

    if (!Number.isSafeInteger(id)) {
      throw new HttpError(400, "Invalid withdrawal id");
    }

    let results;

    try {
      results = await env.DB.batch([
        env.DB.prepare(`
          UPDATE withdrawals
          SET
            status = 'rejected',
            processed_by = ?,
            processed_at = CURRENT_TIMESTAMP
          WHERE id = ?
            AND status = 'pending'
        `).bind(admin.uid, id),

        env.DB.prepare(`
          UPDATE users
          SET balance_koinu = balance_koinu + (
            SELECT amount_koinu
            FROM withdrawals
            WHERE id = ?
              AND status = 'rejected'
          )
          WHERE uid = (
            SELECT uid
            FROM withdrawals
            WHERE id = ?
              AND status = 'rejected'
          )
            AND changes() = 1
        `).bind(id, id),

        env.DB.prepare(`
          INSERT INTO ledger_transactions (
            uid,
            transaction_type,
            amount_koinu,
            balance_before_koinu,
            balance_after_koinu,
            reference_type,
            reference_id,
            idempotency_key
          )
          SELECT
            u.uid,
            'withdrawal_refund',
            w.amount_koinu,
            u.balance_koinu - w.amount_koinu,
            u.balance_koinu,
            'withdrawal',
            CAST(w.id AS TEXT),
            'withdrawal_refund:' || w.id
          FROM withdrawals w
          JOIN users u ON u.uid = w.uid
          WHERE w.id = ?
            AND w.status = 'rejected'
            AND changes() = 1
        `).bind(id),

        env.DB.prepare(`
          SELECT CASE
            WHEN changes() != 1
            THEN abs(-9223372036854775808)
            ELSE 1
          END
        `)
      ]);
    } catch (error) {
      const withdrawal = await env.DB.prepare(`
        SELECT status
        FROM withdrawals
        WHERE id = ?
      `).bind(id).first();

      if (!withdrawal || withdrawal.status !== "pending") {
        throw new HttpError(
          409,
          "Withdrawal not found or already processed"
        );
      }

      throw new HttpError(
        500,
        "Withdrawal rejection failed. No changes were committed."
      );
    }

    if (
      results[0].meta.changes !== 1 ||
      results[1].meta.changes !== 1 ||
      results[2].meta.changes !== 1
    ) {
      throw new HttpError(
        500,
        "Withdrawal refund could not be confirmed"
      );
    }

    return json({
      success: true,
      message: "Withdrawal rejected and balance refunded",
      id
    });
  }

  return json({
    success: false,
    message: "Endpoint not found"
  }, 404);
}

// ==========================================
// WORKER ENTRY POINT
// ==========================================

export default {
  async scheduled(controller, env, ctx) {
    ctx.waitUntil((async () => {
      const cleanupResults = await Promise.allSettled([
        env.DB.prepare(`
          DELETE FROM api_rate_limits
          WHERE updated_at < datetime('now', '-1 day')
        `).run(),
        env.DB.prepare(`
          DELETE FROM user_daily_activity
          WHERE utc_date < date('now', '-90 days')
        `).run()
      ]);

      for (const result of cleanupResults) {
        if (result.status === "rejected") {
          console.error("Scheduled data cleanup failed:", result.reason);
        }
      }
    })());
  },

  async fetch(request, env) {
    const cors = corsHeaders(request);

    const json = (data, status = 200) =>
      new Response(JSON.stringify(data), {
        status,
        headers: { ...JSON_HEADERS, ...cors }
      });

    const origin = request.headers.get("Origin");

    if (!isAllowedOrigin(origin)) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Origin not allowed"
        }),
        {
          status: 403,
          headers: JSON_HEADERS
        }
      );
    }

    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: { ...JSON_HEADERS, ...cors }
      });
    }

    try {
      return await handleRequest(request, env, json);
    } catch (error) {
      if (error instanceof HttpError) {
        return json(
          {
            success: false,
            error: error.message,
            ...error.extra
          },
          error.status
        );
      }

      console.error("Unhandled error:", error);

      return json(
        {
          success: false,
          error: "Internal server error"
        },
        500
      );
    }
  }
};
