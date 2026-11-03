// node --test test/pay.test.mjs — the purchase-check Worker against a fake Paddle API, and the app's check of its unlock codes
import test from 'node:test';
import assert from 'node:assert';
import { createRequire } from 'node:module';
import { handle } from '../worker/index.mjs';

createRequire(import.meta.url)('../app/js/pay.js');
const { Pay } = globalThis;

const PRICE = 'pri_01full000000000000000000000';
const TXN = 'txn_01aaaaaaaaaaaaaaaaaaaaaaaa';
const TXN2 = 'txn_01bbbbbbbbbbbbbbbbbbbbbbbb';
const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
const PRIV = JSON.stringify(await crypto.subtle.exportKey('jwk', pair.privateKey));
const PUB = await crypto.subtle.exportKey('jwk', pair.publicKey);
const env = (o = {}) => ({ PADDLE_API_KEY: 'pdl_sdbx_apikey_test', LICENSE_KEY: PRIV, PADDLE_PRICE_ID: PRICE, ...o });

const txn = (id, o = {}) => ({ id, status: 'completed', customer_id: 'ctm_1', items: [{ price: { id: PRICE } }], ...o });
// fake Paddle: routes maps "path?query" (or a path prefix ending in *) to a body or [status, body]
function paddle(routes) {
  const calls = [];
  const f = async (url, init) => {
    const u = new URL(url);
    calls.push({ url, auth: init.headers.authorization });
    const key = u.pathname + u.search;
    const hit = Object.keys(routes).find(k => k === key || (k.endsWith('*') && key.startsWith(k.slice(0, -1))));
    if (!hit) return new Response('{"error":{}}', { status: 404 });
    const [status, body] = Array.isArray(routes[hit]) ? routes[hit] : [200, routes[hit]];
    return new Response(JSON.stringify(body), { status });
  };
  f.calls = calls;
  return f;
}
const post = body => new Request('https://aureliel.store/api/unlock', { method: 'POST', headers: { 'content-type': 'application/json' }, body: typeof body === 'string' ? body : JSON.stringify(body) });
async function call(body, routes, e = env()) {
  const f = paddle(routes);
  const r = await handle(post(body), e, f);
  return { status: r.status, json: await r.json(), calls: f.calls, cors: r.headers.get('access-control-allow-origin') };
}

test('switched off until the secrets and the price are set', async () => {
  for (const k of ['PADDLE_API_KEY', 'LICENSE_KEY', 'PADDLE_PRICE_ID']) {
    const r = await call({ txn: TXN }, {}, env({ [k]: '' }));
    assert.deepStrictEqual([r.status, r.json.error], [503, 'not_configured']);
  }
});

test('rejects malformed requests before asking Paddle', async () => {
  for (const body of ['not json', { txn: 'txn_123' }, { email: 'nobody' }, { email: 'a@b' }, {}]) {
    const r = await call(body, {});
    assert.deepStrictEqual([r.status, r.json.error, r.calls.length], [400, 'bad_request', 0], JSON.stringify(body));
  }
});

test('a paid transaction gives a code the app accepts', async () => {
  const r = await call({ txn: TXN.toUpperCase() }, { [`/transactions/${TXN}`]: { data: txn(TXN) }, '/adjustments*': { data: [] } });
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.json.txn, TXN);
  assert.strictEqual(r.cors, '*');
  assert.ok(r.calls.every(c => c.url.startsWith('https://sandbox-api.paddle.com/') && c.auth === 'Bearer pdl_sdbx_apikey_test'));
  const p = await Pay.verify(r.json.code, PUB);
  assert.deepStrictEqual([p.p, p.t, p.v], ['full', TXN, 1]);
  assert.ok(Math.abs(p.i - Date.now() / 1000) < 60);
});

test('a live API key talks to the live Paddle API', async () => {
  const r = await call({ txn: TXN }, { [`/transactions/${TXN}`]: { data: txn(TXN) }, '/adjustments*': { data: [] } }, env({ PADDLE_API_KEY: 'pdl_live_apikey_x' }));
  assert.strictEqual(r.status, 200);
  assert.ok(r.calls.every(c => c.url.startsWith('https://api.paddle.com/')));
});

test('unpaid, unknown or other-product transactions are not found', async () => {
  const cases = [
    { [`/transactions/${TXN}`]: { data: txn(TXN, { status: 'ready' }) } },
    { [`/transactions/${TXN}`]: { data: txn(TXN, { items: [{ price: { id: 'pri_other' } }] }) } },
    {}
  ];
  for (const routes of cases) {
    const r = await call({ txn: TXN }, routes);
    assert.deepStrictEqual([r.status, r.json.error], [404, 'not_found']);
  }
});

test('a refunded purchase is reported as refunded', async () => {
  const r = await call({ txn: TXN }, {
    [`/transactions/${TXN}`]: { data: txn(TXN) },
    [`/adjustments?transaction_id=${TXN}&action=refund,chargeback&status=approved&per_page=50`]: { data: [{ transaction_id: TXN, action: 'refund', status: 'approved' }] }
  });
  assert.deepStrictEqual([r.status, r.json.error], [410, 'refunded']);
});

test('restore by email finds the purchase that was not refunded', async () => {
  const r = await call({ email: ' Jo@Example.com ' }, {
    '/customers?email=jo%40example.com&status=active,archived': { data: [{ id: 'ctm_1', email: 'jo@example.com' }] },
    '/transactions?customer_id=ctm_1&status=paid,completed&per_page=50': { data: [txn(TXN), txn(TXN2), txn('txn_01other', { items: [{ price: { id: 'pri_x' } }] })] },
    '/adjustments*': { data: [{ transaction_id: TXN, action: 'refund', status: 'approved' }] }
  });
  assert.deepStrictEqual([r.status, r.json.txn], [200, TXN2]);
  assert.strictEqual((await Pay.verify(r.json.code, PUB)).t, TXN2);
});

test('an email without purchases is not found', async () => {
  const r = await call({ email: 'jo@example.com' }, { '/customers*': { data: [] } });
  assert.deepStrictEqual([r.status, r.json.error], [404, 'not_found']);
});

test('Paddle errors become 502', async () => {
  const r = await call({ txn: TXN }, { [`/transactions/${TXN}`]: [500, {}] });
  assert.deepStrictEqual([r.status, r.json.error], [502, 'paddle']);
});

test('routing: CORS preflight, wrong method, unknown API path, static files', async () => {
  const pre = await handle(new Request('https://aureliel.store/api/unlock', { method: 'OPTIONS' }), env());
  assert.strictEqual(pre.status, 204);
  assert.strictEqual(pre.headers.get('access-control-allow-methods'), 'POST');
  assert.strictEqual((await handle(new Request('https://aureliel.store/api/unlock'), env())).status, 405);
  assert.strictEqual((await handle(new Request('https://aureliel.store/api/nope'), env())).status, 404);
  const seen = [];
  const r = await handle(new Request('https://aureliel.store/index.html'), env({ ASSETS: { fetch: req => { seen.push(req.url); return new Response('page'); } } }));
  assert.deepStrictEqual([await r.text(), seen], ['page', ['https://aureliel.store/index.html']]);
});

test('the app rejects forged or damaged codes', async () => {
  const r = await call({ txn: TXN }, { [`/transactions/${TXN}`]: { data: txn(TXN) }, '/adjustments*': { data: [] } });
  const [data, sig] = r.json.code.split('.');
  const forged = Buffer.from(JSON.stringify({ v: 1, p: 'full', t: TXN2, i: 1 })).toString('base64url');
  const other = await crypto.subtle.exportKey('jwk', (await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'])).publicKey);
  assert.strictEqual(await Pay.verify(`${forged}.${sig}`, PUB), null);
  assert.strictEqual(await Pay.verify(`${data}.${sig.slice(0, -4)}AAAA`, PUB), null);
  assert.strictEqual(await Pay.verify(r.json.code, other), null);
  assert.strictEqual(await Pay.verify('garbage', PUB), null);
  assert.strictEqual(await Pay.verify(r.json.code), null); // signed by the test key, not the site's
});

test('the app reports server and network failures', async () => {
  const real = globalThis.fetch;
  try {
    globalThis.fetch = async () => new Response('{"error":"not_found"}', { status: 404 });
    assert.deepStrictEqual(await Pay.unlock({ email: 'jo@example.com' }), { error: 'not_found' });
    globalThis.fetch = async () => { throw new TypeError('offline'); };
    assert.deepStrictEqual(await Pay.unlock({ txn: TXN }), { error: 'network' });
  } finally { globalThis.fetch = real; }
});

test('the full version stays free until Paddle is configured', () => {
  assert.strictEqual(Pay.enabled, false);
  assert.strictEqual(Pay.canCheckout(), false);
});
