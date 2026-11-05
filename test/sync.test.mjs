// node --test test/sync.test.mjs — merging copies from several devices, and the exchange with a fake Google Drive
import test from 'node:test';
import assert from 'node:assert';
import { createRequire } from 'node:module';

createRequire(import.meta.url)('../app/js/sync.js');
const { Sync } = globalThis;

const person = (id, o = {}) => ({ id, name: id, color: 0, created: 1000, mods: ['char'], todo: [], ans: '0', pos: 0, done: 1, imported: false, ...o });
const game = (id, o = {}) => ({ id, created: 1000, mode: 'local', me: [], cats: [], ids: [1, 2], players: ['a', 'b'], ...o });
const clone = x => JSON.parse(JSON.stringify(x));

test('stamp marks new and changed items and remembers deletions', () => {
  const d = { people: [person('a'), person('b')], games: [game('g')] };
  const snap = Sync.snapshot(d);
  assert.strictEqual(Sync.stamp(d, snap, 5000), false, 'nothing changed');
  assert.strictEqual(d.people[0].upd, undefined);

  d.people[0].name = 'Anna';
  d.people.push(person('c'));
  assert.strictEqual(Sync.stamp(d, snap, 6000), true);
  assert.deepStrictEqual(d.people.map(p => p.upd), [6000, undefined, 6000]);
  assert.strictEqual(Sync.stamp(d, snap, 7000), false, 'stamping again changes nothing');

  d.people = d.people.filter(p => p.id !== 'b');
  d.games = [];
  d.lic = { code: 'x.y', txn: 'txn_1', checked: 7500 };
  assert.strictEqual(Sync.stamp(d, snap, 8000), true);
  assert.deepStrictEqual(d.gone, { 'p:b': 8000, 'g:g': 8000 });
  assert.strictEqual(d.lic.upd, 8000);

  delete d.lic;
  Sync.stamp(d, snap, 9000);
  assert.strictEqual(d.gone.lic, 9000);
  Sync.stamp(d, snap, 9000 + 401 * 864e5);
  assert.deepStrictEqual(d.gone, {}, 'old deletions are forgotten after 400 days');
});

test('merge keeps the newer copy of every item from both devices', () => {
  const a = { people: [person('a', { name: 'A old', upd: 10 }), person('b', { name: 'B new', upd: 30 }), person('mine')], games: [game('g1')], gone: {} };
  const b = { people: [person('a', { name: 'A new', upd: 20 }), person('b', { name: 'B old', upd: 25 }), person('theirs')], games: [game('g2')], gone: {} };
  const m = Sync.merge(a, b);
  assert.deepStrictEqual(m.people.map(p => [p.id, p.name]), [['a', 'A new'], ['b', 'B new'], ['mine', 'mine'], ['theirs', 'theirs']]);
  assert.deepStrictEqual(m.games.map(g => g.id), ['g1', 'g2']);
  assert.strictEqual(m.people[1], a.people[1], 'the local object is kept when it is newer');
});

test('deletions reach the other device, but a later edit wins over an earlier deletion', () => {
  const a = { people: [person('x', { upd: 50 }), person('y', { upd: 50 })], games: [game('g', { upd: 50 })], gone: {} };
  const b = { people: [person('y', { upd: 90, name: 'edited later' })], games: [], gone: { 'p:x': 60, 'p:y': 70, 'g:g': 60 } };
  const m = Sync.merge(a, b);
  assert.deepStrictEqual(m.people.map(p => [p.id, p.name]), [['y', 'edited later']]);
  assert.deepStrictEqual(m.games, []);
  assert.deepStrictEqual(m.gone, { 'p:x': 60, 'p:y': 70, 'g:g': 60 });
  // and the other way round: deleted here, still present in Drive
  const back = Sync.merge({ people: [], games: [], gone: { 'p:z': 80 } }, { people: [person('z', { upd: 40 })], games: [], gone: {} });
  assert.deepStrictEqual(back.people, []);
});

test('the purchase: the newer one wins, a refund removal is respected, a new purchase after it is kept', () => {
  const old = { code: 'c1', txn: 'txn_1', checked: 100 }, fresh = { code: 'c2', txn: 'txn_1', checked: 200 };
  assert.strictEqual(Sync.merge({ lic: old }, { lic: fresh }).lic, fresh);
  assert.strictEqual(Sync.merge({}, { lic: fresh }).lic, fresh);
  assert.strictEqual(Sync.merge({ gone: { lic: 300 } }, { lic: fresh }).lic, undefined);
  const again = { code: 'c3', txn: 'txn_2', checked: 400, upd: 400 };
  assert.strictEqual(Sync.merge({ lic: again, gone: { lic: 300 } }, { lic: fresh }).lic, again);
});

test('clean drops anything malformed in the Drive copy', () => {
  const c = Sync.clean({ people: [person('ok'), { id: 1 }, null, { id: 'n', name: 'n' }], games: [game('g'), { id: 'g2' }], gone: { 'p:a': 5, 'p:b': 'x' }, lic: { code: 1 } });
  assert.deepStrictEqual(c.people.map(p => p.id), ['ok']);
  assert.deepStrictEqual(c.games.map(g => g.id), ['g']);
  assert.deepStrictEqual(c.gone, { 'p:a': 5 });
  assert.strictEqual(c.lic, undefined);
  assert.deepStrictEqual(Sync.clean('garbage'), { people: [], games: [], gone: {} });
});

// fake Google Drive: files { id: text }; records every call
function drive(files = {}) {
  const calls = [];
  let next = 1;
  const f = async (url, init = {}) => {
    const u = new URL(url), method = init.method || 'GET';
    calls.push({ method, path: u.pathname, search: u.search, auth: init.headers && init.headers.authorization, type: init.headers && init.headers['content-type'], body: init.body });
    const id = decodeURIComponent(u.pathname.split('/').pop());
    if (u.pathname === '/drive/v3/files' && method === 'GET') return Response.json({ files: Object.keys(files).map(i => ({ id: i })) });
    if (u.pathname.startsWith('/drive/v3/files/') && method === 'GET') return id in files ? new Response(files[id]) : new Response('{}', { status: 404 });
    if (u.pathname === '/upload/drive/v3/files' && method === 'POST') {
      const fid = 'f' + next++;
      const part = init.body.split('\r\n\r\n');
      files[fid] = part[2].split('\r\n--')[0];
      return Response.json({ id: fid, meta: JSON.parse(part[1].split('\r\n')[0]) });
    }
    if (u.pathname.startsWith('/upload/drive/v3/files/') && method === 'PATCH') {
      if (!(id in files)) return new Response('{}', { status: 404 });
      files[id] = init.body;
      return Response.json({ id });
    }
    return new Response('{}', { status: 400 });
  };
  f.calls = calls; f.files = files;
  return f;
}
async function withDrive(files, fn) {
  const real = globalThis.fetch, d = drive(files);
  globalThis.fetch = d;
  Sync.setToken('tok', 3600);
  try { return await fn(d); } finally { globalThis.fetch = real; Sync.setToken(null); }
}

test('first sync creates the file in the hidden app folder', () => withDrive({}, async d => {
  const local = { people: [person('a', { upd: 5 })], games: [], gone: {} };
  const r = await Sync.exchange(local, null);
  assert.strictEqual(r.fid, 'f1');
  assert.strictEqual(r.changed, false);
  const post = d.calls.find(c => c.method === 'POST');
  assert.match(post.type, /^multipart\/related; boundary=/);
  assert.match(post.body, /"parents":\["appDataFolder"\]/);
  assert.match(post.body, /"name":"between-us.json"/);
  assert.ok(d.calls.every(c => c.auth === 'Bearer tok'));
  assert.ok(d.calls.some(c => c.path === '/drive/v3/files' && c.search.includes('spaces=appDataFolder')));
  assert.deepStrictEqual(JSON.parse(d.files.f1).people.map(p => p.id), ['a']);
}));

test('changes from another device are merged in both directions', () => withDrive({
  f9: JSON.stringify({ v: 1, people: [person('theirs', { upd: 7 }), person('a', { name: 'renamed there', upd: 9 })], games: [], gone: {} })
}, async d => {
  const local = { people: [person('a', { upd: 5 }), person('mine', { upd: 6 })], games: [], gone: {} };
  const r = await Sync.exchange(local, 'f9');
  assert.strictEqual(r.fid, 'f9');
  assert.strictEqual(r.changed, true);
  assert.deepStrictEqual(r.data.people.map(p => [p.id, p.name]), [['a', 'renamed there'], ['mine', 'mine'], ['theirs', 'theirs']]);
  const patch = d.calls.find(c => c.method === 'PATCH');
  assert.ok(patch, 'Drive gets this device\'s new participant');
  assert.deepStrictEqual(JSON.parse(d.files.f9).people.map(p => p.id), ['a', 'mine', 'theirs']);
}));

test('nothing is written when Drive already has everything', () => withDrive({
  f9: JSON.stringify({ v: 1, people: [person('a', { upd: 5 })], games: [], gone: {} })
}, async d => {
  const r = await Sync.exchange({ people: [person('a', { upd: 5 })], games: [], gone: {} }, 'f9');
  assert.strictEqual(r.changed, false);
  assert.ok(!d.calls.some(c => c.method !== 'GET'));
}));

test('a file deleted in Drive is looked up again and recreated', () => withDrive({}, async d => {
  const r = await Sync.exchange({ people: [person('a')], games: [], gone: {} }, 'gone-id');
  assert.strictEqual(r.fid, 'f1');
  assert.deepStrictEqual(d.calls.map(c => c.method + ' ' + c.path), ['GET /drive/v3/files/gone-id', 'GET /drive/v3/files', 'POST /upload/drive/v3/files']);
}));

test('an expired token asks for a new sign-in; a damaged file is rewritten', async () => {
  const real = globalThis.fetch;
  try {
    Sync.setToken('tok', 3600);
    globalThis.fetch = async () => new Response('{}', { status: 401 });
    await assert.rejects(Sync.exchange({ people: [], games: [], gone: {} }, 'f1'), { code: 'login' });
    assert.strictEqual(Sync.hasToken(), false);
    await assert.rejects(Sync.exchange({ people: [], games: [], gone: {} }, 'f1'), { code: 'login' }, 'no request without a token');
  } finally { globalThis.fetch = real; Sync.setToken(null); }
  await withDrive({ f1: 'not json' }, async d => {
    const r = await Sync.exchange({ people: [person('a')], games: [], gone: {} }, 'f1');
    assert.strictEqual(r.fid, 'f1');
    assert.deepStrictEqual(JSON.parse(d.files.f1).people.map(p => p.id), ['a']);
  });
});

test('switched on by the Google client ID, but only on the site and localhost', () => {
  assert.strictEqual(Sync.enabled, true);
  assert.strictEqual(Sync.available(), false, 'no address here, as in the Windows program (file://)');
  const real = globalThis.location;
  try {
    for (const [h, ok] of [['aureliel.store', true], ['www.aureliel.store', true], ['localhost', true], ['google-sync-the-connection-between-us.karimkishvarov61.workers.dev', true],
      ['iioverlordii.github.io', false], ['evil-aureliel.store', false], ['', false]]) {
      globalThis.location = { hostname: h };
      assert.strictEqual(Sync.available(), ok, h);
    }
  } finally { globalThis.location = real; }
});
