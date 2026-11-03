// node --test test/i18n.test.js — runs every built bundle (app/i18n/<lang>.js) through the real engine
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const JS = path.join(__dirname, '..', 'app', 'js');
const OUT = path.join(__dirname, '..', 'app', 'i18n');
const langs = fs.existsSync(OUT) ? fs.readdirSync(OUT).filter(f => /^[a-z]{2}\.js$/.test(f)).map(f => f.slice(0, 2)) : [];

function world(lang) {
  const ctx = { console, Intl };
  ctx.window = ctx; ctx.globalThis = ctx;
  vm.createContext(ctx);
  for (const f of ['data.js', 'engine.js', 'game-data.js', 'game.js', 'strings.js', 'i18n.js']) vm.runInContext(fs.readFileSync(path.join(JS, f), 'utf8'), ctx);
  for (const l of lang === 'en' ? ['en'] : ['en', lang]) {
    vm.runInContext(fs.readFileSync(path.join(OUT, l + '.js'), 'utf8'), ctx);
    ctx.I18n.apply(ctx.I18N[l]);
  }
  return ctx;
}
function rng(seed) { return () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; }; }
function answers(W, seed) {
  const r = rng(seed), lat = {};
  Object.keys(W.PSY.scales).forEach(s => { const n = W.PSY.scales[s].norm; lat[s] = Math.min(100, Math.max(0, (n ? n[0] : 60) + (r() + r() + r() - 1.5) * 50)); });
  return W.PSY.items.map(([s, k]) => { const v = Math.round(Math.min(5, Math.max(1, 1 + lat[s] / 25 + (r() - .5)))); return String(k > 0 ? v : 6 - v); }).join('');
}
const CYR = /[Ѐ-ӿ]/;

// English is the fallback for every other language, so once any bundle exists it must be there too
test('English bundle is present whenever translations exist', { skip: !langs.length && 'no bundles built yet' }, () => {
  assert.ok(langs.includes('en'), 'app/i18n/en.js missing — run python tools/build.py');
});

for (const lang of langs) {
  test(`${lang}: engine texts are fully translated and filled`, () => {
    const W = world(lang);
    const texts = [];
    for (let s = 1; s <= 40; s++) for (const ctx of ['love', 'friends', 'work']) {
      const A = { name: 'Anna', P: W.Engine.profile(answers(W, s * 2), W.Engine.MODS) };
      const B = { name: 'Ben', P: W.Engine.profile(answers(W, s * 2 + 1), W.Engine.MODS) };
      const r = W.Engine.pair(A, B, ctx);
      texts.push(r.label, ...r.parts.map(p => p.name + ' ' + p.hint), ...r.plus, ...r.minus, ...r.tips);
    }
    const list = [1, 2, 3, 4, 5].map(s => ({ name: 'P' + s, P: W.Engine.profile(answers(W, s * 7), W.Engine.MODS) }));
    texts.push(...W.Engine.group(list, 'work').notes);
    for (const x of texts) {
      assert.ok(!/\{[a-z]+\}/i.test(x), `unfilled placeholder: ${x}`);
      if (lang !== 'uk') assert.ok(!CYR.test(x), `Cyrillic left: ${x}`);
    }
  });

  test(`${lang}: questionnaire, results and game are overlaid`, () => {
    const W = world(lang), R = world('en');
    const ru = (() => { const c = { console }; c.window = c; vm.createContext(c);
      ['data.js', 'game-data.js', 'strings.js'].forEach(f => vm.runInContext(fs.readFileSync(path.join(JS, f), 'utf8'), c)); return c; })();
    W.PSY.items.forEach((it, i) => assert.notStrictEqual(it[2], ru.PSY.items[i][2], `item ${i} still Russian`));
    W.GAME.q.forEach((q, i) => {
      assert.strictEqual(q.length, ru.GAME.q[i].length, `game q${i}: option count changed`);
      assert.strictEqual(q[0], ru.GAME.q[i][0], `game q${i}: category changed`);
    });
    Object.keys(ru.UI).forEach(k => assert.ok(W.UI[k] != null, `ui.${k} missing`));
    if (lang !== 'en') assert.notStrictEqual(W.UI.home_sub, R.UI.home_sub, 'ui looks untranslated (same as English)');
    assert.strictEqual(W.UI.app, 'Between Us');
  });
}
