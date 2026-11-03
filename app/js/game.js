// «Кто лучше знает партнёра»: question selection, share codes and scoring. Pure functions, no DOM.
(function (root) {
  'use strict';
  const G = root.GAME, E = root.Engine;
  const FORMAT = 0x47; // 'G' — distinct from profile codes (format 1)
  const NAME_MAX = 40; // bytes of UTF-8
  const Q = G.q;
  const CAT_IDS = G.cats.map(c => c.id);
  const byCat = {};
  Q.forEach((q, i) => { (byCat[q[0]] = byCat[q[0]] || []).push(i); });
  const opts = id => Q[id].slice(2);

  function shuffle(a) {
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); const t = a[i]; a[i] = a[j]; a[j] = t; }
    return a;
  }
  // n random questions spread evenly over the chosen categories; avoids `used` ids while possible
  function pick(n, cats, used) {
    cats = (cats && cats.length ? cats : CAT_IDS).filter(c => byCat[c]);
    const seen = new Set(used || []);
    const fresh = cats.map(c => shuffle(byCat[c].filter(i => !seen.has(i))));
    const stale = cats.map(c => shuffle(byCat[c].filter(i => seen.has(i))));
    const out = [];
    for (const pool of [fresh, stale]) {
      let progress = true;
      while (out.length < n && progress) {
        progress = false;
        for (const list of shuffle(pool.slice())) {
          if (out.length >= n) break;
          if (list.length) { out.push(list.pop()); progress = true; }
        }
      }
    }
    return shuffle(out);
  }

  // ─── share code: [format, n, ids (2 bytes each), then per player: name length, name, answered flag, answers (4 bits each)] ───
  const enc = typeof TextEncoder !== 'undefined' ? new TextEncoder() : null;
  const dec = typeof TextDecoder !== 'undefined' ? new TextDecoder() : null;
  function nameBytes(s) {
    let b = Array.from(enc.encode(String(s || '').trim()));
    while (b.length > NAME_MAX) { s = Array.from(String(s).trim()).slice(0, -1).join(''); b = Array.from(enc.encode(s)); }
    return b;
  }
  const complete = ans => Array.isArray(ans) && ans.every(x => x && x[0] >= 0 && x[1] >= 0);

  // game: { ids: [..], players: [{ name, ans: [[own, guess], ...] | null }, { … }] }
  function encode(game) {
    const n = game.ids.length;
    const bytes = [FORMAT, n];
    game.ids.forEach(id => { bytes.push((id >> 8) & 255, id & 255); });
    game.players.forEach(p => {
      const nb = nameBytes(p.name);
      bytes.push(nb.length, ...nb);
      const ok = complete(p.ans);
      bytes.push(ok ? 1 : 0);
      if (!ok) return;
      for (let i = 0; i < n; i += 2) {
        const a = p.ans[i], b = p.ans[i + 1] || [0, 0];
        bytes.push(((a[0] & 3) << 6) | ((a[1] & 3) << 4) | ((b[0] & 3) << 2) | (b[1] & 3));
      }
    });
    return E.pack(bytes);
  }
  function decode(code) {
    const b = E.unpack(code);
    if (!b || b[0] !== FORMAT) return null;
    const n = b[1];
    let p = 2;
    if (!n || b.length < p + n * 2) return null;
    const ids = [];
    for (let i = 0; i < n; i++, p += 2) ids.push((b[p] << 8) | b[p + 1]);
    if (ids.some(id => !Q[id])) return null; // made by a newer version with more questions
    const players = [];
    for (let k = 0; k < 2; k++) {
      const len = b[p++];
      if (len == null || p + len > b.length) return null;
      const name = dec.decode(new Uint8Array(b.slice(p, p + len)));
      p += len;
      const has = b[p++];
      let ans = null;
      if (has === 1) {
        ans = [];
        for (let i = 0; i < n; i += 2) {
          const v = b[p++];
          if (v == null) return null;
          ans.push([(v >> 6) & 3, (v >> 4) & 3]);
          if (i + 1 < n) ans.push([(v >> 2) & 3, v & 3]);
        }
        // option index must exist for that question
        if (ans.some((x, i) => x[0] >= opts(ids[i]).length || x[1] >= opts(ids[i]).length)) return null;
      } else if (has !== 0) return null;
      players.push({ name, ans });
    }
    return { ids, players };
  }

  // ─── scoring ───
  function score(game) {
    const [A, B] = game.players, n = game.ids.length;
    const know = [0, 0];
    let same = 0;
    const cats = {};
    const items = game.ids.map((id, i) => {
      const a = A.ans[i], b = B.ans[i];
      const ok0 = a[1] === b[0], ok1 = b[1] === a[0], eq = a[0] === b[0];
      if (ok0) know[0]++;
      if (ok1) know[1]++;
      if (eq) same++;
      const c = Q[id][0];
      const cs = cats[c] || (cats[c] = { n: 0, k0: 0, k1: 0, eq: 0 });
      cs.n++; cs.k0 += ok0; cs.k1 += ok1; cs.eq += eq;
      return { id, cat: c, own: [a[0], b[0]], guess: [a[1], b[1]], ok: [ok0, ok1], eq };
    });
    const pct = v => Math.round(v / n * 100);
    const kp = [pct(know[0]), pct(know[1])];
    return {
      n, know, kp, same, sp: pct(same), items,
      cats: CAT_IDS.filter(c => cats[c]).map(c => Object.assign({ id: c }, cats[c])),
      winner: Math.abs(know[0] - know[1]) <= Math.max(1, Math.round(n * 0.05)) ? -1 : know[0] > know[1] ? 0 : 1,
      // both missed — the best conversation starters
      talk: items.filter(x => !x.ok[0] && !x.ok[1])
    };
  }
  const level = p => G.levels[p >= 85 ? 0 : p >= 70 ? 1 : p >= 55 ? 2 : p >= 40 ? 3 : 4];

  root.Game = { FORMAT, Q, CAT_IDS, byCat, opts, pick, encode, decode, score, complete, level };
})(typeof window !== 'undefined' ? window : globalThis);
