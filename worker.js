export default {
  async fetch(request, env) {
    const headers = {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "https://dogedrip.pages.dev",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization"
    };

    if (request.method === "OPTIONS") {
      return new Response(null, { headers });
    }

    const url = new URL(request.url);

    if (url.pathname === "/api/health") {
      try {
        const result = await env.DB.prepare(
          "SELECT name FROM sqlite_master WHERE type = 'table'"
        ).all();

        return new Response(JSON.stringify({
          success: true,
          message: "DogeDrip API is connected",
          database: "connected",
          tables: result.results.map(row => row.name)
        }), {
          status: 200,
          headers
        });
      } catch (error) {
        return new Response(JSON.stringify({
          success: false,
          error: "Database connection failed"
        }), {
          status: 500,
          headers
        });
      }
    }

    return new Response(JSON.stringify({
      success: false,
      message: "Endpoint not found"
    }), {
      status: 404,
      headers
    });
  }
};
