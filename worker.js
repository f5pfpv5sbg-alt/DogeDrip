/**
 * DogeDrip API — Cloudflare Worker
 *
 * Baseline: the existing worker.js (health, auth sync, claim, claims, balance)
 * is preserved. Added:
 *   - POST /api/email/send-code   (Brevo, 6-digit code, 10 min TTL, 60 s resend)
 *   - POST /api/email/verify-code (server-side check, 5 attempts max)
 *   - GET  /api/email/status      (source of truth for the UI)
 *   - Email verification enforcement on /api/claim (backend, not UI)
 *   - Reset of email verification when the account email changes
 *
 * Secrets required:
 *   BREVO_API_KEY        (already configured)
 *   EMAIL_CODE_PEPPER    (new, min 16 chars; see INTEGRIMI.md)
 *
 * No code, hash pepper or secret is ever logged by this file.
 */

const PROJECT_ID = "dogedrip-3ebda";

const GOOGLE_KEYS_URL =
  "https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com";

const CLAIM_AMOUNT_KOINU = 100000;
const COOLDOWN_SECONDS = 45;

/* Email verification configuration */
const CODE_TTL_SECONDS = 10 * 60;
const RESEND_COOLDOWN_SECONDS = 60;
const MAX_CODE_ATTEMPTS = 5;
const BREVO_API_URL = "https://api.brevo.com/v3/smtp/email";
const EMAIL_FROM_ADDRESS = "support.dogedrip@gmail.com";
const EMAIL_FROM_NAME = "DogeDrip";
const CODE_HASH_PREFIX = "hmac-sha256:";
const PEPPER_MIN_LENGTH = 16;

/* Profile configuration */
const AVATAR_MAX_BYTES = 2 * 1024 * 1024;
const AVATAR_KEY_PREFIX = "avatars/";
const UID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;

/**
 * When true (default), /api/claim requires email_verified = 1 in D1.
 * Set to false only during a controlled rollout: it weakens the gate.
 */
const EMAIL_VERIFICATION_ENFORCED = true;

const headers = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "https://dogedrip.pages.dev",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Cache-Control": "no-store"
};

function response(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers });
}

function fail(error, status, extra = {}) {
  return response({ success: false, error, ...extra }, status);
}

function dbTimestampToMs(value) {
  if (typeof value !== "string" || !value) return NaN;

  // SQLite CURRENT_TIMESTAMP format is UTC but not ISO ("YYYY-MM-DD HH:MM:SS").
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(value)) {
    return Date.parse(`${value.replace(" ", "T")}Z`);
  }

  return Date.parse(value);
}

function toHex(bytes) {
  let out = "";
  for (const byte of bytes) out += byte.toString(16).padStart(2, "0");
  return out;
}

function avatarObjectKey(uid) {
  return `${AVATAR_KEY_PREFIX}${uid}`;
}

/**
 * Detects the real image type from magic bytes. The client-provided
 * Content-Type is never trusted on its own.
 */
export function detectImageType(buffer) {
  const bytes = new Uint8Array(buffer);

  if (
    bytes.length >= 4 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47
  ) {
    return { ext: "png", contentType: "image/png" };
  }

  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return { ext: "jpg", contentType: "image/jpeg" };
  }

  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return { ext: "webp", contentType: "image/webp" };
  }

  return null;
}

/** Badge is derived from the stored plan only; users cannot choose it. */
export function planBadge(plan) {
  const normalized = String(plan ?? "").trim().toUpperCase();
  if (normalized === "PREMIUM") return "premium";
  if (normalized === "VIP") return "vip";
  return null;
}

export function deriveUsername(email, uid) {
  const local = String(email ?? "")
    .split("@")[0]
    .replace(/[^A-Za-z0-9_]/g, "")
    .slice(0, 20);

  if (local.length >= 3) return local;

  const suffix = String(uid ?? "")
    .slice(-6)
    .replace(/[^A-Za-z0-9]/g, "");

  return suffix ? `user_${suffix}` : "user";
}

function buildProfile(row) {
  const plan = String(row.plan || "FREE").trim().toUpperCase();
  const createdMs = row.created_at ? dbTimestampToMs(row.created_at) : NaN;

  return {
    uid: row.uid,
    email: row.email,
    username: row.username ? String(row.username) : deriveUsername(row.email, row.uid),
    plan,
    badge: planBadge(plan),
    ref_code: row.ref_code || null,
    created_at: row.created_at || null,
    member_since_iso: Number.isFinite(createdMs) ? new Date(createdMs).toISOString() : null,
    email_verified: Number(row.email_verified) === 1,
    email_verified_at: row.email_verified_at || null,
    avatar_url: row.avatar_url || null
  };
}

export function generateVerificationCode() {
  const cryptoObject = globalThis.crypto;
  if (!cryptoObject || typeof cryptoObject.getRandomValues !== "function") {
    throw new Error("A secure random source is unavailable");
  }

  const range = 1000000;
  const limit = Math.floor(0x100000000 / range) * range; // unbiased rejection sampling
  const buffer = new Uint32Array(1);
  let value;

  do {
    cryptoObject.getRandomValues(buffer);
    value = buffer[0];
  } while (value >= limit);

  return String(value % range).padStart(6, "0");
}

export async function hashVerificationCode(code, pepper) {
  if (typeof code !== "string" || !/^\d{6}$/.test(code)) {
    throw new Error("Invalid verification code format");
  }
  if (typeof pepper !== "string" || pepper.length < PEPPER_MIN_LENGTH) {
    throw new Error("EMAIL_CODE_PEPPER is missing or shorter than 16 characters");
  }

  const key = await globalThis.crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(pepper),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const signature = await globalThis.crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(code)
  );

  return CODE_HASH_PREFIX + toHex(new Uint8Array(signature));
}

export function timingSafeEqualHex(a, b) {
  if (typeof a !== "string" || typeof b !== "string") return false;
  if (a.length !== b.length || a.length === 0) return false;

  let difference = 0;
  for (let i = 0; i < a.length; i += 1) {
    difference |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return difference === 0;
}

export async function verifyVerificationCode(code, storedHash, pepper) {
  if (typeof storedHash !== "string" || !storedHash.startsWith(CODE_HASH_PREFIX)) {
    return false;
  }

  let candidate;
  try {
    candidate = await hashVerificationCode(code, pepper);
  } catch {
    return false;
  }

  return timingSafeEqualHex(candidate, storedHash);
}

export function evaluateSendWindow({ lastSentAt = null, now = Date.now() } = {}) {
  if (!lastSentAt) return { allowed: true, retryAfterMs: 0 };

  const last = dbTimestampToMs(lastSentAt);
  if (!Number.isFinite(last)) return { allowed: true, retryAfterMs: 0 };

  const elapsed = now - last;
  if (elapsed >= RESEND_COOLDOWN_SECONDS * 1000) {
    return { allowed: true, retryAfterMs: 0 };
  }

  return {
    allowed: false,
    retryAfterMs: RESEND_COOLDOWN_SECONDS * 1000 - Math.max(elapsed, 0)
  };
}

function buildVerificationEmailHtml(code) {
  return `<!doctype html>
<html lang="en">
  <body style="margin:0;padding:0;background:#000000;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
      style="background:#000000;padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
            style="max-width:520px;background:#0a0a0a;border:1px solid #1f2937;border-radius:16px;padding:32px;font-family:Helvetica,Arial,sans-serif;color:#ffffff;">
            <tr>
              <td style="font-size:20px;font-weight:800;letter-spacing:-0.5px;padding-bottom:8px;">
                DOGE<span style="color:#F4A6C1;">DRIP</span>
              </td>
            </tr>
            <tr>
              <td style="font-size:15px;color:#cbd5e1;padding-bottom:24px;">
                Use this code to verify the email address on your DogeDrip account.
              </td>
            </tr>
            <tr>
              <td align="center" style="padding:24px 0;">
                <div style="display:inline-block;background:#F4A6C1;color:#000000;font-family:Consolas,Menlo,monospace;font-size:32px;font-weight:800;letter-spacing:10px;padding:16px 24px;border-radius:12px;">
                  ${code}
                </div>
              </td>
            </tr>
            <tr>
              <td style="font-size:13px;color:#94a3b8;padding-top:16px;">
                The code expires in 10 minutes. You have 5 attempts.
                If you did not request it, ignore this email — your account stays unverified.
              </td>
            </tr>
            <tr>
              <td style="font-size:12px;color:#475569;padding-top:24px;border-top:1px solid #1f2937;">
                DogeDrip never asks for this code, your password or your wallet phrase.
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

export async function sendVerificationEmail({
  apiKey,
  to,
  code,
  fetcher = globalThis.fetch,
  fromEmail = EMAIL_FROM_ADDRESS,
  fromName = EMAIL_FROM_NAME
} = {}) {
  if (typeof apiKey !== "string" || !apiKey) {
    return { ok: false, status: 0, message: "BREVO_API_KEY is missing" };
  }
  if (typeof to !== "string" || !to.includes("@")) {
    return { ok: false, status: 0, message: "Invalid recipient" };
  }
  if (typeof fetcher !== "function") {
    return { ok: false, status: 0, message: "fetch is unavailable" };
  }

  const payload = {
    sender: { name: fromName, email: fromEmail },
    to: [{ email: to }],
    subject: "Your DogeDrip verification code",
    htmlContent: buildVerificationEmailHtml(code),
    textContent: `Your DogeDrip verification code is ${code}. It expires in 10 minutes. You have ${MAX_CODE_ATTEMPTS} attempts.`
  };

  let res;
  try {
    res = await fetcher(BREVO_API_URL, {
      method: "POST",
      headers: {
        "api-key": apiKey,
        "content-type": "application/json",
        accept: "application/json"
      },
      body: JSON.stringify(payload)
    });
  } catch (error) {
    // Never surface the provider error body: it can echo request content.
    return { ok: false, status: 0, message: "Email provider unreachable" };
  }

  if (!res || !res.ok) {
    return {
      ok: false,
      status: res ? res.status : 0,
      message: "Email provider rejected the request"
    };
  }

  return { ok: true, status: res.status };
}

function decodeBase64Url(value) {
  const base64 = value
    .replace(/-/g, "+")
    .replace(/_/g, "/")
    .padEnd(Math.ceil(value.length / 4) * 4, "=");

  return Uint8Array.from(atob(base64), c => c.charCodeAt(0));
}

async function verifyFirebaseToken(token) {
  const parts = token.split(".");
  if (parts.length !== 3) throw new Error("Invalid token");

  const header = JSON.parse(
    new TextDecoder().decode(decodeBase64Url(parts[0]))
  );

  const claims = JSON.parse(
    new TextDecoder().decode(decodeBase64Url(parts[1]))
  );

  const now = Math.floor(Date.now() / 1000);

  if (
    header.alg !== "RS256" ||
    !header.kid ||
    claims.aud !== PROJECT_ID ||
    claims.iss !== `https://securetoken.google.com/${PROJECT_ID}` ||
    !claims.sub ||
    claims.sub !== claims.user_id ||
    claims.sub.length > 128 ||
    !claims.email ||
    typeof claims.email !== "string" ||
    !Number.isFinite(claims.exp) ||
    !Number.isFinite(claims.iat) ||
    !Number.isFinite(claims.auth_time) ||
    claims.exp <= now ||
    claims.iat > now ||
    claims.auth_time > now
  ) {
    throw new Error("Invalid Firebase token");
  }

  const keysResponse = await fetch(GOOGLE_KEYS_URL);
  if (!keysResponse.ok) throw new Error("Could not retrieve keys");

  const keySet = await keysResponse.json();
  const jwk = keySet.keys.find(key => key.kid === header.kid);

  if (!jwk) throw new Error("Signing key not found");

  const publicKey = await crypto.subtle.importKey(
    "jwk",
    jwk,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["verify"]
  );

  const valid = await crypto.subtle.verify(
    "RSASSA-PKCS1-v1_5",
    publicKey,
    decodeBase64Url(parts[2]),
    new TextEncoder().encode(`${parts[0]}.${parts[1]}`)
  );

  if (!valid) throw new Error("Invalid token signature");

  return claims;
}

async function authenticate(request) {
  const authorization = request.headers.get("Authorization");

  if (!authorization?.startsWith("Bearer ")) {
    throw new Error("Authentication required");
  }

  return verifyFirebaseToken(authorization.slice(7));
}

function emailVerificationConfigured(env) {
  return (
    typeof env.BREVO_API_KEY === "string" &&
    env.BREVO_API_KEY.length > 0 &&
    typeof env.EMAIL_CODE_PEPPER === "string" &&
    env.EMAIL_CODE_PEPPER.length >= PEPPER_MIN_LENGTH
  );
}

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") {
      return new Response(null, { headers });
    }

    const url = new URL(request.url);

    // HEALTH CHECK
    if (url.pathname === "/api/health" && request.method === "GET") {
      try {
        const result = await env.DB.prepare(
          "SELECT name FROM sqlite_master WHERE type = 'table'"
        ).all();

        return response({
          success: true,
          message: "DogeDrip API is connected",
          database: "connected",
          tables: result.results.map(row => row.name),
          email_verification_configured: emailVerificationConfigured(env)
        });
      } catch {
        return response(
          { success: false, error: "Database connection failed" },
          500
        );
      }
    }

    // AUTH SYNC
    if (url.pathname === "/api/auth/sync" && request.method === "POST") {
      let user;
      try {
        user = await authenticate(request);
      } catch {
        return fail("Authentication required", 401);
      }

      try {
        const previous = await env.DB.prepare(
          "SELECT * FROM users WHERE uid = ?"
        ).bind(user.sub).first();

        const emailChanged = Boolean(
          previous && previous.email && previous.email !== user.email
        );

        await env.DB.prepare(`
          INSERT INTO users (uid, email)
          VALUES (?, ?)
          ON CONFLICT(uid) DO UPDATE SET email = excluded.email
        `).bind(user.sub, user.email).run();

        if (emailChanged) {
          // A new address must be verified again; pending codes are invalid.
          await env.DB.batch([
            env.DB.prepare(
              "UPDATE users SET email_verified = 0, email_verified_at = NULL WHERE uid = ?"
            ).bind(user.sub),
            env.DB.prepare(
              "DELETE FROM email_verification_codes WHERE uid = ?"
            ).bind(user.sub)
          ]);
        }

        // Backfill a real username once, only if the column exists.
        if (previous && "username" in previous && !previous.username) {
          await env.DB.prepare(
            "UPDATE users SET username = ? WHERE uid = ?"
          ).bind(deriveUsername(user.email, user.sub), user.sub).run();
        }

        const state = await env.DB.prepare(
          "SELECT email_verified FROM users WHERE uid = ?"
        ).bind(user.sub).first();

        return response({
          success: true,
          message: "User synchronized successfully",
          uid: user.sub,
          email_verified: Number(state?.email_verified) === 1,
          email_changed: emailChanged
        });
      } catch {
        return fail("Authentication or synchronization failed", 401);
      }
    }

    // EMAIL VERIFICATION — SEND CODE
    if (url.pathname === "/api/email/send-code" && request.method === "POST") {
      let user;
      try {
        user = await authenticate(request);
      } catch {
        return fail("Authentication required", 401);
      }

      if (!emailVerificationConfigured(env)) {
        return fail("Email verification is not configured", 500, {
          code: "not_configured"
        });
      }

      try {
        const account = await env.DB.prepare(
          "SELECT email, email_verified FROM users WHERE uid = ?"
        ).bind(user.sub).first();

        if (!account) return fail("User not synchronized", 404, { code: "not_synced" });

        if (Number(account.email_verified) === 1) {
          return fail("Email is already verified", 409, { code: "already_verified" });
        }

        const existing = await env.DB.prepare(
          "SELECT last_sent_at FROM email_verification_codes WHERE uid = ?"
        ).bind(user.sub).first();

        const now = Date.now();
        const window = evaluateSendWindow({
          lastSentAt: existing ? existing.last_sent_at : null,
          now
        });

        if (!window.allowed) {
          return fail("Please wait before requesting a new code", 429, {
            code: "resend_too_soon",
            retry_after_seconds: Math.max(1, Math.ceil(window.retryAfterMs / 1000))
          });
        }

        const code = generateVerificationCode();
        const codeHash = await hashVerificationCode(code, env.EMAIL_CODE_PEPPER);
        const expiresAt = new Date(now + CODE_TTL_SECONDS * 1000).toISOString();
        const sentAt = new Date(now).toISOString();

        // Only the HMAC hash is stored; attempts reset on every new code.
        await env.DB.prepare(`
          INSERT INTO email_verification_codes
            (uid, code_hash, expires_at, attempts, last_sent_at, created_at)
          VALUES (?, ?, ?, 0, ?, ?)
          ON CONFLICT(uid) DO UPDATE SET
            code_hash = excluded.code_hash,
            expires_at = excluded.expires_at,
            attempts = 0,
            last_sent_at = excluded.last_sent_at,
            created_at = excluded.created_at
        `).bind(user.sub, codeHash, expiresAt, sentAt, sentAt).run();

        const delivery = await sendVerificationEmail({
          apiKey: env.BREVO_API_KEY,
          to: account.email,
          code
        });

        if (!delivery.ok) {
          // Allow an immediate retry: no code was delivered, no cooldown burn.
          await env.DB.prepare(
            "DELETE FROM email_verification_codes WHERE uid = ?"
          ).bind(user.sub).run();

          return fail("Could not send the verification email", 502, {
            code: "email_delivery_failed"
          });
        }

        return response({
          success: true,
          message: "Verification code sent",
          email: account.email,
          expires_in_seconds: CODE_TTL_SECONDS,
          resend_after_seconds: RESEND_COOLDOWN_SECONDS,
          max_attempts: MAX_CODE_ATTEMPTS
        });
      } catch {
        return fail("Could not send verification code", 500);
      }
    }

    // EMAIL VERIFICATION — VERIFY CODE
    if (url.pathname === "/api/email/verify-code" && request.method === "POST") {
      let user;
      try {
        user = await authenticate(request);
      } catch {
        return fail("Authentication required", 401);
      }

      if (!emailVerificationConfigured(env)) {
        return fail("Email verification is not configured", 500, {
          code: "not_configured"
        });
      }

      let body;
      try {
        body = await request.json();
      } catch {
        return fail("Invalid request body", 400, { code: "invalid_body" });
      }

      const code = typeof body?.code === "string" ? body.code.trim() : "";

      if (!/^\d{6}$/.test(code)) {
        return fail("Enter the 6-digit code", 400, { code: "invalid_format" });
      }

      try {
        const account = await env.DB.prepare(
          "SELECT email, email_verified FROM users WHERE uid = ?"
        ).bind(user.sub).first();

        if (!account) return fail("User not synchronized", 404, { code: "not_synced" });

        if (Number(account.email_verified) === 1) {
          return response({
            success: true,
            message: "Email is already verified",
            email: account.email,
            email_verified: true
          });
        }

        const record = await env.DB.prepare(
          "SELECT code_hash, expires_at, attempts FROM email_verification_codes WHERE uid = ?"
        ).bind(user.sub).first();

        if (!record) {
          return fail("No active code. Request a new one.", 400, {
            code: "no_active_code"
          });
        }

        const now = Date.now();
        const attempts = Number(record.attempts);

        if (attempts >= MAX_CODE_ATTEMPTS) {
          await env.DB.prepare(
            "DELETE FROM email_verification_codes WHERE uid = ?"
          ).bind(user.sub).run();

          return fail("Too many incorrect attempts. Request a new code.", 429, {
            code: "too_many_attempts",
            attempts_left: 0
          });
        }

        const expiresAtMs = dbTimestampToMs(record.expires_at);

        if (!Number.isFinite(expiresAtMs) || now >= expiresAtMs) {
          await env.DB.prepare(
            "DELETE FROM email_verification_codes WHERE uid = ?"
          ).bind(user.sub).run();

          return fail("This code has expired. Request a new one.", 400, {
            code: "code_expired"
          });
        }

        const matches = await verifyVerificationCode(
          code,
          record.code_hash,
          env.EMAIL_CODE_PEPPER
        );

        if (!matches) {
          const updated = await env.DB.prepare(
            "UPDATE email_verification_codes SET attempts = attempts + 1 WHERE uid = ? AND attempts < ?"
          ).bind(user.sub, MAX_CODE_ATTEMPTS).run();

          const attemptsUsed = attempts + 1;
          const attemptsLeft = Math.max(0, MAX_CODE_ATTEMPTS - attemptsUsed);

          if (attemptsLeft === 0 || updated.meta?.changes === 0) {
            await env.DB.prepare(
              "DELETE FROM email_verification_codes WHERE uid = ?"
            ).bind(user.sub).run();

            return fail("Too many incorrect attempts. Request a new code.", 429, {
              code: "too_many_attempts",
              attempts_left: 0
            });
          }

          return fail("Incorrect code", 400, {
            code: "invalid_code",
            attempts_left: attemptsLeft
          });
        }

        const verifiedAt = new Date(now).toISOString();

        await env.DB.batch([
          env.DB.prepare(
            "UPDATE users SET email_verified = 1, email_verified_at = ? WHERE uid = ?"
          ).bind(verifiedAt, user.sub),
          env.DB.prepare(
            "DELETE FROM email_verification_codes WHERE uid = ?"
          ).bind(user.sub)
        ]);

        const stored = await env.DB.prepare(
          "SELECT email_verified, email_verified_at FROM users WHERE uid = ?"
        ).bind(user.sub).first();

        if (Number(stored?.email_verified) !== 1) {
          return fail("Could not verify email", 500);
        }

        return response({
          success: true,
          message: "Email verified successfully",
          email: account.email,
          email_verified: true,
          email_verified_at: stored.email_verified_at
        });
      } catch {
        return fail("Could not verify code", 500);
      }
    }

    // EMAIL VERIFICATION — STATUS (backend is the only source of truth)
    if (url.pathname === "/api/email/status" && request.method === "GET") {
      let user;
      try {
        user = await authenticate(request);
      } catch {
        return fail("Authentication required", 401);
      }

      try {
        const account = await env.DB.prepare(
          "SELECT email, email_verified, email_verified_at FROM users WHERE uid = ?"
        ).bind(user.sub).first();

        if (!account) return fail("User not synchronized", 404, { code: "not_synced" });

        const verified = Number(account.email_verified) === 1;

        if (verified) {
          return response({
            success: true,
            email: account.email,
            email_verified: true,
            email_verified_at: account.email_verified_at,
            pending_code: false
          });
        }

        const record = await env.DB.prepare(
          "SELECT expires_at, attempts, last_sent_at FROM email_verification_codes WHERE uid = ?"
        ).bind(user.sub).first();

        const now = Date.now();
        const expiresAtMs = record ? dbTimestampToMs(record.expires_at) : NaN;
        const sentAtMs = record ? dbTimestampToMs(record.last_sent_at) : NaN;

        const codeActive = Boolean(
          record &&
          Number.isFinite(expiresAtMs) &&
          now < expiresAtMs &&
          Number(record.attempts) < MAX_CODE_ATTEMPTS
        );

        return response({
          success: true,
          email: account.email,
          email_verified: false,
          email_verified_at: null,
          pending_code: codeActive,
          code_expires_in_seconds: codeActive
            ? Math.max(0, Math.ceil((expiresAtMs - now) / 1000))
            : 0,
          resend_in_seconds:
            record && Number.isFinite(sentAtMs)
              ? Math.max(0, Math.ceil((sentAtMs + RESEND_COOLDOWN_SECONDS * 1000 - now) / 1000))
              : 0,
          attempts_left: record
            ? Math.max(0, MAX_CODE_ATTEMPTS - Number(record.attempts))
            : MAX_CODE_ATTEMPTS,
          max_attempts: MAX_CODE_ATTEMPTS
        });
      } catch {
        return fail("Could not load email status", 500);
      }
    }

    // PROFILE (read-only; every field comes from D1)
    if (url.pathname === "/api/profile" && request.method === "GET") {
      let user;
      try {
        user = await authenticate(request);
      } catch {
        return fail("Authentication required", 401);
      }

      try {
        // SELECT * keeps this working before/after the profile migration.
        const row = await env.DB.prepare(
          "SELECT * FROM users WHERE uid = ?"
        ).bind(user.sub).first();

        if (!row) return fail("User not synchronized", 404, { code: "not_synced" });

        return response({
          success: true,
          profile: buildProfile(row),
          avatar_storage_configured: Boolean(env.AVATARS)
        });
      } catch {
        return fail("Could not load profile", 500);
      }
    }

    // AVATAR UPLOAD (binary body, R2, never D1)
    if (url.pathname === "/api/profile/avatar" && request.method === "POST") {
      let user;
      try {
        user = await authenticate(request);
      } catch {
        return fail("Authentication required", 401);
      }

      if (!env.AVATARS) {
        return fail("Avatar storage is not configured", 503, {
          code: "avatar_storage_not_configured"
        });
      }

      const contentType = (request.headers.get("content-type") || "")
        .split(";")[0]
        .trim()
        .toLowerCase();

      if (!["image/png", "image/jpeg", "image/jpg", "image/webp"].includes(contentType)) {
        return fail("Only PNG, JPEG or WebP images are allowed", 415, {
          code: "unsupported_media_type"
        });
      }

      const declaredLength = Number(request.headers.get("content-length") || 0);
      if (Number.isFinite(declaredLength) && declaredLength > AVATAR_MAX_BYTES) {
        return fail("Image must be 2 MB or smaller", 413, { code: "file_too_large" });
      }

      let buffer;
      try {
        buffer = await request.arrayBuffer();
      } catch {
        return fail("Could not read the uploaded file", 400, { code: "invalid_body" });
      }

      if (buffer.byteLength === 0) {
        return fail("The uploaded file is empty", 400, { code: "empty_file" });
      }

      if (buffer.byteLength > AVATAR_MAX_BYTES) {
        return fail("Image must be 2 MB or smaller", 413, { code: "file_too_large" });
      }

      const detected = detectImageType(buffer);
      if (!detected) {
        return fail("The file is not a valid PNG, JPEG or WebP image", 415, {
          code: "invalid_image"
        });
      }

      const uid = user.sub;
      if (!UID_PATTERN.test(uid)) {
        return fail("Invalid account identifier", 400);
      }

      const key = avatarObjectKey(uid);

      try {
        await env.AVATARS.put(key, buffer, {
          httpMetadata: {
            contentType: detected.contentType,
            cacheControl: "public, max-age=300"
          }
        });
      } catch {
        return fail("Could not store the image", 502, { code: "storage_failed" });
      }

      const avatarUrl = `/api/avatar/${uid}?v=${Date.now()}`;

      try {
        await env.DB.prepare(
          "UPDATE users SET avatar_url = ? WHERE uid = ?"
        ).bind(avatarUrl, uid).run();
      } catch {
        // Do not leave an orphan object behind if the column is missing.
        try {
          await env.AVATARS.delete(key);
        } catch {}

        return fail("Profile photo column is missing. Run the profile migration.", 503, {
          code: "schema_incomplete"
        });
      }

      return response({
        success: true,
        message: "Profile photo updated",
        avatar_url: avatarUrl
      });
    }

    // AVATAR DELETE
    if (url.pathname === "/api/profile/avatar" && request.method === "DELETE") {
      let user;
      try {
        user = await authenticate(request);
      } catch {
        return fail("Authentication required", 401);
      }

      if (!env.AVATARS) {
        return fail("Avatar storage is not configured", 503, {
          code: "avatar_storage_not_configured"
        });
      }

      const uid = user.sub;
      if (!UID_PATTERN.test(uid)) {
        return fail("Invalid account identifier", 400);
      }

      try {
        await env.AVATARS.delete(avatarObjectKey(uid));
      } catch {
        return fail("Could not remove the image", 502, { code: "storage_failed" });
      }

      try {
        await env.DB.prepare(
          "UPDATE users SET avatar_url = NULL WHERE uid = ?"
        ).bind(uid).run();
      } catch {
        return fail("Profile photo column is missing. Run the profile migration.", 503, {
          code: "schema_incomplete"
        });
      }

      return response({
        success: true,
        message: "Profile photo removed",
        avatar_url: null
      });
    }

    // PUBLIC AVATAR (served from R2; unguessable-by-uid only, no private data)
    const avatarMatch = url.pathname.match(/^\/api\/avatar\/([A-Za-z0-9_-]{1,128})$/);
    if (avatarMatch && request.method === "GET") {
      if (!env.AVATARS) {
        return fail("Avatar storage is not configured", 503, {
          code: "avatar_storage_not_configured"
        });
      }

      let object;
      try {
        object = await env.AVATARS.get(avatarObjectKey(avatarMatch[1]));
      } catch {
        return fail("Could not load the image", 502, { code: "storage_failed" });
      }

      if (!object || !object.body) {
        return new Response(null, { status: 404, headers });
      }

      const imageHeaders = new Headers(headers);
      imageHeaders.set(
        "Content-Type",
        (object.httpMetadata && object.httpMetadata.contentType) || "application/octet-stream"
      );
      imageHeaders.set("Cache-Control", "public, max-age=300");

      return new Response(object.body, { status: 200, headers: imageHeaders });
    }

    // CLAIM
    if (url.pathname === "/api/claim" && request.method === "POST") {
      let user;
      try {
        user = await authenticate(request);
      } catch {
        return fail("Claim failed or authentication invalid", 401);
      }

      try {
        if (EMAIL_VERIFICATION_ENFORCED) {
          const account = await env.DB.prepare(
            "SELECT email_verified FROM users WHERE uid = ?"
          ).bind(user.sub).first();

          if (!account) {
            return fail("User not synchronized", 404, { code: "not_synced" });
          }

          if (Number(account.email_verified) !== 1) {
            return fail("Verify your email address before claiming", 403, {
              code: "email_verified_required"
            });
          }
        }

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
          `).bind(
            user.sub,
            CLAIM_AMOUNT_KOINU
          )
        ]);

        if (results[0].meta.changes !== 1) {
          const existing = await env.DB.prepare(
            "SELECT uid FROM users WHERE uid = ?"
          ).bind(user.sub).first();

          if (!existing) {
            return fail("User not synchronized", 404, { code: "not_synced" });
          }

          return fail("Cooldown active. Please wait before claiming again.", 429, {
            code: "cooldown_active"
          });
        }

        const account = await env.DB.prepare(`
          SELECT balance_koinu, last_claim_at
          FROM users
          WHERE uid = ?
        `).bind(user.sub).first();

        return response({
          success: true,
          message: "Claim successful",
          amount_koinu: CLAIM_AMOUNT_KOINU,
          balance_koinu: account.balance_koinu,
          last_claim_at: account.last_claim_at
        });
      } catch {
        return fail("Claim failed or authentication invalid", 401);
      }
    }

    // CLAIM HISTORY
    if (url.pathname === "/api/claims" && request.method === "GET") {
      let user;
      try {
        user = await authenticate(request);
      } catch {
        return fail("Could not load claim history", 401);
      }

      try {
        const result = await env.DB.prepare(`
          SELECT id, amount_koinu, claimed_at
          FROM claims
          WHERE uid = ?
          ORDER BY id DESC
          LIMIT 50
        `).bind(user.sub).all();

        return response({
          success: true,
          claims: result.results
        });
      } catch {
        return fail("Could not load claim history", 500);
      }
    }

    // BALANCE
    if (url.pathname === "/api/balance" && request.method === "GET") {
      let user;
      try {
        user = await authenticate(request);
      } catch {
        return fail("Authentication failed", 401);
      }

      try {
        const account = await env.DB.prepare(`
          SELECT balance_koinu, last_claim_at, email_verified
          FROM users
          WHERE uid = ?
        `).bind(user.sub).first();

        if (!account) {
          return fail("User not found", 404);
        }

        return response({
          success: true,
          balance_koinu: account.balance_koinu,
          last_claim_at: account.last_claim_at,
          email_verified: Number(account.email_verified) === 1
        });
      } catch {
        return fail("Could not load balance", 500);
      }
    }

    // UNKNOWN ENDPOINT
    return response({
      success: false,
      message: "Endpoint not found"
    }, 404);
  }
};
