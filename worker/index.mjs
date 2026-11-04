// Purchase check for the full version. Cloudflare runs this Worker only for /api/* (wrangler.jsonc);
// every other request is served straight from app/ as before.
//
// POST /api/unlock  { txn: 'txn_…' } or { email: '…' }
//   → asks Paddle whether that purchase of PADDLE_PRICE_ID exists and was not refunded,
//     answers { code, txn } where code is signed with LICENSE_KEY; the app checks it offline (app/js/pay.js).
//
// Cloudflare → Worker → Settings → Variables and secrets:
//   PADDLE_API_KEY  secret, Paddle → Developer tools → API keys (pdl_sdbx_apikey_… sandbox, pdl_live_apikey_… live)
//   LICENSE_KEY     secret, private JWK of the key pair whose public half is in app/js/pay.js
//   PADDLE_PRICE_ID var in wrangler.jsonc, the price of the full version (pri_…)

const CORS = { 'access-control-allow-origin': '*' };
const reply = (status, body) => new Response(JSON.stringify(body), {
  status, headers: { ...CORS, 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }
});
const TXN = /^txn_[a-z\d]{26}$/;
const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,253}\.[^\s@]{2,63}$/;
const PAID = ['paid', 'completed'];

// GET against the Paddle API; null for 404, throws on other errors
function paddle(env, fetchImpl) {
  const base = env.PADDLE_API_KEY.startsWith('pdl_live_') ? 'https://api.paddle.com' : 'https://sandbox-api.paddle.com';
  return async path => {
    const r = await fetchImpl(base + path, { headers: { authorization: `Bearer ${env.PADDLE_API_KEY}`, accept: 'application/json' } });
    if (r.status === 404) return null;
    if (!r.ok) throw new Error(`paddle ${r.status}`);
    return (await r.json()).data;
  };
}

const buysFull = (t, env) => t && PAID.includes(t.status) && (t.items || []).some(i => i.price && i.price.id === env.PADDLE_PRICE_ID);

// ids of transactions that have an approved refund or chargeback
async function refunded(get, ids) {
  if (!ids.length) return new Set();
  const adj = await get(`/adjustments?transaction_id=${ids.join(',')}&action=refund,chargeback&status=approved&per_page=50`) || [];
  return new Set(adj.map(a => a.transaction_id));
}

// the purchase as { txn } or { refunded: true }, or null when there is none
async function find(get, env, q) {
  let txns;
  if (q.txn) {
    const t = await get(`/transactions/${q.txn}`);
    txns = buysFull(t, env) ? [t.id] : [];
  } else {
    const customers = (await get(`/customers?email=${encodeURIComponent(q.email)}&status=active,archived`) || []).slice(0, 5);
    txns = [];
    for (const c of customers) {
      const list = await get(`/transactions?customer_id=${c.id}&status=${PAID.join(',')}&per_page=50`) || [];
      txns.push(...list.filter(t => buysFull(t, env)).map(t => t.id));
    }
  }
  if (!txns.length) return null;
  const gone = await refunded(get, txns);
  const ok = txns.find(id => !gone.has(id));
  return ok ? { txn: ok } : { refunded: true };
}

const b64u = bytes => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
async function sign(env, payload) {
  const key = await crypto.subtle.importKey('jwk', JSON.parse(env.LICENSE_KEY), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  const data = b64u(new TextEncoder().encode(JSON.stringify(payload)));
  const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, new TextEncoder().encode(data));
  return `${data}.${b64u(new Uint8Array(sig))}`;
}

export async function unlock(request, env, fetchImpl = fetch) {
  if (!env.PADDLE_API_KEY || !env.LICENSE_KEY || !env.PADDLE_PRICE_ID) return reply(503, { error: 'not_configured' });
  let body;
  try { body = await request.json(); } catch (e) { return reply(400, { error: 'bad_request' }); }
  const txn = typeof body.txn === 'string' ? body.txn.trim().toLowerCase() : '';
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  const q = txn ? { txn } : { email };
  if (txn ? !TXN.test(txn) : !EMAIL.test(email)) return reply(400, { error: 'bad_request' });
  let found;
  try { found = await find(paddle(env, fetchImpl), env, q); } catch (e) { return reply(502, { error: 'paddle' }); }
  if (!found) return reply(404, { error: 'not_found' });
  if (found.refunded) return reply(410, { error: 'refunded' });
  const code = await sign(env, { v: 1, p: 'full', t: found.txn, i: Math.floor(Date.now() / 1000) });
  return reply(200, { code, txn: found.txn });
}

export async function handle(request, env, fetchImpl = fetch) {
  const { pathname } = new URL(request.url);
  if (pathname === '/api/unlock') {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: { ...CORS, 'access-control-allow-methods': 'POST', 'access-control-allow-headers': 'content-type', 'access-control-max-age': '86400' } });
    }
    return request.method === 'POST' ? unlock(request, env, fetchImpl) : reply(405, { error: 'method' });
  }
  if (pathname.startsWith('/api/')) return reply(404, { error: 'not_found' });
  return env.ASSETS.fetch(request);
}

export default { fetch: (request, env) => handle(request, env) };
