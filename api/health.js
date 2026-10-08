import { getSupabase } from './_supabase.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  try {
    const supabase = getSupabase();
    const { count, error } = await supabase
      .from('rmb_kids')
      .select('*', { count: 'exact', head: true });

    if (error) {
      return res.status(500).json({
        status: 'error',
        message: 'Database query failed',
        error: error.message,
        timestamp: new Date().toISOString(),
      });
    }

    return res.status(200).json({
      status: 'ok',
      database: 'connected',
      kidsCount: count,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    return res.status(500).json({
      status: 'error',
      message: err.message,
      timestamp: new Date().toISOString(),
    });
  }
}
