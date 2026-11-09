const PROJECT_ID = "dogedrip-3ebda";

const GOOGLE_KEYS_URL =
  "https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com";

const CLAIM_AMOUNT_KOINU = 100000;
const COOLDOWN_SECONDS = 45;
const MIN_WITHDRAWAL_KOINU = 100000000;

// Add more origins here if needed (e.g. a custom domain or local dev).
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

// GOOGLE KEYS (cached)
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
    if (parts.length !== 3) throw new Error("bad token");

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
    claims.sub !== claims.user_id ||
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

  let jwk = (await getGoogleKeys()).find(k => k.kid === tokenHeader.kid);

  // Key rotation: refresh at most once per minute when the kid is unknown.
  if (!jwk && Date.now() - cachedKeysAt > 60000) {
    jwk = (await getGoogleKeys(true)).find(k => k.kid === tokenHeader.kid);
  }

  if (!jwk) throw new HttpError(401, "Signing key not found");

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

  if (!valid) throw new HttpError(401, "Invalid token signature");

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
    // fall through
  }

  throw new HttpError(400, "Invalid request body");
}

function generateRefCode() {
  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);

  let code = "DOGE";
  for (const b of bytes) code += REF_ALPHABET[b % 32];
  return code;
}

// Dogecoin address: base58check, version 0x1e (P2PKH) or 0x16 (P2SH)
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
  if (hex.length % 2) hex = "0" + hex;

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
  const hash2 = new Uint8Array(await crypto.subtle.digest("SHA-256", hash1));

  for (let i = 0; i < 4; i++) {
    if (hash2[i] !== checksum[i]) return false;
  }

  return payload[0] === 0x1e || payload[0] === 0x16;
}

async function getAccount(env, uid) {
  const account = await env.DB.prepare(`
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
      END AS cooldown_remaining
    FROM users
    WHERE uid = ?
  `).bind(COOLDOWN_SECONDS, uid).first();

  return account || null;
}

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

  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      // referred_by is only written when the row is first created,
      // and ref_code is only generated once.
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

      break;
    } catch (error) {
      if (!String(error.message).includes("UNIQUE") || attempt === 4) {
        throw error;
      }
    }
  }

  return env.DB.prepare(`
    SELECT ref_code, referred_by
    FROM users
    WHERE uid = ?
  `).bind(user.sub).first();
}

async function handleRequest(request, env, json) {
  const url = new URL(request.url);
  const path = url.pathname;
  const method = request.method;

  // HEALTH CHECK (public, no internal details)
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

  // REFERRAL CODE VALIDATION (public, returns only valid true/false)
  if (path === "/api/referral/validate" && method === "GET") {
    const code = (url.searchParams.get("code") || "").trim().toUpperCase();

    if (!REF_CODE_REGEX.test(code)) {
      return json({ success: true, valid: false });
    }

    const row = await env.DB.prepare(
      "SELECT 1 AS ok FROM users WHERE ref_code = ?"
    ).bind(code).first();

    return json({ success: true, valid: Boolean(row) });
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

  // REFERRAL STATS (real data only)
  if (path === "/api/referrals" && method === "GET") {
    const user = await authenticate(request);

    const account = await env.DB.prepare(`
      SELECT ref_code, referred_by
      FROM users
      WHERE uid = ?
    `).bind(user.sub).first();

    if (!account) throw new HttpError(404, "User not found");

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

  // CLAIM
  if (path === "/api/claim" && method === "POST") {
    const user = await authenticate(request);

    const results = await env.DB.batch([
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
      `).bind(
        CLAIM_AMOUNT_KOINU,
        user.sub,
        `-${COOLDOWN_SECONDS} seconds`
      ),

      env.DB.prepare(`
        INSERT INTO claims (uid, amount_koinu)
        SELECT ?, ?
        WHERE changes() = 1
      `).bind(user.sub, CLAIM_AMOUNT_KOINU)
    ]);

    if (results[0].meta.changes !== 1) {
      const existing = await getAccount(env, user.sub);

      if (!existing) {
        throw new HttpError(404, "User not synchronized");
      }

      throw new HttpError(
        429,
        "Cooldown active. Please wait before claiming again.",
        { cooldown_remaining: existing.cooldown_remaining }
      );
    }

    const account = await getAccount(env, user.sub);

    return json({
      success: true,
      message: "Claim successful",
      amount_koinu: CLAIM_AMOUNT_KOINU,
      balance_koinu: account.balance_koinu,
      last_claim_at: account.last_claim_at,
      cooldown_seconds: COOLDOWN_SECONDS,
      cooldown_remaining: account.cooldown_remaining
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

    return json({ success: true, claims: result.results });
  }

  // BALANCE
  if (path === "/api/balance" && method === "GET") {
    const user = await authenticate(request);
    const account = await getAccount(env, user.sub);

    if (!account) throw new HttpError(404, "User not found");

    return json({
      success: true,
      balance_koinu: account.balance_koinu,
      last_claim_at: account.last_claim_at,
      cooldown_remaining: account.cooldown_remaining,
      cooldown_seconds: COOLDOWN_SECONDS,
      claim_amount_koinu: CLAIM_AMOUNT_KOINU,
      min_withdrawal_koinu: MIN_WITHDRAWAL_KOINU
    });
  }

  // CREATE WITHDRAWAL
  if (path === "/api/withdrawals" && method === "POST") {
    const user = await authenticate(request);
    const body = await readJson(request);

    const amount = body.amount_koinu;
    const wallet =
      typeof body.wallet_address === "string"
        ? body.wallet_address.trim()
        : "";

    if (!Number.isSafeInteger(amount) || amount < MIN_WITHDRAWAL_KOINU) {
      throw new HttpError(400, "Minimum withdrawal is 1 DOGE");
    }

    if (!(await isValidDogeAddress(wallet))) {
      throw new HttpError(400, "Invalid DOGE wallet address");
    }

    const pending = await env.DB.prepare(`
      SELECT id
      FROM withdrawals
      WHERE uid = ? AND status = 'pending'
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
      // One batch = one transaction. If the insert fails (for example the
      // unique pending index), the balance deduction is rolled back too.
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
        `).bind(user.sub, amount, wallet)
      ]);
    } catch (error) {
      if (String(error.message).includes("UNIQUE")) {
        throw new HttpError(
          409,
          "You already have a pending withdrawal request."
        );
      }
      throw error;
    }

    if (results[0].meta.changes !== 1) {
      const account = await getAccount(env, user.sub);

      if (!account) throw new HttpError(404, "User not found");

      throw new HttpError(400, "Insufficient balance");
    }

    const withdrawal = await env.DB.prepare(`
      SELECT id, amount_koinu, wallet_address, status, created_at
      FROM withdrawals
      WHERE id = ? AND uid = ?
    `).bind(results[1].meta.last_row_id, user.sub).first();

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
      SELECT id, amount_koinu, wallet_address, status, created_at
      FROM withdrawals
      WHERE uid = ?
      ORDER BY id DESC
      LIMIT 100
    `).bind(user.sub).all();

    return json({ success: true, withdrawals: result.results });
  }

  // ADMIN: LIST ALL WITHDRAWALS
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

    return json({ success: true, withdrawals: result.results });
  }

  // ADMIN: APPROVE WITHDRAWAL
  const approveMatch = path.match(
    /^\/api\/admin\/withdrawals\/(\d+)\/approve$/
  );

  if (approveMatch && method === "POST") {
    const user = await authenticate(request);
    const admin = await requireAdmin(user, env);

    const id = Number(approveMatch[1]);

    if (!Number.isSafeInteger(id)) {
      throw new HttpError(400, "Invalid withdrawal id");
    }

    const result = await env.DB.prepare(`
      UPDATE withdrawals
      SET
        status = 'approved',
        processed_by = ?,
        processed_at = CURRENT_TIMESTAMP
      WHERE id = ?
        AND status = 'pending'
    `).bind(admin.uid, id).run();

    if (result.meta.changes !== 1) {
      throw new HttpError(409, "Withdrawal not found or already processed");
    }

    return json({ success: true, message: "Withdrawal approved", id });
  }

  // ADMIN: REJECT WITHDRAWAL AND REFUND (once)
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

    const results = await env.DB.batch([
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
      `).bind(id, id)
    ]);

    if (results[0].meta.changes !== 1) {
      throw new HttpError(409, "Withdrawal not found or already processed");
    }

    if (results[1].meta.changes !== 1) {
      throw new HttpError(
        500,
        "Withdrawal rejected but refund needs investigation"
      );
    }

    return json({
      success: true,
      message: "Withdrawal rejected and balance refunded",
      id
    });
  }

  // UNKNOWN ENDPOINT
  return json({ success: false, message: "Endpoint not found" }, 404);
}

export default {
  async fetch(request, env) {
    const cors = corsHeaders(request);

    const json = (data, status = 200) =>
      new Response(JSON.stringify(data), {
        status,
        headers: { ...JSON_HEADERS, ...cors }
      });

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: cors });
    }

    try {
      return await handleRequest(request, env, json);
    } catch (error) {
      if (error instanceof HttpError) {
        return json(
          { success: false, error: error.message, ...error.extra },
          error.status
        );
      }

      console.error("Unhandled error:", error);

      return json(
        { success: false, error: "Internal server error" },
        500
      );
    }
  }
};
