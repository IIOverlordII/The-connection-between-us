// node --test test/engine.test.js test/game.test.js
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');

global.window = globalThis;
require(path.join(__dirname, '..', 'app', 'js', 'data.js'));
require(path.join(__dirname, '..', 'app', 'js', 'engine.js'));
const { Engine, PSY } = globalThis;
const ALL = Engine.MODS;

// deterministic pseudo-random answers
function rng(seed) { return () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; }; }
function randomAns(seed, mods = ALL, k = 7) {
  const r = rng(seed), a = [];
  for (let i = 0; i < Engine.N; i++) a.push(mods.includes(PSY.scales[PSY.items[i][0]].mod) ? String(1 + Math.floor(r() * k)) : '0');
  return a.join('');
}
// answers that push every scale to its maximum (or minimum) on the keyed direction
function extremeAns(hi, k = 7) {
  return PSY.items.map(it => String((it[1] > 0) === hi ? k : 1)).join('');
}

test('every item points to a known scale and module', () => {
  PSY.items.forEach(([s, k, t], i) => {
    assert.ok(PSY.scales[s], `item ${i}: unknown scale ${s}`);
    assert.ok(k === 1 || k === -1, `item ${i}: bad key`);
    assert.ok(t.length > 5, `item ${i}: empty text`);
  });
  assert.strictEqual(Engine.N, 130);
  assert.ok(Engine.N < 256, 'item count must fit one byte of the share code');
});

test('sequence covers each selected item exactly once', () => {
  const seq = Engine.sequence(ALL).filter(x => x.i != null).map(x => x.i).sort((a, b) => a - b);
  assert.deepStrictEqual(seq, PSY.items.map((_, i) => i));
  const quick = Engine.sequence(['char', 'att']);
  assert.strictEqual(quick.filter(x => x.intro).length, 2);
  assert.strictEqual(quick.filter(x => x.i != null).length, Engine.modCount.char + Engine.modCount.att);
});

test('share code round-trips answers and modules', () => {
  for (let s = 1; s < 40; s++) {
    const mods = ALL.filter((m, i) => m === 'char' || (s >> i) & 1);
    const ans = randomAns(s, mods);
    const code = Engine.encode(mods, ans);
    assert.match(code, /^[A-Za-z0-9_-]+$/);
    const back = Engine.decode(code);
    assert.ok(back, 'decode failed');
    assert.deepStrictEqual(back.mods, mods);
    assert.strictEqual(back.ans, ans);
    assert.strictEqual(back.k, 7);
  }
});

test('corrupted code is rejected', () => {
  const code = Engine.encode(ALL, randomAns(7));
  const bad = code.slice(0, 10) + (code[10] === 'A' ? 'B' : 'A') + code.slice(11);
  assert.strictEqual(Engine.decode(bad), null);
  assert.strictEqual(Engine.decode('hello world'), null);
  assert.strictEqual(Engine.decode(''), null);
});

test('scales hit 0 and 100 at the extremes, reversed items are reversed', () => {
  const hi = Engine.profile(extremeAns(true), ALL), lo = Engine.profile(extremeAns(false), ALL);
  Object.keys(PSY.scales).forEach(id => {
    assert.strictEqual(hi.s[id], 100, id);
    assert.strictEqual(lo.s[id], 0, id);
  });
  assert.strictEqual(hi.type.code, 'ENFJ'); // high E, O, A, C
  assert.strictEqual(lo.type.code, 'ISTP');
  assert.strictEqual(hi.att.id, 'fea');
  assert.strictEqual(lo.att.id, 'sec');
});

test('profile has every derived block for a full answer set', () => {
  const P = Engine.profile(randomAns(3), ALL);
  ['dom', 'type', 'temp', 'att', 'val', 'mor', 'mind', 'conf', 'care', 'roles'].forEach(k => assert.ok(P[k], k));
  assert.ok(PSY.types[P.type.code], P.type.code);
  assert.ok(PSY.temperaments[P.temp.id] && PSY.temperaments[P.temp.alt]);
  assert.notStrictEqual(P.temp.id, P.temp.alt);
  assert.strictEqual(P.val.top.length, 3);
  assert.strictEqual(P.care.rank.length, 5);
  assert.strictEqual(P.roles.length, Object.keys(PSY.roles).length);
});

test('missing items: scale needs at least half answered', () => {
  const ans = Engine.blank().split('');
  const idx = Engine.byScale.vol;
  ans[idx[0]] = '7'; ans[idx[1]] = '1';
  let P = Engine.profile(ans.join(''), ['char']);
  assert.strictEqual(P.s.vol, 100);
  ans[idx[1]] = '0';
  P = Engine.profile(ans.join(''), ['char']);
  assert.strictEqual(P.s.vol, null);
});

test('pair: identical people are maximally similar; numbers stay in range', () => {
  const ans = randomAns(11);
  const A = { name: 'Аня', P: Engine.profile(ans, ALL) }, B = { name: 'Борис', P: Engine.profile(ans, ALL) };
  ['love', 'friends', 'work'].forEach(ctx => {
    const r = Engine.pair(A, B, ctx);
    assert.ok(r.sim >= 95, `sim ${r.sim}`);
    assert.ok(r.compat >= 3 && r.compat <= 98);
    assert.ok(r.parts.length >= 6);
    r.plus.concat(r.minus, r.tips).forEach(s => assert.ok(!/undefined|NaN|null/.test(s), s));
  });
});

test('pair: random pairs average near the middle, opposites score low on similarity', () => {
  let sum = 0, n = 0;
  for (let s = 1; s <= 60; s++) {
    const A = { name: 'A', P: Engine.profile(randomAns(s * 2), ALL) }, B = { name: 'B', P: Engine.profile(randomAns(s * 2 + 1), ALL) };
    const r = Engine.pair(A, B, 'love');
    sum += r.sim; n++;
    r.plus.concat(r.minus, r.tips).forEach(t => assert.ok(!/undefined|NaN|null/.test(t), t));
  }
  const avg = sum / n;
  assert.ok(avg > 25 && avg < 75, `random-pair similarity avg ${avg}`);
  const H = { name: 'H', P: Engine.profile(extremeAns(true), ALL) }, L = { name: 'L', P: Engine.profile(extremeAns(false), ALL) };
  assert.ok(Engine.pair(H, L, 'friends').sim < 20);
});

test('pair works with partial modules', () => {
  const A = { name: 'A', P: Engine.profile(randomAns(5, ['char']), ['char']) };
  const B = { name: 'B', P: Engine.profile(randomAns(6), ALL) };
  const r = Engine.pair(A, B, 'love');
  assert.ok(r.parts.every(p => ['char', 'assets', 'dom'].includes(p.id)), r.parts.map(p => p.id).join());
  assert.ok(Number.isFinite(r.compat) && Number.isFinite(r.sim));
});

test('group report', () => {
  const list = [1, 2, 3, 4, 5].map(s => ({ name: 'P' + s, P: Engine.profile(randomAns(s * 13), ALL) }));
  const g = Engine.group(list, 'work');
  assert.strictEqual(g.pairs.length, 10);
  assert.ok(g.pairs[0].compat >= g.pairs[9].compat);
  assert.strictEqual(g.M[1][3], g.M[3][1]);
  assert.strictEqual(g.roles.length, Object.keys(PSY.roles).length);
});

test('old 5-point profiles: format 1 codes still decode and score on their own scale', () => {
  const ans = randomAns(21, ALL, 5);
  const code = Engine.encode(ALL, ans, 5);
  const back = Engine.decode(code);
  assert.strictEqual(back.k, 5);
  assert.strictEqual(back.ans, ans);
  const hi = Engine.profile(extremeAns(true, 5), ALL, 5), lo = Engine.profile(extremeAns(false, 5), ALL, 5);
  Object.keys(PSY.scales).forEach(id => { assert.strictEqual(hi.s[id], 100, id); assert.strictEqual(lo.s[id], 0, id); });
  // the same opinion on both scales lands on the same score
  const mid5 = Engine.profile('3'.repeat(Engine.N), ALL, 5), mid7 = Engine.profile('4'.repeat(Engine.N), ALL, 7);
  Object.keys(PSY.scales).forEach(id => assert.strictEqual(mid5.s[id], mid7.s[id], id));
});

test('to7 maps unfinished 5-point answers onto the 7-point labels', () => {
  assert.strictEqual(Engine.to7('012345'), '013457');
  const a5 = randomAns(3, ALL, 5);
  const p5 = Engine.profile(a5, ALL, 5), p7 = Engine.profile(Engine.to7(a5), ALL, 7);
  Object.keys(PSY.scales).forEach(id => { if (p5.s[id] != null) assert.ok(Math.abs(p5.s[id] - p7.s[id]) < 9, id); });
});
