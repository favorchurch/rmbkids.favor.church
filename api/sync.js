import { getSupabase } from './_supabase.js';

export default async function handler(req, res) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  try {
    let body = req.body;
    if (typeof body === 'string') {
      try {
        body = JSON.parse(body);
      } catch (e) {
        return res.status(400).json({ ok: false, error: 'Invalid JSON payload' });
      }
    }

    const batch = Array.isArray(body?.batch) ? body.batch : (Array.isArray(body) ? body : null);
    if (!batch || !batch.length) {
      return res.status(400).json({ ok: false, error: 'Missing batch array in payload' });
    }

    const supabase = getSupabase();

    for (const item of batch) {
      const kid = item.kid;
      if (kid && kid.id) {
        // Upsert kid explorer profile
        const kidRecord = {
          id: String(kid.id),
          first_name: kid.firstName || 'Explorer',
          last_name: kid.lastName || '',
          age: Number(kid.age) || null,
          grade: kid.grade || '',
          gender: kid.gender || '',
          country: kid.country || '',
          parent_name: kid.parentName || '',
          parent_contact: kid.parentContact || '',
          consent: Boolean(kid.consent),
          consent_at: kid.consentAt ? new Date(kid.consentAt).toISOString() : null,
          chapters_completed: Number(kid.chapters) || 0,
          current_chapter: Number(kid.currentChapter) || 1,
          streak: Number(kid.streak) || 0,
          home_stage: kid.home || '',
          updated_at: new Date().toISOString(),
        };

        const { error: kidErr } = await supabase
          .from('rmb_kids')
          .upsert(kidRecord, { onConflict: 'id' });

        if (kidErr) {
          console.error('Error upserting kid record:', kidErr);
        }
      }

      const kidId = kid?.id ? String(kid.id) : null;

      // Handle event item
      if (item.type === 'event' && item.eid) {
        const eventRecord = {
          eid: String(item.eid),
          kid_id: kidId,
          event_name: item.event || 'Unknown Event',
          chapter: item.chapter ? String(item.chapter) : '',
          details: item.details || '',
          occurred_at: item.at ? new Date(item.at).toISOString() : new Date().toISOString(),
        };

        const { error: eventErr } = await supabase
          .from('rmb_events')
          .upsert(eventRecord, { onConflict: 'eid', ignoreDuplicates: true });

        if (eventErr) {
          console.error('Error inserting event record:', eventErr);
        }
      }

      // Handle answer / heart moment / audio item
      if (item.type === 'answer' && item.eid) {
        let audioUrl = null;

        if (item.audio && kidId) {
          try {
            const buffer = Buffer.from(item.audio, 'base64');
            const mime = item.mime || 'audio/webm';
            let ext = 'webm';
            if (mime.includes('mp4') || mime.includes('m4a')) ext = 'm4a';
            else if (mime.includes('ogg')) ext = 'ogg';

            const fileName = `${kidId}/${item.audioId || item.eid}.${ext}`;

            const { error: uploadErr } = await supabase.storage
              .from('rmbkids-voice')
              .upload(fileName, buffer, {
                contentType: mime,
                upsert: true,
              });

            if (!uploadErr) {
              const { data: pubData } = supabase.storage
                .from('rmbkids-voice')
                .getPublicUrl(fileName);
              audioUrl = pubData?.publicUrl || null;
            } else {
              console.error('Error uploading voice audio:', uploadErr);
            }
          } catch (uploadEx) {
            console.error('Exception processing audio recording:', uploadEx);
          }
        }

        const answerRecord = {
          eid: String(item.eid),
          kid_id: kidId,
          chapter: item.chapter ? String(item.chapter) : '',
          title: item.title || '',
          question: item.question || '',
          answer_text: item.answer || '',
          audio_url: audioUrl,
          audio_id: item.audioId || null,
          mime_type: item.mime || null,
          occurred_at: item.at ? new Date(item.at).toISOString() : new Date().toISOString(),
        };

        const { error: answerErr } = await supabase
          .from('rmb_answers')
          .upsert(answerRecord, { onConflict: 'eid', ignoreDuplicates: true });

        if (answerErr) {
          console.error('Error inserting answer record:', answerErr);
        }
      }
    }

    return res.status(200).json({ ok: true, processed: batch.length });
  } catch (err) {
    console.error('Sync error:', err);
    return res.status(500).json({ ok: false, error: err.message || 'Internal server error' });
  }
}
