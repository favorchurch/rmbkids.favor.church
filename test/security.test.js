import test from 'node:test';
import assert from 'node:assert/strict';
import { createHandler as adminHandlerFactory } from '../api/admin/overview.js';
import { createHandler as syncHandlerFactory } from '../api/sync.js';

function response() {
  return {
    headers: {}, statusCode: 200, body: undefined,
    setHeader(name, value) { this.headers[name] = value; return this; },
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
    end() { return this; },
  };
}

function memorySupabase() {
  const tables = { rmb_kids: new Map(), rmb_events: new Map(), rmb_answers: new Map() };
  const uploads = [];
  const client = {
    from(name) {
      let id;
      return {
        select() { return this; },
        eq(_field, value) { id = value; return this; },
        maybeSingle: async () => ({ data: tables[name].get(id) || null, error: null }),
        order() { return this; }, limit() { return Promise.resolve({ data: [...tables[name].values()], error: null }); },
        insert: async record => {
          const key = record.id || record.eid;
          if (tables[name].has(key)) return { error: { code: '23505', message: 'duplicate' } };
          tables[name].set(key, record); return { error: null };
        },
        upsert: async record => {
          const key = record.id || record.eid;
          if (!tables[name].has(key) || !record.ignoreDuplicates) tables[name].set(key, record);
          return { error: null };
        },
      };
    },
    storage: { from(bucket) {
      return {
        upload: async (path, buffer, options) => { uploads.push({ bucket, path, buffer, options }); return { error: null }; },
        createSignedUrl: async path => ({ data: { signedUrl: `https://private.test/${path}` }, error: null }),
      };
    } },
    tables,
    uploads,
  };
  return client;
}

const id = 'e2e93c51-88cb-4e3d-8708-cc5046b31430';
const baseItem = overrides => ({
  type: 'event', eid: `${id}-1700000000000-ab123`, event: 'Chapter read',
  kid: { id, firstName: 'Explorer', consent: true }, ...overrides,
});
async function call(handler, method, body, headers = {}) {
  const res = response();
  await handler({ method, body, headers }, res);
  return res;
}

test('admin overview fails closed when ADMIN_SECRET is unset or blank', async t => {
  const previous = process.env.ADMIN_SECRET;
  const accesses = { count: 0 };
  const handler = adminHandlerFactory(() => { accesses.count++; throw new Error('must not reach DB'); });
  for (const secret of [undefined, '', '   ']) {
    if (secret === undefined) delete process.env.ADMIN_SECRET;
    else process.env.ADMIN_SECRET = secret;
    const res = await call(handler, 'GET', undefined, { authorization: 'Bearer anything' });
    assert.equal(res.statusCode, 503);
    assert.equal(res.headers['Cache-Control'], 'no-store');
    assert.equal(accesses.count, 0);
  }
  t.after(() => previous === undefined ? delete process.env.ADMIN_SECRET : process.env.ADMIN_SECRET = previous);
});

test('admin overview rejects wrong or non-Bearer credentials without querying', async t => {
  const previous = process.env.ADMIN_SECRET;
  process.env.ADMIN_SECRET = 'a-long-admin-secret';
  const handler = adminHandlerFactory(() => { throw new Error('must not reach DB'); });
  for (const authorization of ['Bearer wrong', 'Basic a-long-admin-secret', undefined]) {
    const res = await call(handler, 'GET', undefined, authorization ? { authorization } : {});
    assert.equal(res.statusCode, 401);
    assert.equal(res.headers['Cache-Control'], 'no-store');
  }
  t.after(() => previous === undefined ? delete process.env.ADMIN_SECRET : process.env.ADMIN_SECRET = previous);
});

test('admin overview serves data only after valid bearer authentication', async t => {
  const previous = process.env.ADMIN_SECRET;
  process.env.ADMIN_SECRET = 'secure-admin';
  let queries = 0;
  const client = { from(name) { queries++; return { select() { return this; }, order() { return this; }, limit: async () => ({ data: name === 'rmb_kids' ? [{ consent: true, country: 'AU' }] : [], error: null }) }; } };
  const res = await call(adminHandlerFactory(() => client), 'GET', undefined, { authorization: 'Bearer secure-admin' });
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.summary.totalKids, 1);
  assert.equal(queries, 2);
  t.after(() => previous === undefined ? delete process.env.ADMIN_SECRET : process.env.ADMIN_SECRET = previous);
});

test('admin overview signs legacy timestamp audio paths and isolates per-file signing failures', async t => {
  const previous = process.env.ADMIN_SECRET;
  process.env.ADMIN_SECRET = 'secure-admin';
  const signedPaths = [];
  const client = {
    from(name) {
      return {
        select() { return this; }, order() { return this; },
        limit: async () => ({ data: name === 'rmb_kids' ? [] : [
          { id: 1, audio_url: '1700000000000/legacy-voice.webm' },
          { id: 2, audio_url: `${id}/missing-voice.webm` },
        ], error: null }),
      };
    },
    storage: { from: () => ({ createSignedUrl: async path => {
      signedPaths.push(path);
      if (path.includes('missing')) throw new Error('storage unavailable');
      return { data: { signedUrl: `https://private.test/${path}` }, error: null };
    } }) },
  };
  const res = await call(adminHandlerFactory(() => client), 'GET', undefined, { authorization: 'Bearer secure-admin' });
  assert.equal(res.statusCode, 200);
  assert.deepEqual(signedPaths, ['1700000000000/legacy-voice.webm', `${id}/missing-voice.webm`]);
  assert.equal(res.body.recentAnswers[0].audio_url, 'https://private.test/1700000000000/legacy-voice.webm');
  assert.equal(res.body.recentAnswers[1].audio_url, null);
  t.after(() => previous === undefined ? delete process.env.ADMIN_SECRET : process.env.ADMIN_SECRET = previous);
});

test('first sync creates explorer and returns custody token; token authorizes later writes', async t => {
  const prevSecret = process.env.SYNC_CUSTODY_SECRET, prevService = process.env.SUPABASE_SERVICE_ROLE_KEY;
  process.env.SYNC_CUSTODY_SECRET = 'test-sync-secret';
  const db = memorySupabase(), handler = syncHandlerFactory(() => db);
  const first = await call(handler, 'POST', { batch: [baseItem()] });
  assert.equal(first.statusCode, 200);
  const token = first.body.custodyTokens[id];
  assert.match(token, /^v1\.[a-f0-9]{64}$/);

  const overwrite = await call(handler, 'POST', { batch: [baseItem({ kid: { id, firstName: 'Overwritten', consent: false } })] });
  assert.equal(overwrite.statusCode, 401);
  assert.equal(db.tables.rmb_kids.get(id).first_name, 'Explorer');

  const authorized = await call(handler, 'POST', { batch: [baseItem({ custodyToken: token, kid: { id, firstName: 'Updated safely', consent: true } })] });
  assert.equal(authorized.statusCode, 200);
  assert.equal(db.tables.rmb_kids.get(id).first_name, 'Updated safely');
  t.after(() => {
    prevSecret === undefined ? delete process.env.SYNC_CUSTODY_SECRET : process.env.SYNC_CUSTODY_SECRET = prevSecret;
    prevService === undefined ? delete process.env.SUPABASE_SERVICE_ROLE_KEY : process.env.SUPABASE_SERVICE_ROLE_KEY = prevService;
  });
});

test('sync rejects forged custody token and explorer/path traversal before any write', async t => {
  const previous = process.env.SYNC_CUSTODY_SECRET;
  process.env.SYNC_CUSTODY_SECRET = 'test-sync-secret';
  const db = memorySupabase(), handler = syncHandlerFactory(() => db);
  const created = await call(handler, 'POST', { batch: [baseItem()] });
  assert.equal(created.statusCode, 200);
  const forged = await call(handler, 'POST', { batch: [baseItem({ custodyToken: 'v1.' + '0'.repeat(64) })] });
  assert.equal(forged.statusCode, 401);

  const traversalId = await call(handler, 'POST', { batch: [baseItem({ kid: { id: '../victim' } })] });
  assert.equal(traversalId.statusCode, 400);
  const traversalAudio = await call(handler, 'POST', { batch: [baseItem({
    type: 'answer', eid: `${id}-1700000000000-abcde`, audio: Buffer.from('voice').toString('base64'),
    mime: 'audio/webm', audioId: '../outside',
  })] });
  assert.equal(traversalAudio.statusCode, 400);
  assert.equal(db.uploads.length, 0);
  t.after(() => previous === undefined ? delete process.env.SYNC_CUSTODY_SECRET : process.env.SYNC_CUSTODY_SECRET = previous);
});

test('sync accepts a text-only answer with an empty audio id', async t => {
  const previous = process.env.SYNC_CUSTODY_SECRET;
  process.env.SYNC_CUSTODY_SECRET = 'test-sync-secret';
  const db = memorySupabase(), handler = syncHandlerFactory(() => db);
  const answer = await call(handler, 'POST', { batch: [{
    type: 'answer', eid: `${id}-1700000000000-text1`, audioId: '', answer: 'A text response',
    kid: { id, firstName: 'Explorer', consent: true },
  }] });
  assert.equal(answer.statusCode, 200);
  assert.equal(db.tables.rmb_answers.get(`${id}-1700000000000-text1`).answer_text, 'A text response');
  assert.equal(db.uploads.length, 0);
  t.after(() => previous === undefined ? delete process.env.SYNC_CUSTODY_SECRET : process.env.SYNC_CUSTODY_SECRET = previous);
});

test('sync validates audio MIME, base64 and size before upload; valid audio remains under explorer path', async t => {
  const previous = process.env.SYNC_CUSTODY_SECRET;
  process.env.SYNC_CUSTODY_SECRET = 'test-sync-secret';
  const db = memorySupabase(), handler = syncHandlerFactory(() => db);
  const token = (await call(handler, 'POST', { batch: [baseItem()] })).body.custodyTokens[id];
  const answer = {
    type: 'answer', eid: `${id}-1700000000000-audio1`, audioId: 'voice-1', audio: Buffer.from('sample audio').toString('base64'),
    mime: 'audio/webm;codecs=opus', custodyToken: token, kid: { id, firstName: 'Explorer' },
  };
  const good = await call(handler, 'POST', { batch: [answer] });
  assert.equal(good.statusCode, 200);
  assert.equal(db.uploads[0].path, `${id}/voice-1.webm`);
  assert.equal(db.uploads[0].options.contentType, 'audio/webm');

  const badMime = await call(handler, 'POST', { batch: [{ ...answer, eid: `${id}-1700000000001-audio2`, mime: 'text/html' }] });
  assert.equal(badMime.statusCode, 400);
  const badB64 = await call(handler, 'POST', { batch: [{ ...answer, eid: `${id}-1700000000002-audio3`, audio: '%%%=' }] });
  assert.equal(badB64.statusCode, 400);
  const huge = await call(handler, 'POST', { batch: [{ ...answer, eid: `${id}-1700000000003-audio4`, audio: Buffer.alloc(5 * 1024 * 1024 + 1).toString('base64') }] });
  assert.equal(huge.statusCode, 400);
  assert.equal(db.uploads.length, 1);
  t.after(() => previous === undefined ? delete process.env.SYNC_CUSTODY_SECRET : process.env.SYNC_CUSTODY_SECRET = previous);
});
