# Deploying for free — Vercel (client) + Render (API) + Atlas (database)

Three free services. The browser only ever talks to the Vercel origin: Vercel rewrites `/api/*` to
the Render API (see `vercel.json`), so the httpOnly refresh cookie stays **same-origin** and no auth
code changes. Render's free tier sleeps after ~15 min idle (first request then takes ~50s).

```
Browser ──▶ app.vercel.app ──rewrite /api/*──▶ vhg-api.onrender.com ──▶ Atlas M0
            (static SPA)                        (Express via tsx)        (MongoDB)
```

---

## 1. Database — MongoDB Atlas (free M0)

1. Create an account at <https://www.mongodb.com/cloud/atlas/register> and a **free M0** cluster.
2. **Database Access** → add a user (username + password). Note them.
3. **Network Access** → add `0.0.0.0/0` (allow from anywhere). Render's free tier has no fixed egress
   IP, so a narrower allow-list will not work on free.
4. **Connect → Drivers** → copy the SRV string, e.g.
   `mongodb+srv://USER:PASS@cluster0.xxxxx.mongodb.net/herbal_garden?retryWrites=true&w=majority`
   — add the `/herbal_garden` database name before the `?`.

## 2. API — Render

1. Push this repo to GitHub.
2. Render → **New → Blueprint** → pick the repo (it reads `render.yaml`), **or** New → Web Service with:
   - Build: `npm ci`  · Start: `npm run start -w server`  · Health check: `/api/health`
   - Runtime `Node`, plan `Free`.
3. Set env vars (dashboard):
   | Key | Value |
   |---|---|
   | `NODE_ENV` | `production` |
   | `TRUST_PROXY` | `1` |
   | `MONGO_URI` | the Atlas SRV string from step 1 |
   | `CLIENT_ORIGIN` | your Vercel URL, e.g. `https://your-app.vercel.app` (fill in after step 3) |
   | `JWT_ACCESS_SECRET` | a long random string |
   | `JWT_REFRESH_SECRET` | a different long random string |
   | `NODE_VERSION` | `22.14.0` |

   `NODE_ENV=production` flips the refresh cookie to `secure` and tightens CORS/cookie rules.
4. Deploy. Verify: `curl https://vhg-api.onrender.com/api/health` → `{"ok":true,"db":"connected",...}`

### Seed the database (once)
From your machine, point the seed at Atlas (do **not** commit the URI):
```bash
cd server
MONGO_URI="mongodb+srv://.../herbal_garden" npx tsx src/seed/index.ts
```
This is idempotent, so re-running is safe.

## 3. Client — Vercel

1. Vercel → **New Project** → import the repo.
2. Edit `vercel.json`: replace `REPLACE-WITH-YOUR-RENDER-SERVICE.onrender.com` with your Render host.
   Commit and push.
3. Deploy. Verify the SPA loads and `/api/health` proxied through Vercel returns `ok:true`.

## 4. Close the loop

- Copy the Vercel URL into Render's `CLIENT_ORIGIN` and redeploy the API.

---

## Gotchas

- **Cookie/login breaks if the browser reaches the API cross-site.** The refresh cookie is
  `SameSite=Lax`, so it is only sent for same-site requests. The `/api` rewrite keeps it same-origin;
  do not instead point the client at the Render URL directly.
- **Render cold start.** Free services sleep; first request after idle is slow. Upgrade or use a
  keep-alive ping if that matters.
- **Node version.** Locally this runs on Node 26; pin `NODE_VERSION=22.14.0` on Render (the start
  script's `--env-file-if-exists` needs ≥ 22.9, and 22 is a widely-supported current LTS here).
- **`.env` is never deployed.** Render injects env vars; `--env-file-if-exists` is a harmless no-op
  there. Never commit `.env`.
- **Plant images / `reference` are gitignored.** Plant photos live in `client/public/plants/*.jpg`
  and mockups in `client/public/reference/*.png`; both are excluded by `.gitignore`, so a Vercel build
  from the repo has the UI but **not the images**. Commit those files (or host them separately) if the
  deployed site needs them.
