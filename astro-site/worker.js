export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/api/data") {
      const value = await env.SCREENER_KV.get("live_data", { type: "json" });
      if (!value) {
        return new Response(JSON.stringify({ error: "No data yet" }), {
          status: 404,
          headers: { "content-type": "application/json" },
        });
      }
      return new Response(JSON.stringify(value), {
        headers: {
          "content-type": "application/json",
          "cache-control": "no-store",
        },
      });
    }

    // Everything else falls through to the static Astro build output.
    return env.ASSETS.fetch(request);
  },
};
