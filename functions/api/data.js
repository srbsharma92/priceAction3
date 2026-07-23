// Cloudflare Pages Function: GET /api/data
// Reads the latest screener JSON from KV (written by the GitHub Action
// after screener_job.py runs) and returns it to the browser.
//
// Requires a KV namespace bound to this Pages project as "SCREENER_KV".
// Set this up in the Cloudflare dashboard:
//   Pages project -> Settings -> Functions -> KV namespace bindings
//   Variable name: SCREENER_KV  ->  select your KV namespace

export async function onRequestGet(context) {
  try {
    const value = await context.env.SCREENER_KV.get('live_data', { type: 'json' });

    if (!value) {
      return new Response(JSON.stringify({ error: 'No data yet' }), {
        status: 404,
        headers: { 'content-type': 'application/json' },
      });
    }

    return new Response(JSON.stringify(value), {
      status: 200,
      headers: {
        'content-type': 'application/json',
        // Always fetch fresh — the frontend polls every 5 minutes anyway.
        'cache-control': 'no-store',
      },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { 'content-type': 'application/json' },
    });
  }
}
