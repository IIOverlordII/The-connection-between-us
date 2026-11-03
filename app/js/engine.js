// Scoring, type derivation, share-code encoding and compatibility. Pure functions, no DOM.
(function (root) {
  'use strict';
  const D = root.PSY;
  const N = D.items.length;
  const MODS = D.modules.map(m => m.id);
  const S = D.scales;
  const FORMAT = 1;

  // ─── indexes (built once) ───
  const byScale = {}, modScales = {};
  D.items.forEach((it, i) => { (byScale[it[0]] = byScale[it[0]] || []).push(i); });
  Object.keys(S).forEach(id => { (modScales[S[id].mod] = modScales[S[id].mod] || []).push(id); });
  const modCount = {};
  MODS.forEach(m => { modCount[m] = modScales[m].reduce((n, s) => n + byScale[s].length, 0); });

  const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
  const mean = a => { let s = 0, n = 0; for (const v of a) if (v != null) { s += v; n++; } return n ? s / n : null; };
  // standard normal CDF (Abramowitz–Stegun 7.1.26)
  function Phi(z) {
    const t = 1 / (1 + 0.3275911 * Math.abs(z) / Math.SQRT2);
    const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-z * z / 2);
    return z >= 0 ? (1 + y) / 2 : (1 - y) / 2;
  }
  const blank = () => '0'.repeat(N);

  // Presentation order: intro card per module, then items round-robin across the module's scales.
  function sequence(mods) {
    const seq = [];
    MODS.forEach(m => {
      if (!mods.includes(m)) return;
      seq.push({ intro: m });
      const lists = modScales[m].map(s => byScale[s]);
      const max = Math.max.apply(null, lists.map(l => l.length));
      for (let k = 0; k < max; k++) lists.forEach(l => { if (k < l.length) seq.push({ i: l[k], mod: m }); });
    });
    return seq;
  }

  function scaleScore(ans, id) {
    const idx = byScale[id];
    let sum = 0, n = 0;
    for (let k = 0; k < idx.length; k++) {
      const i = idx[k], v = ans.charCodeAt(i) - 48;
      if (v >= 1 && v <= 5) { sum += D.items[i][1] > 0 ? v : 6 - v; n++; }
    }
    return n * 2 >= idx.length ? (sum / n - 1) * 25 : null; // 0–100, needs at least half of the items
  }

  // ─── individual profile ───
  function profile(ans, mods) {
    const has = m => mods.includes(m);
    const s = {}, z = {}, pct = {};
    mods.forEach(m => (modScales[m] || []).forEach(id => {
      const v = scaleScore(ans, id);
      s[id] = v;
      const nm = S[id].norm;
      if (v != null && nm) { z[id] = (v - nm[0]) / nm[1]; pct[id] = Phi(z[id]) * 100; }
    }));
    const P = { mods: mods.slice(), s, z, pct, has };
    const zz = id => z[id] != null ? z[id] : 0;
    const pp = id => pct[id] != null ? pct[id] : 50;

    if (has('char')) {
      P.dom = {};
      Object.keys(D.domains).forEach(k => {
        const [a, b] = D.domains[k].asp;
        // aspects correlate ~.5, so the mean of two z-scores has sd ≈ .866
        const dz = (zz(a) + zz(b)) / 2 / 0.866;
        P.dom[k] = { z: dz, pct: Phi(dz) * 100 };
      });
      P.dom.H = { z: zz('hon'), pct: pp('hon') };
      const L = [['E', 'I', 'E'], ['N', 'S', 'O'], ['F', 'T', 'A'], ['J', 'P', 'C']];
      const letters = L.map(([a, b, d]) => { const p = P.dom[d].pct; return p >= 50 ? { l: a, o: b, p } : { l: b, o: a, p: 100 - p }; });
      P.type = { code: letters.map(x => x.l).join(''), letters };
      const x = P.dom.E.z, y = P.dom.N.z;
      const q = (xx, yy) => xx >= 0 ? (yy >= 0 ? 'chol' : 'sang') : (yy >= 0 ? 'mel' : 'phl');
      const alt = Math.abs(x) < Math.abs(y) ? q(-x || -0.01, y) : q(x, -y || -0.01);
      P.temp = { id: q(x, y), alt, x, y, mixed: Math.hypot(x, y) < 0.45 };
    }
    if (has('att') && s.anx != null && s.avo != null) {
      const hiA = s.anx >= 55, hiV = s.avo >= 45;
      P.att = { id: hiA ? (hiV ? 'fea' : 'anx') : (hiV ? 'avo' : 'sec'), anx: s.anx, avo: s.avo };
    }
    if (has('val')) {
      const ids = modScales.val, m = mean(ids.map(id => s[id]));
      const c = {};
      ids.forEach(id => { c[id] = s[id] != null ? s[id] - m : null; });
      const ho = {
        open: mean([c.sd, c.st]), cons: mean([c.se, c.co, c.tr]),
        self: mean([c.ac, c.po]), trans: mean([c.be, c.un])
      };
      P.val = { c, ho, top: ids.filter(id => c[id] != null).sort((a, b) => c[b] - c[a]).slice(0, 3) };
    }
    if (has('mor')) {
      P.mor = { ind: mean([s.care, s.fair]), bind: mean([s.loy, s.auth, s.pur]), lib: s.lib };
    }
    if (has('mind')) {
      const a = zz('ana') >= 0, b = zz('intu') >= 0;
      P.mind = {
        think: a && b ? 'uni' : a ? 'ana' : b ? 'intu' : 'prag',
        chrono: s.morn == null ? null : s.morn >= 62 ? 'lark' : s.morn <= 38 ? 'owl' : 'dove',
        sens: pp('sens') >= 70
      };
    }
    if (has('conf')) {
      const st = ['cmp', 'col', 'cpr', 'avd', 'acc'].filter(id => z[id] != null).sort((a, b) => z[b] - z[a]);
      P.conf = { top: st, hrs: s.hrs, risk: s.hrs == null ? null : s.hrs >= 50 ? 'high' : s.hrs >= 35 ? 'mid' : 'low' };
    }
    if (has('care')) {
      P.care = { rank: modScales.care.filter(id => s[id] != null).sort((a, b) => s[b] - s[a]) };
    }
    if (has('char')) {
      P.roles = Object.keys(D.roles).map(id => {
        const f = D.roles[id].f.map(k => {
          const neg = k[0] === '-', key = neg ? k.slice(1) : k;
          if (pct[key] == null) return null;
          return neg ? 100 - pct[key] : pct[key];
        });
        return { id, v: mean(f) };
      }).sort((a, b) => b.v - a.v);
    }
    return P;
  }

  // ─── share code: [format, item count, module mask, 3-bit answers…, checksum] → base64url ───
  const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
  function encode(mods, ans) {
    let mask = 0;
    mods.forEach(m => { const i = MODS.indexOf(m); if (i >= 0) mask |= 1 << i; });
    const bytes = [FORMAT, N, mask];
    let acc = 0, bits = 0;
    for (let i = 0; i < N; i++) {
      const v = ans.charCodeAt(i) - 48;
      acc = (acc << 3) | (v >= 1 && v <= 5 ? v : 0); bits += 3;
      while (bits >= 8) { bits -= 8; bytes.push((acc >> bits) & 255); }
      acc &= (1 << bits) - 1;
    }
    if (bits) bytes.push((acc << (8 - bits)) & 255);
    let ck = 0;
    bytes.forEach(b => { ck = (ck * 31 + b) & 255; });
    bytes.push(ck);
    let out = '';
    for (let i = 0; i < bytes.length; i += 3) {
      const n = (bytes[i] << 16) | ((bytes[i + 1] || 0) << 8) | (bytes[i + 2] || 0);
      const len = Math.min(3, bytes.length - i) + 1;
      for (let k = 0; k < len; k++) out += B64[(n >> (18 - 6 * k)) & 63];
    }
    return out;
  }
  function decode(code) {
    code = String(code || '').trim();
    if (!/^[A-Za-z0-9_-]{8,}$/.test(code)) return null;
    const bytes = [];
    for (let i = 0; i < code.length; i += 4) {
      const chunk = code.slice(i, i + 4);
      let n = 0;
      for (let k = 0; k < 4; k++) n = (n << 6) | (k < chunk.length ? B64.indexOf(chunk[k]) : 0);
      for (let k = 0; k < chunk.length - 1; k++) bytes.push((n >> (16 - 8 * k)) & 255);
    }
    if (bytes.length < 5) return null;
    const ck = bytes.pop();
    let c = 0;
    bytes.forEach(b => { c = (c * 31 + b) & 255; });
    if (c !== ck || bytes[0] !== FORMAT) return null;
    const n = bytes[1], mask = bytes[2];
    const mods = MODS.filter((m, i) => mask & (1 << i));
    const a = [];
    let acc = 0, bits = 0, p = 3;
    for (let i = 0; i < n; i++) {
      while (bits < 3) { acc = (acc << 8) | (bytes[p++] || 0); bits += 8; }
      bits -= 3;
      const v = (acc >> bits) & 7;
      acc &= (1 << bits) - 1;
      a.push(v >= 1 && v <= 5 ? String(v) : '0');
    }
    const ans = (a.join('') + blank()).slice(0, N);
    return mods.length ? { mods, ans } : null;
  }

  // ─── compatibility ───
  // Similarity from mean squared standardized distance; calibrated so a random pair lands near 50.
  function simDist(a, b, ids, sd) {
    let s = 0, n = 0;
    ids.forEach(id => {
      const x = a[id], y = b[id];
      if (x != null && y != null) { const d = (x - y) / sd; s += d * d; n++; }
    });
    return n ? 100 * Math.exp(-(s / n) / 2.9) : null;
  }
  const stretch = v => clamp(Math.round(50 + (v - 50) * 1.3), 3, 98);
  const CHAR = modScales.char;
  const PARTS = {
    char: 'Сходство характеров', val: 'Общие ценности', mor: 'Моральные взгляды', mind: 'Стиль мышления и биоритм',
    assets: 'Личные ресурсы обоих', attach: 'Привязанность', conf: 'Поведение в конфликтах', care: 'Языки заботы',
    dom: 'Баланс лидерства', roles: 'Взаимодополняемость ролей'
  };
  const PART_HINT = {
    char: 'насколько похожи 10 аспектов личности и честность',
    val: 'совпадают ли жизненные приоритеты — по исследованиям, важнее сходства характеров',
    mor: 'насколько похоже ваше чувство «правильного»',
    mind: 'анализ или интуиция, нужда в определённости, жаворонок или сова',
    assets: 'эмоциональная устойчивость, доброжелательность, добросовестность и честность каждого — сильнейшие предикторы удовлетворённости',
    attach: 'надёжность привязанности обоих и ловушки сочетаний',
    conf: 'сотрудничество, опасные сочетания стилей и «четыре всадника» Готтмана',
    care: 'похоже ли вы чувствуете заботу',
    dom: 'не будет ли борьбы за лидерство или, наоборот, вакуума решений',
    roles: 'покрывают ли вы вместе ключевые роли в работе'
  };
  const WEIGHTS = {
    love: { char: .12, val: .15, mor: .08, mind: .05, assets: .18, attach: .17, conf: .13, care: .07, dom: .05 },
    friends: { char: .22, val: .15, mor: .08, mind: .15, assets: .15, attach: .05, conf: .10, care: .05, dom: .05 },
    work: { char: .08, val: .10, mor: .04, mind: .12, assets: .24, conf: .17, roles: .17, dom: .08 }
  };
  const CTX = { love: 'Пара', friends: 'Дружба', work: 'Работа' };

  function asset(P) {
    const d = P.dom;
    return (100 - d.N.pct + d.A.pct + d.C.pct + d.H.pct) / 4;
  }

  function pair(A, B, ctx) {
    ctx = WEIGHTS[ctx] ? ctx : 'love';
    const a = A.P, b = B.P;
    const both = m => a.has(m) && b.has(m);
    const v = {};
    const plus = [], minus = [], tips = [];

    // components
    v.char = simDist(a.z, b.z, CHAR, 1);
    if (both('val')) v.val = simDist(a.val.c, b.val.c, modScales.val, 15);
    if (both('mor')) v.mor = simDist(a.s, b.s, modScales.mor, 18);
    if (both('mind')) v.mind = simDist(a.s, b.s, ['ana', 'intu', 'clo', 'grow', 'morn'], 20);
    v.assets = (asset(a) + asset(b)) / 2;
    if (both('att') && a.att && b.att) {
      const sec = P => 100 - (P.att.anx + P.att.avo) / 2;
      let x = (sec(a) + sec(b)) / 2;
      const trap = (a.att.anx >= 55 && b.att.avo >= 45 && b.att.anx < 55) || (b.att.anx >= 55 && a.att.avo >= 45 && a.att.anx < 55);
      if (trap) x -= 15;
      if (a.att.anx >= 60 && b.att.anx >= 60) x -= 8;
      if (a.att.avo >= 55 && b.att.avo >= 55) x -= 8;
      v.attach = clamp(x, 0, 100);
    }
    if (both('conf')) {
      const hi = (P, id) => (P.z[id] || 0) >= 0.6;
      let x = 60 + ((a.s.col + b.s.col) / 2 - 60) * 0.4 - ((a.s.hrs + b.s.hrs) / 2 - 38) * 0.6;
      if (hi(a, 'cmp') && hi(b, 'cmp')) x -= 12;
      if ((hi(a, 'cmp') && hi(b, 'avd')) || (hi(b, 'cmp') && hi(a, 'avd'))) x -= 10;
      if (hi(a, 'avd') && hi(b, 'avd')) x -= 8;
      v.conf = clamp(x, 0, 100);
    }
    if (both('care')) v.care = simDist(a.s, b.s, modScales.care, 22);
    const za = a.z.ass || 0, zb = b.z.ass || 0;
    v.dom = clamp(100 - Math.max(0, Math.abs(za + zb) - 0.4) * 30, 0, 100);
    if (ctx === 'work') {
      const cover = Object.keys(D.roles).filter(id => Math.max(roleV(a, id), roleV(b, id)) >= 60).length;
      v.roles = clamp(cover / Object.keys(D.roles).length * 100 + (a.roles[0].id !== b.roles[0].id ? 10 : -10), 0, 100);
    }

    const W = WEIGHTS[ctx];
    let sw = 0, sv = 0;
    const parts = [];
    Object.keys(W).forEach(k => {
      if (v[k] == null) return;
      sw += W[k]; sv += W[k] * v[k];
      parts.push({ id: k, name: PARTS[k], hint: PART_HINT[k], v: Math.round(v[k]), w: W[k] });
    });
    const compat = stretch(sv / sw);
    const simParts = [[v.char, 2], [v.val, 1], [v.mor, 1], [v.mind, 1], [both('conf') ? simDist(a.z, b.z, ['cmp', 'col', 'cpr', 'avd', 'acc'], 1) : null, 1], [v.care, .5]];
    let ss = 0, sn = 0;
    simParts.forEach(([x, w]) => { if (x != null) { ss += x * w; sn += w; } });
    const sim = stretch(ss / sn);

    insights(A, B, ctx, plus, minus, tips);
    return { compat, sim, parts, plus, minus, tips, ctx, label: label(compat) };
  }
  const roleV = (P, id) => { const r = P.roles.find(x => x.id === id); return r ? r.v : 0; };
  function label(x) {
    return x >= 75 ? 'Отличная' : x >= 60 ? 'Хорошая' : x >= 45 ? 'Умеренная' : 'Непростая';
  }

  // Rule-based observations. Names appear only in the nominative (subject or address) — Russian names are not declined.
  function insights(A, B, ctx, plus, minus, tips) {
    const a = A.P, b = B.P, an = A.name, bn = B.name;
    const love = ctx === 'love', work = ctx === 'work';
    const dz = k => [a.dom[k].z, b.dom[k].z];
    const hiLo = (za, zb) => za >= zb ? [an, bn] : [bn, an];
    const gap = 1.2, HI = 0.5;

    // Extraversion
    let [x, y] = dz('E');
    if (Math.abs(x - y) >= gap) {
      const [h, l] = hiLo(x, y);
      minus.push(`${h} заряжается от людей и активности, ${l} — от тишины и уединения. Договоритесь о балансе: совместные выходы чередуйте со временем на восстановление.`);
    } else if (x > HI && y > HI) plus.push('Оба общительны и энергичны — вам легко вместе в компаниях, поездках и новых знакомствах.');
    else if (x < -HI && y < -HI) plus.push('Оба цените спокойствие и узкий круг — вам комфортно вдвоём без лишней суеты.');

    // Neuroticism
    [x, y] = dz('N');
    if (x > HI && y > HI) minus.push('Вы оба остро переживаете стресс и в трудные периоды можете «раскачивать» друг друга. Договоритесь заранее о паузах в ссорах и о том, какая поддержка нужна каждому.');
    else if (Math.abs(x - y) >= gap) {
      const [h, l] = hiLo(x, y);
      plus.push(`${l} — спокойная опора в стрессовых ситуациях, ${h} привносит эмоциональную глубину и чуткость к рискам.`);
      tips.push(`${l}, не обесценивайте переживания партнёра фразой «не накручивай» — лучше спросите, чем помочь.`);
    } else if (x < -HI && y < -HI) plus.push('Оба эмоционально устойчивы — кризисы вы переживаете без лишних драм.');

    // Agreeableness
    [x, y] = dz('A');
    if (x > HI && y > HI) plus.push('Оба доброжелательны и умеете уступать — серьёзных конфликтов будет немного.');
    else if (x < -HI && y < -HI) minus.push('Оба прямолинейны и не любите уступать — споры могут быть жёсткими. Правило: критикуйте поступок, а не человека.');
    const [cx, cy] = [a.z.com || 0, b.z.com || 0];
    if (Math.abs(cx - cy) >= gap + .2) {
      const [h, l] = hiLo(cx, cy);
      minus.push(`${h} ждёт эмоционального участия, а ${l} скорее предложит решение, чем сочувствие.`);
      tips.push(`${l}, когда партнёру плохо, иногда достаточно просто выслушать и сказать «понимаю».`);
    }

    // Conscientiousness / order
    [x, y] = dz('C');
    const [ox, oy] = [a.z.ord || 0, b.z.ord || 0];
    if (Math.abs(ox - oy) >= gap) {
      const [h, l] = hiLo(ox, oy);
      minus.push(work
        ? `${h} ценит порядок и сроки, ${l} работает гибко и «по вдохновению». Фиксируйте договорённости и дедлайны письменно.`
        : `Разное отношение к порядку: ${h} любит структуру и планы, ${l} — свободу и импровизацию. Это частая тема бытовых споров — заранее распределите зоны ответственности.`);
    }
    if (x > HI && y > HI) plus.push('Оба надёжны и организованны — планы и обещания выполняются.');
    else if (x < -HI && y < -HI) minus.push('Организованность у обоих невысокая — рутина и сроки могут «повисать». Помогут общий календарь и напоминания.');

    // Openness
    [x, y] = dz('O');
    if (Math.abs(x - y) >= gap) {
      const [h, l] = hiLo(x, y);
      minus.push(`${h} тянется к новому — идеям, местам, экспериментам, ${l} ценит привычное и проверенное. Чередуйте новое с любимым.`);
    } else if (x > HI && y > HI) plus.push('Обоим интересны идеи и новое — темы для разговоров не закончатся.');

    // Assertiveness balance
    if (za(a) >= 0.6 && za(b) >= 0.6) minus.push(work
      ? 'Два лидера: оба привыкли решать сами. Чётко разделите зоны ответственности и право последнего слова.'
      : 'Два лидера: оба привыкли решать. Разделите сферы, где решает каждый, иначе неизбежна борьба за руль.');
    else if (za(a) <= -0.6 && za(b) <= -0.6) minus.push('Никто не стремится брать инициативу — решения могут откладываться. Договоритесь, кто за что отвечает.');
    else if (Math.abs(za(a) - za(b)) >= 1.2) {
      const [h, l] = hiLo(za(a), za(b));
      plus.push(`${h} охотно берёт инициативу, ${l} не борется за лидерство — роли распределяются естественно.`);
      tips.push(`${h}, чаще спрашивайте мнение партнёра, даже если он(а) не настаивает.`);
    }

    // Honesty-humility
    const [hx, hy] = [a.z.hon || 0, b.z.hon || 0];
    if (Math.abs(hx - hy) >= gap + .2) {
      const [h, l] = hiLo(hx, hy);
      minus.push(`${h} особенно ценит прямоту и скромность, ${l} прагматичнее и больше думает о статусе. Обсудите, что каждый считает «честной игрой».`);
    } else if (hx > HI && hy > HI) plus.push('Оба высоко цените честность — фундамент для доверия.');

    // Values
    if (a.val && b.val) {
      const shared = Object.keys(a.val.c).filter(k => a.val.c[k] > 4 && b.val.c[k] > 4)
        .sort((p, q) => (b.val.c[q] + a.val.c[q]) - (b.val.c[p] + a.val.c[p])).slice(0, 3);
      if (shared.length) plus.push(`Общие главные ценности: ${shared.map(k => '«' + S[k].name + '»').join(', ')}. Это прочная основа для общих целей.`);
      const oc = P => (P.val.ho.open || 0) - (P.val.ho.cons || 0);
      if (Math.abs(oc(a) - oc(b)) >= 25) {
        const [h, l] = oc(a) > oc(b) ? [an, bn] : [bn, an];
        minus.push(`${h} стремится к переменам и свободе, ${l} — к стабильности и порядку. На этом часто спорят о деньгах, переездах, работе и воспитании.`);
      }
      const st = P => (P.val.ho.self || 0) - (P.val.ho.trans || 0);
      if (Math.abs(st(a) - st(b)) >= 25) {
        const [h, l] = st(a) > st(b) ? [an, bn] : [bn, an];
        minus.push(`Разные мотивы. ${h}: на первом месте успех и влияние. ${l}: важнее забота о людях и справедливость. Уважайте мотивы друг друга.`);
      }
    }

    // Moral foundations
    if (a.mor && b.mor) {
      const bx = a.mor.bind - a.mor.ind, by = b.mor.bind - b.mor.ind;
      if (Math.abs(bx - by) >= 22) {
        const [h, l] = bx > by ? [an, bn] : [bn, an];
        minus.push(`Разные моральные «настройки». ${h}: важны традиции, лояльность и уважение к авторитетам. ${l}: на первом месте личная свобода, забота и справедливость. Политика и религия могут быть острыми темами — договоритесь спорить уважительно.`);
      } else if (simDist(a.s, b.s, modScales.mor, 18) >= 70) plus.push('Похожее чувство «правильного» — в спорных вопросах вы чаще на одной стороне.');
    }

    // Mind
    if (a.mind && b.mind) {
      const t1 = a.mind.think, t2 = b.mind.think;
      if ((t1 === 'ana' && t2 === 'intu') || (t1 === 'intu' && t2 === 'ana')) {
        const [h, l] = t1 === 'ana' ? [an, bn] : [bn, an];
        plus.push(`Вы решаете по-разному: ${h} — анализом, ${l} — интуицией. Вместе это сильная связка: интуиция предлагает, анализ проверяет.`);
      }
      const [qx, qy] = [a.z.clo || 0, b.z.clo || 0];
      if (Math.abs(qx - qy) >= gap) {
        const [h, l] = hiLo(qx, qy);
        minus.push(`${h} нуждается в ясности и плане, ${l} предпочитает оставлять варианты открытыми. Решите, что планируете заранее, а что — по ходу.`);
      }
      if (a.s.morn != null && b.s.morn != null) {
        if (Math.abs(a.s.morn - b.s.morn) >= 40) {
          const [h, l] = a.s.morn > b.s.morn ? [an, bn] : [bn, an];
          minus.push(`Разные биоритмы: ${h} — жаворонок, ${l} — сова. Важные разговоры и общие дела планируйте на дневное время, когда в форме оба.`);
        } else if (love && Math.abs(a.s.morn - b.s.morn) <= 15) plus.push('Похожие биоритмы — легко совпадать по режиму дня.');
      }
      if (a.mind.sens && b.mind.sens) tips.push('Оба высокочувствительны: берегите общее пространство от перегрузки — тишина и паузы нужны вам обоим.');
      if ((a.z.grow || 0) > HI && (b.z.grow || 0) > HI) plus.push('Оба верите в развитие — будете поддерживать рост друг друга.');
    }

    // Attachment
    if (!work && a.att && b.att) {
      const ia = a.att.id, ib = b.att.id;
      if (ia === 'sec' && ib === 'sec') plus.push('Оба с надёжным стилем привязанности — это один из сильнейших предикторов устойчивых отношений.');
      else if ((ia === 'anx' && ib === 'avo') || (ia === 'avo' && ib === 'anx')) {
        const [h, l] = ia === 'anx' ? [an, bn] : [bn, an];
        minus.push(`Ловушка «тревожный — избегающий»: ${h} при отдалении ищет близости, ${l} от напора отстраняется ещё сильнее. Помогает ясность: заранее договаривайтесь о связи («напишу вечером») и о праве на паузу.`);
      } else if (ia === 'anx' && ib === 'anx') minus.push('Оба тревожитесь в близости и легко заражаете друг друга сомнениями. Говорите о потребностях прямо вместо проверок.');
      else if ((ia === 'avo' || ia === 'fea') && (ib === 'avo' || ib === 'fea')) minus.push('Оба держите дистанцию — отношения спокойные, но может не хватать близости. Планируйте время для откровенных разговоров.');
      if ((ia === 'sec') !== (ib === 'sec')) {
        const s = ia === 'sec' ? an : bn;
        plus.push(`${s} с надёжной привязанностью может стать «якорем» и помочь партнёру чувствовать себя спокойнее.`);
      }
    }

    // Conflict
    if (a.conf && b.conf) {
      const hi = (P, id) => (P.z[id] || 0) >= 0.6;
      if (hi(a, 'col') && hi(b, 'col')) plus.push('Оба решаете разногласия сотрудничеством — это сильная сторона.');
      if (hi(a, 'cmp') && hi(b, 'cmp')) minus.push('Оба склонны «побеждать» в споре — есть риск эскалации. Договоритесь о стоп-слове и возвращайтесь к разговору через 20 минут.');
      [[a, b, an, bn], [b, a, bn, an]].forEach(([p, q, pn, qn]) => {
        if (hi(p, 'cmp') && hi(q, 'avd')) minus.push(`Схема «догоняющий — убегающий»: ${pn} давит, чтобы решить сейчас, ${qn} уходит от разговора. Назначайте время для обсуждения — так обоим спокойнее.`);
        if (hi(p, 'cmp') && hi(q, 'acc')) tips.push(`${pn} обычно настаивает, ${qn} уступает. Ссор меньше, но у уступающего копится обида — время от времени меняйтесь ролями.`);
      });
      if (hi(a, 'avd') && hi(b, 'avd')) minus.push('Оба избегаете острых тем — проблемы могут копиться незаметно. Раз в неделю устраивайте спокойный «разговор о нас».');
      const risky = [[a, an], [b, bn]].filter(([p]) => p.conf.risk === 'high').map(([, n]) => n);
      if (risky.length) minus.push(`${risky.join(' и ')}: в ссорах заметны разрушительные паттерны — критика личности, оборона, сарказм или «стена». По Готтману, именно они сильнее всего предсказывают разрыв. Пробуйте мягкий старт: «я чувствую… когда… мне бы хотелось…».`);
    }

    // Care
    if (!work && a.care && b.care) {
      const ta = a.care.rank[0], tb = b.care.rank[0];
      if (ta === tb) plus.push(`Совпадает главный способ чувствовать заботу — «${S[ta].name}».`);
      tips.push(`${an} лучше всего чувствует заботу через «${S[ta].name}» и «${S[a.care.rank[1]].name}»: ${S[ta].how}.`);
      tips.push(`${bn} лучше всего чувствует заботу через «${S[tb].name}» и «${S[b.care.rank[1]].name}»: ${S[tb].how}.`);
    }

    // Work roles
    if (work) {
      const ra = a.roles[0].id, rb = b.roles[0].id;
      if (ra !== rb) plus.push(`Роли дополняют друг друга: ${an} — ${D.roles[ra].name.toLowerCase()}, ${bn} — ${D.roles[rb].name.toLowerCase()}.`);
      else minus.push(`Оба сильнее всего в роли «${D.roles[ra].name}» — возможна конкуренция. Договоритесь, кто за что отвечает.`);
      const missing = Object.keys(D.roles).filter(id => Math.max(roleV(a, id), roleV(b, id)) < 50);
      if (missing.length) tips.push(`В паре слабо представлены роли: ${missing.map(id => '«' + D.roles[id].name + '»').join(', ')}. Учитывайте это при распределении задач.`);
    }
    if (!plus.length) plus.push('Явных совпадений немного — но различия тоже бывают ресурсом, если их понимать.');
  }
  const za = P => P.z.ass || 0;

  // ─── group ───
  function group(list, ctx) {
    const n = list.length, M = [];
    for (let i = 0; i < n; i++) { M.push([]); for (let j = 0; j < n; j++) M[i].push(null); }
    const pairs = [];
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
      const r = pair(list[i], list[j], ctx);
      M[i][j] = M[j][i] = r;
      pairs.push({ i, j, compat: r.compat, sim: r.sim });
    }
    const dom = {};
    ['N', 'E', 'O', 'A', 'C', 'H'].forEach(k => {
      const zs = list.map(x => x.P.dom[k].z);
      const m = zs.reduce((s, v) => s + v, 0) / n;
      dom[k] = { m, sd: Math.sqrt(zs.reduce((s, v) => s + (v - m) * (v - m), 0) / n) };
    });
    const roles = Object.keys(D.roles).map(id => {
      let best = -1, bv = -1;
      list.forEach((x, i) => { const v = roleV(x.P, id); if (v > bv) { bv = v; best = i; } });
      return { id, best, v: bv };
    });
    const notes = [];
    if (dom.E.m > 0.5) notes.push('Энергичная, общительная компания — легко собраться и придумать движ.');
    else if (dom.E.m < -0.5) notes.push('Спокойная, «камерная» компания — вам хорошо в небольших встречах и глубоких разговорах.');
    if (dom.C.m < -0.5) notes.push('В группе мало организованности — назначьте ответственного за планы и сроки.');
    if (dom.A.m < -0.4) notes.push('Группа прямолинейная и спорная — договоритесь о правилах дискуссии.');
    if (dom.N.m > 0.5) notes.push('Многие в группе остро реагируют на стресс — важна атмосфера поддержки.');
    if (dom.O.sd > 1.1) notes.push('Очень разное отношение к новому: одним нужны эксперименты, другим — стабильность. Чередуйте форматы.');
    const missing = roles.filter(r => r.v < 55).map(r => '«' + D.roles[r.id].name + '»');
    if (missing.length) notes.push(`Слабо представлены роли: ${missing.join(', ')}.`);
    pairs.sort((p, q) => q.compat - p.compat);
    return { M, pairs, dom, roles, notes };
  }

  root.Engine = { N, MODS, modCount, modScales, byScale, sequence, profile, encode, decode, pair, group, Phi, CTX, blank };
})(typeof window !== 'undefined' ? window : globalThis);
