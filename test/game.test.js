// node --test test/game.test.js
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');

global.window = globalThis;
['data.js', 'engine.js', 'game-data.js', 'game.js'].forEach(f => require(path.join(__dirname, '..', 'app', 'js', f)));
const { Game, GAME, Engine } = globalThis;

const randAns = (ids, seed) => ids.map((id, i) => {
  const k = Game.opts(id).length;
  return [(seed * 7 + i * 3) % k, (seed * 5 + i) % k];
});

test('content: valid categories, 2–4 options, no duplicates, several hundred questions', () => {
  const cats = new Set(GAME.cats.map(c => c.id));
  const seen = new Set();
  GAME.q.forEach((q, i) => {
    assert.ok(cats.has(q[0]), `q${i}: unknown category ${q[0]}`);
    const o = q.slice(2);
    assert.ok(o.length >= 2 && o.length <= 4, `q${i}: ${o.length} options`);
    assert.strictEqual(new Set(o).size, o.length, `q${i}: duplicate options`);
    o.forEach(x => assert.ok(x.length > 0 && x.length <= 40, `q${i}: option length "${x}"`));
    const key = q[1] + '|' + o.join('|');
    assert.ok(!seen.has(key), `q${i}: duplicate question`);
    seen.add(key);
  });
  assert.ok(GAME.q.length >= 300, `only ${GAME.q.length} questions`);
  GAME.cats.forEach(c => assert.ok(Game.byCat[c.id] && Game.byCat[c.id].length >= 20, c.id));
});

test('pick: unique ids, honours categories, spreads evenly, avoids used ones', () => {
  const ids = Game.pick(24, ['love', 'money', 'food']);
  assert.strictEqual(new Set(ids).size, 24);
  const per = {};
  ids.forEach(id => { per[GAME.q[id][0]] = (per[GAME.q[id][0]] || 0) + 1; });
  assert.deepStrictEqual(Object.keys(per).sort(), ['food', 'love', 'money']);
  Object.values(per).forEach(v => assert.strictEqual(v, 8));
  const used = Game.byCat.love.slice(0, 20);
  const next = Game.pick(5, ['love'], used);
  assert.ok(next.every(id => !used.includes(id)), 'reused a played question while fresh ones remain');
  assert.strictEqual(Game.pick(40, ['love'], Game.byCat.love).length, Game.byCat.love.length, 'falls back to played ones');
});

test('code round-trip: invitation and finished game, Cyrillic names, odd length', () => {
  [10, 15, 20, 30].forEach(n => {
    const ids = Game.pick(n);
    const inv = { ids, players: [{ name: 'Аня', ans: randAns(ids, 1) }, { name: 'Борис', ans: null }] };
    const code = Game.encode(inv);
    assert.match(code, /^[A-Za-z0-9_-]+$/);
    assert.deepStrictEqual(Game.decode(code), inv);
    const fin = { ids, players: [inv.players[0], { name: 'Борис', ans: randAns(ids, 2) }] };
    assert.deepStrictEqual(Game.decode(Game.encode(fin)), fin);
  });
});

test('long names are trimmed to fit, damaged or foreign codes are rejected', () => {
  const ids = Game.pick(10);
  const g = { ids, players: [{ name: 'Александра-Виктория Константиновна', ans: randAns(ids, 3) }, { name: '', ans: null }] };
  const back = Game.decode(Game.encode(g));
  assert.ok(back.players[0].name.length > 5 && 'Александра-Виктория Константиновна'.startsWith(back.players[0].name));
  const code = Game.encode(g);
  assert.strictEqual(Game.decode(code.slice(0, 12) + (code[12] === 'A' ? 'B' : 'A') + code.slice(13)), null);
  const profile = Engine.encode(Engine.MODS, '3'.repeat(Engine.N));
  assert.strictEqual(Game.decode(profile), null, 'profile code must not parse as a game');
  assert.strictEqual(Engine.decode(code), null, 'game code must not parse as a profile');
});

test('score: guesses, matches, winner and conversation topics', () => {
  const ids = Game.pick(10);
  const own0 = ids.map(() => 0), own1 = ids.map((_, i) => (i < 6 ? 0 : 1));
  const g = {
    ids,
    players: [
      { name: 'A', ans: ids.map((_, i) => [own0[i], own1[i]]) },           // A guesses B perfectly
      { name: 'B', ans: ids.map((_, i) => [own1[i], i < 3 ? 0 : 1]) }       // B guesses A right 3 times
    ]
  };
  const s = Game.score(g);
  assert.deepStrictEqual(s.know, [10, 3]);
  assert.deepStrictEqual(s.kp, [100, 30]);
  assert.strictEqual(s.same, 6);
  assert.strictEqual(s.winner, 0);
  assert.strictEqual(s.talk.length, 0);
  assert.strictEqual(s.cats.reduce((x, c) => x + c.n, 0), 10);
  g.players[1].ans = ids.map((_, i) => [own1[i], 0]);
  assert.strictEqual(Game.score({ ids, players: [{ name: 'A', ans: ids.map((_, i) => [0, own1[i]]) }, g.players[1]] }).winner, -1, 'equal knowledge is a draw');
});
