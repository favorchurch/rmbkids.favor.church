// Sends a kid's sign-up details, activity and answers to the church's Google Sheet,
// but only when a parent has ticked the consent box. Everything waits in an outbox on
// this device and is sent when there is internet, so nothing is lost when offline.
window.FKQ_SYNC_URL = window.FKQ_SYNC_URL || '/api/sync';
const Sync = (() => {
  const KEY = 'rmb-outbox', CUSTODY_KEY = 'rmb-custody-v1', REKEY_KEY = 'rmb-legacy-rekey-v1';
  const load = () => { try { return JSON.parse(localStorage.getItem(KEY)) || []; } catch { return []; } };
  const loadCustody = () => { try { return JSON.parse(localStorage.getItem(CUSTODY_KEY)) || {}; } catch { return {}; } };
  const storeCustody = value => { try { localStorage.setItem(CUSTODY_KEY, JSON.stringify(value)); } catch { } };
  const store = q => { try { localStorage.setItem(KEY, JSON.stringify(q.slice(-400))); } catch { } };
  let busy = false, createReplacementId = null, updateProfileId = null;
  const loadRekeys = () => { try { return JSON.parse(localStorage.getItem(REKEY_KEY)) || { mapped: {}, attempted: {} }; } catch { return { mapped: {}, attempted: {} }; } };
  const storeRekeys = value => { try { localStorage.setItem(REKEY_KEY, JSON.stringify(value)); } catch { } };
  function rekeyLegacyExplorer(oldId) {
    const custody = loadCustody();
    if (custody[oldId] || !createReplacementId || !updateProfileId) return false;
    const rekeys = loadRekeys();
    if (rekeys.mapped[oldId]) {
      const newId = rekeys.mapped[oldId];
      updateProfileId(oldId, newId);
      const q = load();
      let changed = false;
      for (const item of q) if (item.kid?.id === oldId) { item.kid.id = newId; changed = true; }
      if (changed) store(q);
      return true;
    }
    if (rekeys.attempted[oldId]) return false;
    const newId = createReplacementId();
    if (typeof newId !== 'string' || !newId || newId === oldId) return false;
    rekeys.mapped[oldId] = newId;
    rekeys.attempted[oldId] = true;
    rekeys.attempted[newId] = true;
    storeRekeys(rekeys);
    updateProfileId(oldId, newId);
    const q = load();
    let changed = false;
    for (const item of q) if (item.kid?.id === oldId) { item.kid.id = newId; changed = true; }
    if (changed) store(q);
    return true;
  }
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
      const first = q[0], batch = first.audioId ? [first] : q.filter(x => x.kid?.id === first.kid?.id && !x.audioId).slice(0, 15);
      const custody = loadCustody();
      const body = await Promise.all(batch.map(async x => {
        let item = { ...x };
        if (item.kid?.id && custody[item.kid.id]) item.custodyToken = custody[item.kid.id];
        if (item.audioId) {
          const blob = await VoiceStore.get(item.audioId).catch(() => null);
          item = blob ? { ...item, audio: await toB64(blob), mime: blob.type || 'audio/webm' } : { ...item, audioMissing: true };
        }
        return item;
      }));
      const res = await fetch(window.FKQ_SYNC_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ batch: body }) });
      const j = await res.json();
      if (res.status === 401 && first.kid?.id && !custody[first.kid.id] && rekeyLegacyExplorer(first.kid.id)) {
        busy = false;
        setTimeout(flush, 0);
        return;
      }
      if (j?.custodyTokens && typeof j.custodyTokens === 'object') {
        Object.assign(custody, j.custodyTokens); storeCustody(custody);
      }
      if (j && j.ok) {
        const done = new Set(batch.map(x => x.eid)); store(load().filter(x => !done.has(x.eid)));
        busy = false; if (load().length) setTimeout(flush, 300); return;
      }
    } catch { }
    busy = false;
  }
  const api = {
    progress: null,
    configureRekey({ createId, updateProfile }) { createReplacementId = createId; updateProfileId = updateProfile; },
    event(p, what, extra = {}) { push(p, { type: 'event', event: what, chapter: extra.chapter || '', details: extra.details || '', force: !!extra.force }); },
    answer(p, e) { push(p, { type: 'answer', chapter: e.ch || '', title: e.title || '', question: e.prompt || '', answer: [e.text, e.text2].filter(Boolean).join(' / '), audioId: e.audio ? e.id : '' }); },
    flush, pending: () => load().length,
    custodyFor(id) { return loadCustody()[id] || ''; },
    importCustody(id, token) { const custody = loadCustody(); custody[id] = token; storeCustody(custody); }
  };
  addEventListener('online', flush);
  setInterval(flush, 60000);
  setTimeout(flush, 3000);
  return api;
})();
