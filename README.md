# NSE Live Terminal — Astro + Cloudflare Pages

Replaces the Streamlit UI with a static Astro site hosted on Cloudflare
Pages. **Nothing about how you pull or process data changes** —
`screener_job.py` still runs on the same GitHub Actions cron and still
writes `data/live_data.xlsx` exactly as before.

The only new piece: instead of Streamlit reading the xlsx off disk, a
tiny Python step converts it to JSON and pushes it to a Cloudflare KV
store. A Cloudflare Pages Function reads it back out for the frontend.
This means data updates show up instantly without rebuilding/redeploying
the site.

```
screener_job.py (unchanged)
        │  writes
        ▼
data/live_data.xlsx
        │  new step: publish_to_cloudflare_kv.py
        ▼
Cloudflare KV  (key: "live_data")
        │  read by
        ▼
functions/api/data.js  (Pages Function)
        │  fetched by
        ▼
Astro static site (src/pages/index.astro + app.js)
```

## What's in this folder

```
astro-site/
├── package.json
├── astro.config.mjs
├── wrangler.toml                # reference only, see step 4
├── functions/
│   └── api/data.js              # Pages Function — serves KV data as JSON
└── src/
    ├── pages/index.astro        # the page (hero, controls, tabs, tables)
    ├── scripts/
    │   ├── app.js                # fetch + render + filter + tabs logic
    │   └── fo_list.js             # your FO_LIST, ported to JS
    └── styles/theme.css          # your navy/gold theme, ported 1:1
```

Plus, outside this folder (repo root level, alongside `screener_job.py`):

- `publish_to_cloudflare_kv.py` — converts the xlsx to JSON and pushes it to KV
- `.github_workflows_update_data.yml` — example workflow showing where the
  new step slots in (merge it into your real `update_data.yml`)

## Step 1 — Cloudflare account + KV namespace

1. Sign up / log in at https://dash.cloudflare.com
2. Left sidebar → **Workers & Pages** → **KV** → **Create a namespace**.
   Name it something like `screener-data`. Copy its **Namespace ID**.
3. Note your **Account ID** — it's on the right sidebar of almost any
   Cloudflare dashboard page.

## Step 2 — API token for GitHub Actions to write to KV

1. Dashboard → profile icon (top right) → **My Profile** → **API Tokens**
   → **Create Token**.
2. Use the **"Edit Cloudflare Workers"** template, or a custom token with
   permission: **Account → Workers KV Storage → Edit**.
3. Copy the token (shown once).

## Step 3 — Add GitHub secrets

In your repo: **Settings → Secrets and variables → Actions → New repository secret**.
Add:

| Secret name | Value |
|---|---|
| `CF_ACCOUNT_ID` | from Step 1 |
| `CF_API_TOKEN` | from Step 2 |
| `CF_KV_NAMESPACE_ID` | the namespace ID from Step 1 |

## Step 4 — Wire up the new publish step

1. Copy `publish_to_cloudflare_kv.py` into your repo root (next to
   `screener_job.py`).
2. Make sure `requests` is in your `requirements.txt` (it's very likely
   already there since `screener_job.py` probably uses it too).
3. Open your existing `update_data.yml` and add this step **right after**
   the step that runs `screener_job.py`:

   ```yaml
   - name: Publish data to Cloudflare KV
     env:
       CF_ACCOUNT_ID: ${{ secrets.CF_ACCOUNT_ID }}
       CF_API_TOKEN: ${{ secrets.CF_API_TOKEN }}
       CF_KV_NAMESPACE_ID: ${{ secrets.CF_KV_NAMESPACE_ID }}
     run: python publish_to_cloudflare_kv.py
   ```

   See `.github_workflows_update_data.yml` for the full file as reference
   — everything above the new step should already exist in your workflow.

   You can now remove any step that commits `live_data.xlsx` back into
   the repo, if you had one — it's no longer needed since Pages doesn't
   read that file.

## Step 5 — Push the Astro site to its own repo (or a subfolder)

Put the `astro-site/` folder into a git repo Cloudflare Pages can see —
either its own repo, or a subfolder of your existing one (Pages lets you
set a "root directory" at deploy time).

```bash
cd astro-site
npm install
npm run dev        # sanity check at http://localhost:4321 (no live data yet)
```

## Step 6 — Create the Cloudflare Pages project

1. Dashboard → **Workers & Pages** → **Create application** → **Pages**
   → **Connect to Git**. Pick the repo/branch from Step 5.
2. Build settings:
   - **Framework preset**: Astro
   - **Build command**: `npm run build`
   - **Build output directory**: `dist`
   - **Root directory**: `astro-site` (only if it's a subfolder of a
     bigger repo — leave blank if it's its own repo)
3. Deploy. Cloudflare will build and give you a `*.pages.dev` URL.

## Step 7 — Bind the KV namespace to the Pages project

This is what lets `functions/api/data.js` actually reach your data.

1. Pages project → **Settings** → **Functions** → **KV namespace bindings**
   → **Add binding**.
2. Variable name: `SCREENER_KV`. Namespace: the one from Step 1.
3. Redeploy (Pages → Deployments → retry latest, or push any commit) so
   the binding takes effect.

## Step 8 — Test end-to-end

1. Manually trigger your GitHub Action once (Actions tab →
   `Update Screener Data` → **Run workflow**), so KV has data.
2. Visit `https://<your-project>.pages.dev/api/data` directly — you
   should see the JSON payload.
3. Visit the site root — tables should populate, F&O checkbox should
   filter client-side, tabs should switch, and the LIVE/CLOSED pill
   should reflect current IST market hours.

## Step 9 (optional) — Custom domain

Pages project → **Custom domains** → add your domain. Cloudflare handles
DNS + SSL automatically if the domain is already on Cloudflare.

## Notes on things that changed on purpose

- **Filtering, sorting, and bullish/bearish highlighting** all happen in
  `src/scripts/app.js`, mirroring `apply_fo_filter` / `highlight_close`
  from the Streamlit app line-for-line — same columns, same logic, same
  colors.
- **Auto-refresh**: the frontend polls `/api/data` every 5 minutes
  (`REFRESH_MS` in `app.js`), same cadence as `st_autorefresh` did.
- **`screener_job.py` itself is untouched.** The only new file that
  touches your scraping pipeline is `publish_to_cloudflare_kv.py`, and
  it only *reads* the xlsx that already exists — it doesn't change how
  it's produced.
