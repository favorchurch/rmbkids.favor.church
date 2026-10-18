# Favor Kids Quest — Read My Bible 2026

An interactive Bible reading adventure for kids, paired with a serverless backend hosted on **Vercel** and database/storage powered by **Supabase**.

---

## Architecture

- **Frontend**: Static Web / PWA (`index.html`, `app.js`, `game.js`, `sync.js`, CSS & WebP assets).
- **Backend API**: Vercel Serverless Functions (`/api/*`).
  - `POST /api/sync`: Ingests kid profiles, progress, audit events, quiz/reflection answers, and voice recordings. First sync for an unused explorer UUID returns a signed custody token only after that explorer row is successfully inserted; partial-failure responses include tokens only for rows already created by that request. Writes to existing explorer records require that token. Parent-created transfer codes carry the custody token so an intentional device transfer can continue syncing the same explorer; treat a transfer code like a password. Existing records created before custody protection remain read-only: a device with no local custody token that receives 401 re-keys its local profile and queued events/answers to a fresh explorer ID, preserving on-device progress and syncing as a new record. This migration never claims or modifies the old server row. Leaders will see a new record per re-keyed device.
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
   - Indexes and Row Level Security (RLS) policies. The security migration revokes browser-role SQL privileges only on the app-owned `public.rmb_kids`, `public.rmb_events`, and `public.rmb_answers` tables. On shared `storage.objects`, it drops only the explicitly named legacy rmbkids app policies, leaves all table privileges and every other policy intact, and adds a restrictive `anon`/`authenticated` policy denying rows in `rmbkids-voice`. That restrictive rule also blocks access from broad permissive policies granted to PostgreSQL `PUBLIC`; other buckets are unaffected. Supabase `service_role` bypasses RLS and its storage table grants are not changed. The migration does not discover/drop arbitrary policies by searching policy text. Apply it to an existing Supabase project before relying on the API protections.
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
| `ADMIN_SECRET` | **Required** long random secret for `/api/admin/overview`; send as `Authorization: Bearer <secret>`. Missing/blank configuration returns 503; invalid credentials return 401. |
| `SYNC_CUSTODY_SECRET` | Recommended long random server-only secret used to sign explorer custody tokens (falls back to the server-only Supabase service-role key). |

---

## Legacy Sync Migration

Devices that have not stored a custody token cannot safely take ownership of their pre-existing server record. On the first 401 from sync, the client assigns that local profile a fresh explorer ID and rewrites its pending outbox items to the new ID. The profile's local reading progress, answers, and audio remain on the device. The migration marker prevents repeated re-keying; a follow-up 401 is left queued rather than triggering an unbounded identity loop. The old server row is intentionally read-only and unchanged. Because each re-keyed device registers independently, leaders will see a new record for each such device; records are not merged automatically.

The automated storage-migration test is structural (scope assertions against the SQL source), not an execution against PostgreSQL. No local PostgreSQL server/container is included with this repository's test setup; the SQL migration has not been executed in an ephemeral database here. Treat this as a material verification limitation: the migration still requires a separate isolated PostgreSQL/Supabase-compatible execution and policy/grant read-back before it is considered migration-ready. No production database should be used for that verification.

## Deploying to Vercel

1. Configure the server-only `ADMIN_SECRET` and `SYNC_CUSTODY_SECRET` environment variables in Vercel (along with the required Supabase variables).
2. Apply the security schema migration in `supabase/schema.sql` to the Supabase project.
3. Deploy the application code to Vercel.

```bash
# Link or deploy to Vercel under the favor-church team
vercel link --scope favor-church --project rmbkids
vercel env pull .env.local
vercel --prod
```
