// worker.js - Cloudflare Worker for DogeDrip API

const ALLOWED_ORIGIN = "https://dogedrip.pages.dev";

function corsHeaders(origin = ALLOWED_ORIGIN) {
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Max-Age": "86400",
  };
}

function jsonResponse(data, status = 200, origin = ALLOWED_ORIGIN) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...corsHeaders(origin),
    },
  });
}

// Funksioni strikt i verifikimit server-side
async function verifyTurnstileToken(token, requestIp, secretKey) {
  if (!token) {
    return { success: false, error: "Missing Turnstile CAPTCHA token." };
  }

  try {
    const formData = new URLSearchParams();
    formData.append("secret", secretKey);
    formData.append("response", token);
    if (requestIp) {
      formData.append("remoteip", requestIp);
    }

    const result = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      body: formData,
    });

    const outcome = await result.json();

    if (!outcome.success) {
      return { success: false, error: "CAPTCHA verification failed. Invalid, expired, or reused token." };
    }

    // Verifikim i hostname-it
    if (outcome.hostname && outcome.hostname !== "dogedrip.pages.dev") {
      return { success: false, error: "CAPTCHA hostname mismatch." };
    }

    return { success: true };
  } catch (err) {
    return { success: false, error: "Internal error during CAPTCHA verification." };
  }
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const origin = request.headers.get("Origin") || ALLOWED_ORIGIN;

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders(origin) });
    }

    try {
      // 1. Faucet Claim (Turnstile i detyrueshëm)
      if (url.pathname === "/api/claim" && request.method === "POST") {
        const clientIp = request.headers.get("CF-Connecting-IP");
        const body = await request.json().catch(() => ({}));
        
        const turnstileCheck = await verifyTurnstileToken(body.turnstile_token, clientIp, env.TURNSTILE_SECRET_KEY);
        if (!turnstileCheck.success) {
          return jsonResponse({ success: false, error: turnstileCheck.error }, 400, origin);
        }

        // --- Ekzekutohet vetëm pasi CAPTCHA konfirmohet reale ---
        return jsonResponse({ success: true, message: "Claim success", amount_koinu: 50000 }, 200, origin);
      }

      // 2. Lucky Wheel Spin (Turnstile i detyrueshëm)
      if (url.pathname === "/api/wheel/spin" && request.method === "POST") {
        const clientIp = request.headers.get("CF-Connecting-IP");
        const body = await request.json().catch(() => ({}));

        const turnstileCheck = await verifyTurnstileToken(body.turnstile_token, clientIp, env.TURNSTILE_SECRET_KEY);
        if (!turnstileCheck.success) {
          return jsonResponse({ success: false, error: turnstileCheck.error }, 400, origin);
        }

        return jsonResponse({ success: true, spin: { prize_key: "p1", amount_koinu: 100000 } }, 200, origin);
      }

      // 3. Daily Check-in (Turnstile i detyrueshëm)
      if (url.pathname === "/api/streak/checkin" && request.method === "POST") {
        const clientIp = request.headers.get("CF-Connecting-IP");
        const body = await request.json().catch(() => ({}));

        const turnstileCheck = await verifyTurnstileToken(body.turnstile_token, clientIp, env.TURNSTILE_SECRET_KEY);
        if (!turnstileCheck.success) {
          return jsonResponse({ success: false, error: turnstileCheck.error }, 400, origin);
        }

        return jsonResponse({ success: true, reward_koinu: 1000, streak_day: 1 }, 200, origin);
      }

      return jsonResponse({ success: false, error: "Endpoint not found" }, 404, origin);
    } catch (err) {
      return jsonResponse({ success: false, error: err.message || "Server error" }, 500, origin);
    }
  }
};
