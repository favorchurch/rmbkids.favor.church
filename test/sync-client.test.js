import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const source = await readFile(new URL('../sync.js', import.meta.url), 'utf8');

function clientHarness(responses) {
  const values = new Map();
  const timers = [];
  const requests = [];
  const localStorage = {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
  };
  const context = {
    window: { FKQ_SYNC_URL: '/api/sync' }, localStorage,
    navigator: { onLine: true }, addEventListener() {}, setInterval() {},
    setTimeout(callback) { timers.push(callback); return timers.length; },
    fetch: async (_url, options) => {
      requests.push(JSON.parse(options.body));
      const next = responses.shift();
      return { status: next.status, json: async () => next.body };
    },
    Math, Promise, Date, FileReader: class {},
  };
  vm.runInNewContext(source, context, { filename: 'sync.js' });
  timers.length = 0; // discard the production startup flush timer
  return { Sync: vm.runInContext('Sync', context), values, requests, timers };
}

const legacyId = '1700000000000';
const replacementId = 'd4c7ecab-e6bc-45ad-97b4-48369993ad02';
const event = { eid: 'legacy-event-1', type: 'event', event: 'Chapter read', kid: { id: legacyId, firstName: 'Explorer' } };

function configure(harness, profiles, generatedIds = [replacementId]) {
  let creates = 0;
  harness.Sync.configureRekey({
    createId: () => { creates++; return generatedIds.shift(); },
    updateProfile(oldId, newId) {
      const profile = profiles.find(item => item.id === oldId);
      if (profile) profile.id = newId;
    },
  });
  return () => creates;
}

function seed(harness, outbox = [event]) {
  harness.values.set('rmb-outbox', JSON.stringify(outbox));
  harness.values.set('rmb-custody-v1', '{}');
}

test('legacy 401 re-keys profile and every queued event, then syncs under a new custody identity', async () => {
  const harness = clientHarness([
    { status: 401, body: { ok: false } },
    { status: 200, body: { ok: true, custodyTokens: { [replacementId]: 'v1.token' } } },
  ]);
  const profiles = [{ id: legacyId, completed: [1, 2, 3], homeStage: 2 }];
  seed(harness, [event, { ...event, eid: 'legacy-event-2' }]);
  const generated = configure(harness, profiles);

  await harness.Sync.flush();
  assert.equal(profiles[0].id, replacementId);
  const migrated = JSON.parse(harness.values.get('rmb-outbox'));
  assert.deepEqual(migrated.map(item => item.kid.id), [replacementId, replacementId]);
  assert.deepEqual(profiles[0].completed, [1, 2, 3]);
  assert.equal(harness.timers.length, 1);
  await harness.timers.shift()();

  assert.equal(harness.requests.length, 2);
  assert.equal(harness.requests[1].batch[0].kid.id, replacementId);
  assert.deepEqual(JSON.parse(harness.values.get('rmb-outbox')), []);
  assert.equal(JSON.parse(harness.values.get('rmb-custody-v1'))[replacementId], 'v1.token');
  assert.equal(generated(), 1);
});

test('re-key attempt is bounded and never repeatedly changes the explorer id after another 401', async () => {
  const harness = clientHarness([
    { status: 401, body: { ok: false } },
    { status: 401, body: { ok: false } },
  ]);
  const profiles = [{ id: legacyId, completed: [4] }];
  seed(harness);
  const generated = configure(harness, profiles);

  await harness.Sync.flush();
  await harness.timers.shift()();
  assert.equal(generated(), 1);
  assert.equal(harness.requests.length, 2);
  assert.equal(profiles[0].id, replacementId);
  assert.equal(JSON.parse(harness.values.get('rmb-outbox'))[0].kid.id, replacementId);
  assert.equal(harness.timers.length, 0);
});
