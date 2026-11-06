
const PROJECT_ID = "dogedrip-3ebda";
const GOOGLE_KEYS_URL =
  "https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com";

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

  return Uint8Array.from(
    atob(base64),
    character => character.charCodeAt(0)
  );
}

async function verifyFirebaseToken(token) {
  const parts = token.split(".");

  if (parts.length !== 3) {
    throw new Error("Invalid token");
  }

  const header = JSON.parse(
    new TextDecoder().decode(decodeBase64Url(parts[0]))
  );

  const claims = JSON.parse(
    new TextDecoder().decode(decodeBase64Url(parts[1]))
  );

  if (header.alg !== "RS256" || !header.kid) {
    throw new Error("Invalid token algorithm");
  }

  const now = Math.floor(Date.now() / 1000);

  if (
    claims.aud !== PROJECT_ID ||
    claims.iss !== `https://securetoken.google.com/${PROJECT_ID}` ||
    !claims.sub ||
    claims.sub !== claims.user_id ||
    claims.sub.length > 128 ||
    !claims.email ||
    typeof claims.email !== "string" ||
    claims.exp <= now ||
    claims.iat > now ||
    claims.auth_time > now
  ) {
    throw new Error("Invalid or expired Firebase token");
  }

  const keysResponse = await fetch(GOOGLE_KEYS_URL);

  if (!keysResponse.ok) {
    throw new Error("Could not retrieve Firebase public keys");
  }

  const keySet = await keysResponse.json();
  const jwk = keySet.keys.find(key => key.kid === header.kid);

  if (!jwk) {
    throw new Error("Signing key not found");
  }

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

  if (!valid) {
    throw new Error("Invalid token signature");
  }

  return claims;
}

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") {
      return new Response(null, { headers });
    }

    const url = new URL(request.url);

    if (url.pathname === "/api/health" && request.method === "GET") {
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

    if (url.pathname === "/api/auth/sync" && request.method === "POST") {
      try {
        const authorization = request.headers.get("Authorization");

        if (!authorization?.startsWith("Bearer ")) {
          return response({
            success: false,
            error: "Authentication required"
          }, 401);
        }

        const token = authorization.slice(7);
        const user = await verifyFirebaseToken(token);

        await env.DB.prepare(`
          INSERT INTO users (uid, email)
          VALUES (?, ?)
          ON CONFLICT(uid) DO UPDATE SET email = excluded.email
        `).bind(user.sub, user.email).run();

        return response({
          success: true,
          message: "User synchronized successfully",
          uid: user.sub
        });

      } catch (error) {
        return response({
          success: false,
          error: "Authentication or synchronization failed"
        }, 401);
      }
    }

    return response({
      success: false,
      message: "Endpoint not found"
    }, 404);
  }
};
