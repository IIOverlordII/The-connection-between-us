// Language runtime: picks the language, loads its bundle (i18n/<lang>.js) and overlays it onto PSY, GAME and UI.
// Built-in texts are Russian; for any other language the English bundle is applied first as a fallback.
(function (root) {
  'use strict';
  const LANGS = [['en', 'English'], ['es', 'Español'], ['pt', 'Português'], ['de', 'Deutsch'], ['fr', 'Français'],
    ['it', 'Italiano'], ['pl', 'Polski'], ['tr', 'Türkçe'], ['ru', 'Русский'], ['uk', 'Українська']];
  const SOURCE = 'ru', FALLBACK = 'en';
  const has = c => LANGS.some(l => l[0] === c);
  let lang = SOURCE, plural = null;

  function detect(saved) {
    if (has(saved)) return saved;
    const list = (root.navigator && (navigator.languages || [navigator.language])) || [];
    for (const x of list) { const c = String(x || '').toLowerCase().split('-')[0]; if (has(c)) return c; }
    return FALLBACK;
  }

  function load(code, ver) {
    root.I18N = root.I18N || {};
    if (root.I18N[code]) return Promise.resolve(root.I18N[code]);
    return new Promise(resolve => {
      const s = document.createElement('script');
      s.src = `i18n/${code}.js${ver ? '?v=' + ver : ''}`;
      s.onload = () => resolve(root.I18N[code] || null);
      s.onerror = () => resolve(null); // offline and not cached yet: stay on built-in texts
      document.head.appendChild(s);
    });
  }

  const isObj = x => x && typeof x === 'object' && !Array.isArray(x);
  function merge(dst, src) {
    Object.keys(src).forEach(k => {
      if (isObj(src[k]) && isObj(dst[k])) merge(dst[k], src[k]);
      else if (src[k] != null) dst[k] = src[k];
    });
  }
  const byId = (arr, map, fn) => arr.forEach(x => { if (map[x.id]) fn(x, map[x.id]); });

  // Writes a bundle's texts into the live data objects; ids, keys, option order and counts never change.
  function apply(b) {
    if (!b) return;
    const P = root.PSY, G = root.GAME;
    if (b.ui) merge(root.UI, b.ui);
    if (b.eng) merge(P.eng, b.eng);
    const p = b.psy || {};
    if (Array.isArray(p.answers) && p.answers.length === P.answers.length) P.answers = p.answers.slice();
    if (p.modules) byId(P.modules, p.modules, (m, t) => merge(m, t));
    if (p.theory) byId(P.theory, p.theory, (m, t) => merge(m, t));
    ['scales', 'domains', 'types', 'temperaments', 'attach', 'thinking', 'chrono', 'roles'].forEach(k => {
      if (p[k]) Object.keys(p[k]).forEach(id => { if (P[k][id]) merge(P[k][id], p[k][id]); });
    });
    if (Array.isArray(p.items)) p.items.forEach((s, i) => { if (s && P.items[i]) P.items[i][2] = s; });
    const g = b.game || {};
    if (Array.isArray(g.levels) && g.levels.length === G.levels.length) G.levels = g.levels.slice();
    if (g.cats) G.cats.forEach(c => { if (g.cats[c.id]) c.name = g.cats[c.id]; });
    if (Array.isArray(g.q)) g.q.forEach((x, i) => {
      if (Array.isArray(x) && G.q[i] && x.length === G.q[i].length - 1) G.q[i].splice(1, x.length, ...x);
    });
  }

  async function init(saved, ver) {
    lang = detect(saved);
    if (lang !== SOURCE) {
      const fb = await load(FALLBACK, ver);
      if (fb) apply(fb);
      const own = lang === FALLBACK ? fb : await load(lang, ver);
      if (own && lang !== FALLBACK) apply(own);
      if (!own) lang = fb ? FALLBACK : SOURCE; // bundle unavailable: report the language actually shown
    }
    plural = typeof Intl !== 'undefined' && Intl.PluralRules ? new Intl.PluralRules(lang) : null;
    if (root.document) document.documentElement.lang = lang;
    return lang;
  }

  const fill = (s, v) => String(s).replace(/\{(\w+)\}/g, (m, k) => (v && v[k] != null ? v[k] : m));
  // plain text: callers escape the result before putting it into HTML
  function t(key, vars) {
    const s = root.UI[key];
    return s == null ? key : fill(typeof s === 'object' ? (s.other || s.many || s.one) : s, vars);
  }
  function tp(key, n, vars) {
    const s = root.UI[key];
    if (s == null) return key;
    const form = typeof s === 'object' ? (s[plural ? plural.select(n) : 'other'] || s.other || s.many || s.one) : s;
    return fill(form, Object.assign({ n }, vars));
  }

  root.I18n = { LANGS, SOURCE, FALLBACK, init, apply, detect, t, tp, fill, lang: () => lang };
})(typeof window !== 'undefined' ? window : globalThis);
