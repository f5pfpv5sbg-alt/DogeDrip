
const PROJECT_ID = "dogedrip-3ebda";

const GOOGLE_KEYS_URL =
  "https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com";

const MIN_WITHDRAWAL_KOINU = 100000000;
const WHEEL_USES_FAUCET_RESERVE = true;

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

  return {
    "Access-Control-Allow-Origin": ALLOWED_ORIGINS.includes(origin)
      ? origin
      : ALLOWED_ORIGINS[0],
    "Vary": "Origin",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Max-Age": "86400"
  };
}

function decodeBase64Url(value) {
  const base64 = value
    .replace(/-/g, "+")
    .replace(/_/g, "/")
    .padEnd(Math.ceil(value.length / 4) * 4, "=");

  return Uint8Array.from(atob(base64), c => c.charCodeAt(0));
}

// GOOGLE FIREBASE KEYS
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
    claims.auth_time > now
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

async function authenticate(request) {
  const authorization = request.headers.get("Authorization");

  if (!authorization?.startsWith("Bearer ")) {
    throw new HttpError(401, "Authentication required");
  }

  return verifyFirebaseToken(authorization.slice(7));
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

async function readJson(request) {
  try {
    const data = await request.json();

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

// DOGE ADDRESS VALIDATION
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

  for (let i = 0; i < hex.length; i += 2) {
    bytes.push(parseInt(hex.slice(i, i + 2), 16));
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

// USER PLAN
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

// ACCOUNT INFORMATION
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

// USER SYNCHRONIZATION
async function syncUser(env, user, referredByCode) {
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
        INSERT INTO users (uid, email, ref_code, referred_by)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(uid) DO UPDATE SET
          email = excluded.email,
          ref_code = COALESCE(users.ref_code, excluded.ref_code)
      `).bind(
        user.sub,
        user.email,
        generateRefCode(),
        referrerCode
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
    SELECT ref_code, referred_by
    FROM users
    WHERE uid = ?
  `).bind(user.sub).first();
}

// ==========================================
// LUCKY WHEEL HELPERS
// ==========================================

function getUtcDate() {
  return new Date().toISOString().slice(0, 10);
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

function selectWeightedPrize(prizes) {
  const valid = prizes.filter(
    p =>
      Number.isSafeInteger(Number(p.amount_koinu)) &&
      Number(p.amount_koinu) >= 0 &&
      Number.isSafeInteger(Number(p.probability_weight)) &&
      Number(p.probability_weight) >= 0
  );

  const totalWeight = valid.reduce(
    (sum, p) => sum + Number(p.probability_weight),
    0
  );

  if (!Number.isSafeInteger(totalWeight) || totalWeight <= 0) {
    throw new HttpError(503, "Wheel prize configuration unavailable");
  }

  const random = new Uint32Array(1);
  crypto.getRandomValues(random);

  let ticket = random[0] % totalWeight;

  for (const prize of valid) {
    const weight = Number(prize.probability_weight);

    if (weight <= 0) continue;

    if (ticket < weight) return prize;

    ticket -= weight;
  }

  throw new HttpError(500, "Could not select wheel prize");
}

async function getWheelData(env, uid, plan) {
  const utcDate = getUtcDate();

  const [prizesResult, inventory, usage, account, reserve] =
    await Promise.all([
      env.DB.prepare(`
        SELECT
          id,
          prize_key,
          amount_koinu,
          probability_weight,
          display_order
        FROM wheel_prizes
        ORDER BY display_order ASC
      `).all(),

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

      WHEEL_USES_FAUCET_RESERVE
        ? env.DB.prepare(`
            SELECT available_koinu, payouts_enabled
            FROM faucet_reserve
            WHERE id = 1
          `).first()
        : Promise.resolve({
            available_koinu: 0,
            payouts_enabled: 1
          })
    ]);

  if (!account) {
    throw new HttpError(404, "User not found");
  }

  if (!prizesResult.results?.length) {
    throw new HttpError(503, "Wheel prizes are not configured");
  }

  if (WHEEL_USES_FAUCET_RESERVE && !reserve) {
    throw new HttpError(503, "Wheel reserve is not configured");
  }

  const freeUsed = Number(usage?.free_spins_used || 0);
  const freeTotal = Number(plan.free_wheel_spins || 0);
  const freeRemaining = Math.max(0, freeTotal - freeUsed);
  const paidRemaining = Number(inventory?.paid_spins || 0);

  return {
    prizes: prizesResult.results.map(p => ({
      id: p.prize_key,
      label: `${(
        Number(p.amount_koinu) / 100000000
      ).toFixed(
        Number(p.amount_koinu) % 100000000 === 0 ? 0 : 3
      )} DOGE`,
      amount_koinu: Number(p.amount_koinu)
    })),
    packs: WHEEL_PACKAGES,
    spins: {
      free_remaining: freeRemaining,
      free_total: freeTotal,
      paid_remaining: paidRemaining,
      total_remaining: freeRemaining + paidRemaining
    },
    balance_koinu: Number(account.balance_koinu)
  };
}

async function getExistingSpin(env, uid, requestId) {
  return env.DB.prepare(`
    SELECT
      id,
      spin_type,
      prize_key,
      prize_koinu,
      created_at
    FROM wheel_spins
    WHERE uid = ? AND request_id = ?
  `).bind(uid, requestId).first();
}

async function getExistingPurchase(env, uid, requestId) {
  return env.DB.prepare(`
    SELECT
      id,
      package_spins,
      cost_koinu,
      created_at
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

async function handleWheelState(env, uid) {
  const plan = await getUserPlan(env, uid);
  const data = await getWheelData(env, uid, plan);

  return {
    success: true,
    ...data
  };
}

// ==========================================
// LUCKY WHEEL SPIN
// ==========================================

async function handleWheelSpin(env, uid, body) {
  const requestId = getRequestId(body);

  if (!WHEEL_USES_FAUCET_RESERVE) {
    throw new HttpError(
      503,
      "Wheel reserve protection is required"
    );
  }

  const plan = await getUserPlan(env, uid);

  // Idempotency check.
  const existing = await getExistingSpin(env, uid, requestId);

  if (existing) {
    const data = await getWheelData(env, uid, plan);
    return wheelSpinResponse(existing, true, data);
  }

  const before = await getWheelData(env, uid, plan);

  let spinType;

  if (before.spins.free_remaining > 0) {
    spinType = "free";
  } else if (before.spins.paid_remaining > 0) {
    spinType = "paid";
  } else {
    throw new HttpError(409, "No spins remaining");
  }

  const prizeRows = await env.DB.prepare(`
    SELECT
      id,
      prize_key,
      amount_koinu,
      probability_weight
    FROM wheel_prizes
    ORDER BY display_order ASC
  `).all();

  const prize = selectWeightedPrize(prizeRows.results || []);
  const amount = Number(prize.amount_koinu);
  const utcDate = getUtcDate();

  if (!Number.isSafeInteger(amount) || amount < 0) {
    throw new HttpError(500, "Invalid wheel prize amount");
  }

  const statements = [];

  // STEP 1: Deduct the exact prize from the reserve.
  statements.push(
    env.DB.prepare(`
      UPDATE faucet_reserve
      SET
        available_koinu = available_koinu - ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = 1
        AND payouts_enabled = 1
        AND available_koinu >= ?
    `).bind(amount, amount)
  );

  // STEP 2: Consume exactly one free or paid spin.
  if (spinType === "free") {
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

  // STEP 3: Insert the spin only if STEP 2 succeeded.
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

  // STEP 4: Credit the user only if STEP 3 succeeded.
  statements.push(
    env.DB.prepare(`
      UPDATE users
      SET balance_koinu = balance_koinu + ?
      WHERE uid = ?
        AND changes() = 1
    `).bind(amount, uid)
  );

  // STEP 5: Force a SQL error if any previous write changed 0 rows.
  // D1 rolls back the entire batch when a statement errors.
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
    // Another request may have completed the same request_id.
    const concurrentSpin = await getExistingSpin(
      env,
      uid,
      requestId
    );

    if (concurrentSpin) {
      const data = await getWheelData(env, uid, plan);
      return wheelSpinResponse(concurrentSpin, true, data);
    }

    const reserve = await env.DB.prepare(`
      SELECT available_koinu, payouts_enabled
      FROM faucet_reserve
      WHERE id = 1
    `).first();

    if (
      !reserve ||
      Number(reserve.payouts_enabled) !== 1 ||
      Number(reserve.available_koinu) < amount
    ) {
      throw new HttpError(
        503,
        "Wheel temporarily unavailable. Insufficient faucet reserve."
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
    throw new HttpError(
      500,
      "Spin record could not be confirmed"
    );
  }

  const after = await getWheelData(env, uid, plan);

  return wheelSpinResponse(savedSpin, false, after);
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
    const data = await getWheelData(env, uid, plan);

    return {
      success: true,
      replayed: true,
      purchase: {
        id: existing.id,
        spins: Number(existing.package_spins),
        price_koinu: Number(existing.cost_koinu),
        created_at: existing.created_at
      },
      ...data
    };
  }

  const pack = WHEEL_PACKAGES.find(p => p.id === packId);

  if (!pack) {
    throw new HttpError(400, "Invalid spin package");
  }

  const statements = [];

  // STEP 1: Debit the user's balance.
  statements.push(
    env.DB.prepare(`
      UPDATE users
      SET balance_koinu = balance_koinu - ?
      WHERE uid = ?
        AND balance_koinu >= ?
    `).bind(
      pack.price_koinu,
      uid,
      pack.price_koinu
    )
  );

  // STEP 2: Record the purchase only after the debit.
  statements.push(
    env.DB.prepare(`
      INSERT INTO wheel_purchases (
        uid,
        request_id,
        package_spins,
        cost_koinu
      )
      SELECT ?, ?, ?, ?
      WHERE changes() = 1
    `).bind(
      uid,
      requestId,
      pack.spins,
      pack.price_koinu
    )
  );

  // STEP 3: Add paid spins only after purchase insertion.
  statements.push(
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
        paid_spins =
          wheel_spin_inventory.paid_spins + excluded.paid_spins,
        updated_at = CURRENT_TIMESTAMP
    `).bind(uid, pack.spins)
  );

  // STEP 4: Force rollback if any required write changed 0 rows.
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
    const concurrentPurchase = await getExistingPurchase(
      env,
      uid,
      requestId
    );

    if (concurrentPurchase) {
      const plan = await getUserPlan(env, uid);
      const data = await getWheelData(env, uid, plan);

      return {
        success: true,
        replayed: true,
        purchase: {
          id: concurrentPurchase.id,
          spins: Number(concurrentPurchase.package_spins),
          price_koinu: Number(concurrentPurchase.cost_koinu),
          created_at: concurrentPurchase.created_at
        },
        ...data
      };
    }

    const account = await env.DB.prepare(`
      SELECT balance_koinu
      FROM users
      WHERE uid = ?
    `).bind(uid).first();

    if (!account) {
      throw new HttpError(404, "User not found");
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
  const data = await getWheelData(env, uid, plan);

  return {
    success: true,
    replayed: false,
    purchase: {
      id: purchase.id,
      spins: Number(purchase.package_spins),
      price_koinu: Number(purchase.cost_koinu),
      created_at: purchase.created_at
    },
    ...data
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
  if (path === "/api/auth/sync" && method === "POST") {
    const user = await authenticate(request);

    let body = {};

    try {
      body = await request.json();
    } catch {
      body = {};
    }

    const rawRef =
      body && typeof body.referred_by === "string"
        ? body.referred_by.trim().toUpperCase()
        : "";

    const profile = await syncUser(
      env,
      user,
      REF_CODE_REGEX.test(rawRef) ? rawRef : null
    );

    return json({
      success: true,
      message: "User synchronized successfully",
      uid: user.sub,
      ref_code: profile.ref_code,
      referred_by: profile.referred_by
    });
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
      `).bind(account.ref_code).first();

      invitedCount = row ? row.total : 0;
    }

    return json({
      success: true,
      ref_code: account.ref_code,
      referred_by: account.referred_by,
      invited_count: invitedCount
    });
  }

  // ==========================================
  // LUCKY WHEEL ROUTES
  // ==========================================

  if (path === "/api/wheel/state" && method === "GET") {
    const user = await authenticate(request);

    return json(
      await handleWheelState(env, user.sub)
    );
  }

  if (path === "/api/wheel/spin" && method === "POST") {
    const user = await authenticate(request);
    const body = await readJson(request);

    return json(
      await handleWheelSpin(env, user.sub, body)
    );
  }

  if (path === "/api/wheel/buy" && method === "POST") {
    const user = await authenticate(request);
    const body = await readJson(request);

    return json(
      await handleWheelBuy(env, user.sub, body)
    );
  }

  if (path === "/api/wheel/history" && method === "GET") {
    const user = await authenticate(request);

    return json(
      await handleWheelHistory(env, user.sub)
    );
  }

  // ==========================================
  // FAUCET CLAIM
  // ==========================================

  if (path === "/api/claim" && method === "POST") {
    const user = await authenticate(request);
    const plan = await getUserPlan(env, user.sub);

    let results;

    try {
      results = await env.DB.batch([
        // STEP 1: Update the user's balance and cooldown.
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

        // STEP 2: Insert the claim only after the balance update.
        env.DB.prepare(`
          INSERT INTO claims (uid, amount_koinu)
          SELECT ?, ?
          WHERE changes() = 1
        `).bind(
          user.sub,
          plan.amount_koinu
        ),

        // STEP 3: Force rollback if the claim was not inserted.
        env.DB.prepare(`
          SELECT CASE
            WHEN changes() != 1
            THEN abs(-9223372036854775808)
            ELSE 1
          END
        `)
      ]);
    } catch (error) {
      if (
        String(error.message).includes("INSUFFICIENT_FAUCET_RESERVE")
      ) {
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
        throw new HttpError(
          429,
          "Daily claim limit reached",
          {
            reason: "daily_limit",
            plan: plan.name,
            daily_claims_used: dailyUsed,
            daily_limit: plan.daily_limit,
            daily_claims_remaining: 0
          }
        );
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

    if (results[0].meta.changes !== 1 ||
        results[1].meta.changes !== 1) {
      throw new HttpError(
        500,
        "Claim transaction could not be confirmed"
      );
    }

    const account = await getAccount(env, user.sub, plan);

    if (!account) {
      throw new HttpError(404, "User not found");
    }

    const dailyUsed = Number(account.daily_claims_used || 0);

    return json({
      success: true,
      message: "Claim successful",
      plan: plan.name,
      amount_koinu: plan.amount_koinu,
      balance_koinu: account.balance_koinu,
      last_claim_at: account.last_claim_at,
      cooldown_seconds: plan.cooldown_seconds,
      cooldown_remaining: account.cooldown_remaining,
      daily_claims_used: dailyUsed,
      daily_limit: plan.daily_limit,
      daily_claims_remaining: Math.max(
        0,
        plan.daily_limit - dailyUsed
      )
    });
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
      claims: result.results
    });
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
      balance_koinu: account.balance_koinu,
      last_claim_at: account.last_claim_at,
      cooldown_remaining: account.cooldown_remaining,
      cooldown_seconds: plan.cooldown_seconds,
      claim_amount_koinu: plan.amount_koinu,
      min_withdrawal_koinu: MIN_WITHDRAWAL_KOINU,
      plan: plan.name,
      daily_claims_used: dailyUsed,
      daily_limit: plan.daily_limit,
      daily_claims_remaining: Math.max(
        0,
        plan.daily_limit - dailyUsed
      )
    });
  }

  // ==========================================
  // CREATE WITHDRAWAL
  // ==========================================

  if (path === "/api/withdrawals" && method === "POST") {
    const user = await authenticate(request);
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
        // STEP 1: Reserve the user's balance.
        env.DB.prepare(`
          UPDATE users
          SET balance_koinu = balance_koinu - ?
          WHERE uid = ?
            AND balance_koinu >= ?
        `).bind(amount, user.sub, amount),

        // STEP 2: Create one pending request only after the debit.
        // The NOT EXISTS condition protects against simultaneous requests.
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
        `).bind(
          user.sub,
          amount,
          wallet,
          user.sub
        ),

        // STEP 3: Roll back if the withdrawal was not created.
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

    if (results[0].meta.changes !== 1 ||
        results[1].meta.changes !== 1) {
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
    `).bind(
      results[1].meta.last_row_id,
      user.sub
    ).first();

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
      withdrawals: result.results
    });
  }

  // ADMIN: LIST WITHDRAWALS
  if (path === "/api/admin/withdrawals" && method === "GET") {
    const user = await authenticate(request);
    await requireAdmin(user, env);

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
      withdrawals: result.results
    });
  }

  // ADMIN: APPROVE WITHDRAWAL
  // Real DOGE sending and transaction-ID verification are not integrated.
  // Therefore approval is deliberately blocked to prevent false payment status.
  const approveMatch = path.match(
    /^\/api\/admin\/withdrawals\/(\d+)\/approve$/
  );

  if (approveMatch && method === "POST") {
    const user = await authenticate(request);
    await requireAdmin(user, env);

    throw new HttpError(
      501,
      "Real DOGE payouts are not integrated. Withdrawal approval is disabled."
    );
  }

  // ADMIN: REJECT WITHDRAWAL AND REFUND
  const rejectMatch = path.match(
    /^\/api\/admin\/withdrawals\/(\d+)\/reject$/
  );

  if (rejectMatch && method === "POST") {
    const user = await authenticate(request);
    const admin = await requireAdmin(user, env);

    const id = Number(rejectMatch[1]);

    if (!Number.isSafeInteger(id)) {
      throw new HttpError(400, "Invalid withdrawal id");
    }

    let results;

    try {
      results = await env.DB.batch([
        // STEP 1: Reject only a pending withdrawal.
        env.DB.prepare(`
          UPDATE withdrawals
          SET
            status = 'rejected',
            processed_by = ?,
            processed_at = CURRENT_TIMESTAMP
          WHERE id = ?
            AND status = 'pending'
        `).bind(admin.uid, id),

        // STEP 2: Refund only if STEP 1 changed one row.
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

        // STEP 3: Roll back if the refund did not happen.
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

    if (results[0].meta.changes !== 1 ||
        results[1].meta.changes !== 1) {
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
