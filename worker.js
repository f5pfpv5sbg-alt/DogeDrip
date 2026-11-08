
const PROJECT_ID = "dogedrip-3ebda";

const GOOGLE_KEYS_URL =
  "https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com";

const CLAIM_AMOUNT_KOINU = 100000;
const COOLDOWN_SECONDS = 45;
const MIN_WITHDRAWAL_KOINU = 100000000;

const headers = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "https://dogedrip.pages.dev",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization"
};

function response(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers
  });
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

  const tokenHeader = JSON.parse(
    new TextDecoder().decode(decodeBase64Url(parts[0]))
  );

  const claims = JSON.parse(
    new TextDecoder().decode(decodeBase64Url(parts[1]))
  );

  const now = Math.floor(Date.now() / 1000);

  if (
    tokenHeader.alg !== "RS256" ||
    !tokenHeader.kid ||
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

  if (!keysResponse.ok) {
    throw new Error("Could not retrieve Firebase keys");
  }

  const keySet = await keysResponse.json();
  const jwk = keySet.keys.find(key => key.kid === tokenHeader.kid);

  if (!jwk) throw new Error("Signing key not found");

  const publicKey = await crypto.subtle.importKey(
    "jwk",
    jwk,
    {
      name: "RSASSA-PKCS1-v1_5",
      hash: "SHA-256"
    },
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

async function requireAdmin(user, env) {
  const account = await env.DB.prepare(`
    SELECT uid, email, role
    FROM users
    WHERE uid = ?
  `).bind(user.sub).first();

  if (
    !account ||
    account.role !== "admin" ||
    account.email.toLowerCase() !== user.email.toLowerCase()
  ) {
    throw new Error("Admin access denied");
  }

  return account;
}

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") {
      return new Response(null, { headers });
    }

    const url = new URL(request.url);
    const path = url.pathname;

    // HEALTH CHECK
    if (path === "/api/health" && request.method === "GET") {
      try {
        const result = await env.DB.prepare(
          "SELECT name FROM sqlite_master WHERE type = 'table'"
        ).all();

        return response({
          success: true,
          message: "DogeDrip API is connected",
          database: "connected",
          tables: result.results.map(row => row.name)
        });
      } catch {
        return response({
          success: false,
          error: "Database connection failed"
        }, 500);
      }
    }

    // AUTH SYNC
    if (path === "/api/auth/sync" && request.method === "POST") {
      try {
        const user = await authenticate(request);

        await env.DB.prepare(`
          INSERT INTO users (uid, email)
          VALUES (?, ?)
          ON CONFLICT(uid)
          DO UPDATE SET email = excluded.email
        `).bind(user.sub, user.email).run();

        return response({
          success: true,
          message: "User synchronized successfully",
          uid: user.sub
        });
      } catch {
        return response({
          success: false,
          error: "Authentication or synchronization failed"
        }, 401);
      }
    }

    // CLAIM
    if (path === "/api/claim" && request.method === "POST") {
      try {
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
          const existing = await env.DB.prepare(
            "SELECT uid FROM users WHERE uid = ?"
          ).bind(user.sub).first();

          if (!existing) {
            return response({
              success: false,
              error: "User not synchronized"
            }, 404);
          }

          return response({
            success: false,
            error: "Cooldown active. Please wait before claiming again."
          }, 429);
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
        return response({
          success: false,
          error: "Claim failed or authentication invalid"
        }, 401);
      }
    }

    // CLAIM HISTORY
    if (path === "/api/claims" && request.method === "GET") {
      try {
        const user = await authenticate(request);

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
        return response({
          success: false,
          error: "Could not load claim history"
        }, 401);
      }
    }

    // BALANCE
    if (path === "/api/balance" && request.method === "GET") {
      try {
        const user = await authenticate(request);

        const account = await env.DB.prepare(`
          SELECT balance_koinu, last_claim_at
          FROM users
          WHERE uid = ?
        `).bind(user.sub).first();

        if (!account) {
          return response({
            success: false,
            error: "User not found"
          }, 404);
        }

        return response({
          success: true,
          balance_koinu: account.balance_koinu,
          last_claim_at: account.last_claim_at
        });

      } catch {
        return response({
          success: false,
          error: "Authentication failed"
        }, 401);
      }
    }

    // CREATE WITHDRAWAL
    if (path === "/api/withdrawals" && request.method === "POST") {
      try {
        const user = await authenticate(request);
        const body = await request.json();

        const amount = body.amount_koinu;
        const wallet = body.wallet_address;

        if (
          !Number.isSafeInteger(amount) ||
          amount < MIN_WITHDRAWAL_KOINU
        ) {
          return response({
            success: false,
            error: "Minimum withdrawal is 1 DOGE"
          }, 400);
        }

        if (
          typeof wallet !== "string" ||
          wallet.trim().length < 26 ||
          wallet.trim().length > 50 ||
          !/^[1-9A-HJ-NP-Za-km-z]+$/.test(wallet.trim())
        ) {
          return response({
            success: false,
            error: "Invalid DOGE wallet address"
          }, 400);
        }

        const results = await env.DB.batch([
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
          `).bind(user.sub, amount, wallet.trim())
        ]);

        if (results[0].meta.changes !== 1) {
          const account = await env.DB.prepare(`
            SELECT uid, balance_koinu
            FROM users
            WHERE uid = ?
          `).bind(user.sub).first();

          if (!account) {
            return response({
              success: false,
              error: "User not found"
            }, 404);
          }

          return response({
            success: false,
            error: "Insufficient balance"
          }, 400);
        }

        const withdrawal = await env.DB.prepare(`
          SELECT id, amount_koinu, wallet_address, status, created_at
          FROM withdrawals
          WHERE uid = ?
          ORDER BY id DESC
          LIMIT 1
        `).bind(user.sub).first();

        return response({
          success: true,
          message: "Withdrawal request submitted",
          withdrawal
        });

      } catch {
        return response({
          success: false,
          error: "Could not create withdrawal"
        }, 401);
      }
    }

    // USER WITHDRAWAL HISTORY
    if (path === "/api/withdrawals" && request.method === "GET") {
      try {
        const user = await authenticate(request);

        const result = await env.DB.prepare(`
          SELECT id, amount_koinu, wallet_address, status, created_at
          FROM withdrawals
          WHERE uid = ?
          ORDER BY id DESC
          LIMIT 100
        `).bind(user.sub).all();

        return response({
          success: true,
          withdrawals: result.results
        });

      } catch {
        return response({
          success: false,
          error: "Could not load withdrawals"
        }, 401);
      }
    }

    // ADMIN: LIST ALL WITHDRAWALS
    if (
      path === "/api/admin/withdrawals" &&
      request.method === "GET"
    ) {
      try {
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

        return response({
          success: true,
          withdrawals: result.results
        });

      } catch {
        return response({
          success: false,
          error: "Admin authentication failed"
        }, 403);
      }
    }

    // ADMIN: APPROVE WITHDRAWAL
    const approveMatch = path.match(
      /^\/api\/admin\/withdrawals\/(\d+)\/approve$/
    );

    if (approveMatch && request.method === "POST") {
      try {
        const user = await authenticate(request);
        await requireAdmin(user, env);

        const id = Number(approveMatch[1]);

        const result = await env.DB.prepare(`
          UPDATE withdrawals
          SET status = 'approved'
          WHERE id = ?
            AND status = 'pending'
        `).bind(id).run();

        if (result.meta.changes !== 1) {
          return response({
            success: false,
            error: "Withdrawal not found or already processed"
          }, 409);
        }

        return response({
          success: true,
          message: "Withdrawal approved",
          id
        });

      } catch {
        return response({
          success: false,
          error: "Admin authentication failed"
        }, 403);
      }
    }

    // ADMIN: REJECT WITHDRAWAL AND REFUND
    const rejectMatch = path.match(
      /^\/api\/admin\/withdrawals\/(\d+)\/reject$/
    );

    if (rejectMatch && request.method === "POST") {
      try {
        const user = await authenticate(request);
        await requireAdmin(user, env);

        const id = Number(rejectMatch[1]);

        const results = await env.DB.batch([
          env.DB.prepare(`
            UPDATE withdrawals
            SET status = 'rejected'
            WHERE id = ?
              AND status = 'pending'
          `).bind(id),

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
          return response({
            success: false,
            error: "Withdrawal not found or already processed"
          }, 409);
        }

        if (results[1].meta.changes !== 1) {
          return response({
            success: false,
            error: "Withdrawal rejected but refund needs investigation"
          }, 500);
        }

        return response({
          success: true,
          message: "Withdrawal rejected and balance refunded",
          id
        });

      } catch {
        return response({
          success: false,
          error: "Admin authentication failed"
        }, 403);
      }
    }

    // UNKNOWN ENDPOINT
    return response({
      success: false,
      message: "Endpoint not found"
    }, 404);
  }
};
