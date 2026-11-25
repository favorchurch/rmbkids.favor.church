import crypto from 'node:crypto';
import { getSupabase } from '../_supabase.js';

const PATH_RE = /^(?:[0-9a-f-]{36}|[0-9]{10,16})\/[-A-Za-z0-9_]{1,100}\.(?:webm|m4a|ogg|mp3|wav)$/i;
const LEGACY_PUBLIC_PREFIX = '/storage/v1/object/public/rmbkids-voice/';

// Rows written by the old sync stored getPublicUrl() output. Accept only that exact
// Supabase form for this bucket and reduce it to the object path; anything else is rejected.
function voiceObjectPath(value) {
  if (typeof value !== 'string') return null;
  if (PATH_RE.test(value)) return value;
  let url;
  try { url = new URL(value); } catch { return null; }
  if (url.protocol !== 'https:' || url.username || url.password || url.port || url.search || url.hash) return null;
  let allowedHost = /^[a-z0-9-]+\.supabase\.co$/i;
  try { if (process.env.SUPABASE_URL) allowedHost = new URL(process.env.SUPABASE_URL).hostname.toLowerCase(); } catch { /* keep default */ }
  const hostOk = typeof allowedHost === 'string' ? url.hostname === allowedHost : allowedHost.test(url.hostname);
  if (!hostOk || !url.pathname.startsWith(LEGACY_PUBLIC_PREFIX)) return null;
  let path;
  try { path = decodeURIComponent(url.pathname.slice(LEGACY_PUBLIC_PREFIX.length)); } catch { return null; }
  return PATH_RE.test(path) ? path : null;
}

export function createHandler(getClient = getSupabase) {
  return async function handler(req, res) {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');

    if (req.method === 'OPTIONS') return res.status(204).end();
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

    const adminSecret = process.env.ADMIN_SECRET;
    if (typeof adminSecret !== 'string' || adminSecret.trim().length === 0) {
      return res.status(503).json({ error: 'Admin access is not configured' });
    }

    const authorization = req.headers?.authorization;
    const match = typeof authorization === 'string' ? authorization.match(/^Bearer ([^\s]+)$/i) : null;
    if (!match) return res.status(401).json({ error: 'Unauthorized' });

    const expected = crypto.createHash('sha256').update(adminSecret).digest();
    const provided = crypto.createHash('sha256').update(match[1]).digest();
    if (!crypto.timingSafeEqual(expected, provided)) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    try {
      const supabase = getClient();
      const { data: kids, error: kidsErr } = await supabase
        .from('rmb_kids')
        .select('id, first_name, last_name, age, grade, country, streak, chapters_completed, home_stage, consent, consent_at, updated_at')
        .order('updated_at', { ascending: false })
        .limit(100);
      if (kidsErr) throw kidsErr;

      const { data: answers, error: ansErr } = await supabase
        .from('rmb_answers')
        .select('id, kid_id, chapter, title, question, answer_text, audio_url, occurred_at')
        .order('occurred_at', { ascending: false })
        .limit(50);
      if (ansErr) throw ansErr;
      const privateAnswers = await Promise.all((answers || []).map(async answer => {
        const path = voiceObjectPath(answer.audio_url);
        if (!path) return { ...answer, audio_url: null };
        try {
          const { data, error } = await supabase.storage.from('rmbkids-voice').createSignedUrl(path, 60 * 60);
          return { ...answer, audio_url: error ? null : data?.signedUrl || null };
        } catch {
          return { ...answer, audio_url: null };
        }
      }));

      const totalKids = kids?.length || 0;
      const consentedKids = kids?.filter(k => k.consent).length || 0;
      const countries = (kids || []).reduce((acc, k) => {
        const country = k.country || 'Unknown';
        acc[country] = (acc[country] || 0) + 1;
        return acc;
      }, {});
      return res.status(200).json({
        summary: { totalKids, consentedKids, byCountry: countries },
        kids,
        recentAnswers: privateAnswers,
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  };
}

export default createHandler();
