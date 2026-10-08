import { getSupabase } from '../_supabase.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  // Check admin secret if configured
  const adminSecret = process.env.ADMIN_SECRET;
  const provided = req.headers['x-admin-secret'] || req.query.secret;
  if (adminSecret && provided !== adminSecret) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const supabase = getSupabase();

    // 1. Fetch kids summary
    const { data: kids, error: kidsErr } = await supabase
      .from('rmb_kids')
      .select('id, first_name, last_name, age, grade, country, streak, chapters_completed, home_stage, consent, consent_at, updated_at')
      .order('updated_at', { ascending: false })
      .limit(100);

    if (kidsErr) throw kidsErr;

    // 2. Fetch recent answers
    const { data: answers, error: ansErr } = await supabase
      .from('rmb_answers')
      .select('id, kid_id, chapter, title, question, answer_text, audio_url, occurred_at')
      .order('occurred_at', { ascending: false })
      .limit(50);

    if (ansErr) throw ansErr;

    // 3. Aggregate totals
    const totalKids = kids?.length || 0;
    const consentedKids = kids?.filter(k => k.consent).length || 0;
    const countries = (kids || []).reduce((acc, k) => {
      const c = k.country || 'Unknown';
      acc[c] = (acc[c] || 0) + 1;
      return acc;
    }, {});

    return res.status(200).json({
      summary: {
        totalKids,
        consentedKids,
        byCountry: countries,
      },
      kids,
      recentAnswers: answers,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
