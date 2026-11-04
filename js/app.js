(function () {
  'use strict';
  const D = window.PSY, E = window.Engine, I = window.I18n, Pay = window.Pay || { enabled: false, verify: async () => null }; // no pay.js (a page cached before it existed): everything stays free
  const S = D.scales;
  const VER = ((document.currentScript && /[?&]v=([^&]+)/.exec(document.currentScript.src)) || [])[1] || '';

  // ───────── utils ─────────
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => Array.from(el.querySelectorAll(s));
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
  const r0 = v => Math.round(v);
  // texts: t → plain text (escape before use), te → escaped text, th → escaped template with ready HTML values
  const t = (k, v) => I.t(k, v);
  const te = (k, v) => esc(I.t(k, v));
  const th = (k, html) => esc(I.t(k)).replace(/\{(\w+)\}/g, (m, x) => (html[x] != null ? html[x] : m));
  const tp = (k, n, v) => I.tp(k, n, v);
  const quote = x => I.fill(D.eng.quote, { x });
  const qWord = n => tp('q_count', n);
  const minutes = n => t('about_min', { n: Math.max(1, Math.round(n * 7 / 60)) }); // ~7 s per item
  const COLORS = ['#7c3aed', '#e11d48', '#059669', '#d97706', '#2563eb', '#0891b2', '#db2777', '#65a30d'];
  const ICON = {
    home: '<path d="M3 11l9-8 9 8"/><path d="M5 10v10h14V10"/>',
    users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><circle cx="17" cy="9" r="2.8"/><path d="M16 14.2a5 5 0 0 1 5.5 5.8"/>',
    book: '<path d="M4 4h10a4 4 0 0 1 4 4v12H8a4 4 0 0 1-4-4z"/><path d="M4 16a4 4 0 0 1 4-4h10"/>',
    gear: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    chev: '<path d="M9 6l6 6-6 6"/>',
    share: '<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="M8.6 13.5l6.8 4M15.4 6.5l-6.8 4"/>',
    link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
    heart: '<path d="M12 21C5 15 3 12 3 8.5A4.5 4.5 0 0 1 12 6a4.5 4.5 0 0 1 9 2.5C21 12 19 15 12 21z"/>',
    check: '<path d="M5 12l5 5 9-10"/>',
    warn: '<path d="M12 3l9 16H3z"/><path d="M12 10v4M12 17v.5"/>',
    bulb: '<path d="M9 18h6M10 21h4"/><path d="M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2V17h5v-1.1c0-.8.4-1.5 1-2A6 6 0 0 0 12 3z"/>',
    back: '<path d="M15 18l-6-6 6-6"/>',
    game: '<rect x="3.5" y="3.5" width="17" height="17" rx="4"/><circle cx="8.5" cy="8.5" r="1.3"/><circle cx="15.5" cy="15.5" r="1.3"/><circle cx="15.5" cy="8.5" r="1.3"/><circle cx="8.5" cy="15.5" r="1.3"/><circle cx="12" cy="12" r="1.3"/>',
    trophy: '<path d="M8 4h8v5a4 4 0 0 1-8 0z"/><path d="M8 6H5a3 3 0 0 0 3 4M16 6h3a3 3 0 0 1-3 4M12 13v4M8 20h8M9.5 17h5"/>',
    globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>',
    lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>'
  };
  const icon = (n, cls = '') => `<svg class="${cls}" viewBox="0 0 24 24">${ICON[n] || ''}</svg>`;
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

  // ───────── storage ─────────
  const Store = {
    key: 'psy-v1',
    d: {},
    load() {
      let saved = {};
      try { saved = JSON.parse(localStorage.getItem(this.key) || '{}') || {}; } catch (e) { saved = {}; }
      this.d = Object.assign({ theme: 'auto', fs: 16, lang: '', ctx: 'love', people: [], sel: [], mode: 'compat', games: [], gset: { mode: 'local', n: 20, cats: [] }, gfilter: 'all' }, saved);
      this.d.people.forEach(p => {
        if (!p.ans || p.ans.length !== E.N) p.ans = ((p.ans || '') + E.blank()).slice(0, E.N);
        // k = answer scale: profiles from before the 7-point scale keep k = 5; an unfinished old test continues on 7 points
        if (p.k !== 7) p.k = 5;
        if (p.k === 5 && p.todo.length) { p.ans = E.to7(p.ans); p.k = 7; }
      });
    },
    save() { try { localStorage.setItem(this.key, JSON.stringify(this.d)); } catch (e) { /* private mode or quota */ } }
  };
  Store.load();

  const people = () => Store.d.people;
  const byId = id => people().find(p => p.id === id);
  const done = () => people().filter(p => p.mods.length);
  const color = p => COLORS[p.color % COLORS.length];
  const ava = (p, cls = '') => `<span class="ava ${cls}" style="background:${color(p)}">${esc((p.name.trim()[0] || '?').toUpperCase())}</span>`;
  const modName = id => D.modules.find(x => x.id === id).name;

  // profile cache keyed by answers + modules
  const cache = new Map();
  function prof(p) {
    const key = p.mods.join() + '|' + p.k + '|' + p.ans;
    let c = cache.get(p.id);
    if (!c || c.key !== key) { c = { key, P: E.profile(p.ans, p.mods, p.k) }; cache.set(p.id, c); }
    return c.P;
  }
  const ent = p => ({ name: p.name, P: prof(p) });

  function addPerson(name, mods, ans, imported, k = 7) {
    const used = people().map(p => p.color);
    let c = 0;
    while (used.includes(c) && c < COLORS.length) c++;
    const p = { id: uid(), name: name.trim() || t('no_name'), color: c % COLORS.length, created: Date.now(),
      mods: imported ? mods : [], todo: imported ? [] : mods, ans: ans || E.blank(), k, pos: 0, done: imported ? Date.now() : 0, imported: !!imported };
    people().push(p); Store.save();
    return p;
  }

  // ───────── shell ─────────
  const NAV = [['#/', 'nav_home', 'home'], ['#/compare', 'nav_compare', 'users'], ['#/game', 'nav_game', 'game'], ['#/theory', 'nav_theory', 'book'], ['#/settings', 'nav_settings', 'gear']];
  // pricing and policy pages (English documents next to index.html)
  const LEGAL = [['pricing.html', 'legal_pricing'], ['terms.html', 'legal_terms'], ['refund.html', 'legal_refund'], ['privacy.html', 'legal_privacy']];
  const legalLinks = (cls = '') => `<p class="legal-links ${cls}">${LEGAL.map(([h, l]) => `<a href="${h}">${te(l)}</a>`).join(' · ')}</p>`;
  function renderNav(root) {
    const map = { '': '#/', p: '#/', take: '#/', next: '#/', new: '#/', import: '#/', compare: '#/compare', pair: '#/compare', group: '#/compare', game: '#/game', g: '#/game', theory: '#/theory', settings: '#/settings', buy: '#/settings' };
    const cur = map[root] || '#/';
    $('#sidebar').innerHTML = `<div class="side-brand"><img src="icons/icon.svg" alt="">${te('app')}</div>` +
      NAV.map(([h, l, ic]) => `<a class="side-link${cur === h ? ' active' : ''}" href="${h}">${icon(ic)}${te(l)}</a>`).join('') +
      `<div class="side-foot">${te('side_foot')}${legalLinks()}</div>`;
    $('#tabbar').innerHTML = NAV.map(([h, l, ic]) => `<a class="tab${cur === h ? ' active' : ''}" href="${h}">${icon(ic)}<span>${te(l)}</span></a>`).join('');
    $('#langBtn').textContent = I.lang().toUpperCase();
  }
  function setTitle(s, back) {
    $('#title').textContent = s;
    document.title = s === t('app') ? s : `${s} — ${t('app')}`;
    const b = $('#backBtn');
    b.hidden = !back;
    b.onclick = () => { if (typeof back === 'string') location.hash = back; else history.back(); };
  }
  const setExtra = h => { $('#topExtra').innerHTML = h || ''; };
  const view = () => $('#view');
  const go = h => { location.hash = h; };
  function applyPrefs() {
    document.documentElement.dataset.theme = Store.d.theme;
    document.documentElement.style.setProperty('--fs', (Store.d.fs || 16) + 'px');
  }
  function openModal(html) { $('#modalBody').innerHTML = html; $('#modal').hidden = false; $('#modalBody').scrollTop = 0; }
  function closeModal() { $('#modal').hidden = true; $('#modalBody').innerHTML = ''; }
  let toastT = 0;
  function toast(msg) {
    const el = $('#toast');
    el.textContent = msg; el.hidden = false;
    clearTimeout(toastT); toastT = setTimeout(() => { el.hidden = true; }, Math.max(2200, msg.length * 55)); // long messages stay longer
  }
  async function copy(text) {
    try { await navigator.clipboard.writeText(text); toast(t('copied')); return; } catch (e) { /* fall back below */ }
    const ta = document.createElement('textarea');
    ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select();
    try { document.execCommand('copy'); toast(t('copied')); } catch (e) { toast(t('copy_fail')); }
    ta.remove();
  }
  const seg = (name, items, cur) => `<div class="seg" data-seg="${name}">${items.map(([v, l]) => `<button data-v="${v}" class="${String(cur) === String(v) ? 'on' : ''}">${esc(l)}</button>`).join('')}</div>`;
  function langModal() {
    openModal(`<h2>${te('language')}</h2><div class="list">${I.LANGS.map(([c, n]) =>
      `<button class="list-item lang-item${c === I.lang() ? ' on' : ''}" data-lang="${c}"><span class="li-main"><span class="li-title">${esc(n)}</span></span>${c === I.lang() ? icon('check', 'chev') : ''}</button>`).join('')}</div>`);
    $('#modalBody .list').onclick = e => {
      const b = e.target.closest('[data-lang]'); if (!b) return;
      Store.d.lang = b.dataset.lang; Store.save();
      if (b.dataset.lang !== I.lang()) location.reload(); else closeModal();
    };
  }

  // ───────── full version ─────────
  // Everything is free until Paddle is set up in pay.js; then an unlock code from the purchase-check server
  // (stored as Store.d.lic) opens the full pair and group reports and the long game rounds on this device.
  let full = !Pay.enabled;
  async function loadLicense() {
    const l = Store.d.lic, p = l && await Pay.verify(l.code);
    full = !Pay.enabled || !!(p && p.t === l.txn);
  }
  function setLicense(r) { Store.d.lic = { code: r.code, txn: r.txn, checked: Date.now() }; Store.save(); full = true; }
  const failText = err => t(err === 'not_found' ? 'full_not_found' : err === 'refunded' ? 'full_refunded' : 'full_error');
  // about once a week while online: a refunded purchase switches the full version off
  // (only an explicit "refunded" does, so a server misconfiguration can't lock out every buyer at once)
  async function recheckLicense() {
    const l = Store.d.lic;
    if (!Pay.enabled || !l || !navigator.onLine || Date.now() - (l.checked || 0) < 7 * 864e5) return;
    const r = await Pay.unlock({ txn: l.txn });
    if (r.code) setLicense(r);
    else if (r.error === 'refunded') { delete Store.d.lic; Store.save(); full = false; route(); toast(failText(r.error)); }
  }
  const sleep = ms => new Promise(res => setTimeout(res, ms));
  // right after payment Paddle may need a few seconds before the transaction shows up as paid
  async function afterPayment(txn) {
    toast(t('full_checking'));
    let r;
    for (let i = 0; i < 4; i++) {
      if (i) await sleep(2500);
      r = await Pay.unlock({ txn });
      if (r.code || r.error !== 'not_found') break;
    }
    if (!r.code) { toast(t('full_paid_wait')); return; }
    setLicense(r); Pay.close(); route(); toast(t('full_done'));
  }
  function buyModal() {
    if (!Pay.enabled) return;
    const pr = Pay.price(I.lang());
    openModal(`<h2>${te('full_title')}</h2><p class="price-big">${esc(pr)}</p><p class="small muted">${te('full_once')}</p>
      <ul class="ins plus">${['full_f1', 'full_f2', 'full_f5', 'full_f3', 'full_f4'].map(k => `<li>${icon('check')}<span>${te(k, { n: window.GAME.q.length })}</span></li>`).join('')}</ul>
      ${Pay.canCheckout() ? `<button class="btn block" id="payBtn">${te('full_buy', { price: pr })}</button>`
        : `<p class="small">${te('full_on_site')}</p><a class="btn block" href="${Pay.SITE}#/buy" target="_blank" rel="noopener">${esc(Pay.SITE.replace('https://', ''))}</a>`}
      <button class="btn secondary block" id="restBtn" style="margin-top:8px">${te('full_restore')}</button>
      <p class="note">${te('full_paddle')}</p>${legalLinks('note')}`);
    if ($('#payBtn')) $('#payBtn').onclick = () => {
      const dark = Store.d.theme === 'dark' || (Store.d.theme === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches);
      closeModal();
      Pay.checkout({ locale: I.lang(), theme: dark ? 'dark' : 'light', onPaid: afterPayment }).catch(() => toast(t('full_error')));
    };
    $('#restBtn').onclick = restoreModal;
  }
  function restoreModal() {
    openModal(`<h2>${te('full_restore')}</h2><p class="small muted">${te('full_restore_hint')}</p>
      <input class="input" id="restIn" type="text" inputmode="email" autocomplete="email" spellcheck="false" placeholder="${te('full_restore_ph')}">
      <p class="small" id="restMsg" role="status"></p>
      <button class="btn block" id="restGo">${te('full_restore')}</button>`);
    const inp = $('#restIn'), msg = $('#restMsg'), btn = $('#restGo');
    inp.focus();
    const send = async () => {
      const v = inp.value.trim();
      const q = /^txn_/i.test(v) ? { txn: v.toLowerCase() } : { email: v };
      if (q.email != null && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) { inp.focus(); msg.textContent = t('full_restore_hint'); return; }
      btn.disabled = true; msg.textContent = t('full_checking');
      const r = await Pay.unlock(q);
      if (r.code) { setLicense(r); route(); toast(t('full_done')); return; }
      btn.disabled = false; msg.textContent = failText(r.error);
    };
    btn.onclick = send;
    inp.onkeydown = e => { if (e.key === 'Enter') send(); };
  }
  // shown in place of the paid sections of a report
  const lockCard = (title, text, inner) => `<${inner ? 'div' : 'section'} class="${inner ? 'lock-in' : 'card'} lock-card"><h3 class="card-h">${icon('lock')}${te(title)}</h3><p class="small">${te(text)}</p>
    <div class="row"><button class="btn" data-buy>${te('full_buy', { price: Pay.price(I.lang()) })}</button><button class="btn secondary" data-restore>${te('full_restore')}</button></div>
    <p class="note">${te('full_once')} <a href="pricing.html">${te('legal_pricing')}</a></p></${inner ? 'div' : 'section'}>`;

  document.addEventListener('click', e => {
    const c = e.target.closest('[data-copy]');
    if (c) { e.preventDefault(); copy(c.dataset.copy); return; }
    if (e.target.closest('[data-buy]')) { buyModal(); return; }
    if (e.target.closest('[data-restore]')) { restoreModal(); return; }
    const el = e.target.closest('[data-close]');
    if (el) { if (!el.hasAttribute('href')) e.preventDefault(); closeModal(); }
  });
  let keyHandler = null;
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && !$('#modal').hidden) { closeModal(); return; }
    if (!$('#modal').hidden || /INPUT|TEXTAREA|SELECT/.test(document.activeElement && document.activeElement.tagName)) return;
    if (keyHandler) keyHandler(e);
  });

  // ───────── charts (inline SVG / CSS, no libraries) ─────────
  const level = p => t(p >= 85 ? 'lvl_vhi' : p >= 65 ? 'lvl_hi' : p >= 35 ? 'lvl_mid' : p >= 15 ? 'lvl_lo' : 'lvl_vlo');
  function bar(label, v, col, sub) {
    return `<div class="srow"><div class="sl">${esc(label)}${sub ? `<small>${esc(sub)}</small>` : ''}</div>
      <div class="track"><i style="width:${clamp(v, 1, 100).toFixed(1)}%;background:${col}"></i></div><div class="sv">${r0(v)}</div></div>`;
  }
  function dots(label, pts, sub) {
    return `<div class="srow"><div class="sl">${esc(label)}${sub ? `<small>${esc(sub)}</small>` : ''}</div>
      <div class="track multi"><b class="mid"></b>${pts.map(p => `<span class="dot" style="left:${clamp(p.v, 2, 98).toFixed(1)}%;background:${p.c}" title="${esc(p.t)}: ${r0(p.v)}"></span>`).join('')}</div><div class="sv"></div></div>`;
  }
  const legend = list => `<div class="legend">${list.map(p => `<span><i style="background:${color(p)}"></i>${esc(p.name)}</span>`).join('')}</div>`;

  // 2D map: x, y in 0..100 (y grows upwards), lines at lx / ly, q = quadrant labels [tl, tr, bl, br]
  function map2d(o) {
    const W = 320, P = 30, Z = W - 2 * P;
    const X = v => P + clamp(v, 3, 97) / 100 * Z, Y = v => P + (1 - clamp(v, 3, 97) / 100) * Z;
    let h = `<svg class="map" viewBox="0 0 ${W} ${W}" role="img" aria-label="${esc(o.aria || '')}">
      <rect x="${P}" y="${P}" width="${Z}" height="${Z}" rx="14" class="map-bg"/>`;
    if (o.circle) h += `<circle cx="${W / 2}" cy="${W / 2}" r="${Z / 2 - 4}" class="map-ax" fill="none"/>`;
    h += `<line x1="${X(o.lx)}" y1="${P}" x2="${X(o.lx)}" y2="${P + Z}" class="map-ax"/><line x1="${P}" y1="${Y(o.ly)}" x2="${P + Z}" y2="${Y(o.ly)}" class="map-ax"/>`;
    const q = o.q;
    h += `<text x="${P + 10}" y="${P + 20}" class="map-q">${esc(q[0])}</text><text x="${P + Z - 10}" y="${P + 20}" class="map-q" text-anchor="end">${esc(q[1])}</text>
      <text x="${P + 10}" y="${P + Z - 10}" class="map-q">${esc(q[2])}</text><text x="${P + Z - 10}" y="${P + Z - 10}" class="map-q" text-anchor="end">${esc(q[3])}</text>`;
    h += `<text x="${W / 2}" y="${P - 10}" class="map-a" text-anchor="middle">${esc(o.ya[1])}</text>
      <text x="${W / 2}" y="${W - 10}" class="map-a" text-anchor="middle">${esc(o.ya[0])}</text>
      <text transform="translate(${P - 10} ${W / 2}) rotate(-90)" class="map-a" text-anchor="middle">${esc(o.xa[0])}</text>
      <text transform="translate(${W - P + 10} ${W / 2}) rotate(90)" class="map-a" text-anchor="middle">${esc(o.xa[1])}</text>`;
    o.pts.forEach((p, i) => {
      const cx = X(p.x), cy = Y(p.y), right = p.x > 70;
      h += `<circle cx="${cx}" cy="${cy}" r="8" fill="${p.c}" class="map-pt"/>`;
      if (p.t) h += `<text x="${right ? cx - 12 : cx + 12}" y="${cy + 4 + (i % 2 ? 9 : 0)}" class="map-l" text-anchor="${right ? 'end' : 'start'}">${esc(p.t)}</text>`;
    });
    return h + '</svg>';
  }
  const tempPt = P => ({ x: 50 + P.dom.E.z * 22, y: 50 + P.dom.N.z * 22 });
  const tempMap = pts => { const T = D.temperaments; return map2d({ pts, lx: 50, ly: 50, circle: true, q: [T.mel.name, T.chol.name, T.phl.name, T.sang.name],
    xa: [t('ax_intro'), t('ax_extra')], ya: [t('ax_stable'), t('ax_sensitive')], aria: t('aria_temp') }); };
  const attMap = pts => { const A = D.attach; return map2d({ pts, lx: 45, ly: 55, q: [A.anx.name, A.fea.name, A.sec.name, A.avo.name],
    xa: [t('ax_close'), t('ax_distance')], ya: [t('ax_calm'), t('ax_anxious')], aria: t('aria_att') }); };

  const VAL_ORDER = ['sd', 'st', 'he', 'ac', 'po', 'se', 'co', 'tr', 'be', 'un'];
  function radar(series) {
    const C = 180, R = 100, n = VAL_ORDER.length;
    const pt = (i, f) => { const a = -Math.PI / 2 + i * 2 * Math.PI / n; return [C + Math.cos(a) * R * f, C + Math.sin(a) * R * f]; };
    let h = `<svg class="radar" viewBox="-96 4 552 352" role="img" aria-label="${te('aria_values')}">`;
    [0.25, 0.5, 0.75, 1].forEach(f => { h += `<polygon class="rd-ring" points="${VAL_ORDER.map((_, i) => pt(i, f).join(',')).join(' ')}"/>`; });
    VAL_ORDER.forEach((k, i) => {
      const [x, y] = pt(i, 1), [lx, ly] = pt(i, 1.12);
      const anc = Math.abs(lx - C) < 8 ? 'middle' : lx > C ? 'start' : 'end';
      h += `<line class="rd-ax" x1="${C}" y1="${C}" x2="${x}" y2="${y}"/><text class="rd-l" x="${lx}" y="${ly + 4}" text-anchor="${anc}">${esc(S[k].name)}</text>`;
    });
    series.forEach(s => {
      const pts = VAL_ORDER.map((k, i) => pt(i, clamp(50 + (s.c[k] || 0) * 1.7, 6, 100) / 100).join(','));
      h += `<polygon class="rd-s" points="${pts.join(' ')}" style="stroke:${s.col};fill:${s.col}"/>`;
    });
    return h + '</svg>';
  }
  function ring(v, label, col) {
    const c = 2 * Math.PI * 42;
    return `<div class="ring"><svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="42" class="ring-bg"/>
      <circle cx="50" cy="50" r="42" class="ring-fg" transform="rotate(-90 50 50)" style="stroke:${col};stroke-dasharray:${(c * v / 100).toFixed(1)} ${c.toFixed(1)}${v > 0 ? '' : ';stroke-opacity:0'}"/>
      <text x="50" y="57" text-anchor="middle" class="ring-v">${v}%</text></svg><div class="ring-l">${esc(label)}</div></div>`;
  }
  // red → amber → green; cells use a soft tint, bars a saturated tone
  const heat = v => `hsl(${r0(clamp(v, 0, 100) * 1.25)} 62% var(--heat-l))`;
  const heatBar = v => `hsl(${r0(clamp(v, 0, 100) * 1.25)} 65% var(--heat-bar))`;

  // ───────── home ─────────
  function personRow(p) {
    let sub;
    if (p.todo.length) {
      const seq = E.sequence(p.todo), all = seq.filter(x => x.i != null).length;
      const dn = seq.slice(0, p.pos).filter(x => x.i != null).length;
      sub = `<span class="badge warn">${te('in_progress', { a: dn, b: all })}</span>`;
    } else if (p.mods.length) {
      const P = prof(p);
      sub = `<b>${esc(P.type.code)}</b> · ${esc(D.types[P.type.code].name)} · ${esc(D.temperaments[P.temp.id].name)}${p.imported ? ` · <span class="muted">${te('by_code')}</span>` : ''}`;
    } else sub = `<span class="muted">${te('not_started')}</span>`;
    const href = p.todo.length ? `#/take/${p.id}` : `#/p/${p.id}`;
    return `<a class="list-item" href="${href}">${ava(p)}<span class="li-main"><span class="li-title">${esc(p.name)}</span><span class="li-sub">${sub}</span></span>${icon('chev', 'chev')}</a>`;
  }
  function vHome() {
    setTitle(t('app'));
    const ps = people(), dn = done();
    view().innerHTML = `
      <div class="hero"><h2>${te('tagline')}</h2>
        <p>${te('home_sub')}</p>
        <div class="hero-actions"><a class="btn light" href="#/new">${icon('plus')}${te('start_test')}</a>
        ${dn.length >= 2 ? `<a class="btn ghost-light" href="${compareHref(dn.map(p => p.id))}">${icon('heart')}${te('compare_all')}</a>` : ''}
        <a class="btn ghost-light" href="#/game">${icon('game')}${te('game_title')}</a></div></div>
      ${ps.length ? `<h3>${te('participants')}</h3><div class="list">${ps.map(personRow).join('')}</div>` : ''}
      <div class="row" style="margin:14px 0"><button class="btn secondary" id="importBtn">${icon('link')}${te('add_by_code')}</button></div>
      ${ps.length < 2 ? `<div class="card"><h3 style="margin-top:0">${te('how_title')}</h3>
        <ol class="steps"><li><b>${te('how1_b')}</b> ${te('how1')}</li><li><b>${te('how2_b')}</b> ${te('how2')}</li><li><b>${te('how3_b')}</b> ${te('how3')}</li></ol>
        <p class="small muted">${te('how_note')}</p></div>` : ''}
      ${legalLinks('note center')}`;
    $('#importBtn').onclick = importModal;
  }
  const compareHref = ids => ids.length === 2 ? `#/pair/${ids[0]}/${ids[1]}` : `#/group/${ids.join(',')}`;

  // ───────── who takes the test ─────────
  // One or several names at once; everyone takes the full test in turn on this device,
  // and after the last one the comparison opens. Store.d.queue = still to go, Store.d.batch = the whole round.
  const queue = () => (Store.d.queue || []).filter(id => { const p = byId(id); return p && p.todo.length; });
  function vNew() {
    setTitle(t('who_takes'), '#/');
    const N = E.N;
    view().innerHTML = `<div class="card"><h2 class="card-h" style="margin-top:0">${te('who_takes')}</h2><p class="small muted">${te('who_hint')}</p>
        <div id="names" class="names"></div>
        <button class="btn ghost" id="addRow">${icon('plus')}${te('add_person_row')}</button></div>
      <div class="card test-info">${icon('check')}<div><b>${te('test_info', { q: qWord(N), t: minutes(N) })}</b><br><span class="small muted">${te('honest_note')}</span></div></div>
      <button class="btn block" id="startBtn">${te('start_test')}</button>`;
    const box = $('#names');
    const used = people().map(p => p.color);
    const freeColor = k => { const free = COLORS.map((_, i) => i).filter(i => !used.includes(i)); return free.length ? free[k % free.length] : (people().length + k) % COLORS.length; };
    function row(val = '') {
      const k = box.children.length, d = document.createElement('div');
      d.className = 'name-row';
      d.innerHTML = `<span class="ava" style="background:${COLORS[freeColor(k)]}">${k + 1}</span>
        <input class="input" maxlength="40" placeholder="${te(k ? 'name_ph2' : 'name_ph')}" autocomplete="off" value="${esc(val)}">
        <button class="btn ghost icon-btn" data-rm aria-label="${te('remove')}">×</button>`;
      box.appendChild(d);
      renumber();
      return $('input', d);
    }
    function renumber() {
      $$('.name-row', box).forEach((r, i) => { $('.ava', r).textContent = i + 1; $('.ava', r).style.background = COLORS[freeColor(i)]; $('[data-rm]', r).hidden = box.children.length < 2; });
    }
    row().focus(); row();
    $('#addRow').onclick = () => row().focus();
    box.onclick = e => { const b = e.target.closest('[data-rm]'); if (b) { b.parentNode.remove(); renumber(); } };
    box.onkeydown = e => {
      if (e.key !== 'Enter') return;
      e.preventDefault();
      const rows = $$('input', box), i = rows.indexOf(e.target);
      if (i < rows.length - 1) rows[i + 1].focus();
      else if (e.target.value.trim()) row().focus();
      else start();
    };
    function start() {
      const names = $$('input', box).map(i => i.value.trim()).filter(Boolean);
      if (!names.length) { $('input', box).focus(); toast(t('enter_name')); return; }
      if (new Set(names.map(n => n.toLowerCase())).size < names.length) { toast(t('g_names_differ')); return; }
      const ids = names.map((nm, k) => { const p = addPerson(nm, E.MODS.slice(), null, false); p.color = freeColor(k); return p.id; });
      Store.d.queue = ids.slice(); Store.d.batch = ids.slice(); Store.save();
      go('#/take/' + ids[0]);
    }
    $('#startBtn').onclick = start;
  }

  // handoff between two people of the same round
  function vNext(id, prevId) {
    const p = byId(id), prev = byId(prevId);
    if (!p || !p.todo.length) return go('#/');
    setTitle(p.name, '#/');
    const left = queue().length;
    view().innerHTML = `<div class="card intro-card">
        ${prev ? `<p class="next-saved">${icon('check')}${te('next_saved', { name: prev.name })}</p>` : ''}
        <div class="duo">${ava(p, 'big')}</div>
        <h2>${te('next_t', { name: p.name })}</h2><p>${te('next_hint', { name: p.name })}</p>
        ${left > 1 ? `<p class="small muted">${te('next_left', { n: left })}</p>` : ''}
        <button class="btn block" id="goBtn">${te('next_go', { name: p.name })}</button>
        ${prev ? `<a class="btn ghost block" href="#/p/${prev.id}">${te('next_peek', { name: prev.name })}</a>` : ''}</div>`;
    $('#goBtn').onclick = () => go('#/take/' + p.id);
    keyHandler = e => { if (e.key === 'Enter') { e.preventDefault(); go('#/take/' + p.id); } };
  }

  // ───────── questionnaire runner ─────────
  function vTake(id) {
    const p = byId(id);
    if (!p) return go('#/');
    if (!p.todo.length) return go('#/p/' + id);
    const seq = E.sequence(p.todo);
    const total = seq.filter(x => x.i != null).length;
    const modList = seq.filter(x => x.intro).map(x => x.intro);
    p.pos = clamp(p.pos || 0, 0, seq.length);
    setTitle(p.name, '#/');
    let lock = false;

    function finish() {
      p.mods = E.MODS.filter(m => p.mods.includes(m) || p.todo.includes(m));
      p.todo = []; p.pos = 0; p.done = Date.now();
      keyHandler = null;
      // someone outside the current round finishing an old test leaves the round alone
      if (!(Store.d.queue || []).includes(p.id)) { Store.save(); return go(`#/p/${p.id}/new`); }
      const next = queue()[0];
      if (next) { Store.save(); return go(`#/next/${next}/${p.id}`); }
      const batch = (Store.d.batch || []).filter(x => { const q = byId(x); return q && q.mods.length; });
      delete Store.d.queue; delete Store.d.batch;
      Store.save();
      if (batch.length >= 2) { go(compareHref(batch)); toast(t('all_done')); return; }
      go(`#/p/${p.id}/new`);
    }
    function move(d) { p.pos = clamp(p.pos + d, 0, seq.length); Store.save(); render(); }
    function render() {
      if (p.pos >= seq.length) return finish();
      const st = seq[p.pos];
      let dn = 0;
      for (let k = 0; k < p.pos; k++) if (seq[k].i != null) dn++;
      setExtra(`<span class="counter">${dn}/${total}</span>`);
      const prog = `<div class="progress"><i style="width:${dn / total * 100}%"></i></div>`;
      if (st.intro) {
        const m = D.modules.find(x => x.id === st.intro), cnt = E.modCount[m.id];
        view().innerHTML = `${prog}<div class="card intro-card"><div class="kicker">${te('block_of', { a: modList.indexOf(m.id) + 1, b: modList.length })}</div>
          <h2>${esc(m.name)}</h2><p class="muted">${esc(m.sub)}</p><p>${esc(m.intro)}</p>
          <p class="small muted">${esc(qWord(cnt))} · ${esc(minutes(cnt))}</p>
          <button class="btn block" id="goBtn">${te(dn ? 'continue' : 'start')}</button>
          ${p.pos ? `<button class="btn ghost block" id="prevBtn">${icon('back')}${te('back')}</button>` : ''}</div>
          <p class="small muted center">${th('keys_hint', { k1: '<kbd>1</kbd>', k5: `<kbd>${D.answers.length}</kbd>`, left: '<kbd>←</kbd>' })}</p>`;
        $('#goBtn').onclick = () => move(1);
        if ($('#prevBtn')) $('#prevBtn').onclick = () => move(-1);
        return;
      }
      const it = D.items[st.i], m = D.modules.find(x => x.id === st.mod), cur = p.ans.charCodeAt(st.i) - 48;
      view().innerHTML = `${prog}<div class="q-wrap"><div class="q-meta"><span>${esc(m.name)}</span><span>${te('of', { a: dn + 1, b: total })}</span></div>
        <div class="card q-card"><div class="q-prompt">${esc(m.prompt)}</div><div class="q-text">${esc(it[2])}</div></div>
        <div class="ans${D.answers.length === 7 ? ' scale7' : ''}">${D.answers.map((a, i) => `<button data-v="${i + 1}" class="${cur === i + 1 ? 'on' : ''}"><span class="ak">${i + 1}</span>${esc(a)}</button>`).join('')}</div>
        <div class="q-nav"><button class="btn ghost" id="prevBtn">${icon('back')}${te('back')}</button><span class="spacer"></span>
          <button class="btn ghost" id="skipBtn">${te(cur >= 1 ? 'next' : 'skip')}</button></div></div>`;
      $('.ans').onclick = e => { const b = e.target.closest('button'); if (b) answer(+b.dataset.v); };
      $('#prevBtn').onclick = () => move(-1);
      $('#skipBtn').onclick = () => move(1);
    }
    function answer(v) {
      const st = seq[p.pos];
      if (lock || !st || st.i == null) return;
      lock = true;
      p.ans = p.ans.slice(0, st.i) + v + p.ans.slice(st.i + 1);
      $$('.ans button').forEach(b => b.classList.toggle('on', +b.dataset.v === v));
      setTimeout(() => { lock = false; if (location.hash === '#/take/' + id) move(1); }, 170);
    }
    keyHandler = e => {
      const st = seq[p.pos];
      if (st && st.i != null && e.key >= '1' && e.key <= String(D.answers.length)) { e.preventDefault(); answer(+e.key); }
      else if (e.key === 'ArrowLeft' || e.key === 'Backspace') { e.preventDefault(); move(-1); }
      else if (e.key === 'ArrowRight' || e.key === 'Enter') { e.preventDefault(); move(1); }
    };
    render();
  }

  // ───────── personal report ─────────
  const DOM_ORDER = ['O', 'C', 'E', 'A', 'N'];
  const domText = (k, pct) => { const d = D.domains[k]; return pct >= 65 ? d.hi : pct <= 35 ? d.lo : d.mid; };
  // collapsible report section: the title and the result stay visible, the details open on tap
  const fold = (title, head, body, open) => `<details class="card fold"${open ? ' open' : ''}><summary><span class="fold-t"><span class="card-h">${esc(title)}</span>${head ? `<span class="fold-sub">${head}</span>` : ''}</span>${icon('chev', 'fold-ic')}</summary><div class="fold-b">${body}</div></details>`;
  const firstSentence = s => { const m = String(s).match(/^.*?[.!?…。](?=\s|$)/); return m ? m[0] : String(s); };
  // "Main points": the few most telling results in plain words, before the detailed sections
  function secMain(P) {
    const li = (label, text) => `<li><b>${esc(label)}</b> ${esc(text)}</li>`, rows = [];
    const strong = DOM_ORDER.map(k => ({ k, v: P.dom[k].pct })).filter(x => Math.abs(x.v - 50) >= 15)
      .sort((x, y) => Math.abs(y.v - 50) - Math.abs(x.v - 50)).slice(0, 3);
    strong.forEach(x => rows.push(li(t('sum_lvl', { name: D.domains[x.k].name, level: level(x.v) }), domText(x.k, x.v))));
    if (!strong.length) rows.push(`<li>${te('sum_balanced')}</li>`);
    const T = D.temperaments[P.temp.id];
    rows.push(li(t('sum_temp', { x: T.name }), firstSentence(T.d)));
    if (P.att) { const A = D.attach[P.att.id]; rows.push(li(t('sum_att', { x: A.name }), firstSentence(A.d))); }
    if (P.val) rows.push(li(t('sum_val'), P.val.top.map(k => S[k].name).join(D.eng.sep) + '.'));
    if (P.conf) { const c = S[P.conf.top[0]]; rows.push(li(t('sum_conf'), `${c.name} — ${c.desc}.`)); }
    if (P.care) rows.push(li(t('care_please'), S[P.care.rank[0]].how + '.'));
    const R = D.roles[P.roles[0].id];
    rows.push(li(t('sum_role'), `${R.name} — ${R.d}.`));
    return `<section class="card main-card"><h3 class="card-h">${icon('bulb')}${te('sum_title')}</h3><ul class="sum">${rows.join('')}</ul>
      <p class="note">${te('sum_read')}</p></section>`;
  }
  const more = href => `<a href="${href}">${te('more')}</a>`;

  function secSummary(p, P) {
    const T = D.types[P.type.code], chips = [];
    chips.push(`<span class="chip">${esc(D.temperaments[P.temp.id].name)}</span>`);
    if (P.att) chips.push(`<span class="chip">${te('chip_att', { x: D.attach[P.att.id].name })}</span>`);
    if (P.mind) chips.push(`<span class="chip">${esc(D.thinking[P.mind.think].name)}</span>`);
    if (P.mind && P.mind.chrono) chips.push(`<span class="chip">${esc(D.chrono[P.mind.chrono].name)}</span>`);
    chips.push(`<span class="chip">${te('chip_role', { x: D.roles[P.roles[0].id].name })}</span>`);
    return `<div class="hero person" style="--pc:${color(p)}"><div class="row">${ava(p, 'big')}<div style="flex:1;min-width:0"><div class="kicker">${esc(p.name)}</div>
      <h2><span class="code">${esc(P.type.code)}</span> ${esc(T.name)}</h2><p>${esc(T.tag)}</p></div></div><div class="chips">${chips.join('')}</div></div>`;
  }
  function secBig5(P) {
    const col = 'var(--primary)';
    const blocks = DOM_ORDER.map(k => {
      const d = D.domains[k], v = P.dom[k].pct;
      const asp = d.asp.map(a => bar(S[a].name, P.pct[a], 'var(--primary-2)')).join('');
      const ext = d.asp.filter(a => P.pct[a] >= 62 || P.pct[a] <= 38).map(a => `<li>${esc(P.pct[a] >= 62 ? S[a].hi : S[a].lo)}</li>`).join('');
      return `<div class="dom"><div class="dom-h"><b>${esc(d.name)}</b><span class="muted small">${esc(d.alt)}</span><span class="lvl">${esc(level(v))}</span></div>
        ${bar('', v, col)}<p class="small">${esc(domText(k, v))}</p><div class="asp">${asp}</div>${ext ? `<ul class="small tight">${ext}</ul>` : ''}</div>`;
    }).join('');
    const h = P.pct.hon;
    const hon = `<div class="dom"><div class="dom-h"><b>${esc(S.hon.name)}</b><span class="muted small">${te('hon_alt')}</span><span class="lvl">${esc(level(h))}</span></div>
      ${bar('', h, col)}<p class="small">${esc(h >= 50 ? S.hon.hi : S.hon.lo)}</p></div>`;
    const head = DOM_ORDER.map(k => `${esc(D.domains[k].name)} <b>${r0(P.dom[k].pct)}</b>`).join(' · ');
    return fold(t('big5_title'), head, blocks + hon + `<p class="note">${te('scale_note')}</p>`);
  }
  function secType(P) {
    const T = D.types[P.type.code], L = P.type.letters;
    const weak = L.map((x, i) => ({ x, i })).filter(o => o.x.p < 58);
    const alts = weak.map(o => { const c = P.type.code.split(''); c[o.i] = o.x.o; return c.join(''); });
    return fold(t('type_title'), `<b>${esc(P.type.code)}</b> ${esc(T.name)}`, `<div class="tcode">${L.map(x => `<div class="tl"><b>${x.l}</b><small>${r0(x.p)}%</small></div>`).join('')}</div>
      <h3 class="sub-h">${esc(T.name)}</h3><p class="muted">${esc(T.tag)}</p><p>${esc(T.d)}</p>
      <div class="pm"><div><h4>${te('strengths')}</h4><ul>${T.plus.map(s => `<li>${esc(s)}</li>`).join('')}</ul></div>
      <div><h4>${te('growth')}</h4><ul>${T.minus.map(s => `<li>${esc(s)}</li>`).join('')}</ul></div></div>
      <div class="letters">${L.map(x => `<div class="small"><b>${x.l}</b> ${te('L_' + x.l)} — ${r0(x.p)}% <span class="muted">· ${x.o} ${te('L_' + x.o)} — ${r0(100 - x.p)}%</span></div>`).join('')}</div>
      ${alts.length ? `<p class="small">${th('weak_letters', { letters: weak.map(o => o.x.l + '/' + o.x.o).join(', '), types: alts.map(c => `<b>${c}</b> ${esc(quote(D.types[c].name))}`).join(', ') })}</p>` : ''}
      <p class="note">${te('type_note')} <a href="#/theory/jung">${te('why_types')}</a></p>`);
  }
  function secTemp(P, p) {
    const T = D.temperaments[P.temp.id], A = D.temperaments[P.temp.alt];
    return fold(t('temp_title'), esc(T.name), `<div class="split">${tempMap([Object.assign(tempPt(P), { c: color(p), t: p.name })])}<div>
      <h3 class="sub-h">${esc(T.name)} <span class="muted small">· ${esc(T.axis)}</span></h3><p>${esc(T.d)}</p><p class="small">${esc(T.stress)}</p>
      <p class="small muted">${te(P.temp.mixed ? 'temp_mixed' : 'temp_second', { x: A.name })}</p>
      </div></div><p class="note">${te('temp_note')} ${more('#/theory/temp')}</p>`);
  }
  function secAtt(P, p) {
    if (!P.att) return '';
    const A = D.attach[P.att.id];
    return fold(t('att_title'), te('att_style', { x: A.name }), `<div class="split">${attMap([{ x: P.att.avo, y: P.att.anx, c: color(p), t: p.name }])}<div>
      <h3 class="sub-h">${te('att_style', { x: A.name })}</h3><p>${esc(A.d)}</p><p class="small tip">${icon('bulb')}<span>${esc(A.tip)}</span></p>
      ${bar(S.anx.name, P.s.anx, 'var(--primary)')}${bar(S.avo.name, P.s.avo, 'var(--primary)')}</div></div>
      <p class="note">${te('att_note')} ${more('#/theory/attach')}</p>`);
  }
  function secVal(P, p) {
    if (!P.val) return '';
    const c = P.val.c, ho = P.val.ho;
    const oc = (ho.open || 0) - (ho.cons || 0), st = (ho.self || 0) - (ho.trans || 0);
    const t1 = t(oc > 10 ? 'val_oc_hi' : oc < -10 ? 'val_oc_lo' : 'val_oc_mid'), t2 = t(st > 10 ? 'val_st_hi' : st < -10 ? 'val_st_lo' : 'val_st_mid');
    return fold(t('val_title'), esc(P.val.top.map(k => S[k].name).join(D.eng.sep)), `<div class="split">${radar([{ c, col: color(p) }])}<div>
      <h4>${te('val_top')}</h4><ol class="tops">${P.val.top.map(k => `<li><b>${esc(S[k].name)}</b> — ${esc(S[k].desc)}</li>`).join('')}</ol>
      <p>${esc(t1)} ${esc(t2)}</p></div></div>
      <p class="note">${te('val_note')} ${more('#/theory/values')}</p>`);
  }
  function secMor(P) {
    if (!P.mor) return '';
    const ids = E.modScales.mor, m = P.mor;
    return fold(t('mor_title'), te(m.bind >= m.ind - 10 ? 'mor_bind_s' : 'mor_ind_s'), ids.map(k => bar(S[k].name, P.pct[k], 'var(--primary)', S[k].desc)).join('') +
      `<p>${te(m.bind >= m.ind - 10 ? 'mor_bind' : 'mor_ind')}</p><p class="note"><a href="#/theory/moral">${te('mor_link')}</a></p>`);
  }
  function secMind(P) {
    if (!P.mind) return '';
    const T = D.thinking[P.mind.think], ids = ['ana', 'intu', 'clo', 'grow', 'sens', 'morn'];
    const ext = ids.filter(k => P.pct[k] >= 65 || P.pct[k] <= 35).map(k => `<li>${esc(P.pct[k] >= 65 ? S[k].hi : S[k].lo)}</li>`).join('');
    return fold(t('mind_title'), esc(T.name) + (P.mind.chrono ? ' · ' + esc(D.chrono[P.mind.chrono].name) : ''), `<h3 class="sub-h">${esc(T.name)}</h3><p>${esc(T.d)}</p>
      ${ids.map(k => bar(S[k].name, P.pct[k], 'var(--primary)')).join('')}
      ${ext ? `<ul class="small tight">${ext}</ul>` : ''}
      ${P.mind.chrono ? `<p><b>${te('chrono_label')}</b> ${esc(D.chrono[P.mind.chrono].full)}</p>` : ''}
      <p class="note"><a href="#/theory/mind">${te('mind_link')}</a></p>`);
  }
  function secConf(P) {
    if (!P.conf) return '';
    const top = P.conf.top[0], second = P.conf.top[1], cls = { low: 'ok', mid: 'warn', high: 'bad' }[P.conf.risk];
    return fold(t('conf_title'), esc(S[top].name), `<h3 class="sub-h">${te('conf_lead', { x: S[top].name })}</h3><p>${esc(S[top].hi)}</p>
      <p class="small muted">${te('conf_second', { x: S[second].name })}</p>
      ${['col', 'cpr', 'acc', 'avd', 'cmp'].map(k => bar(S[k].name, P.pct[k], 'var(--primary)', S[k].desc)).join('')}
      <div class="risk ${cls}"><b>${te('risk_' + P.conf.risk)}</b> ${te(P.conf.risk === 'low' ? 'risk_ok_text' : 'risk_bad_text')}</div>
      <p class="note"><a href="#/theory/conflict">${te('conf_link')}</a></p>`);
  }
  function secCare(P) {
    if (!P.care) return '';
    const r = P.care.rank;
    return fold(t('care_title'), esc(S[r[0]].name), r.map(k => bar(S[k].name, P.s[k], 'var(--primary)')).join('') +
      `<p><b>${te('care_please')}</b> ${te('care_line', { a: S[r[0]].how, b: S[r[1]].how })}</p><p class="note">${te('care_note')} ${more('#/theory/care')}</p>`);
  }
  function secRoles(P) {
    const [a, b] = P.roles;
    return fold(t('roles_title'), esc(D.roles[a.id].name), `<p>${th('roles_line', { a: `<b>${esc(D.roles[a.id].name)}</b>`, ad: esc(D.roles[a.id].d), b: `<b>${esc(D.roles[b.id].name)}</b>`, bd: esc(D.roles[b.id].d) })}</p>
      ${P.roles.map(x => bar(D.roles[x.id].name, x.v, 'var(--primary)')).join('')}
      <p class="note">${te('roles_note')}</p>`);
  }
  function vReport(id, flag) {
    const p = byId(id);
    if (!p) return go('#/');
    if (!p.mods.length) return go(p.todo.length ? '#/take/' + id : '#/');
    setTitle(p.name, '#/');
    const P = prof(p);
    const missing = E.MODS.filter(m => !p.mods.includes(m));
    const others = done().filter(x => x.id !== p.id);
    const nq = (Store.d.queue || []).includes(p.id) && byId(queue()[0]); // the round is not over yet
    view().innerHTML = `
      ${nq ? `<div class="card done-card">${icon('users')}<div><b>${te('next_t', { name: nq.name })}</b>
        <div class="row" style="margin-top:8px"><a class="btn" href="#/next/${nq.id}/${p.id}">${te('next_pass')}</a></div></div></div>` : ''}
      ${flag === 'new' && !nq ? `<div class="card done-card">${icon('check')}<div><b>${te('done_title')}</b> ${te('done_saved')}${others.length ? ' ' + te('done_can_compare') : ''}
        <div class="row" style="margin-top:8px"><a class="btn" href="#/new">${te('next_person')}</a>${others.length ? `<a class="btn secondary" href="${compareHref([p.id].concat(others.map(o => o.id)))}">${te('compare')}</a>` : ''}</div></div></div>` : ''}
      ${p.todo.length ? `<div class="card done-card warn">${icon('warn')}<div>${te('unfinished')} <a href="#/take/${p.id}">${te('continue_test')}</a></div></div>` : ''}
      ${secSummary(p, P)}
      ${secMain(P)}
      <div class="row toolbar"><button class="btn secondary" id="shareBtn">${icon('share')}${te('share')}</button>
        ${others.length ? `<button class="btn secondary" id="cmpBtn">${icon('heart')}${te('compare_with')}</button>` : ''}</div>
      ${secBig5(P)}${secType(P)}${secTemp(P, p)}${secAtt(P, p)}${secVal(P, p)}${secMor(P)}${secMind(P)}${secConf(P)}${secCare(P)}${secRoles(P)}${answersFold([p])}
      <section class="card"><h3 class="card-h">${te('manage')}</h3>
        ${missing.length && !p.todo.length ? `<p>${te('missing_blocks', { list: missing.map(m => quote(modName(m))).join(D.eng.sep) })}</p>
          <p><button class="btn" id="moreBtn">${te('take_missing', { q: qWord(missing.reduce((s, m) => s + E.modCount[m], 0)) })}</button></p>` : ''}
        <div class="row"><button class="btn secondary" id="renBtn">${te('rename')}</button><button class="btn secondary" id="retakeBtn">${te('retake')}</button><button class="btn danger" id="delBtn">${te('delete')}</button></div>
        <p class="note">${te('report_note')}</p></section>`;
    $('#shareBtn').onclick = () => shareModal([p]);
    bindAnswers([p]);
    if ($('#cmpBtn')) $('#cmpBtn').onclick = () => openModal(`<h2>${te('compare_x_with', { name: p.name })}</h2><div class="list">${others.map(o =>
      `<a class="list-item" href="#/pair/${p.id}/${o.id}" data-close>${ava(o)}<span class="li-main"><span class="li-title">${esc(o.name)}</span></span>${icon('chev', 'chev')}</a>`).join('')}</div>
      ${others.length > 1 ? `<p style="margin-top:12px"><a class="btn block" data-close href="${compareHref([p.id].concat(others.map(o => o.id)))}">${te('compare_with_all')}</a></p>` : ''}`);
    if ($('#moreBtn')) $('#moreBtn').onclick = () => { if (p.k === 5) { p.ans = E.to7(p.ans); p.k = 7; } p.todo = missing; p.pos = 0; Store.save(); go('#/take/' + p.id); };
    $('#renBtn').onclick = () => { const n = prompt(t('new_name'), p.name); if (n && n.trim()) { p.name = n.trim().slice(0, 40); Store.save(); route(); } };
    $('#retakeBtn').onclick = () => {
      if (!confirm(t('retake_confirm', { name: p.name }))) return;
      p.todo = p.mods.slice(); p.mods = []; p.ans = E.blank(); p.k = 7; p.pos = 0; p.imported = false; Store.save(); go('#/take/' + p.id);
    };
    $('#delBtn').onclick = () => {
      if (!confirm(t('delete_confirm', { name: p.name }))) return;
      Store.d.people = people().filter(x => x.id !== p.id);
      Store.d.sel = Store.d.sel.filter(x => x !== p.id);
      cache.delete(p.id); Store.save(); go('#/');
    };
  }

  // ───────── answers side by side ─────────
  // answer of person p to item i on the 7-point labels (1..7, 0 = skipped); old 5-point answers map onto the same labels
  const ans7 = (p, i) => { const c = p.ans[i]; return c === '0' ? 0 : +(p.k === 5 ? E.to7(c) : c); };
  const AFILTERS = [['diff', 'ans_f_diff'], ['same', 'ans_f_same'], ['all', 'g_f_all']];
  function answerRows(list) {
    return D.items.map(([s, , text], i) => {
      const mod = S[s].mod;
      if (!list.every(p => p.mods.includes(mod))) return null;
      const v = list.map(p => ans7(p, i)), got = v.filter(x => x > 0);
      const spread = got.length === list.length && got.length > 1 ? Math.max(...got) - Math.min(...got) : -1;
      return { i, mod, text, v, spread };
    }).filter(Boolean);
  }
  function answersFold(list) {
    const rows = answerRows(list), one = list.length === 1, locked = !one && !full;
    const head = one ? te('ans_done', { a: rows.filter(r => r.v[0]).length, b: rows.length })
      : te('ans_sub', { same: rows.filter(r => r.spread >= 0 && r.spread <= 1).length, diff: rows.filter(r => r.spread >= 3).length });
    const f = Store.d.afilter || 'diff';
    return fold(t(one ? 'ans_mine' : 'ans_title'), head, `<p class="small muted">${te('ans_hint', { lo: D.answers[0], hi: D.answers[D.answers.length - 1] })}</p>
      ${one ? '' : legend(list) + (locked ? '' : seg('afilter', AFILTERS.map(([v, k]) => [v, t(k)]), f))}<div class="alist" id="alist"></div>
      ${locked ? lockCard('full_ans_t', 'full_ans_text', true) : ''}`);
  }
  function bindAnswers(list) {
    const box = $('#alist'); if (!box) return;
    const rows = answerRows(list), one = list.length === 1, locked = !one && !full, last = D.answers.length - 1;
    const draw = () => {
      const f = one ? 'all' : locked ? 'diff' : Store.d.afilter || 'diff';
      let shown = f === 'diff' ? rows.filter(r => r.spread >= 3).sort((a, b) => b.spread - a.spread || a.i - b.i)
        : f === 'same' ? rows.filter(r => r.spread >= 0 && r.spread <= 1) : rows;
      if (locked) shown = shown.slice(0, 3); // preview: the three biggest differences
      box.innerHTML = shown.map(r => `<div class="ai"><div class="aq"><span class="muted small">${esc(modName(r.mod))}</span><b>${esc(r.text)}</b></div>
        <div class="track multi ascale">${r.v.map((v, k) => v ? `<span class="dot" style="left:${(4 + (v - 1) / last * 92).toFixed(1)}%;background:${color(list[k])}"></span>` : '').join('')}</div>
        <div class="aw">${r.v.map((v, k) => `<span>${one ? '' : ava(list[k]) + esc(list[k].name) + ': '}<b>${v ? esc(D.answers[v - 1]) : te('ans_skip')}</b></span>`).join('')}</div></div>`).join('')
        || `<p class="muted">${te('g_none')}</p>`;
    };
    // the list is drawn when the section is opened, so a closed section costs nothing
    const fd = box.closest('details');
    fd.addEventListener('toggle', () => { if (fd.open && !box.childElementCount) draw(); });
    const sg = $('[data-seg="afilter"]');
    if (sg) sg.onclick = e => {
      const b = e.target.closest('button'); if (!b) return;
      Store.d.afilter = b.dataset.v; Store.save();
      $$('button', sg).forEach(x => x.classList.toggle('on', x === b));
      draw();
    };
  }

  // ───────── sharing / import ─────────
  const webBase = () => /^https?:$/.test(location.protocol) ? location.href.split('#')[0].split('?')[0] : '';
  const shareLine = p => `${p.name}: ${E.encode(p.mods, p.ans, p.k)}`;
  function shareModal(list) {
    const base = webBase();
    const one = list.length === 1 ? list[0] : null;
    const text = list.map(shareLine).join('\n');
    const link = one && base ? `${base}#/import/${E.encode(one.mods, one.ans, one.k)}/${encodeURIComponent(one.name)}` : '';
    openModal(`<h2>${te(one ? 'share_result' : 'share_group')}</h2>
      <p class="small muted">${te(link ? 'share_hint_link' : 'share_hint_code')}</p>
      ${link ? `<label class="lbl">${te('link')}</label><div class="copy"><input class="input" readonly value="${esc(link)}"><button class="btn secondary" data-copy="${esc(link)}">${te('copy')}</button></div>` : ''}
      <label class="lbl">${te(one ? 'code' : 'all_codes')}</label>
      <div class="copy"><textarea class="input code-ta" readonly rows="${Math.min(6, list.length + 1)}">${esc(text)}</textarea><button class="btn secondary" data-copy="${esc(text)}">${te('copy')}</button></div>
      ${navigator.share ? `<button class="btn block" id="nativeShare" style="margin-top:12px">${icon('share')}${te('send')}</button>` : ''}`);
    const ns = $('#nativeShare');
    if (ns) ns.onclick = () => navigator.share(link ? { title: t('app'), text: t('share_text', { name: one.name }), url: link } : { title: t('app'), text }).catch(() => { /* cancelled */ });
  }
  function parseShared(text) {
    const out = [];
    String(text || '').split(/\n+/).forEach(line => {
      line = line.trim();
      if (!line) return;
      let m = line.match(/#\/import\/([A-Za-z0-9_-]+)(?:\/(\S*))?/);
      if (m) { let n = ''; try { n = decodeURIComponent(m[2] || ''); } catch (e) { n = m[2] || ''; } out.push({ code: m[1], name: n }); return; }
      m = line.match(/^(.*?)\s*[:：]\s*([A-Za-z0-9_-]{20,})\s*$/);
      if (m) { out.push({ code: m[2], name: m[1] }); return; }
      m = line.match(/([A-Za-z0-9_-]{20,})/);
      if (m) out.push({ code: m[1], name: '' });
    });
    return out;
  }
  function importEntries(entries) {
    const added = [], dup = [];
    let bad = 0;
    entries.forEach(({ code, name }) => {
      const d = E.decode(code);
      if (!d || !d.mods.includes('char')) { bad++; return; }
      const nm = (name || '').trim().slice(0, 40) || t('no_name');
      const ex = people().find(p => p.name === nm && p.ans === d.ans && p.k === d.k && p.mods.join() === d.mods.join());
      if (ex) { dup.push(ex); return; }
      added.push(addPerson(nm, d.mods, d.ans, true, d.k));
    });
    return { added, dup, bad };
  }
  function importModal() {
    openModal(`<h2>${te('add_by_code')}</h2>
      <p class="small muted">${te('import_hint')}</p>
      <textarea class="input" id="impTa" rows="5" placeholder="${te('import_ph')}"></textarea>
      <button class="btn block" id="impBtn" style="margin-top:12px">${te('add')}</button>`);
    $('#impTa').focus();
    $('#impBtn').onclick = () => {
      const txt = $('#impTa').value;
      const gm = txt.match(/#\/g\/([A-Za-z0-9_-]+)/);
      const gcode = gm ? gm[1] : (txt.match(/[A-Za-z0-9_-]{16,}/g) || []).find(x => window.Game.decode(x));
      if (gcode) {
        if (!window.Game.decode(gcode)) { toast(t('game_code_bad')); return; }
        closeModal(); go('#/g/' + gcode); return;
      }
      const r = importEntries(parseShared(txt));
      if (!r.added.length && !r.dup.length) { toast(t(r.bad ? 'code_bad' : 'code_none')); return; }
      closeModal();
      const msg = [r.added.length && t('imp_added', { n: r.added.length }), r.dup.length && t('imp_dup', { n: r.dup.length }), r.bad && t('imp_bad', { n: r.bad })].filter(Boolean).join(', ');
      toast(msg);
      const all = r.added.concat(r.dup);
      if (all.length === 1) go('#/p/' + all[0].id); else route();
    };
  }
  function vImport(code, name) {
    setTitle(t('add_person'), '#/');
    let nm = '';
    try { nm = decodeURIComponent(name || ''); } catch (e) { nm = name || ''; }
    const d = E.decode(code);
    if (!d || !d.mods.includes('char')) { view().innerHTML = `<div class="card empty">${te('link_broken')}<p><a class="btn" href="#/">${te('to_home')}</a></p></div>`; return; }
    const ex = people().find(p => p.ans === d.ans && p.k === d.k && p.mods.join() === d.mods.join());
    const P = E.profile(d.ans, d.mods, d.k);
    view().innerHTML = `<div class="card"><h2>${te('sent_profile')}</h2>
      <p><b>${esc(P.type.code)}</b> ${esc(quote(D.types[P.type.code].name))} · ${esc(D.temperaments[P.temp.id].name)} · ${te('blocks_n', { a: d.mods.length, b: E.MODS.length })}</p>
      <label class="lbl" for="nm">${te('name')}</label><input class="input" id="nm" maxlength="40" value="${esc(nm)}">
      ${ex ? `<p class="small muted">${te('exists')} <a href="#/p/${ex.id}">${esc(ex.name)}</a></p>` : ''}
      <button class="btn block" id="addBtn" style="margin-top:12px">${te('add_to_people')}</button>
      <p class="small muted" style="margin-top:10px">${te('then_take')}</p></div>`;
    $('#addBtn').onclick = () => { const p = addPerson($('#nm').value, d.mods, d.ans, true, d.k); history.replaceState(null, '', '#/p/' + p.id); route(); };
  }

  // ───────── compare: picker ─────────
  const ctxItems = () => [['love', t('ctx_love')], ['friends', t('ctx_friends')], ['work', t('ctx_work')]];
  function vCompare() {
    setTitle(t('nav_compare'));
    const dn = done();
    if (dn.length < 2) {
      view().innerHTML = `<div class="card empty">${icon('users', 'big-ico')}<p>${te('need_two')}</p>
        <p><a class="btn" href="#/new">${te('new_person')}</a> <button class="btn secondary" id="importBtn">${te('add_by_code_short')}</button></p></div>`;
      $('#importBtn').onclick = importModal;
      return;
    }
    let sel = Store.d.sel.filter(id => dn.some(p => p.id === id));
    if (sel.length < 2) sel = dn.map(p => p.id);
    function draw() {
      $('#pick').innerHTML = dn.map(p => `<label class="chk"><input type="checkbox" value="${p.id}"${sel.includes(p.id) ? ' checked' : ''}>${ava(p)}
        <span><b>${esc(p.name)}</b><br><span class="small muted">${esc(prof(p).type.code)} · ${esc(D.temperaments[prof(p).temp.id].name)}</span></span></label>`).join('');
      $('#goCmp').disabled = sel.length < 2;
      $('#goCmp').textContent = sel.length === 2 ? t('cmp_pair') : sel.length > 2 ? t('cmp_group', { n: sel.length }) : t('pick_two');
    }
    view().innerHTML = `<div class="card"><div class="row"><b style="flex:1">${te('context')}</b>${seg('ctx', ctxItems(), Store.d.ctx)}</div>
      <p class="small muted" style="margin:8px 0 0">${te('ctx_hint')}</p></div>
      <div class="card"><b>${te('who')}</b><div id="pick" class="mods"></div></div>
      <button class="btn block" id="goCmp"></button>
      <div class="row" style="margin-top:12px"><button class="btn secondary" id="shareAll">${icon('share')}${te('share_all')}</button></div>`;
    draw();
    $('#pick').onchange = () => { sel = $$('#pick input:checked').map(i => i.value); Store.d.sel = sel; Store.save(); draw(); };
    $('[data-seg="ctx"]').onclick = e => { const b = e.target.closest('button'); if (!b) return; Store.d.ctx = b.dataset.v; Store.save(); $$('[data-seg="ctx"] button').forEach(x => x.classList.toggle('on', x === b)); };
    $('#goCmp').onclick = () => { Store.d.sel = sel; Store.save(); go(compareHref(sel)); };
    $('#shareAll').onclick = () => shareModal(dn);
  }
  function ctxBar() {
    return `<div class="row ctx-row"><span class="muted small">${te('context_colon')}</span>${seg('ctx', ctxItems(), Store.d.ctx)}</div>`;
  }
  function bindCtx() {
    $('[data-seg="ctx"]').onclick = e => { const b = e.target.closest('button'); if (!b) return; Store.d.ctx = b.dataset.v; Store.save(); route(); };
  }

  // ───────── pair report ─────────
  function vPair(ia, ib) {
    const a = byId(ia), b = byId(ib);
    if (!a || !b || !a.mods.length || !b.mods.length) return go('#/compare');
    setTitle(`${a.name} + ${b.name}`, '#/compare');
    const A = ent(a), B = ent(b), r = E.pair(A, B, Store.d.ctx), pa = A.P, pb = B.P;
    const li = (arr, cls, ic) => arr.length ? `<ul class="ins ${cls}">${arr.map(x => `<li>${icon(ic)}<span>${esc(x)}</span></li>`).join('')}</ul>` : '';
    const ctxName = t('for_' + r.ctx);
    const rowsCmp = [
      ['row_type', P => `<b>${P.type.code}</b> ${esc(D.types[P.type.code].name)}`],
      ['row_temp', P => esc(D.temperaments[P.temp.id].name)],
      ['row_att', P => P.att ? esc(D.attach[P.att.id].name) : '—'],
      ['row_vals', P => P.val ? P.val.top.slice(0, 2).map(k => esc(S[k].name)).join(', ') : '—'],
      ['row_mind', P => P.mind ? esc(D.thinking[P.mind.think].name) : '—'],
      ['row_chrono', P => P.mind && P.mind.chrono ? esc(D.chrono[P.mind.chrono].name) : '—'],
      ['row_conf', P => P.conf ? esc(S[P.conf.top[0]].name) : '—'],
      ['row_care', P => P.care ? esc(S[P.care.rank[0]].name) : '—'],
      ['row_role', P => esc(D.roles[P.roles[0].id].name)]
    ];
    const both = m => pa.has(m) && pb.has(m);
    const miss = E.MODS.filter(m => !both(m));
    view().innerHTML = `${ctxBar()}
      <div class="card pair-head"><div class="duo">${ava(a, 'big')}<span class="amp">+</span>${ava(b, 'big')}</div>
        <div class="rings">${ring(r.compat, t('ring_compat', { ctx: ctxName }), 'var(--primary)')}${ring(r.sim, t('similarity'), 'var(--accent)')}</div>
        <p class="center">${th('compat_verdict', { label: `<b>${esc(r.label)}</b>`, ctx: esc(ctxName) })}<br><span class="small muted">${te('sim_expl')}</span></p>
        <p class="center small scale-line">${te('compat_scale', D.eng.labels)}</p></div>
      ${answersFold([a, b])}
      ${full ? '' : lockCard('full_pair_t', 'full_pair_text') + gameCardForPair(a, b)}${full ? `
      <section class="card"><h3 class="card-h">${te('strengths')}</h3>${li(r.plus, 'plus', 'check')}</section>
      ${r.minus.length ? `<section class="card"><h3 class="card-h">${te('frictions')}</h3>${li(r.minus, 'minus', 'warn')}</section>` : ''}
      ${r.tips.length ? `<section class="card"><h3 class="card-h">${te('tips')}</h3>${li(r.tips, 'tip', 'bulb')}</section>` : ''}
      ${gameCardForPair(a, b)}
      ${fold(t('parts_title'), te('parts_sub'), r.parts.map(x => `<div class="part">${bar(x.name, x.v, heatBar(x.v))}<div class="small muted part-h">${esc(x.hint)} · ${te('weight', { n: r0(x.w * 100) })}</div></div>`).join('') +
        (miss.length ? `<p class="note">${te('missing_both', { list: miss.map(m => quote(modName(m))).join(D.eng.sep) })}</p>` : ''))}
      <section class="card"><h3 class="card-h">${te('brief')}</h3><div class="tbl"><table class="cmp-t"><tr><th></th><th>${ava(a)} ${esc(a.name)}</th><th>${ava(b)} ${esc(b.name)}</th></tr>
        ${rowsCmp.map(([l, f]) => `<tr><td class="muted">${te(l)}</td><td>${f(pa)}</td><td>${f(pb)}</td></tr>`).join('')}</table></div></section>
      ${fold(t('side_by_side'), te('side_sub'), legend([a, b]) +
        DOM_ORDER.map(k => dots(D.domains[k].name, [{ v: pa.dom[k].pct, c: color(a), t: a.name }, { v: pb.dom[k].pct, c: color(b), t: b.name }])).join('') +
        dots(S.hon.name, [{ v: pa.pct.hon, c: color(a), t: a.name }, { v: pb.pct.hon, c: color(b), t: b.name }]) +
        `<details><summary>${te('aspects10')}</summary>${E.modScales.char.filter(k => k !== 'hon').map(k => dots(S[k].name, [{ v: pa.pct[k], c: color(a), t: a.name }, { v: pb.pct[k], c: color(b), t: b.name }])).join('')}</details>`)}
      ${fold(t(both('att') ? 'temp_att' : 'temp_title'), te('maps_sub'), `<div class="maps">
        ${tempMap([Object.assign(tempPt(pa), { c: color(a), t: a.name }), Object.assign(tempPt(pb), { c: color(b), t: b.name })])}
        ${both('att') ? attMap([{ x: pa.att.avo, y: pa.att.anx, c: color(a), t: a.name }, { x: pb.att.avo, y: pb.att.anx, c: color(b), t: b.name }]) : ''}</div>`)}
      ${both('val') ? fold(t('val_title'), te('vals_sub'), legend([a, b]) + radar([{ c: pa.val.c, col: color(a) }, { c: pb.val.c, col: color(b) }])) : ''}` : ''}
      <p class="note">${te('pair_note')} <a href="#/theory/compat">${te('science')}</a></p>`;
    bindCtx(); bindAnswers([a, b]);
  }

  // ───────── group report ─────────
  function vGroup(ids) {
    const list = ids.split(',').map(byId).filter(p => p && p.mods.length);
    if (list.length < 2) return go('#/compare');
    if (list.length === 2) return go(`#/pair/${list[0].id}/${list[1].id}`);
    setTitle(t('group_n', { n: list.length }), '#/compare');
    const ents = list.map(ent), g = E.group(ents, Store.d.ctx), key = Store.d.mode === 'sim' ? 'sim' : 'compat';
    const cell = (i, j) => {
      if (i === j) return `<td class="self">${ava(list[i])}</td>`;
      const v = g.M[i][j][key];
      return `<td><a href="#/pair/${list[i].id}/${list[j].id}" style="background:${heat(v)}">${v}</a></td>`;
    };
    const bySim = g.pairs.slice().sort((p, q) => q.sim - p.sim);
    const pn = p => `${esc(list[p.i].name)} + ${esc(list[p.j].name)}`;
    const hl = [
      ['hl_best', g.pairs[0], t('compat_n', { n: g.pairs[0].compat })],
      ['hl_sim', bySim[0], t('sim_n', { n: bySim[0].sim })],
      ['hl_diff', bySim[bySim.length - 1], t('sim_n', { n: bySim[bySim.length - 1].sim })]
    ];
    const withAtt = list.filter(p => prof(p).att);
    view().innerHTML = `${ctxBar()}
      <section class="card"><div class="row"><h3 class="card-h" style="flex:1;margin:0">${te('matrix')}</h3>${seg('mode', [['compat', t('compatibility')], ['sim', t('similarity')]], key)}</div>
        <div class="tbl"><table class="heat"><tr><th></th>${list.map(p => `<th>${ava(p)}</th>`).join('')}</tr>
        ${list.map((p, i) => `<tr><th class="hn">${ava(p)}<span>${esc(p.name)}</span></th>${list.map((_, j) => cell(i, j)).join('')}</tr>`).join('')}</table></div>
        <p class="note">${te('matrix_note')}</p></section>
      ${answersFold(list)}
      ${full ? `<div class="grid hl">${hl.map(([k, p, s]) => `<a class="tile" href="#/pair/${list[p.i].id}/${list[p.j].id}"><span class="tile-main"><span class="muted small">${te(k)}</span><b>${pn(p)}</b><span class="small">${esc(s)}</span></span></a>`).join('')}</div>
      <section class="card"><h3 class="card-h">${te('portrait')}</h3>
        ${g.notes.length ? `<ul class="ins tip">${g.notes.map(x => `<li>${icon('bulb')}<span>${esc(x)}</span></li>`).join('')}</ul>` : `<p>${te('balanced')}</p>`}
        ${legend(list)}${DOM_ORDER.map(k => dots(D.domains[k].name, list.map(p => ({ v: prof(p).dom[k].pct, c: color(p), t: p.name })))).join('')}
        ${dots(S.hon.name, list.map(p => ({ v: prof(p).pct.hon, c: color(p), t: p.name })))}</section>
      <section class="card"><h3 class="card-h">${te('team_roles')}</h3><div class="tbl"><table>${g.roles.map(x => `<tr><td><b>${esc(D.roles[x.id].name)}</b><br><span class="small muted">${esc(D.roles[x.id].d)}</span></td>
        <td class="nowrap">${ava(list[x.best])} ${esc(list[x.best].name)}</td><td class="nowrap"><span class="badge ${x.v >= 65 ? 'ok' : x.v >= 55 ? '' : 'warn'}">${r0(x.v)}</span></td></tr>`).join('')}</table></div>
        <p class="note">${te('roles_best_note')}</p></section>
      <section class="card"><h3 class="card-h">${te(withAtt.length >= 2 ? 'temp_att' : 'temp_title')}</h3><div class="maps">
        ${tempMap(list.map(p => Object.assign(tempPt(prof(p)), { c: color(p), t: p.name })))}
        ${withAtt.length >= 2 ? attMap(withAtt.map(p => ({ x: prof(p).att.avo, y: prof(p).att.anx, c: color(p), t: p.name }))) : ''}</div></section>` : lockCard('full_group_t', 'full_group_text')}
      <section class="card"><h3 class="card-h">${te('members')}</h3><div class="list">${list.map(p => { const P = prof(p); return `<a class="list-item" href="#/p/${p.id}">${ava(p)}<span class="li-main"><span class="li-title">${esc(p.name)}</span>
        <span class="li-sub"><b>${P.type.code}</b> ${esc(D.types[P.type.code].name)} · ${esc(D.temperaments[P.temp.id].name)} · ${esc(D.roles[P.roles[0].id].name)}</span></span>${icon('chev', 'chev')}</a>`; }).join('')}</div></section>
      <p class="note">${te('group_note')} <a href="#/theory/compat">${te('science_compat')}</a></p>`;
    bindCtx(); bindAnswers(list);
    $('[data-seg="mode"]').onclick = e => { const b = e.target.closest('button'); if (!b) return; Store.d.mode = b.dataset.v; Store.save(); route(); };
  }

  // ───────── game: who knows the partner better ─────────
  const GM = window.Game, GD = window.GAME;
  const catName = id => (GD.cats.find(c => c.id === id) || {}).name || id;
  const games = () => Store.d.games;
  const gById = id => games().find(g => g.id === id);
  const blankAns = n => Array.from({ length: n }, () => [-1, -1]);
  const gDone = g => GM.complete(g.players[0].ans) && GM.complete(g.players[1].ans);
  const gTurn = g => g.me.find(i => !GM.complete(g.players[i].ans)); // player who answers next on this device
  const gColor = (g, k) => { const p = people().find(x => x.name === g.players[k].name); return p ? color(p) : COLORS[k ? 1 : 0]; };
  const gAva = (g, k, cls = '') => `<span class="ava ${cls}" style="background:${gColor(g, k)}">${esc((g.players[k].name.trim()[0] || '?').toUpperCase())}</span>`;
  const samePair = (g, a, b) => { const n = g.players.map(p => p.name); return (n[0] === a && n[1] === b) || (n[0] === b && n[1] === a); };
  const sameAns = (x, y) => JSON.stringify(x) === JSON.stringify(y);
  const gameLink = g => { const base = webBase(); return base ? `${base}#/g/${GM.encode(g)}` : ''; };
  function saveGame(g) {
    if (!games().includes(g)) games().unshift(g);
    // keep the list bounded: drop the oldest finished games first
    while (games().length > 60) {
      const i = games().map(gDone).lastIndexOf(true);
      games().splice(i >= 0 ? i : games().length - 1, 1);
    }
    Store.save();
  }
  function newGame(names, n, cats, mode) {
    const used = [];
    games().forEach(g => { if (samePair(g, names[0], names[1])) used.push(...g.ids); });
    const ids = GM.pick(n, cats, used);
    const me = mode === 'local' ? [0, 1] : [0];
    const g = { id: uid(), created: Date.now(), mode, me, cats: cats.slice(), ids,
      players: names.map((nm, k) => ({ name: nm, ans: me.includes(k) ? blankAns(ids.length) : null })), cur: { q: 0, ready: false } };
    saveGame(g);
    return g;
  }
  function gStatusText(g) {
    if (gDone(g)) { const s = GM.score(g); return `${esc(g.players[0].name)} ${s.know[0]} : ${s.know[1]} ${esc(g.players[1].name)}`; }
    const k = gTurn(g);
    if (k == null) return `<span class="badge warn">${te('g_waiting', { name: g.players[g.me.includes(0) ? 1 : 0].name })}</span>`;
    const dn = g.players[k].ans.filter(x => x[0] >= 0 && x[1] >= 0).length;
    return `<span class="badge warn">${te('in_progress', { a: dn, b: g.ids.length })}</span>`;
  }

  function vGameHub() {
    setTitle(t('game_title'));
    const list = games();
    view().innerHTML = `<div class="hero game-hero"><h2>${te('game_title')}</h2>
        <p>${te('g_hero_sub', { n: GD.q.length })}</p>
        <div class="hero-actions"><a class="btn light" href="#/game/new">${icon('game')}${te('g_new')}</a></div></div>
      ${list.length ? `<h3>${te('g_yours')}</h3><div class="list">${list.map(g => `<a class="list-item" href="${gTurn(g) != null ? '#/game/play/' + g.id : '#/game/res/' + g.id}">
        <span class="duo-s">${gAva(g, 0)}${gAva(g, 1)}</span><span class="li-main"><span class="li-title">${te('g_pair', { a: g.players[0].name, b: g.players[1].name })}</span>
        <span class="li-sub">${gStatusText(g)} · ${esc(qWord(g.ids.length))}</span></span>${icon('chev', 'chev')}</a>`).join('')}</div>` : ''}
      <div class="row" style="margin:14px 0"><button class="btn secondary" id="importBtn">${icon('link')}${te('g_open')}</button></div>
      <div class="card"><h3 class="card-h">${te('g_how')}</h3><ol class="steps">
        <li><b>${te('g_how1_b')}</b> ${te('g_how1')}</li><li><b>${te('g_how2_b')}</b> ${te('g_how2')}</li><li><b>${te('g_how3_b')}</b> ${te('g_how3')}</li></ol></div>`;
    $('#importBtn').onclick = importModal;
  }

  function vGameNew(pa, pb) {
    setTitle(t('g_new'), '#/game');
    const set = Store.d.gset;
    const A = byId(pa), B = byId(pb);
    let mode = set.mode, n = full ? set.n : 10, cats = set.cats.length ? set.cats.slice() : GM.CAT_IDS.slice();
    const names = people().map(p => p.name).filter((v, i, a) => a.indexOf(v) === i);
    view().innerHTML = `<div class="card">
        <label class="lbl" for="gA">${te('g_first')}</label><input class="input" id="gA" maxlength="30" placeholder="${te('name_ph')}" value="${esc(A ? A.name : '')}" autocomplete="off">
        <label class="lbl" for="gB">${te('g_partner')}</label><input class="input" id="gB" maxlength="30" placeholder="${te('g_partner_ph')}" value="${esc(B ? B.name : '')}" autocomplete="off">
        ${names.length ? `<div class="chips pick-names">${names.map(nm => `<button class="tchip" data-nm="${esc(nm)}">${esc(nm)}</button>`).join('')}</div>` : ''}
      </div>
      <div class="card">
        <div class="setting"><span class="label">${te('g_mode')}</span>${seg('gmode', [['local', t('g_local')], ['invite', t('g_invite')]], mode)}</div>
        <div class="setting"><span class="label">${te('g_count')}</span>${seg('gn', [[10, '10'], [20, '20'], [30, '30']], n)}</div>
        ${full ? '' : `<p class="note">${icon('lock', 'inline-ic')}${te('full_game')}</p>`}
        <div class="lbl">${te('g_topics')}</div><div class="chips" id="gCats"></div>
      </div>
      <button class="btn block" id="gStart">${te('start')}</button>`;
    const drawCats = () => {
      $('#gCats').innerHTML = `<button class="tchip${cats.length === GM.CAT_IDS.length ? ' on' : ''}" data-all="1">${te('g_all_topics')}</button>` +
        GD.cats.map(c => `<button class="tchip${cats.includes(c.id) ? ' on' : ''}" data-cat="${c.id}">${esc(c.name)}</button>`).join('');
    };
    drawCats();
    $('#gCats').onclick = e => {
      const b = e.target.closest('button'); if (!b) return;
      if (b.dataset.all) cats = cats.length === GM.CAT_IDS.length ? [] : GM.CAT_IDS.slice();
      else cats = cats.includes(b.dataset.cat) ? cats.filter(c => c !== b.dataset.cat) : cats.concat(b.dataset.cat);
      drawCats();
    };
    const pickNames = $('.pick-names');
    if (pickNames) pickNames.onclick = e => {
      const b = e.target.closest('[data-nm]'); if (!b) return;
      const a = $('#gA'), bb = $('#gB');
      if (!a.value.trim()) a.value = b.dataset.nm; else bb.value = b.dataset.nm;
    };
    $$('[data-seg="gmode"], [data-seg="gn"]').forEach(sg => sg.onclick = e => {
      const b = e.target.closest('button'); if (!b) return;
      if (sg.dataset.seg === 'gn' && !full && +b.dataset.v > 10) { buyModal(); return; }
      if (sg.dataset.seg === 'gmode') mode = b.dataset.v; else n = +b.dataset.v;
      $$('button', sg).forEach(x => x.classList.toggle('on', x === b));
    });
    $('#gStart').onclick = () => {
      const a = $('#gA').value.trim(), b = $('#gB').value.trim();
      if (!a) { $('#gA').focus(); toast(t('g_need_first')); return; }
      if (!b) { $('#gB').focus(); toast(t('g_need_partner')); return; }
      if (a === b) { toast(t('g_names_differ')); return; }
      if (!cats.length) { toast(t('g_need_topic')); return; }
      Store.d.gset = { mode, n, cats: cats.length === GM.CAT_IDS.length ? [] : cats };
      const g = newGame([a, b], n, cats, mode);
      go('#/game/play/' + g.id);
    };
  }

  function vGamePlay(gid) {
    const g = gById(gid);
    if (!g) return go('#/game');
    const p = gTurn(g);
    if (p == null) return go('#/game/res/' + g.id);
    const o = 1 - p, me = g.players[p], other = g.players[o], n = g.ids.length;
    setTitle(me.name, '#/game');
    let lock = false;
    if (g.cur.p !== p) { g.cur = { p, q: 0, ready: false }; Store.save(); }

    function intro() {
      let text;
      if (g.mode === 'local' && p === 1) text = `<h2>${te('g_handoff_t', { name: me.name })}</h2><p>${te('g_handoff', { name: other.name })}</p>`;
      else if (g.mode === 'join') text = `<h2>${te('g_join_t', { name: me.name })}</h2><p>${te('g_join', { name: other.name })}</p>`;
      else text = `<h2>${te('g_start_t', { name: me.name })}</h2><p>${te('g_start', { name: other.name })} ${g.mode === 'local' ? te('g_start_local', { name: other.name }) : te('g_start_invite')}</p>`;
      view().innerHTML = `<div class="card intro-card"><div class="duo">${gAva(g, p, 'big')}</div>${text}
        <p class="small muted">${esc(qWord(n))} · ${te('about_min', { n: Math.max(1, Math.round(n * 12 / 60)) })}</p>
        <button class="btn block" id="goBtn">${g.mode === 'local' && p === 1 ? te('g_iam', { name: me.name }) : te('start')}</button></div>`;
      $('#goBtn').onclick = () => { g.cur.ready = true; Store.save(); render(); };
    }
    function finish() {
      keyHandler = null;
      Store.save();
      go('#/game/' + (gTurn(g) != null ? 'play/' : 'res/') + g.id);
      if (gTurn(g) != null) route(); // same hash: re-render for the next player
    }
    function move(d) {
      g.cur.q = clamp(g.cur.q + d, 0, n);
      Store.save();
      if (g.cur.q >= n) {
        const firstGap = me.ans.findIndex(x => x[0] < 0 || x[1] < 0);
        if (firstGap >= 0) { g.cur.q = firstGap; toast(t('g_answer_all')); render(); return; }
        return finish();
      }
      render();
    }
    function render() {
      if (!g.cur.ready) return intro();
      const qi = clamp(g.cur.q, 0, n - 1), id = g.ids[qi], q = GD.q[id], a = me.ans[qi];
      const dn = me.ans.filter(x => x[0] >= 0 && x[1] >= 0).length;
      setExtra(`<span class="counter">${dn}/${n}</span>`);
      const btns = (k, sel) => q.slice(2).map((x, i) => `<button data-k="${k}" data-v="${i}" class="${sel === i ? 'on' : ''}"><span class="ak">${i + 1}</span>${esc(x)}</button>`).join('');
      view().innerHTML = `<div class="progress"><i style="width:${dn / n * 100}%"></i></div>
        <div class="q-wrap"><div class="q-meta"><span>${esc(catName(q[0]))}</span><span>${te('of', { a: qi + 1, b: n })}</span></div>
        <div class="card q-card g-card"><div class="q-prompt">${te('g_your_choice', { name: me.name })}</div><div class="q-text">${esc(q[1])}</div></div>
        <div class="ans gopts">${btns(0, a[0])}</div>
        <div class="g-sub">${gAva(g, o)}<span>${th('g_guess', { name: `<b>${esc(other.name)}</b>` })}</span></div>
        <div class="ans gopts guess">${btns(1, a[1])}</div>
        <div class="q-nav"><button class="btn ghost" id="prevBtn"${qi ? '' : ' disabled'}>${icon('back')}${te('back')}</button><span class="spacer"></span>
          <button class="btn ghost" id="nextBtn"${a[0] >= 0 && a[1] >= 0 ? '' : ' disabled'}>${te(qi === n - 1 ? 'done' : 'next')}</button></div></div>`;
      $$('.gopts').forEach(box => box.onclick = e => { const b = e.target.closest('button'); if (b) choose(+b.dataset.k, +b.dataset.v); });
      $('#prevBtn').onclick = () => move(-1);
      $('#nextBtn').onclick = () => move(1);
    }
    function choose(k, v) {
      const qi = g.cur.q, a = me.ans[qi];
      if (lock || !a) return;
      const wasDone = a[0] >= 0 && a[1] >= 0;
      a[k] = v;
      Store.save();
      $$(`.gopts button[data-k="${k}"]`).forEach(b => b.classList.toggle('on', +b.dataset.v === v));
      const ready = a[0] >= 0 && a[1] >= 0;
      $('#nextBtn').disabled = !ready;
      if (ready && !wasDone) {
        lock = true;
        setTimeout(() => { lock = false; if (location.hash === '#/game/play/' + g.id && g.cur.q === qi) move(1); }, 260);
      }
    }
    keyHandler = e => {
      if (!g.cur.ready) { if (e.key === 'Enter') { g.cur.ready = true; Store.save(); render(); } return; }
      const a = me.ans[g.cur.q], k = +e.key;
      if (a && k >= 1 && k <= GD.q[g.ids[g.cur.q]].length - 2) { e.preventDefault(); choose(a[0] < 0 ? 0 : 1, k - 1); }
      else if (e.key === 'ArrowLeft' || e.key === 'Backspace') { e.preventDefault(); if (g.cur.q > 0) move(-1); }
      else if ((e.key === 'ArrowRight' || e.key === 'Enter') && a && a[0] >= 0 && a[1] >= 0) { e.preventDefault(); move(1); }
    };
    render();
  }

  function gShare(g, title) {
    const link = gameLink(g), code = GM.encode(g), text = `${t('g_code_prefix')}: ${code}`;
    openModal(`<h2>${esc(title)}</h2>
      <p class="small muted">${te(link ? 'g_share_hint_link' : 'g_share_hint_code')}</p>
      ${link ? `<label class="lbl">${te('link')}</label><div class="copy"><input class="input" readonly value="${esc(link)}"><button class="btn secondary" data-copy="${esc(link)}">${te('copy')}</button></div>` : ''}
      <label class="lbl">${te('code')}</label><div class="copy"><textarea class="input code-ta" readonly rows="3">${esc(text)}</textarea><button class="btn secondary" data-copy="${esc(text)}">${te('copy')}</button></div>
      ${navigator.share ? `<button class="btn block" id="nativeShare" style="margin-top:12px">${icon('share')}${te('send')}</button>` : ''}`);
    const ns = $('#nativeShare');
    if (ns) ns.onclick = () => navigator.share(link ? { title: t('game_title'), text: t(gDone(g) ? 'g_share_res' : 'g_share_inv'), url: link } : { text }).catch(() => { /* cancelled */ });
  }

  function vGameRes(gid) {
    const g = gById(gid);
    if (!g) return go('#/game');
    if (gTurn(g) != null) return go('#/game/play/' + g.id);
    const [A, B] = g.players;
    setTitle(t('g_pair', { a: A.name, b: B.name }), '#/game');
    if (!gDone(g)) {
      const wait = g.me.includes(0) ? B : A;
      view().innerHTML = `<div class="card intro-card"><div class="duo">${gAva(g, 0, 'big')}<span class="amp">+</span>${gAva(g, 1, 'big')}</div>
        <h2>${te('g_wait_t', { name: wait.name })}</h2>
        <p>${te('g_wait')}</p>
        <button class="btn block" id="shareBtn">${icon('share')}${te('g_send_inv')}</button>
        <button class="btn ghost block" id="pasteBtn">${icon('link')}${te('g_paste')}</button></div>`;
      $('#shareBtn').onclick = () => gShare(g, t('g_invite_title'));
      $('#pasteBtn').onclick = importModal;
      return;
    }
    const s = GM.score(g), filter = Store.d.gfilter || 'all';
    const verdict = s.winner < 0 ? t('g_draw') : t('g_winner', { name: g.players[s.winner].name });
    const opt = (id, i) => esc(GD.q[id][2 + i]);
    // each player's own choice, and under it what the partner guessed about it
    const row = (x, k) => { const o = 1 - k; return `<div class="gr">${gAva(g, k)}<span class="gr-main"><span><b>${esc(g.players[k].name)}:</b> ${opt(x.id, x.own[k])}</span>
      <span class="gr-guess">${te('g_thought', { name: g.players[o].name })} ${opt(x.id, x.guess[o])} <span class="${x.ok[o] ? 'pass' : 'fail'}">${x.ok[o] ? '✓' : '✗'}</span></span></span></div>`; };
    const shown = s.items.filter(x => filter === 'miss' ? !(x.ok[0] && x.ok[1]) : filter === 'eq' ? x.eq : true);
    view().innerHTML = `<div class="card pair-head"><div class="rings">${ring(s.kp[0], t('g_guesses', { name: A.name }), gColor(g, 0))}${ring(s.kp[1], t('g_guesses', { name: B.name }), gColor(g, 1))}</div>
        <p class="center"><b>${icon('trophy', 'inline-ico')}${esc(verdict)}</b><br><span class="muted">${esc(GM.level(Math.max(s.kp[0], s.kp[1])))} · ${te('g_same', { a: s.same, b: s.n, p: s.sp })}</span></p>
        <p class="center small muted">${te('g_score', { name: A.name, a: s.know[0], b: s.n })} · ${te('g_score', { name: B.name, a: s.know[1], b: s.n })}</p></div>
      <div class="row toolbar"><button class="btn" id="againBtn">${icon('game')}${te('g_rematch')}</button><button class="btn secondary" id="shareBtn">${icon('share')}${te(g.mode === 'join' ? 'g_send_res' : 'share')}</button></div>
      ${g.mode === 'join' ? `<div class="card done-card warn">${icon('share')}<div>${te('g_send_back', { name: A.name })}</div></div>` : ''}
      <section class="card"><h3 class="card-h">${te('g_by_topic')}</h3><div class="tbl"><table class="gt"><tr><th>${te('g_topic')}</th><th>${gAva(g, 0)} ${te('g_guessed')}</th><th>${gAva(g, 1)} ${te('g_guessed')}</th><th>${te('g_matched')}</th></tr>
        ${s.cats.map(c => `<tr><td>${esc(catName(c.id))}</td><td>${c.k0}/${c.n}</td><td>${c.k1}/${c.n}</td><td>${c.eq}/${c.n}</td></tr>`).join('')}</table></div></section>
      ${s.talk.length ? `<section class="card"><h3 class="card-h">${te('g_talk')}</h3><p class="small muted">${te('g_talk_hint')}</p>
        <ul class="ins tip">${s.talk.slice(0, 6).map(x => `<li>${icon('bulb')}<span><b>${esc(GD.q[x.id][1])}</b><br>${esc(A.name)}: ${opt(x.id, x.own[0])} · ${esc(B.name)}: ${opt(x.id, x.own[1])}</span></li>`).join('')}</ul></section>` : ''}
      <section class="card"><div class="row"><h3 class="card-h" style="flex:1;margin:0">${te('g_all_answers')}</h3>${seg('gfilter', [['all', t('g_f_all')], ['miss', t('g_f_miss')], ['eq', t('g_f_eq')]], filter)}</div>
        <p class="small muted">${te('g_rows_hint')}</p>
        <div class="glist">${shown.map(x => `<div class="gi"><div class="gq"><span class="muted small">${esc(catName(x.cat))}</span><b>${esc(GD.q[x.id][1])}</b>${x.eq ? `<span class="badge ok">${te('g_eq_badge')}</span>` : ''}</div>${row(x, 0)}${row(x, 1)}</div>`).join('') || `<p class="muted">${te('g_none')}</p>`}</div></section>
      <div class="row"><button class="btn danger" id="delBtn">${te('g_delete')}</button></div>`;
    $('[data-seg="gfilter"]').onclick = e => { const b = e.target.closest('button'); if (!b) return; Store.d.gfilter = b.dataset.v; Store.save(); route(); };
    $('#shareBtn').onclick = () => gShare(g, t(g.mode === 'join' ? 'g_send_result' : 'g_share_result'));
    $('#againBtn').onclick = () => {
      const mode = g.mode === 'local' ? 'local' : 'invite';
      const names = g.me.includes(0) || mode === 'local' ? [A.name, B.name] : [B.name, A.name];
      const ng = newGame(names, full ? g.ids.length : Math.min(10, g.ids.length), g.cats && g.cats.length ? g.cats : GM.CAT_IDS, mode);
      go('#/game/play/' + ng.id);
    };
    $('#delBtn').onclick = () => {
      if (!confirm(t('g_delete_confirm'))) return;
      Store.d.games = games().filter(x => x !== g); Store.save(); go('#/game');
    };
  }

  // opened from a link or a pasted code: an invitation (partner hasn't answered) or a finished game
  function vGameOpen(code) {
    setTitle(t('nav_game'), '#/game');
    const d = GM.decode(code);
    if (!d || !GM.complete(d.players[0].ans)) {
      view().innerHTML = `<div class="card empty">${te('g_open_bad')}<p><a class="btn" href="#/game">${te('g_to_games')}</a></p></div>`;
      return;
    }
    const local = games().find(g => g.ids.join() === d.ids.join() && sameAns(g.players[0].ans, d.players[0].ans));
    if (GM.complete(d.players[1].ans)) {
      let g = local;
      if (g) { if (!GM.complete(g.players[1].ans)) g.players[1] = d.players[1]; }
      else g = { id: uid(), created: Date.now(), mode: 'shared', me: [], cats: [], ids: d.ids, players: d.players, cur: { q: 0, ready: true } };
      saveGame(g);
      history.replaceState(null, '', '#/game/res/' + g.id);
      return route();
    }
    if (local) { history.replaceState(null, '', (gTurn(local) != null ? '#/game/play/' : '#/game/res/') + local.id); return route(); }
    const [A, B] = d.players;
    view().innerHTML = `<div class="card intro-card"><div class="duo"><span class="ava big" style="background:${COLORS[0]}">${esc((A.name[0] || '?').toUpperCase())}</span></div>
      <h2>${te('g_invites', { name: A.name })}</h2><p>${te('g_invite_text', { title: t('game_title'), q: qWord(d.ids.length), name: A.name })}</p>
      <label class="lbl" for="gMe" style="text-align:left">${te('g_your_name')}</label><input class="input" id="gMe" maxlength="30" value="${esc(B.name)}">
      <button class="btn block" id="joinBtn" style="margin-top:12px">${te('g_play')}</button></div>`;
    $('#joinBtn').onclick = () => {
      const nm = $('#gMe').value.trim();
      if (!nm) { $('#gMe').focus(); toast(t('enter_name')); return; }
      if (nm === A.name) { toast(t('g_names_differ')); return; }
      const g = { id: uid(), created: Date.now(), mode: 'join', me: [1], cats: [], ids: d.ids,
        players: [A, { name: nm, ans: blankAns(d.ids.length) }], cur: { p: 1, q: 0, ready: true } };
      saveGame(g);
      history.replaceState(null, '', '#/game/play/' + g.id);
      route();
    };
  }

  function gameCardForPair(a, b) {
    const list = games().filter(g => gDone(g) && samePair(g, a.name, b.name));
    const last = list[0];
    let body;
    if (last) {
      const s = GM.score(last), w = s.winner < 0 ? t('g_card_draw') : t('g_card_win', { name: last.players[s.winner].name });
      body = `<p>${te('g_last')} <b>${esc(last.players[0].name)} ${s.know[0]} : ${s.know[1]} ${esc(last.players[1].name)}</b> — ${esc(w)}; ${te('g_card_same', { p: s.sp })}${list.length > 1 ? ' ' + te('g_total', { n: list.length }) : ''}</p>
        <div class="row"><a class="btn secondary" href="#/game/res/${last.id}">${te('g_result')}</a><a class="btn" href="#/game/new/${a.id}/${b.id}">${icon('game')}${te('g_again')}</a></div>`;
    } else body = `<p>${te('g_try', { n: GD.q.length })}</p><a class="btn" href="#/game/new/${a.id}/${b.id}">${icon('game')}${te('g_play_btn')}</a>`;
    return `<section class="card"><h3 class="card-h">${te('g_card_t')}</h3>${body}</section>`;
  }

  // ───────── theory ─────────
  const EV_CLS = { 3: 'ok', 2: '', 1: 'warn' };
  const evBadge = ev => `<span class="badge ${EV_CLS[ev]}">${te('ev' + ev)}</span>`;
  function vTheory(id) {
    if (id) {
      const x = D.theory.find(y => y.id === id);
      if (!x) return go('#/theory');
      setTitle(x.title, '#/theory');
      view().innerHTML = `<section class="card"><h2>${esc(x.title)}</h2><p>${evBadge(x.ev)}</p>
        ${x.text.map(s => `<p>${esc(s)}</p>`).join('')}<p class="small"><b>${te('in_app')}</b> ${esc(x.used)}</p>
        <h3>${te('books')}</h3><ul class="books">${x.books.map(b => `<li>${esc(b)}</li>`).join('')}</ul></section>`;
      return;
    }
    setTitle(t('nav_theory'));
    view().innerHTML = `<p class="muted">${te('theory_intro')}</p>
      <div class="list">${D.theory.map(x => `<a class="list-item" href="#/theory/${x.id}"><span class="li-main"><span class="li-title">${esc(x.title)}</span>
        <span class="li-sub">${evBadge(x.ev)} ${esc(x.used)}</span></span>${icon('chev', 'chev')}</a>`).join('')}</div>`;
  }

  // ───────── settings ─────────
  const SITE = 'https://aureliel.store/';
  const RELEASE = 'https://github.com/IIOverlordII/The-connection-between-us/releases/latest';
  let installEvt = null;
  window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); installEvt = e; });
  function vSettings() {
    setTitle(t('nav_settings'));
    const dn = done(), curLang = (I.LANGS.find(l => l[0] === I.lang()) || [])[1];
    view().innerHTML = `<div class="card">
        <div class="setting"><span class="label">${te('language')}</span><button class="btn secondary" id="langPick">${icon('globe')}${esc(curLang)}</button></div>
        <div class="setting"><span class="label">${te('theme')}</span>${seg('theme', [['auto', t('theme_auto')], ['light', t('theme_light')], ['dark', t('theme_dark')]], Store.d.theme)}</div>
        <div class="setting"><span class="label">${te('font')}</span>${seg('fs', [[15, 'A−'], [16, 'A'], [18, 'A+'], [20, 'A++']], Store.d.fs)}</div></div>
      ${Pay.enabled ? `<div class="card"><h3 class="card-h">${te('full_title')}</h3>${full
        ? `<p class="small">${te('full_active')}${Store.d.lic ? ' ' + te('full_order', { txn: Store.d.lic.txn }) : ''}</p>`
        : `<p class="small">${te('full_sub')}</p><div class="row"><button class="btn" data-buy>${te('full_buy', { price: Pay.price(I.lang()) })}</button><button class="btn secondary" data-restore>${te('full_restore')}</button></div>`}</div>` : ''}
      <div class="card"><h3 class="card-h">${te('data')}</h3><p class="small">${te('data_text')}</p>
        <div class="row"><button class="btn secondary" id="expBtn"${dn.length ? '' : ' disabled'}>${te('all_codes_btn')}</button><button class="btn danger" id="wipeBtn"${people().length ? '' : ' disabled'}>${te('delete_all')}</button></div></div>
      <div class="card"><h3 class="card-h">${te('install')}</h3><p class="small">${te('site')} <a href="${SITE}" target="_blank" rel="noopener">${esc(SITE.replace('https://', ''))}</a></p>
        <p class="small">${te('inst_ios')}</p><p class="small">${te('inst_android')}</p>
        <p class="small">${th('inst_windows', { link: `<a href="${RELEASE}" target="_blank" rel="noopener">BetweenUs.exe</a>` })}</p>
        <button class="btn" id="installBtn"${installEvt ? '' : ' hidden'}>${te('install_btn')}</button></div>
      <div class="card"><h3 class="card-h">${te('about')}</h3><p class="small">${te('about_text', { n: E.N, m: E.MODS.length, g: window.GAME.q.length, game: t('game_title') })}</p>
        <p class="small">${te('about_disclaimer')}</p>${legalLinks('small')}</div>`;
    $$('[data-seg]').forEach(sg => sg.onclick = e => {
      const b = e.target.closest('button'); if (!b) return;
      const k = sg.dataset.seg;
      Store.d[k] = k === 'fs' ? +b.dataset.v : b.dataset.v; Store.save(); applyPrefs(); route();
    });
    $('#langPick').onclick = langModal;
    $('#expBtn').onclick = () => shareModal(dn);
    $('#wipeBtn').onclick = () => { if (confirm(t('delete_all_confirm'))) { Store.d.people = []; Store.d.sel = []; cache.clear(); Store.save(); route(); } };
    const ib = $('#installBtn');
    if (ib) ib.onclick = () => { if (!installEvt) return; installEvt.prompt(); installEvt = null; ib.hidden = true; };
  }

  // ───────── routing ─────────
  function route() {
    const h = location.hash.replace(/^#\/?/, '');
    const [a, b, c, d] = h.split('/');
    closeModal(); setExtra(''); keyHandler = null;
    renderNav(a || '');
    switch (a) {
      case '': case undefined: vHome(); break;
      case 'new': vNew(); break;
      case 'take': vTake(b); break;
      case 'next': vNext(b, c); break;
      case 'p': vReport(b, c); break;
      case 'import': vImport(b, c); break;
      case 'compare': vCompare(); break;
      case 'pair': vPair(b, c); break;
      case 'group': vGroup(b || ''); break;
      case 'game': b === 'new' ? vGameNew(c, d) : b === 'play' ? vGamePlay(c) : b === 'res' ? vGameRes(c) : vGameHub(); break;
      case 'g': vGameOpen(b); break;
      case 'theory': vTheory(b); break;
      case 'settings': vSettings(); break;
      case 'buy': vSettings(); if (!full) buyModal(); break; // link from the Windows program and old copies
      default: vHome();
    }
    $('#view').focus({ preventScroll: true });
  }

  // ───────── moving to the main domain ─────────
  // Old copies (GitHub Pages) forward visitors to the main site together with the data saved in this browser:
  // localStorage belongs to the origin, so without this people and games would stay behind.
  // The data travels in the #fragment, which browsers never send to the server.
  const MOVE = window.PSY_MOVE || { from: ['iioverlordii.github.io'], to: 'https://aureliel.store/' };
  const b64u = s => { let b = ''; new TextEncoder().encode(s).forEach(c => { b += String.fromCharCode(c); }); return btoa(b).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); };
  const unb64u = s => new TextDecoder().decode(Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0)));
  async function moveIfOld() {
    if (!MOVE.from.includes(location.hostname)) return false;
    // the main site must answer, otherwise keep working here
    try { await fetch(MOVE.to + 'manifest.webmanifest', { mode: 'no-cors', cache: 'no-store' }); } catch (e) { return false; }
    const d = Store.d, back = location.hash.length > 2 ? '/' + encodeURIComponent(location.hash) : '';
    const data = d.people.length || d.games.length ? b64u(JSON.stringify({ people: d.people, games: d.games, lang: d.lang, theme: d.theme, fs: d.fs })) : '';
    location.replace(MOVE.to + (data ? `#/migrate/${data}${back}` : location.hash));
    return true;
  }
  // #/migrate/<data>[/<original hash>] — merges data carried over from an old copy, then continues to the original page
  function importMigration() {
    const m = /^#\/migrate\/([A-Za-z0-9_-]+)(?:\/(.*))?$/.exec(location.hash);
    if (!m) return -1;
    let added = 0;
    try {
      const x = JSON.parse(unb64u(m[1])), ids = new Set(people().map(p => p.id)), gids = new Set(Store.d.games.map(g => g.id));
      (Array.isArray(x.people) ? x.people : []).forEach(p => {
        if (!p || typeof p.id !== 'string' || ids.has(p.id) || typeof p.name !== 'string' || typeof p.ans !== 'string' || !Array.isArray(p.mods) || !Array.isArray(p.todo)) return;
        p.mods = E.MODS.filter(k => p.mods.includes(k)); p.todo = E.MODS.filter(k => p.todo.includes(k));
        p.k = p.k === 7 ? 7 : 5; p.ans = (p.ans.replace(p.k === 7 ? /[^0-7]/g : /[^0-5]/g, '0') + E.blank()).slice(0, E.N); p.color = (p.color | 0) % COLORS.length; p.pos = p.pos | 0;
        if (p.k === 5 && p.todo.length) { p.ans = E.to7(p.ans); p.k = 7; }
        people().push(p); added++;
      });
      (Array.isArray(x.games) ? x.games : []).forEach(g => {
        if (g && typeof g.id === 'string' && !gids.has(g.id) && Array.isArray(g.ids) && Array.isArray(g.players) && g.players.length === 2 && Array.isArray(g.me)) Store.d.games.push(g);
      });
      if (!Store.d.lang && typeof x.lang === 'string') Store.d.lang = x.lang;
      if (Store.d.theme === 'auto' && ['light', 'dark'].includes(x.theme)) Store.d.theme = x.theme;
      if (Store.d.fs === 16 && [15, 18, 20].includes(x.fs)) Store.d.fs = x.fs;
      Store.save();
    } catch (e) { /* damaged link: just open the app */ }
    let back = '#/';
    try { if (m[2] && decodeURIComponent(m[2]).startsWith('#/')) back = decodeURIComponent(m[2]); } catch (e) { /* keep home */ }
    history.replaceState(null, '', location.pathname + location.search + back);
    return added;
  }

  applyPrefs();
  moveIfOld().then(moved => {
    if (moved) return;
    const added = importMigration();
    applyPrefs();
    return I.init(Store.d.lang, VER).then(loadLicense).then(() => {
      $('#langBtn').onclick = langModal;
      window.addEventListener('hashchange', () => { route(); window.scrollTo(0, 0); });
      route();
      if (added > 0) toast(t('imp_added', { n: added }));
      recheckLicense();
    });
  });

  // offline cache on https; locally only with ?sw=1 so it does not get in the way of development
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.search.includes('sw=1'))) {
    navigator.serviceWorker.register('sw.js').catch(() => { /* offline cache unavailable */ });
  }
})();
