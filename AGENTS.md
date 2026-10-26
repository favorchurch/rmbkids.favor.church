# AGENTS.md

Favor Kids Quest (Read My Bible 2026): a static PWA for kids (`index.html`, `app.js`, `game.js`, `sync.js`, CSS and WebP assets) plus Vercel serverless functions in `api/` (`/api/sync`, `/api/health`, `/api/admin/overview`) backed by Supabase (tables, RLS and the `rmbkids-voice` bucket from `supabase/schema.sql`). See `README.md` for architecture. No test suite or build step exists; `package.json` scripts are `dev` (`vercel dev`), `deploy` (`vercel --prod`) and `db:setup`.

## Deploy facts

- **Deploy target and branch:** Vercel project `rmbkids` (team `favor-church`), default branch `main`. Domains on the project: `rmbkids.favor.church`, `rmbkids.vercel.app`. Note `vercel.json` redirects every non-`/api` path to an external GitHub Pages site, so the root URL does not serve the app from this repo.
- **Merge to main auto-deploys prod:** unverified. The README documents a manual `vercel --prod`, and the latest Vercel deployment has no production target. Verify in Vercel project Settings > Git. Whether a PR creates a preview deploy: unverified.
- **Required env vars (names only):** `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`; optional `SUPABASE_ANON_KEY`, `ADMIN_SECRET`. Set in: Vercel project env, or local `.env.local` (see `.env.example`). Per-environment coverage: unverified (`vercel env ls`). A new required var must be set on the deploy target before the merge that needs it.
- **Rock hosts and keys:** none, this repo does not call Rock.
- **Build gate:** none exists (no build or test script). Smoke check: `vercel dev`, then `GET /api/health`.
- **Contributor-merge path:** none in the repo (no workflow or deploy hook). Unverified whether Vercel blocks deploys for authors without project access.
- **Rollback:** unverified. Likely Vercel instant rollback or promote of a previous deployment, or a revert PR. Database changes: `supabase/schema.sql` only, no documented rollback.
- **Verify live:** `curl -m 10 https://rmbkids.favor.church/api/health` (expects a database connectivity result). Unverified that this domain serves the API.
