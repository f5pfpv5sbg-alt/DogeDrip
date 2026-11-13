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
  "X-Content-Type-Options": "nosniff"
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
  referralValidate: { limit: 30, windowSeconds: 60 },
  authSync: { limit: 10, windowSeconds: 60 },
  claim: { limit: 20, windowSeconds: 60 },
  wheelSpin: { limit: 15, windowSeconds: 60 },
  wheelBuy: { limit: 5, windowSeconds: 60 },
  streakCheckin: { limit: 3, windowSeconds: 60 },
  withdrawalCreate: { limit: 3, windowSeconds: 3600 },
  adCreate: { limit: 3, windowSeconds: 86400 },
  adPaymentReference: { limit: 5, windowSeconds: 86400 },
  adminRead: { limit: 60, windowSeconds: 60 },
  adminReject: { limit: 10, windowSeconds: 60 },
  adminApprove: { limit: 5, windowSeconds: 60 }
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
      WHERE ref_code = ? AND uid != ?
    `).bind(referredByCode, user.sub).first();

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
    wdPending,
    wdRequested,
    wdApproved,
    wdRejected,
    balances,
    activity,
    faucetReserve,
    wheelReserve
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
      SELECT available_koinu, payouts_enabled
      FROM faucet_reserve
      WHERE id = 1
    `).first(),

    env.DB.prepare(`
      SELECT available_koinu, locked_koinu, payouts_enabled
      FROM wheel_reserve
      WHERE id = 1
    `).first()
  ]);

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
  const incomeKoinu = Number(wheelBuys?.total || 0);
  const payoutsKoinu = claimsKoinu + wheelPrizesKoinu + streakKoinu;

  return {
    success: true,
    date: today,
    registered_today: registeredToday,
    active_users_today: Number(activity?.active_users || 0),
    login_sessions_today: Number(activity?.login_sessions || 0),
    income_koinu: incomeKoinu,
    payouts_koinu: payoutsKoinu,
    profit_koinu: incomeKoinu - payoutsKoinu,
    breakdown: {
      claims_koinu: claimsKoinu,
      claims_count: Number(claims?.count || 0),
      wheel_prizes_koinu: wheelPrizesKoinu,
      wheel_spins_count: Number(wheelPrizes?.count || 0),
      streak_koinu: streakKoinu,
      streak_checkins_count: Number(streaks?.count || 0),
      wheel_purchases_koinu: incomeKoinu,
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
      wheel_payouts_enabled: Number(wheelReserve?.payouts_enabled) === 1
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
// MAIN API ROUTES
// ==========================================

async function handleRequest(request, env, json) {
  const url = new URL(request.url);
  const path = url.pathname;
  const method = request.method;

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

  // USER PROFILE
  if (path === "/api/profile" && method === "GET") {
    const user = await authenticate(request, { requireVerifiedEmail: false });
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

    const account = await env.DB.prepare(`
      SELECT ref_code, referred_by
      FROM users
      WHERE uid = ?
    `).bind(user.sub).first();

    if (!account) {
      throw new HttpError(404, "User not found");
    }

    let invitedCount = 0;

    if (account.ref_code) {
      const row = await env.DB.prepare(`
        SELECT COUNT(*) AS total
        FROM users
        WHERE referred_by = ?
          AND email_verified = 1
      `).bind(account.ref_code).first();

      invitedCount = row ? Number(row.total) : 0;
    }

    return json({
      success: true,
      ref_code: account.ref_code,
      referred_by: account.referred_by,
      invited_count: invitedCount
    });
  }

  // LUCKY WHEEL ROUTES

  if (path === "/api/wheel/state" && method === "GET") {
    const user = await authenticate(request);

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

    return json(await handleWheelBuy(env, user.sub, body));
  }

  if (path === "/api/wheel/history" && method === "GET") {
    const user = await authenticate(request);

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
        `)
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

  // ADMIN: APPROVE WITHDRAWAL
  // Real DOGE sending is not integrated.

  const approveMatch = path.match(
    /^\/api\/admin\/withdrawals\/(\d+)\/approve$/
  );

  if (approveMatch && method === "POST") {
    const user = await authenticate(request);
    await requireAdmin(user, env);

    await enforceRateLimit(
      env,
      `uid:${user.sub}`,
      "admin_withdrawal_approve",
      RATE_LIMIT_POLICIES.adminApprove
    );

    throw new HttpError(
      501,
      "Real DOGE payouts are not integrated. Withdrawal approval is disabled."
    );
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
        headers: cors
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
