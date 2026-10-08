// Sends a kid's sign-up details, activity and answers to the church's Google Sheet,
// but only when a parent has ticked the consent box. Everything waits in an outbox on
// this device and is sent when there is internet, so nothing is lost when offline.
window.FKQ_SYNC_URL = window.FKQ_SYNC_URL || '/api/sync';
const Sync = (() => {
  const KEY = 'rmb-outbox';
  const load = () => { try { return JSON.parse(localStorage.getItem(KEY)) || []; } catch { return []; } };
  const store = q => { try { localStorage.setItem(KEY, JSON.stringify(q.slice(-400))); } catch { } };
  let busy = false;
  const kid = p => ({
    id: p.id, country: p.country || '', firstName: p.name || '', lastName: p.lastName || '', age: p.age, grade: p.grade || '', gender: p.gender,
    parentName: p.parentName || '', parentContact: p.parentContact || '', consent: !!p.consent?.yes, consentAt: p.consent?.at || '',
    ...(api.progress ? safe(() => api.progress(p)) : {})
  });
  const safe = f => { try { return f() || {}; } catch { return {}; } };
  function push(p, item) {
    if (!p || (!p.consent?.yes && !item.force)) return;
    const q = load(); q.push({ eid: `${p.id}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, at: new Date().toISOString(), kid: kid(p), ...item }); store(q); flush();
  }
  const toB64 = blob => new Promise((ok, bad) => { const r = new FileReader(); r.onload = () => ok(String(r.result).split(',')[1]); r.onerror = bad; r.readAsDataURL(blob); });
  async function flush() {
    if (busy || !window.FKQ_SYNC_URL || navigator.onLine === false) return;
    let q = load(); if (!q.length) return;
    busy = true;
    try {
      // a voice message goes on its own; everything else in small batches
      const first = q[0], batch = first.audioId ? [first] : q.filter(x => !x.audioId).slice(0, 15);
      const body = await Promise.all(batch.map(async x => {
        if (!x.audioId) return x;
        const blob = await VoiceStore.get(x.audioId).catch(() => null);
        return blob ? { ...x, audio: await toB64(blob), mime: blob.type || 'audio/webm' } : { ...x, audioMissing: true };
      }));
      const res = await fetch(window.FKQ_SYNC_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ batch: body }) });
      const j = await res.json();
      if (j && j.ok) { const done = new Set(batch.map(x => x.eid)); store(load().filter(x => !done.has(x.eid))); busy = false; if (load().length) setTimeout(flush, 300); return; }
    } catch { }
    busy = false;
  }
  const api = {
    progress: null,
    event(p, what, extra = {}) { push(p, { type: 'event', event: what, chapter: extra.chapter || '', details: extra.details || '', force: !!extra.force }); },
    answer(p, e) { push(p, { type: 'answer', chapter: e.ch || '', title: e.title || '', question: e.prompt || '', answer: [e.text, e.text2].filter(Boolean).join(' / '), audioId: e.audio ? e.id : '' }); },
    flush, pending: () => load().length
  };
  addEventListener('online', flush);
  setInterval(flush, 60000);
  setTimeout(flush, 3000);
  return api;
})();
