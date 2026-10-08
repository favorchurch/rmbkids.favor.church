import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import postgres from 'postgres';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });
dotenv.config();

const dbUrl = process.argv[2] || process.env.DATABASE_URL || process.env.SUPABASE_POSTGRES_URL;

if (!dbUrl) {
  console.log(`
Usage:
  node scripts/setup-db.mjs "<DATABASE_URL>"

Or set DATABASE_URL in your .env.local file.

Alternatively, you can copy the contents of supabase/schema.sql
and paste it directly into the Supabase Web Dashboard SQL Editor.
`);
  process.exit(1);
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const schemaPath = join(__dirname, '..', 'supabase', 'schema.sql');
const sqlContent = readFileSync(schemaPath, 'utf8');

console.log('Connecting to database and applying schema...');
const sql = postgres(dbUrl, { ssl: 'require', max: 1 });

try {
  await sql.unsafe(sqlContent);
  console.log('✓ Supabase schema applied successfully!');
  console.log('  - Tables created: rmb_kids, rmb_events, rmb_answers');
  console.log('  - Storage bucket: rmbkids-voice');
  console.log('  - Leaderboard view: rmb_leaderboard');
} catch (err) {
  console.error('Failed to apply schema:', err.message);
  process.exit(1);
} finally {
  await sql.end();
}
