# AGENTS.md

Favor Kids Quest (Read My Bible 2026): a static PWA for kids (`index.html`, `app.js`, `game.js`, `sync.js`, CSS and WebP assets) plus Vercel serverless functions in `api/` (`/api/sync`, `/api/health`, `/api/admin/overview`) backed by Supabase (tables, RLS and the `rmbkids-voice` bucket from `supabase/schema.sql`). See `README.md` for architecture. No build step exists. Tests run with `pnpm test` (`node --test`, files in `test/`). `package.json` scripts are `dev` (`vercel dev`), `deploy` (`vercel --prod`), `db:setup` and `test`.

## Deploy facts

- **Deploy target and branch:** Vercel project `rmbkids` (team `favor-church`), default branch `main`. Domains on the project: `rmbkids.favor.church`, `rmbkids.vercel.app`. Note `vercel.json` redirects every non-`/api` path to an external GitHub Pages site, so the root URL does not serve the app from this repo.
- **Merge to main deploys prod:** verified 2026-11-26. The Vercel project `rmbkids` is Git-connected; a merge to `main` creates a Production deployment (`rmbkids-huvewvnjk`, source git, commit `2829add`). PR branches get Preview deployments. `pnpm deploy` (`vercel --prod`) is still available for a manual deploy.
- **Env vars (names only):** required `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `ADMIN_SECRET` (`/api/admin/overview` returns 503 without it). `SYNC_CUSTODY_SECRET` signs custody tokens and falls back to `SUPABASE_SERVICE_ROLE_KEY` when unset. Optional `SUPABASE_ANON_KEY`. Set in: Vercel project env, or local `.env.local` (see `.env.example`). Per-environment coverage: verified 2026-11-26 with `vercel env ls --project rmbkids --scope favor-church`: the project has no environment variables in any environment. A new required var must be set on the deploy target before the merge that needs it.
- **Rock hosts and keys:** none, this repo does not call Rock.
- **Build gate:** no build step. Test gate: `pnpm test` (`node --test`, added by PR #1). Smoke check: `vercel dev`, then `GET /api/health`.
- **Contributor-merge path:** none in the repo (no workflow or deploy hook). Unverified whether Vercel blocks deploys for authors without project access.
- **Rollback:** unverified. Likely Vercel instant rollback or promote of a previous deployment, or a revert PR. Database changes: `supabase/schema.sql` only, no documented rollback.
- **Verify live:** `curl -m 10 https://rmbkids.favor.church/api/health`. Verified 2026-11-26: it returns `status: error` with `Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY`, so the prod API is not configured. The root URL returns 307 to the GitHub Pages app.
