import crypto from 'node:crypto';
import { getSupabase } from './_supabase.js';

const MAX_BATCH = 100;
const MAX_AUDIO_BYTES = 5 * 1024 * 1024;
const EXPLORER_ID = /^(?:[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}|[0-9]{10,16})$/i;
const SAFE_FILE_ID = /^[A-Za-z0-9_-]{1,100}$/;
const AUDIO_TYPES = new Map([
  ['audio/webm', 'webm'], ['audio/mp4', 'm4a'], ['audio/ogg', 'ogg'],
  ['audio/mpeg', 'mp3'], ['audio/wav', 'wav'],
]);

function custodySecret() {
  const configured = process.env.SYNC_CUSTODY_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY;
  return typeof configured === 'string' && configured.trim() ? configured : null;
}

function custodyToken(explorerId, secret) {
  return `v1.${crypto.createHmac('sha256', secret).update(explorerId).digest('hex')}`;
}

function validCustodyToken(explorerId, token, secret) {
  if (typeof token !== 'string' || !/^v1\.[a-f0-9]{64}$/.test(token)) return false;
  const expected = Buffer.from(custodyToken(explorerId, secret));
  const received = Buffer.from(token);
  return expected.length === received.length && crypto.timingSafeEqual(expected, received);
}

function validDate(value) {
  if (value == null || value === '') return new Date().toISOString();
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function parseAudio(item) {
  if (item.audio == null) return { buffer: null, extension: null, mime: null };
  if (typeof item.audio !== 'string' || item.audio.length > Math.ceil(MAX_AUDIO_BYTES * 4 / 3) + 4) return null;
  const rawMime = typeof item.mime === 'string' ? item.mime.split(';', 1)[0].trim().toLowerCase() : '';
  const extension = AUDIO_TYPES.get(rawMime);
  if (!extension || item.audio.length % 4 !== 0 || /[^A-Za-z0-9+/=]/.test(item.audio)) return null;
  const padding = item.audio.endsWith('==') ? 2 : item.audio.endsWith('=') ? 1 : 0;
  if (padding > 0 && item.audio.slice(0, -padding).includes('=')) return null;
  const buffer = Buffer.from(item.audio, 'base64');
  if (!buffer.length || buffer.length > MAX_AUDIO_BYTES || buffer.toString('base64') !== item.audio) return null;
  return { buffer, extension, mime: rawMime };
}

export function createHandler(getClient = getSupabase) {
  return async function handler(req, res) {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    if (req.method === 'OPTIONS') return res.status(204).end();
    if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Method not allowed' });

    let body = req.body;
    if (typeof body === 'string') {
      try { body = JSON.parse(body); }
      catch { return res.status(400).json({ ok: false, error: 'Invalid JSON payload' }); }
    }
    const batch = Array.isArray(body?.batch) ? body.batch : (Array.isArray(body) ? body : null);
    if (!batch || !batch.length || batch.length > MAX_BATCH) {
      return res.status(400).json({ ok: false, error: 'Batch must contain 1 to 100 items' });
    }

    const grouped = new Map();
    let eventCount = 0, answerCount = 0;
    for (const item of batch) {
      if (!item || typeof item !== 'object' || Array.isArray(item) || typeof item.kid?.id !== 'string' || !EXPLORER_ID.test(item.kid.id)) {
        return res.status(400).json({ ok: false, error: 'Invalid explorer_id' });
      }
      if (item.eid != null && (typeof item.eid !== 'string' || !SAFE_FILE_ID.test(item.eid))) {
        return res.status(400).json({ ok: false, error: 'Invalid event id' });
      }
      if (!['event', 'answer'].includes(item.type)) return res.status(400).json({ ok: false, error: 'Unsupported sync item type' });
      if (item.type === 'event') eventCount++;
      if (item.type === 'answer') answerCount++;
      if (eventCount > 100 || answerCount > 50) return res.status(400).json({ ok: false, error: 'Too many events or answers in batch' });
      if (item.type === 'event' || item.type === 'answer') {
        if (!item.eid) return res.status(400).json({ ok: false, error: 'Missing event id' });
        const at = validDate(item.at);
        if (!at) return res.status(400).json({ ok: false, error: 'Invalid event timestamp' });
      }
      if (item.type === 'event' && (typeof item.event !== 'string' || item.event.length > 200 || (item.details != null && (typeof item.details !== 'string' || item.details.length > 4000)))) {
        return res.status(400).json({ ok: false, error: 'Invalid event payload' });
      }
      if (item.type === 'answer') {
        for (const field of ['title', 'question', 'answer']) {
          if (item[field] != null && (typeof item[field] !== 'string' || item[field].length > 10000)) return res.status(400).json({ ok: false, error: `Invalid ${field}` });
        }
        if (item.audioId && (typeof item.audioId !== 'string' || !SAFE_FILE_ID.test(item.audioId))) return res.status(400).json({ ok: false, error: 'Invalid audio id' });
        const audio = parseAudio(item);
        if (!audio) return res.status(400).json({ ok: false, error: 'Invalid audio payload or unsupported MIME type' });
        item._validatedAudio = audio;
      }
      const id = item.kid.id;
      if (!grouped.has(id)) grouped.set(id, []);
      grouped.get(id).push(item);
    }

    const secret = custodySecret();
    if (!secret) return res.status(503).json({ ok: false, error: 'Sync custody is not configured' });

    const issued = {};
    try {
      const supabase = getClient();
      const knownInBatch = new Set();
      for (const [id, items] of grouped) {
        const { data: existing, error: lookupError } = await supabase.from('rmb_kids').select('id').eq('id', id).maybeSingle();
        if (lookupError) throw lookupError;
        const token = items.find(item => item.custodyToken)?.custodyToken;
        if (existing && !validCustodyToken(id, token, secret)) {
          return res.status(401).json({ ok: false, error: 'Valid custody token required for this explorer' });
        }
        if (!existing) knownInBatch.add(id);
      }

      for (const [id, items] of grouped) {
        for (const item of items) {
          const kid = item.kid;
          const date = item.at ? validDate(item.at) : new Date().toISOString();
          const kidRecord = {
            id,
            first_name: typeof kid.firstName === 'string' ? kid.firstName.slice(0, 100) : 'Explorer',
            last_name: typeof kid.lastName === 'string' ? kid.lastName.slice(0, 100) : '',
            age: Number.isInteger(Number(kid.age)) && Number(kid.age) >= 0 && Number(kid.age) <= 120 ? Number(kid.age) : null,
            grade: typeof kid.grade === 'string' ? kid.grade.slice(0, 100) : '',
            gender: typeof kid.gender === 'string' ? kid.gender.slice(0, 40) : '',
            country: typeof kid.country === 'string' ? kid.country.slice(0, 100) : '',
            parent_name: typeof kid.parentName === 'string' ? kid.parentName.slice(0, 200) : '',
            parent_contact: typeof kid.parentContact === 'string' ? kid.parentContact.slice(0, 200) : '',
            consent: kid.consent === true,
            consent_at: kid.consentAt ? validDate(kid.consentAt) : null,
            chapters_completed: Number.isInteger(Number(kid.chapters)) && Number(kid.chapters) >= 0 && Number(kid.chapters) <= 1000 ? Number(kid.chapters) : 0,
            current_chapter: Number.isInteger(Number(kid.currentChapter)) && Number(kid.currentChapter) >= 1 && Number(kid.currentChapter) <= 1000 ? Number(kid.currentChapter) : 1,
            streak: Number.isInteger(Number(kid.streak)) && Number(kid.streak) >= 0 && Number(kid.streak) <= 10000 ? Number(kid.streak) : 0,
            home_stage: typeof kid.home === 'string' ? kid.home.slice(0, 100) : '',
            updated_at: new Date().toISOString(),
          };

          if (!knownInBatch.has(id)) {
            const { error: updateError } = await supabase.from('rmb_kids').upsert(kidRecord, { onConflict: 'id' });
            if (updateError) throw updateError;
          } else {
            const { error: insertError } = await supabase.from('rmb_kids').insert(kidRecord);
            if (insertError) {
              if (insertError.code === '23505') return res.status(409).json({ ok: false, error: 'Explorer already exists; custody token required', custodyTokens: issued });
              throw insertError;
            }
            issued[id] = custodyToken(id, secret);
            knownInBatch.delete(id);
          }

          if (item.type === 'event' && item.eid) {
            const { error } = await supabase.from('rmb_events').upsert({
              eid: item.eid, kid_id: id, event_name: item.event || 'Unknown Event',
              chapter: item.chapter ? String(item.chapter).slice(0, 50) : '',
              details: item.details || '', occurred_at: date,
            }, { onConflict: 'eid', ignoreDuplicates: true });
            if (error) throw error;
          }

          if (item.type === 'answer' && item.eid) {
            let audioUrl = null;
            const audio = item._validatedAudio;
            if (audio?.buffer) {
              const fileName = `${id}/${item.audioId || item.eid}.${audio.extension}`;
              const { error: uploadError } = await supabase.storage.from('rmbkids-voice').upload(fileName, audio.buffer, { contentType: audio.mime, upsert: true });
              if (uploadError) throw uploadError;
              audioUrl = fileName;
            }
            const { error } = await supabase.from('rmb_answers').upsert({
              eid: item.eid, kid_id: id, chapter: item.chapter ? String(item.chapter).slice(0, 50) : '',
              title: item.title || '', question: item.question || '', answer_text: item.answer || '',
              audio_url: audioUrl, audio_id: item.audioId || null, mime_type: audio?.mime || null, occurred_at: date,
            }, { onConflict: 'eid', ignoreDuplicates: true });
            if (error) throw error;
          }
        }
      }
      return res.status(200).json({ ok: true, processed: batch.length, custodyTokens: issued });
    } catch (err) {
      console.error('Sync error:', err);
      return res.status(500).json({ ok: false, error: err.message || 'Internal server error', custodyTokens: issued });
    }
  };
}

export default createHandler();
