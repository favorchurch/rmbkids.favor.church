# Favor Kids Quest — Read My Bible 2026

An interactive Bible reading adventure for kids, paired with a serverless backend hosted on **Vercel** and database/storage powered by **Supabase**.

---

## Architecture

- **Frontend**: Static Web / PWA (`index.html`, `app.js`, `game.js`, `sync.js`, CSS & WebP assets).
- **Backend API**: Vercel Serverless Functions (`/api/*`).
  - `POST /api/sync`: Ingests kid profiles, progress, audit events, quiz/reflection answers, and voice recordings.
  - `GET /api/health`: Healthcheck verifying database connectivity.
  - `GET /api/admin/overview`: Summary metrics for church staff/leaders (kids count, country distribution, streaks, recent answers).
- **Database & Storage**: Supabase (PostgreSQL + Supabase Storage).
  - `rmb_kids`: Explorer profile information, streaks, completed chapters, and parental consent.
  - `rmb_events`: Audit trail of actions (signups, reading events, home upgrades).
  - `rmb_answers`: Heart moment entries, prayer reflections, and audio URLs.
  - `rmbkids-voice` Storage Bucket: Stores voice messages recorded for parents and prayers.

---

## Supabase Setup

1. In your Supabase project dashboard, open the **SQL Editor**.
2. Run the SQL script from [`supabase/schema.sql`](file:///Users/rico/Git/rmbkids.favor.church/supabase/schema.sql).
3. The script automatically provisions:
   - Tables (`rmb_kids`, `rmb_events`, `rmb_answers`)
   - Indexes and Row Level Security (RLS) policies
   - Storage bucket (`rmbkids-voice`) and storage access policies
   - Public view (`rmb_leaderboard`)

---

## Environment Variables

Configure these in your Vercel Project Settings (or in `.env.local` for local development):

| Variable | Description |
|---|---|
| `SUPABASE_URL` | Your Supabase project URL (`https://<project-ref>.supabase.co`) |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role secret key (bypasses RLS for secure server-side writes) |
| `SUPABASE_ANON_KEY` | Optional Supabase public anon key |
| `ADMIN_SECRET` | Optional bearer/header token for `/api/admin/overview` |

---

## Deploying to Vercel

```bash
# Link or deploy to Vercel under the favor-church team
vercel link --scope favor-church --project rmbkids
vercel env pull .env.local
vercel --prod
```
