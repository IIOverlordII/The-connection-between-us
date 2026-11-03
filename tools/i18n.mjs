// Translation tooling.
//   node tools/i18n.mjs export          — writes i18n/ru.json: every translatable text from the built-in (Russian) data
//   node tools/i18n.mjs check [lang…]   — validates i18n/<lang>.json against ru.json (all when no lang given)
//   node tools/i18n.mjs build           — check + write app/i18n/<lang>.js for every valid bundle
// Exit code 1 if any bundle has errors.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const JS = path.join(ROOT, 'app', 'js');
const SRC = path.join(ROOT, 'i18n');
const OUT = path.join(ROOT, 'app', 'i18n');
const LANGS = ['en', 'es', 'pt', 'de', 'fr', 'it', 'pl', 'tr', 'ru', 'uk'];

function loadBuiltIn() {
  const ctx = {};
  ctx.window = ctx; ctx.globalThis = ctx;
  vm.createContext(ctx);
  for (const f of ['data.js', 'game-data.js', 'strings.js']) vm.runInContext(fs.readFileSync(path.join(JS, f), 'utf8'), ctx, { filename: f });
  return ctx;
}
const pick = (o, keys) => Object.fromEntries(keys.filter(k => o[k] != null).map(k => [k, o[k]]));
const mapObj = (o, fn) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, fn(v, k)]));
const clone = x => JSON.parse(JSON.stringify(x));

function exportRu() {
  const { PSY: P, GAME: G, UI } = loadBuiltIn();
  return {
    meta: { lang: 'ru', name: 'Русский' },
    ui: clone(UI),
    eng: clone(P.eng),
    psy: {
      answers: P.answers.slice(),
      modules: Object.fromEntries(P.modules.map(m => [m.id, pick(m, ['name', 'sub', 'prompt', 'intro'])])),
      scales: mapObj(P.scales, s => pick(s, ['name', 'hi', 'lo', 'desc', 'how'])),
      items: P.items.map(x => x[2]),
      domains: mapObj(P.domains, d => pick(d, ['name', 'alt', 'hi', 'mid', 'lo'])),
      types: mapObj(P.types, x => pick(x, ['name', 'tag', 'd', 'plus', 'minus'])),
      temperaments: mapObj(P.temperaments, x => pick(x, ['name', 'axis', 'd', 'stress'])),
      attach: mapObj(P.attach, x => pick(x, ['name', 'd', 'tip'])),
      thinking: mapObj(P.thinking, x => pick(x, ['name', 'd'])),
      chrono: clone(P.chrono),
      roles: mapObj(P.roles, x => pick(x, ['name', 'd'])),
      theory: Object.fromEntries(P.theory.map(x => [x.id, pick(x, ['title', 'used', 'text', 'books'])]))
    },
    game: {
      levels: G.levels.slice(),
      cats: Object.fromEntries(G.cats.map(c => [c.id, c.name])),
      q: G.q.map(x => x.slice(1))
    }
  };
}

const holes = s => [...String(s).matchAll(/\{(\w+)\}/g)].map(m => m[1]).sort().join(',');
const isObj = x => x && typeof x === 'object' && !Array.isArray(x);
const PLURAL_KEYS = ['zero', 'one', 'two', 'few', 'many', 'other'];
const isPlural = x => isObj(x) && Object.keys(x).length && Object.keys(x).every(k => PLURAL_KEYS.includes(k));

// Compares a bundle with the reference structure; returns { errors, warnings }.
function check(lang, b, ref) {
  const errors = [], warnings = [];
  const cats = new Intl.PluralRules(lang).resolvedOptions().pluralCategories;
  function walk(r, x, at) {
    if (typeof r === 'string') {
      if (typeof x !== 'string' || !x.trim()) return errors.push(`${at}: missing`);
      if (holes(r) !== holes(x)) errors.push(`${at}: placeholders {${holes(r)}} expected, got {${holes(x)}}`);
      if (lang !== 'ru' && /[Ѐ-ӿ]/.test(x) && !['uk', 'ru'].includes(lang) && !at.startsWith('meta')) warnings.push(`${at}: Cyrillic text left`);
      return;
    }
    if (isPlural(r)) {
      if (!isObj(x)) return errors.push(`${at}: plural object expected`);
      for (const c of cats) if (typeof x[c] !== 'string' || !x[c].trim()) errors.push(`${at}.${c}: plural form missing for ${lang}`);
      const want = holes(r.other || r.many || r.one);
      for (const [c, v] of Object.entries(x)) if (holes(v) !== want) errors.push(`${at}.${c}: placeholders {${want}} expected, got {${holes(v)}}`);
      return;
    }
    if (Array.isArray(r)) {
      if (!Array.isArray(x)) return errors.push(`${at}: array expected`);
      if (x.length !== r.length) errors.push(`${at}: ${r.length} entries expected, got ${x.length}`);
      r.forEach((v, i) => walk(v, x[i], `${at}[${i}]`));
      return;
    }
    if (isObj(r)) {
      if (!isObj(x)) return errors.push(`${at}: object expected`);
      for (const k of Object.keys(r)) walk(r[k], x[k], at ? `${at}.${k}` : k);
      for (const k of Object.keys(x)) if (!(k in r) && at !== 'meta') warnings.push(`${at ? at + '.' : ''}${k}: unknown key`);
    }
  }
  walk(ref, b, '');
  if (b.ui && b.ui.app !== ref.ui.app) errors.push(`ui.app: brand must stay "${ref.ui.app}"`);
  return { errors, warnings };
}

const read = f => JSON.parse(fs.readFileSync(f, 'utf8'));
const [cmd, ...args] = process.argv.slice(2);
const ref = exportRu();

if (cmd === 'export') {
  fs.mkdirSync(SRC, { recursive: true });
  fs.writeFileSync(path.join(SRC, 'ru.json'), JSON.stringify(ref, null, 2) + '\n');
  const words = JSON.stringify(ref).split(/\s+/).length;
  console.log(`i18n/ru.json written (~${words} words)`);
} else if (cmd === 'check' || cmd === 'build') {
  const langs = args.length ? args : LANGS.filter(l => l !== 'ru' && fs.existsSync(path.join(SRC, l + '.json')));
  let bad = 0;
  if (cmd === 'build') fs.mkdirSync(OUT, { recursive: true });
  for (const lang of langs) {
    const file = path.join(SRC, lang + '.json');
    if (!fs.existsSync(file)) { console.log(`${lang}: no file`); bad++; continue; }
    let b;
    try { b = read(file); } catch (e) { console.log(`${lang}: invalid JSON — ${e.message}`); bad++; continue; }
    const { errors, warnings } = check(lang, b, ref);
    console.log(`${lang}: ${errors.length} error(s), ${warnings.length} warning(s)`);
    errors.slice(0, 40).forEach(e => console.log('  ✗ ' + e));
    if (errors.length > 40) console.log(`  … and ${errors.length - 40} more`);
    warnings.slice(0, 10).forEach(w => console.log('  · ' + w));
    if (errors.length) { bad++; continue; }
    if (cmd === 'build') {
      delete b.meta;
      fs.writeFileSync(path.join(OUT, lang + '.js'), `// Generated from i18n/${lang}.json by tools/i18n.mjs — do not edit.\n(window.I18N = window.I18N || {})[${JSON.stringify(lang)}] = ${JSON.stringify(b)};\n`);
    }
  }
  process.exit(bad ? 1 : 0);
} else {
  console.log('usage: node tools/i18n.mjs export | check [lang…] | build');
  process.exit(2);
}
