// Full version: Paddle checkout and the unlock code signed by the purchase-check server (worker/index.mjs).
// While PADDLE.token is empty, Pay.enabled is false and the whole app stays free.
(function (root) {
  'use strict';
  // Paddle → Developer tools: the client-side token (test_… sandbox, live_… live) and the price ID (pri_…) of the full version
  const PADDLE = { token: '', priceId: 'pri_01m6kfbze7fd4qbvatbdrsk0cg' };
  // public half of the server's LICENSE_KEY: only codes signed with the private half unlock the full version
  const KEY = { kty: 'EC', crv: 'P-256', x: 'ibJXGHMrVooFlkVW53Go-dZO7wdAyYIFkDpkdWoRBzE', y: 'fLYi2OTjqYHhB0Hqb67bImB7lSj0sBhPU3aPi3F1V9A' };
  const PRICE_USD = 4.99;
  const SITE = 'https://aureliel.store/';
  // checkout languages Paddle is known to support; others fall back to the browser's language
  const LOCALES = ['en', 'es', 'pt', 'de', 'fr', 'it', 'pl', 'tr', 'ru'];
  const enabled = !!(PADDLE.token && PADDLE.priceId);

  const host = () => (root.location && root.location.hostname) || '';
  const onSite = () => /(^|\.)aureliel\.store$|\.workers\.dev$/.test(host());
  const api = () => (onSite() ? '/' : SITE) + 'api/unlock';
  // Paddle opens checkout only on approved domains: not in the Windows program or on old copies
  const canCheckout = () => enabled && onSite();

  const unb64u = s => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));
  const keys = new Map();
  // resolves the code's payload { v, p: 'full', t: 'txn_…', i } when the signature is valid, otherwise null
  async function verify(code, jwk = KEY) {
    try {
      const [data, sig] = String(code || '').split('.');
      if (!data || !sig || !root.crypto || !root.crypto.subtle) return null;
      if (!keys.has(jwk)) keys.set(jwk, await crypto.subtle.importKey('jwk', jwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']));
      if (!await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, keys.get(jwk), unb64u(sig), new TextEncoder().encode(data))) return null;
      const p = JSON.parse(new TextDecoder().decode(unb64u(data)));
      return p && p.p === 'full' && typeof p.t === 'string' ? p : null;
    } catch (e) { return null; }
  }

  // asks the server about a purchase by order number ({ txn }) or email ({ email });
  // resolves { code, txn } or { error: 'not_found' | 'refunded' | 'network' | … }
  async function unlock(q) {
    try {
      const r = await fetch(api(), { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(q) });
      const j = await r.json().catch(() => ({}));
      const p = r.ok && await verify(j.code);
      if (p) return { code: j.code, txn: p.t };
      return { error: (j && j.error) || 'server' };
    } catch (e) { return { error: 'network' }; }
  }

  // Paddle.js is loaded only when someone opens the checkout
  let script = null, ready = false, onPaid = null;
  function loadPaddle() {
    script = script || new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'https://cdn.paddle.com/paddle/v2/paddle.js';
      s.onload = () => (root.Paddle ? resolve(root.Paddle) : reject(new Error('paddle')));
      s.onerror = () => { script = null; reject(new Error('paddle')); };
      document.head.appendChild(s);
    });
    return script;
  }
  // opens Paddle's overlay checkout; opts.onPaid(txn) runs once the payment has gone through
  async function checkout(opts) {
    const P = await loadPaddle();
    onPaid = opts.onPaid;
    if (!ready) {
      if (PADDLE.token.startsWith('test_')) P.Environment.set('sandbox');
      P.Initialize({ token: PADDLE.token, eventCallback: ev => {
        if (ev && ev.name === 'checkout.completed' && ev.data && ev.data.transaction_id && onPaid) onPaid(ev.data.transaction_id);
      } });
      ready = true;
    }
    const settings = { displayMode: 'overlay', theme: opts.theme === 'dark' ? 'dark' : 'light' };
    if (LOCALES.includes(opts.locale)) settings.locale = opts.locale;
    P.Checkout.open({ items: [{ priceId: PADDLE.priceId, quantity: 1 }], settings });
  }
  function close() { try { if (ready) root.Paddle.Checkout.close(); } catch (e) { /* already closed */ } }

  function price(lang) {
    try { return new Intl.NumberFormat(lang, { style: 'currency', currency: 'USD' }).format(PRICE_USD); } catch (e) { return '$' + PRICE_USD; }
  }

  root.Pay = { enabled, canCheckout, verify, unlock, checkout, close, price, SITE };
})(typeof window !== 'undefined' ? window : globalThis);
