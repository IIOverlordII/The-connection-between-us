(function () {
  'use strict';
  const D = window.PSY, E = window.Engine;
  const S = D.scales;

  // ───────── utils ─────────
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => Array.from(el.querySelectorAll(s));
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
  const r0 = v => Math.round(v);
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
    back: '<path d="M15 18l-6-6 6-6"/>'
  };
  const icon = (n, cls = '') => `<svg class="${cls}" viewBox="0 0 24 24">${ICON[n] || ''}</svg>`;
  const plural = (n, forms) => {
    const [one, few, many] = forms.split('|'), m10 = n % 10, m100 = n % 100;
    return m10 === 1 && m100 !== 11 ? one : m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14) ? few : many;
  };
  const qWord = n => `${n} ${plural(n, 'вопрос|вопроса|вопросов')}`;
  const minutes = n => Math.max(1, Math.round(n * 7 / 60)); // ~7 s per item
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

  // ───────── storage ─────────
  const Store = {
    key: 'psy-v1',
    d: {},
    load() {
      let saved = {};
      try { saved = JSON.parse(localStorage.getItem(this.key) || '{}') || {}; } catch (e) { saved = {}; }
      this.d = Object.assign({ theme: 'auto', fs: 16, ctx: 'love', people: [], sel: [], mode: 'compat' }, saved);
      this.d.people.forEach(p => { if (!p.ans || p.ans.length !== E.N) p.ans = ((p.ans || '') + E.blank()).slice(0, E.N); });
    },
    save() { try { localStorage.setItem(this.key, JSON.stringify(this.d)); } catch (e) { /* private mode or quota */ } }
  };
  Store.load();

  const people = () => Store.d.people;
  const byId = id => people().find(p => p.id === id);
  const done = () => people().filter(p => p.mods.length);
  const color = p => COLORS[p.color % COLORS.length];
  const ava = (p, cls = '') => `<span class="ava ${cls}" style="background:${color(p)}">${esc((p.name.trim()[0] || '?').toUpperCase())}</span>`;

  // profile cache keyed by answers + modules
  const cache = new Map();
  function prof(p) {
    const key = p.mods.join() + '|' + p.ans;
    let c = cache.get(p.id);
    if (!c || c.key !== key) { c = { key, P: E.profile(p.ans, p.mods) }; cache.set(p.id, c); }
    return c.P;
  }
  const ent = p => ({ name: p.name, P: prof(p) });

  function addPerson(name, mods, ans, imported) {
    const used = people().map(p => p.color);
    let c = 0;
    while (used.includes(c) && c < COLORS.length) c++;
    const p = { id: uid(), name: name.trim() || 'Без имени', color: c % COLORS.length, created: Date.now(),
      mods: imported ? mods : [], todo: imported ? [] : mods, ans: ans || E.blank(), pos: 0, done: imported ? Date.now() : 0, imported: !!imported };
    people().push(p); Store.save();
    return p;
  }

  // ───────── shell ─────────
  const NAV = [['#/', 'Главная', 'home'], ['#/compare', 'Сравнение', 'users'], ['#/theory', 'Теория', 'book'], ['#/settings', 'Настройки', 'gear']];
  function renderNav(root) {
    const map = { '': '#/', p: '#/', take: '#/', new: '#/', import: '#/', compare: '#/compare', pair: '#/compare', group: '#/compare', theory: '#/theory', settings: '#/settings' };
    const cur = map[root] || '#/';
    $('#sidebar').innerHTML = `<div class="side-brand"><img src="icons/icon.svg" alt="">Психопрофиль</div>` +
      NAV.map(([h, l, ic]) => `<a class="side-link${cur === h ? ' active' : ''}" href="${h}">${icon(ic)}${esc(l)}</a>`).join('') +
      `<div class="side-foot">Ответы хранятся только на этом устройстве.</div>`;
    $('#tabbar').innerHTML = NAV.map(([h, l, ic]) => `<a class="tab${cur === h ? ' active' : ''}" href="${h}">${icon(ic)}<span>${esc(l)}</span></a>`).join('');
  }
  function setTitle(s, back) {
    $('#title').textContent = s;
    document.title = s === 'Психопрофиль' ? s : `${s} — Психопрофиль`;
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
    const t = $('#toast');
    t.textContent = msg; t.hidden = false;
    clearTimeout(toastT); toastT = setTimeout(() => { t.hidden = true; }, 2200);
  }
  async function copy(text) {
    try { await navigator.clipboard.writeText(text); toast('Скопировано'); return; } catch (e) { /* fall back below */ }
    const ta = document.createElement('textarea');
    ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select();
    try { document.execCommand('copy'); toast('Скопировано'); } catch (e) { toast('Не удалось скопировать — выделите текст вручную'); }
    ta.remove();
  }
  const seg = (name, items, cur) => `<div class="seg" data-seg="${name}">${items.map(([v, l]) => `<button data-v="${v}" class="${String(cur) === String(v) ? 'on' : ''}">${esc(l)}</button>`).join('')}</div>`;

  document.addEventListener('click', e => {
    const c = e.target.closest('[data-copy]');
    if (c) { e.preventDefault(); copy(c.dataset.copy); return; }
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
  const level = p => p >= 85 ? 'очень высокий' : p >= 65 ? 'высокий' : p >= 35 ? 'средний' : p >= 15 ? 'низкий' : 'очень низкий';
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
  const tempMap = pts => map2d({ pts, lx: 50, ly: 50, circle: true, q: ['Меланхолик', 'Холерик', 'Флегматик', 'Сангвиник'],
    xa: ['интроверсия', 'экстраверсия'], ya: ['эмоциональная стабильность', 'эмоциональная чувствительность'], aria: 'Карта темперамента' });
  const attMap = pts => map2d({ pts, lx: 45, ly: 55, q: ['Тревожный', 'Тревожно-избегающий', 'Надёжный', 'Избегающий'],
    xa: ['близость комфортна', 'дистанция'], ya: ['спокойствие в отношениях', 'тревога в отношениях'], aria: 'Карта привязанности' });

  const VAL_ORDER = ['sd', 'st', 'he', 'ac', 'po', 'se', 'co', 'tr', 'be', 'un'];
  function radar(series) {
    const C = 180, R = 100, n = VAL_ORDER.length;
    const pt = (i, f) => { const a = -Math.PI / 2 + i * 2 * Math.PI / n; return [C + Math.cos(a) * R * f, C + Math.sin(a) * R * f]; };
    let h = `<svg class="radar" viewBox="-96 4 552 352" role="img" aria-label="Круг ценностей">`;
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
      <circle cx="50" cy="50" r="42" class="ring-fg" transform="rotate(-90 50 50)" style="stroke:${col};stroke-dasharray:${(c * v / 100).toFixed(1)} ${c.toFixed(1)}"/>
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
      sub = `<span class="badge warn">в процессе ${dn}/${all}</span>`;
    } else if (p.mods.length) {
      const P = prof(p);
      sub = `<b>${esc(P.type.code)}</b> · ${esc(D.types[P.type.code].name)} · ${esc(D.temperaments[P.temp.id].name)}${p.imported ? ' · <span class="muted">по коду</span>' : ''}`;
    } else sub = '<span class="muted">не начат</span>';
    const href = p.todo.length ? `#/take/${p.id}` : `#/p/${p.id}`;
    return `<a class="list-item" href="${href}">${ava(p)}<span class="li-main"><span class="li-title">${esc(p.name)}</span><span class="li-sub">${sub}</span></span>${icon('chev', 'chev')}</a>`;
  }
  function vHome() {
    setTitle('Психопрофиль');
    const ps = people(), dn = done();
    view().innerHTML = `
      <div class="hero"><h2>Тест характера и совместимости</h2>
        <p>Узнайте свой характер, темперамент, стиль привязанности, ценности и тип мышления — и сравните себя с партнёром, друзьями или командой.</p>
        <div class="hero-actions"><a class="btn light" href="#/new">${icon('plus')}Новый участник</a>
        ${dn.length >= 2 ? `<a class="btn ghost-light" href="${compareHref(dn.map(p => p.id))}">${icon('heart')}Сравнить всех</a>` : ''}</div></div>
      ${ps.length ? `<h3>Участники</h3><div class="list">${ps.map(personRow).join('')}</div>` : ''}
      <div class="row" style="margin:14px 0"><button class="btn secondary" id="importBtn">${icon('link')}Добавить по коду или ссылке</button></div>
      ${ps.length < 2 ? `<div class="card"><h3 style="margin-top:0">Как это работает</h3>
        <ol class="steps"><li><b>Каждый проходит тест</b> — по очереди на этом устройстве или на своём телефоне. Полный тест — около 15 минут, быстрый — 6.</li>
        <li><b>Получает профиль:</b> Большая пятёрка, 16 типов, темперамент, привязанность, ценности, мораль, мышление, стиль в конфликтах и роль в команде.</li>
        <li><b>Сравнивайте:</b> совместимость и схожесть пары, друзей или команды, сильные стороны, зоны трения и советы.</li></ol>
        <p class="small muted">Результатом можно поделиться ссылкой или кодом. Ответы никуда не отправляются: всё хранится на устройстве.</p></div>` : ''}`;
    $('#importBtn').onclick = importModal;
  }
  const compareHref = ids => ids.length === 2 ? `#/pair/${ids[0]}/${ids[1]}` : `#/group/${ids.join(',')}`;

  // ───────── new participant ─────────
  const PRESETS = { full: E.MODS.slice(), quick: ['char', 'att'] };
  function vNew() {
    setTitle('Новый участник', '#/');
    let mods = PRESETS.full.slice(), preset = 'full', col = people().length % COLORS.length;
    function draw() {
      const n = mods.reduce((s, m) => s + E.modCount[m], 0);
      $('#modsBox').innerHTML = D.modules.map(m => `<label class="chk${m.req ? ' req' : ''}"><input type="checkbox" value="${m.id}"${mods.includes(m.id) ? ' checked' : ''}${m.req ? ' disabled' : ''}>
        <span><b>${esc(m.name)}</b> <span class="muted small">· ${qWord(E.modCount[m.id])}</span><br><span class="small muted">${esc(m.sub)}</span></span></label>`).join('');
      $('#est').textContent = `${qWord(n)} · около ${minutes(n)} мин`;
      $$('[data-seg="preset"] button').forEach(b => b.classList.toggle('on', b.dataset.v === preset));
    }
    view().innerHTML = `<div class="card">
        <label class="lbl" for="nm">Имя</label><input class="input" id="nm" maxlength="40" placeholder="Например, Аня" autocomplete="off">
        <label class="lbl">Цвет</label><div class="swatches">${COLORS.map((c, i) => `<button class="sw${i === col ? ' on' : ''}" data-c="${i}" style="background:${c}" aria-label="Цвет ${i + 1}"></button>`).join('')}</div>
      </div>
      <div class="card"><div class="row"><b style="flex:1">Что пройти</b>${seg('preset', [['full', 'Полный'], ['quick', 'Быстрый'], ['custom', 'Свой набор']], preset)}</div>
        <div id="modsBox" class="mods"></div><p class="muted small" id="est"></p></div>
      <button class="btn block" id="startBtn">Начать тест</button>
      <p class="small muted center" style="margin-top:10px">Нет правильных и неправильных ответов. Отвечайте честно — так результат будет точнее.</p>`;
    draw();
    $('#nm').focus();
    $('[data-seg="preset"]').onclick = e => {
      const b = e.target.closest('button'); if (!b) return;
      preset = b.dataset.v;
      if (PRESETS[preset]) mods = PRESETS[preset].slice();
      draw();
    };
    $('#modsBox').onchange = () => { mods = ['char'].concat($$('#modsBox input:checked').map(i => i.value).filter(v => v !== 'char')); preset = 'custom'; draw(); };
    $('.swatches').onclick = e => { const b = e.target.closest('.sw'); if (!b) return; col = +b.dataset.c; $$('.sw').forEach(x => x.classList.toggle('on', x === b)); };
    const start = () => {
      const name = $('#nm').value.trim();
      if (!name) { $('#nm').focus(); toast('Введите имя'); return; }
      const ordered = E.MODS.filter(m => mods.includes(m));
      const p = addPerson(name, ordered, null, false);
      p.color = col; Store.save();
      go('#/take/' + p.id);
    };
    $('#startBtn').onclick = start;
    $('#nm').onkeydown = e => { if (e.key === 'Enter') start(); };
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
      Store.save();
      keyHandler = null;
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
        view().innerHTML = `${prog}<div class="card intro-card"><div class="kicker">Блок ${modList.indexOf(m.id) + 1} из ${modList.length}</div>
          <h2>${esc(m.name)}</h2><p class="muted">${esc(m.sub)}</p><p>${esc(m.intro)}</p>
          <p class="small muted">${qWord(cnt)} · около ${minutes(cnt)} мин</p>
          <button class="btn block" id="goBtn">${dn ? 'Продолжить' : 'Начать'}</button>
          ${p.pos ? `<button class="btn ghost block" id="prevBtn">${icon('back')}Назад</button>` : ''}</div>
          <p class="small muted center">Подсказка: клавиши <kbd>1</kbd>–<kbd>5</kbd> — ответ, <kbd>←</kbd> — назад.</p>`;
        $('#goBtn').onclick = () => move(1);
        if ($('#prevBtn')) $('#prevBtn').onclick = () => move(-1);
        return;
      }
      const it = D.items[st.i], m = D.modules.find(x => x.id === st.mod), cur = p.ans.charCodeAt(st.i) - 48;
      view().innerHTML = `${prog}<div class="q-wrap"><div class="q-meta"><span>${esc(m.name)}</span><span>${dn + 1} из ${total}</span></div>
        <div class="card q-card"><div class="q-prompt">${esc(m.prompt)}</div><div class="q-text">${esc(it[2])}</div></div>
        <div class="ans">${D.answers.map((a, i) => `<button data-v="${i + 1}" class="${cur === i + 1 ? 'on' : ''}"><span class="ak">${i + 1}</span>${esc(a)}</button>`).join('')}</div>
        <div class="q-nav"><button class="btn ghost" id="prevBtn">${icon('back')}Назад</button><span class="spacer"></span>
          <button class="btn ghost" id="skipBtn">${cur >= 1 ? 'Далее' : 'Пропустить'}</button></div></div>`;
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
      if (st && st.i != null && e.key >= '1' && e.key <= '5') { e.preventDefault(); answer(+e.key); }
      else if (e.key === 'ArrowLeft' || e.key === 'Backspace') { e.preventDefault(); move(-1); }
      else if (e.key === 'ArrowRight' || e.key === 'Enter') { e.preventDefault(); move(1); }
    };
    render();
  }

  // ───────── personal report ─────────
  const DOM_ORDER = ['O', 'C', 'E', 'A', 'N'];
  const LETTER = { E: 'экстраверсия', I: 'интроверсия', N: 'интуиция (идеи)', S: 'ощущение (факты)', F: 'чувство (ценности)', T: 'мышление (логика)', J: 'суждение (план)', P: 'восприятие (гибкость)' };
  const domText = (k, pct) => { const d = D.domains[k]; return pct >= 65 ? d.hi : pct <= 35 ? d.lo : d.mid; };
  const card = (title, body, id) => `<section class="card"${id ? ` id="${id}"` : ''}><h3 class="card-h">${esc(title)}</h3>${body}</section>`;

  function secSummary(p, P) {
    const T = D.types[P.type.code], chips = [];
    chips.push(`<span class="chip">${esc(D.temperaments[P.temp.id].name)}</span>`);
    if (P.att) chips.push(`<span class="chip">Привязанность: ${esc(D.attach[P.att.id].name.toLowerCase())}</span>`);
    if (P.mind) chips.push(`<span class="chip">${esc(D.thinking[P.mind.think].name)}</span>`);
    if (P.mind && P.mind.chrono) chips.push(`<span class="chip">${esc(D.chrono[P.mind.chrono].split(' ')[0])}</span>`);
    chips.push(`<span class="chip">Роль: ${esc(D.roles[P.roles[0].id].name.toLowerCase())}</span>`);
    return `<div class="hero person" style="--pc:${color(p)}"><div class="row">${ava(p, 'big')}<div style="flex:1;min-width:0"><div class="kicker">${esc(p.name)}</div>
      <h2><span class="code">${esc(P.type.code)}</span> ${esc(T.name)}</h2><p>${esc(T.tag)}</p></div></div><div class="chips">${chips.join('')}</div></div>`;
  }
  function secBig5(P) {
    const col = 'var(--primary)';
    const blocks = DOM_ORDER.map(k => {
      const d = D.domains[k], v = P.dom[k].pct;
      const asp = d.asp.map(a => bar(S[a].name, P.pct[a], 'var(--primary-2)')).join('');
      const ext = d.asp.filter(a => P.pct[a] >= 62 || P.pct[a] <= 38).map(a => `<li>${esc(P.pct[a] >= 62 ? S[a].hi : S[a].lo)}</li>`).join('');
      return `<div class="dom"><div class="dom-h"><b>${esc(d.name)}</b><span class="muted small">${esc(d.alt)}</span><span class="lvl">${level(v)}</span></div>
        ${bar('', v, col)}<p class="small">${esc(domText(k, v))}</p><div class="asp">${asp}</div>${ext ? `<ul class="small tight">${ext}</ul>` : ''}</div>`;
    }).join('');
    const h = P.pct.hon;
    const hon = `<div class="dom"><div class="dom-h"><b>Честность-скромность</b><span class="muted small">шестой фактор HEXACO</span><span class="lvl">${level(h)}</span></div>
      ${bar('', h, col)}<p class="small">${esc(h >= 50 ? S.hon.hi : S.hon.lo)}</p></div>`;
    return card('Характер: Большая пятёрка', blocks + hon +
      `<p class="note">Шкала 0–100 — примерное положение относительно среднего человека: 50 — типичный уровень, 80 — выше, чем примерно у 80% людей. Нормы ориентировочные.</p>`);
  }
  function secType(P) {
    const T = D.types[P.type.code], L = P.type.letters;
    const weak = L.map((x, i) => ({ x, i })).filter(o => o.x.p < 58);
    const alts = weak.map(o => { const c = P.type.code.split(''); c[o.i] = o.x.o; return c.join(''); });
    return card('Тип личности: 16 типов', `<div class="tcode">${L.map(x => `<div class="tl"><b>${x.l}</b><small>${r0(x.p)}%</small></div>`).join('')}</div>
      <h3 class="sub-h">${esc(T.name)} — ${esc(T.tag.toLowerCase())}</h3><p>${esc(T.d)}</p>
      <div class="pm"><div><h4>Сильные стороны</h4><ul>${T.plus.map(s => `<li>${esc(s)}</li>`).join('')}</ul></div>
      <div><h4>Зоны роста</h4><ul>${T.minus.map(s => `<li>${esc(s)}</li>`).join('')}</ul></div></div>
      <div class="letters">${L.map(x => `<div class="small"><b>${x.l}</b> ${esc(LETTER[x.l])} — ${r0(x.p)}% <span class="muted">· ${x.o} ${esc(LETTER[x.o])} — ${r0(100 - x.p)}%</span></div>`).join('')}</div>
      ${alts.length ? `<p class="small">Слабо выражены: ${weak.map(o => o.x.l + '/' + o.x.o).join(', ')} — вам могут подходить и соседние типы: ${alts.map(c => `<b>${c}</b> «${esc(D.types[c].name)}»`).join(', ')}.</p>` : ''}
      <p class="note">Код вычислен из Большой пятёрки по соответствиям, найденным Маккрае и Костой (1989). Это не официальный MBTI®. <a href="#/theory/jung">Почему типы — упрощение</a></p>`);
  }
  function secTemp(P, p) {
    const T = D.temperaments[P.temp.id], A = D.temperaments[P.temp.alt];
    return card('Темперамент', `<div class="split">${tempMap([Object.assign(tempPt(P), { c: color(p), t: p.name })])}<div>
      <h3 class="sub-h">${esc(T.name)} <span class="muted small">· ${esc(T.axis)}</span></h3><p>${esc(T.d)}</p><p class="small">${esc(T.stress)}</p>
      ${P.temp.mixed ? `<p class="small muted">Вы близко к центру круга: черты выражены умеренно, заметны и черты соседнего типа — ${esc(A.name.toLowerCase())}.</p>` : `<p class="small muted">Второй по близости тип — ${esc(A.name.toLowerCase())}.</p>`}
      </div></div><p class="note">По Айзенку: горизонталь — экстраверсия, вертикаль — нейротизм. <a href="#/theory/temp">Подробнее</a></p>`);
  }
  function secAtt(P, p) {
    if (!P.att) return '';
    const A = D.attach[P.att.id];
    return card('Привязанность в близких отношениях', `<div class="split">${attMap([{ x: P.att.avo, y: P.att.anx, c: color(p), t: p.name }])}<div>
      <h3 class="sub-h">${esc(A.name)} стиль</h3><p>${esc(A.d)}</p><p class="small tip">${icon('bulb')}<span>${esc(A.tip)}</span></p>
      ${bar(S.anx.name, P.s.anx, 'var(--primary)')}${bar(S.avo.name, P.s.avo, 'var(--primary)')}</div></div>
      <p class="note">Стиль привязанности не приговор: он меняется с опытом надёжных отношений. <a href="#/theory/attach">Подробнее</a></p>`);
  }
  function secVal(P, p) {
    if (!P.val) return '';
    const c = P.val.c, ho = P.val.ho;
    const oc = (ho.open || 0) - (ho.cons || 0), st = (ho.self || 0) - (ho.trans || 0);
    const t1 = oc > 10 ? 'Вас больше влекут перемены, свобода и новое, чем стабильность.' : oc < -10 ? 'Стабильность, порядок и традиции для вас важнее перемен.' : 'Вы держите баланс между стремлением к новому и стабильностью.';
    const t2 = st > 10 ? 'Сейчас на первом плане личные цели — успех и влияние.' : st < -10 ? 'Забота о людях и справедливость для вас важнее личного статуса.' : 'Вы держите баланс между личными целями и заботой о других.';
    return card('Ценности', `<div class="split">${radar([{ c, col: color(p) }])}<div>
      <h4>Главные ценности</h4><ol class="tops">${P.val.top.map(k => `<li><b>${esc(S[k].name)}</b> — ${esc(S[k].desc)}</li>`).join('')}</ol>
      <p>${esc(t1)} ${esc(t2)}</p></div></div>
      <p class="note">Показан порядок приоритетов: каждая ценность относительно вашего среднего уровня (теория Шварца). <a href="#/theory/values">Подробнее</a></p>`);
  }
  function secMor(P) {
    if (!P.mor) return '';
    const ids = E.modScales.mor, m = P.mor;
    const t = m.bind >= m.ind - 10
      ? 'Ваша мораль опирается и на заботу и справедливость, и на «связывающие» основания — лояльность, авторитет и святыни. По Хайдту, такой профиль чаще встречается у людей с традиционными взглядами.'
      : 'Ваша мораль опирается прежде всего на заботу и справедливость, а лояльность, авторитет и святыни для вас вторичны. По Хайдту, такой профиль чаще встречается у людей с либеральными взглядами.';
    return card('Мораль', ids.map(k => bar(S[k].name, P.pct[k], 'var(--primary)', S[k].desc)).join('') + `<p>${esc(t)}</p><p class="note"><a href="#/theory/moral">О теории моральных оснований</a></p>`);
  }
  function secMind(P) {
    if (!P.mind) return '';
    const T = D.thinking[P.mind.think], ids = ['ana', 'intu', 'clo', 'grow', 'sens', 'morn'];
    const ext = ids.filter(k => P.pct[k] >= 65 || P.pct[k] <= 35).map(k => `<li>${esc(P.pct[k] >= 65 ? S[k].hi : S[k].lo)}</li>`).join('');
    return card('Мышление и восприятие', `<h3 class="sub-h">${esc(T.name)}</h3><p>${esc(T.d)}</p>
      ${ids.map(k => bar(S[k].name, P.pct[k], 'var(--primary)')).join('')}
      ${ext ? `<ul class="small tight">${ext}</ul>` : ''}
      ${P.mind.chrono ? `<p><b>Хронотип:</b> ${esc(D.chrono[P.mind.chrono])}.</p>` : ''}
      <p class="note"><a href="#/theory/mind">Типы мышления и устройство разума</a></p>`);
  }
  function secConf(P) {
    if (!P.conf) return '';
    const top = P.conf.top[0], second = P.conf.top[1];
    const risk = { low: ['низкий', 'ok'], mid: ['умеренный', 'warn'], high: ['высокий', 'bad'] }[P.conf.risk];
    return card('В конфликтах', `<h3 class="sub-h">Ведущий стиль — ${esc(S[top].name.toLowerCase())}</h3><p>${esc(S[top].hi)}</p>
      <p class="small muted">Второй по выраженности — ${esc(S[second].name.toLowerCase())}.</p>
      ${['col', 'cpr', 'acc', 'avd', 'cmp'].map(k => bar(S[k].name, P.pct[k], 'var(--primary)', S[k].desc)).join('')}
      <div class="risk ${risk[1]}"><b>Разрушительные паттерны: ${risk[0]} уровень.</b> ${P.conf.risk === 'low' ? 'В ссорах вы редко переходите на личности — отличная основа.' :
        'Критика личности, оборона, сарказм и «стена» — по Готтману, главные предвестники разрыва. Противоядия: мягкий старт разговора, признание своей части ответственности, благодарность и пауза на 20 минут, если эмоции зашкаливают.'}</div>
      <p class="note"><a href="#/theory/conflict">Стили конфликта и «четыре всадника»</a></p>`);
  }
  function secCare(P) {
    if (!P.care) return '';
    const r = P.care.rank;
    return card('Как вы чувствуете заботу', r.map(k => bar(S[k].name, P.s[k], 'var(--primary)')).join('') +
      `<p><b>Чтобы порадовать вас:</b> ${esc(S[r[0]].how)}; а ещё — ${esc(S[r[1]].how)}.</p><p class="note">Научная база «языков любви» слабая — это подсказка, а не диагноз. <a href="#/theory/care">Подробнее</a></p>`);
  }
  function secRoles(P) {
    const [a, b] = P.roles;
    return card('Роль в команде', `<p><b>${esc(D.roles[a.id].name)}</b> — ${esc(D.roles[a.id].d)}. Вторая сильная роль — <b>${esc(D.roles[b.id].name.toLowerCase())}</b>: ${esc(D.roles[b.id].d)}.</p>
      ${P.roles.map(x => bar(D.roles[x.id].name, x.v, 'var(--primary)')).join('')}
      <p class="note">Роли выведены из черт характера и стиля мышления.</p>`);
  }
  function vReport(id, flag) {
    const p = byId(id);
    if (!p) return go('#/');
    if (!p.mods.length) return go(p.todo.length ? '#/take/' + id : '#/');
    setTitle(p.name, '#/');
    const P = prof(p);
    const missing = E.MODS.filter(m => !p.mods.includes(m));
    const others = done().filter(x => x.id !== p.id);
    view().innerHTML = `
      ${flag === 'new' ? `<div class="card done-card">${icon('check')}<div><b>Готово!</b> Профиль сохранён.${others.length ? ' Можно сравнить себя с остальными.' : ''}
        <div class="row" style="margin-top:8px"><a class="btn" href="#/new">Следующий участник</a>${others.length ? `<a class="btn secondary" href="${compareHref([p.id].concat(others.map(o => o.id)))}">Сравнить</a>` : ''}</div></div></div>` : ''}
      ${p.todo.length ? `<div class="card done-card warn">${icon('warn')}<div>Есть незаконченные блоки. <a href="#/take/${p.id}">Продолжить тест</a></div></div>` : ''}
      ${secSummary(p, P)}
      <div class="row toolbar"><button class="btn secondary" id="shareBtn">${icon('share')}Поделиться</button>
        ${others.length ? `<button class="btn secondary" id="cmpBtn">${icon('heart')}Сравнить с…</button>` : ''}</div>
      ${secBig5(P)}${secType(P)}${secTemp(P, p)}${secAtt(P, p)}${secVal(P, p)}${secMor(P)}${secMind(P)}${secConf(P)}${secCare(P)}${secRoles(P)}
      <section class="card"><h3 class="card-h">Управление</h3>
        ${missing.length && !p.todo.length ? `<p>Не пройдены блоки: ${missing.map(m => '«' + esc(D.modules.find(x => x.id === m).name) + '»').join(', ')}. С ними совместимость будет точнее.</p>
          <p><button class="btn" id="moreBtn">Пройти недостающие (${qWord(missing.reduce((s, m) => s + E.modCount[m], 0))})</button></p>` : ''}
        <div class="row"><button class="btn secondary" id="renBtn">Переименовать</button><button class="btn secondary" id="retakeBtn">Пройти заново</button><button class="btn danger" id="delBtn">Удалить</button></div>
        <p class="note">Результаты самоотчёта — не медицинский и не психиатрический диагноз. Ответы меняются вместе с настроением и обстоятельствами; со временем тест стоит пройти ещё раз.</p></section>`;
    $('#shareBtn').onclick = () => shareModal([p]);
    if ($('#cmpBtn')) $('#cmpBtn').onclick = () => openModal(`<h2>Сравнить ${esc(p.name)} с…</h2><div class="list">${others.map(o =>
      `<a class="list-item" href="#/pair/${p.id}/${o.id}" data-close>${ava(o)}<span class="li-main"><span class="li-title">${esc(o.name)}</span></span>${icon('chev', 'chev')}</a>`).join('')}</div>
      ${others.length > 1 ? `<p style="margin-top:12px"><a class="btn block" data-close href="${compareHref([p.id].concat(others.map(o => o.id)))}">Сравнить со всеми</a></p>` : ''}`);
    if ($('#moreBtn')) $('#moreBtn').onclick = () => { p.todo = missing; p.pos = 0; Store.save(); go('#/take/' + p.id); };
    $('#renBtn').onclick = () => { const n = prompt('Новое имя', p.name); if (n && n.trim()) { p.name = n.trim().slice(0, 40); Store.save(); route(); } };
    $('#retakeBtn').onclick = () => {
      if (!confirm(`Пройти тест заново? Текущие ответы ${p.name} будут удалены.`)) return;
      p.todo = p.mods.slice(); p.mods = []; p.ans = E.blank(); p.pos = 0; p.imported = false; Store.save(); go('#/take/' + p.id);
    };
    $('#delBtn').onclick = () => {
      if (!confirm(`Удалить участника «${p.name}» и все его ответы?`)) return;
      Store.d.people = people().filter(x => x.id !== p.id);
      Store.d.sel = Store.d.sel.filter(x => x !== p.id);
      cache.delete(p.id); Store.save(); go('#/');
    };
  }

  // ───────── sharing / import ─────────
  const webBase = () => /^https?:$/.test(location.protocol) ? location.href.split('#')[0] : '';
  const shareLine = p => `${p.name}: ${E.encode(p.mods, p.ans)}`;
  function shareModal(list) {
    const base = webBase();
    const one = list.length === 1 ? list[0] : null;
    const text = list.map(shareLine).join('\n');
    const link = one && base ? `${base}#/import/${E.encode(one.mods, one.ans)}/${encodeURIComponent(one.name)}` : '';
    openModal(`<h2>${one ? 'Поделиться результатом' : 'Поделиться группой'}</h2>
      <p class="small muted">Отправьте ${link ? 'ссылку или код' : 'код'} тому, с кем хотите сравниться: в приложении — «Главная → Добавить по коду или ссылке». В коде только ответы и имя, без других личных данных.</p>
      ${link ? `<label class="lbl">Ссылка</label><div class="copy"><input class="input" readonly value="${esc(link)}"><button class="btn secondary" data-copy="${esc(link)}">Копировать</button></div>` : ''}
      <label class="lbl">${one ? 'Код' : 'Коды всех участников'}</label>
      <div class="copy"><textarea class="input code-ta" readonly rows="${Math.min(6, list.length + 1)}">${esc(text)}</textarea><button class="btn secondary" data-copy="${esc(text)}">Копировать</button></div>
      ${navigator.share ? `<button class="btn block" id="nativeShare" style="margin-top:12px">${icon('share')}Отправить…</button>` : ''}`);
    const ns = $('#nativeShare');
    if (ns) ns.onclick = () => navigator.share(link ? { title: 'Психопрофиль', text: `Мой психопрофиль: ${one.name}`, url: link } : { title: 'Психопрофиль', text }).catch(() => { /* cancelled */ });
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
      const nm = (name || '').trim().slice(0, 40) || 'Без имени';
      const ex = people().find(p => p.name === nm && p.ans === d.ans && p.mods.join() === d.mods.join());
      if (ex) { dup.push(ex); return; }
      added.push(addPerson(nm, d.mods, d.ans, true));
    });
    return { added, dup, bad };
  }
  function importModal() {
    openModal(`<h2>Добавить по коду или ссылке</h2>
      <p class="small muted">Вставьте ссылку или код, которыми поделился другой участник. Можно несколько — каждый с новой строки.</p>
      <textarea class="input" id="impTa" rows="5" placeholder="Аня: AQKHf3…"></textarea>
      <button class="btn block" id="impBtn" style="margin-top:12px">Добавить</button>`);
    $('#impTa').focus();
    $('#impBtn').onclick = () => {
      const r = importEntries(parseShared($('#impTa').value));
      if (!r.added.length && !r.dup.length) { toast(r.bad ? 'Код повреждён — проверьте, что он скопирован целиком' : 'Код не найден'); return; }
      closeModal();
      const msg = [r.added.length && `Добавлено: ${r.added.length}`, r.dup.length && `уже были: ${r.dup.length}`, r.bad && `ошибок: ${r.bad}`].filter(Boolean).join(', ');
      toast(msg);
      const all = r.added.concat(r.dup);
      if (all.length === 1) go('#/p/' + all[0].id); else route();
    };
  }
  function vImport(code, name) {
    setTitle('Добавить участника', '#/');
    let nm = '';
    try { nm = decodeURIComponent(name || ''); } catch (e) { nm = name || ''; }
    const d = E.decode(code);
    if (!d || !d.mods.includes('char')) { view().innerHTML = `<div class="card empty">Ссылка повреждена или устарела. Попросите отправить её ещё раз.<p><a class="btn" href="#/">На главную</a></p></div>`; return; }
    const ex = people().find(p => p.ans === d.ans && p.mods.join() === d.mods.join());
    const P = E.profile(d.ans, d.mods);
    view().innerHTML = `<div class="card"><h2>Вам отправили психопрофиль</h2>
      <p><b>${esc(P.type.code)}</b> «${esc(D.types[P.type.code].name)}» · ${esc(D.temperaments[P.temp.id].name)} · блоков: ${d.mods.length} из ${E.MODS.length}</p>
      <label class="lbl" for="nm">Имя</label><input class="input" id="nm" maxlength="40" value="${esc(nm)}">
      ${ex ? `<p class="small muted">Этот профиль уже есть на устройстве: <a href="#/p/${ex.id}">${esc(ex.name)}</a>.</p>` : ''}
      <button class="btn block" id="addBtn" style="margin-top:12px">Добавить в участники</button>
      <p class="small muted" style="margin-top:10px">Затем пройдите тест сами — и сравните результаты.</p></div>`;
    $('#addBtn').onclick = () => { const p = addPerson($('#nm').value, d.mods, d.ans, true); history.replaceState(null, '', '#/p/' + p.id); route(); };
  }

  // ───────── compare: picker ─────────
  const CTX_ITEMS = [['love', 'Пара'], ['friends', 'Дружба'], ['work', 'Работа']];
  function vCompare() {
    setTitle('Сравнение');
    const dn = done();
    if (dn.length < 2) {
      view().innerHTML = `<div class="card empty">${icon('users', 'big-ico')}<p>Для сравнения нужны минимум два участника, прошедших тест.</p>
        <p><a class="btn" href="#/new">Новый участник</a> <button class="btn secondary" id="importBtn">Добавить по коду</button></p></div>`;
      $('#importBtn').onclick = importModal;
      return;
    }
    let sel = Store.d.sel.filter(id => dn.some(p => p.id === id));
    if (sel.length < 2) sel = dn.map(p => p.id);
    function draw() {
      $('#pick').innerHTML = dn.map(p => `<label class="chk"><input type="checkbox" value="${p.id}"${sel.includes(p.id) ? ' checked' : ''}>${ava(p)}
        <span><b>${esc(p.name)}</b><br><span class="small muted">${esc(prof(p).type.code)} · ${esc(D.temperaments[prof(p).temp.id].name)}</span></span></label>`).join('');
      $('#goCmp').disabled = sel.length < 2;
      $('#goCmp').textContent = sel.length === 2 ? 'Сравнить пару' : sel.length > 2 ? `Сравнить группу (${sel.length})` : 'Выберите минимум двоих';
    }
    view().innerHTML = `<div class="card"><div class="row"><b style="flex:1">Контекст</b>${seg('ctx', CTX_ITEMS, Store.d.ctx)}</div>
      <p class="small muted" style="margin:8px 0 0">От контекста зависит, что важнее: в паре — привязанность и конфликты, в дружбе — сходство, в работе — надёжность и роли.</p></div>
      <div class="card"><b>Кого сравниваем</b><div id="pick" class="mods"></div></div>
      <button class="btn block" id="goCmp"></button>
      <div class="row" style="margin-top:12px"><button class="btn secondary" id="shareAll">${icon('share')}Поделиться всей группой</button></div>`;
    draw();
    $('#pick').onchange = () => { sel = $$('#pick input:checked').map(i => i.value); Store.d.sel = sel; Store.save(); draw(); };
    $('[data-seg="ctx"]').onclick = e => { const b = e.target.closest('button'); if (!b) return; Store.d.ctx = b.dataset.v; Store.save(); $$('[data-seg="ctx"] button').forEach(x => x.classList.toggle('on', x === b)); };
    $('#goCmp').onclick = () => { Store.d.sel = sel; Store.save(); go(compareHref(sel)); };
    $('#shareAll').onclick = () => shareModal(dn);
  }
  function ctxBar() {
    return `<div class="row ctx-row"><span class="muted small">Контекст:</span>${seg('ctx', CTX_ITEMS, Store.d.ctx)}</div>`;
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
    const li = (arr, cls, ic) => arr.length ? `<ul class="ins ${cls}">${arr.map(t => `<li>${icon(ic)}<span>${esc(t)}</span></li>`).join('')}</ul>` : '';
    const ctxName = { love: 'для пары', friends: 'для дружбы', work: 'для работы' }[r.ctx];
    const rowsCmp = [
      ['Тип (16)', P => `<b>${P.type.code}</b> ${esc(D.types[P.type.code].name)}`],
      ['Темперамент', P => esc(D.temperaments[P.temp.id].name)],
      ['Привязанность', P => P.att ? esc(D.attach[P.att.id].name) : '—'],
      ['Главные ценности', P => P.val ? P.val.top.slice(0, 2).map(k => esc(S[k].name)).join(', ') : '—'],
      ['Мышление', P => P.mind ? esc(D.thinking[P.mind.think].name) : '—'],
      ['Хронотип', P => P.mind && P.mind.chrono ? esc(D.chrono[P.mind.chrono].split(' ')[0]) : '—'],
      ['Стиль в споре', P => P.conf ? esc(S[P.conf.top[0]].name) : '—'],
      ['Забота', P => P.care ? esc(S[P.care.rank[0]].name) : '—'],
      ['Роль', P => esc(D.roles[P.roles[0].id].name)]
    ];
    const both = m => pa.has(m) && pb.has(m);
    const miss = E.MODS.filter(m => !both(m));
    view().innerHTML = `${ctxBar()}
      <div class="card pair-head"><div class="duo">${ava(a, 'big')}<span class="amp">+</span>${ava(b, 'big')}</div>
        <div class="rings">${ring(r.compat, 'Совместимость ' + ctxName, 'var(--primary)')}${ring(r.sim, 'Схожесть', 'var(--accent)')}</div>
        <p class="center"><b>${esc(r.label)} совместимость</b> ${ctxName}.<br><span class="small muted">Схожесть — насколько вы похожи. Совместимость учитывает и то, что помогает отношениям независимо от сходства.</span></p></div>
      <section class="card"><h3 class="card-h">Из чего складывается</h3>${r.parts.map(x => `<div class="part">${bar(x.name, x.v, heatBar(x.v))}<div class="small muted part-h">${esc(x.hint)} · вес ${r0(x.w * 100)}%</div></div>`).join('')}
        ${miss.length ? `<p class="note">Не учтены блоки, которые прошли не оба: ${miss.map(m => '«' + esc(D.modules.find(x => x.id === m).name) + '»').join(', ')}.</p>` : ''}</section>
      <section class="card"><h3 class="card-h">Сильные стороны</h3>${li(r.plus, 'plus', 'check')}</section>
      ${r.minus.length ? `<section class="card"><h3 class="card-h">Зоны трения</h3>${li(r.minus, 'minus', 'warn')}</section>` : ''}
      ${r.tips.length ? `<section class="card"><h3 class="card-h">Советы</h3>${li(r.tips, 'tip', 'bulb')}</section>` : ''}
      <section class="card"><h3 class="card-h">Коротко о каждом</h3><div class="tbl"><table class="cmp-t"><tr><th></th><th>${ava(a)} ${esc(a.name)}</th><th>${ava(b)} ${esc(b.name)}</th></tr>
        ${rowsCmp.map(([l, f]) => `<tr><td class="muted">${esc(l)}</td><td>${f(pa)}</td><td>${f(pb)}</td></tr>`).join('')}</table></div></section>
      <section class="card"><h3 class="card-h">Характеры рядом</h3>${legend([a, b])}
        ${DOM_ORDER.map(k => dots(D.domains[k].name, [{ v: pa.dom[k].pct, c: color(a), t: a.name }, { v: pb.dom[k].pct, c: color(b), t: b.name }])).join('')}
        ${dots('Честность-скромность', [{ v: pa.pct.hon, c: color(a), t: a.name }, { v: pb.pct.hon, c: color(b), t: b.name }])}
        <details><summary>10 аспектов</summary>${E.modScales.char.filter(k => k !== 'hon').map(k => dots(S[k].name, [{ v: pa.pct[k], c: color(a), t: a.name }, { v: pb.pct[k], c: color(b), t: b.name }])).join('')}</details></section>
      <section class="card"><h3 class="card-h">Темперамент${both('att') ? ' и привязанность' : ''}</h3><div class="maps">
        ${tempMap([Object.assign(tempPt(pa), { c: color(a), t: a.name }), Object.assign(tempPt(pb), { c: color(b), t: b.name })])}
        ${both('att') ? attMap([{ x: pa.att.avo, y: pa.att.anx, c: color(a), t: a.name }, { x: pb.att.avo, y: pb.att.anx, c: color(b), t: b.name }]) : ''}</div></section>
      ${both('val') ? `<section class="card"><h3 class="card-h">Ценности</h3>${legend([a, b])}${radar([{ c: pa.val.c, col: color(a) }, { c: pb.val.c, col: color(b) }])}</section>` : ''}
      <p class="note">Совместимость здесь — повод для разговора, а не приговор. Исследования показывают: счастье пары больше зависит от того, как вы относитесь друг к другу, чем от совпадения черт. <a href="#/theory/compat">Что говорит наука</a></p>`;
    bindCtx();
  }

  // ───────── group report ─────────
  function vGroup(ids) {
    const list = ids.split(',').map(byId).filter(p => p && p.mods.length);
    if (list.length < 2) return go('#/compare');
    if (list.length === 2) return go(`#/pair/${list[0].id}/${list[1].id}`);
    setTitle(`Группа (${list.length})`, '#/compare');
    const ents = list.map(ent), g = E.group(ents, Store.d.ctx), key = Store.d.mode === 'sim' ? 'sim' : 'compat';
    const cell = (i, j) => {
      if (i === j) return `<td class="self">${ava(list[i])}</td>`;
      const v = g.M[i][j][key];
      return `<td><a href="#/pair/${list[i].id}/${list[j].id}" style="background:${heat(v)}">${v}</a></td>`;
    };
    const bySim = g.pairs.slice().sort((p, q) => q.sim - p.sim);
    const pn = p => `${esc(list[p.i].name)} + ${esc(list[p.j].name)}`;
    const hl = [
      ['Самая гармоничная пара', g.pairs[0], `совместимость ${g.pairs[0].compat}%`],
      ['Самые похожие', bySim[0], `схожесть ${bySim[0].sim}%`],
      ['Самые разные', bySim[bySim.length - 1], `схожесть ${bySim[bySim.length - 1].sim}%`]
    ];
    const withAtt = list.filter(p => prof(p).att);
    view().innerHTML = `${ctxBar()}
      <section class="card"><div class="row"><h3 class="card-h" style="flex:1;margin:0">Матрица</h3>${seg('mode', [['compat', 'Совместимость'], ['sim', 'Схожесть']], key)}</div>
        <div class="tbl"><table class="heat"><tr><th></th>${list.map(p => `<th>${ava(p)}</th>`).join('')}</tr>
        ${list.map((p, i) => `<tr><th class="hn">${ava(p)}<span>${esc(p.name)}</span></th>${list.map((_, j) => cell(i, j)).join('')}</tr>`).join('')}</table></div>
        <p class="note">Нажмите на число, чтобы открыть подробный отчёт по паре.</p></section>
      <div class="grid hl">${hl.map(([t, p, s]) => `<a class="tile" href="#/pair/${list[p.i].id}/${list[p.j].id}"><span class="tile-main"><span class="muted small">${t}</span><b>${pn(p)}</b><span class="small">${s}</span></span></a>`).join('')}</div>
      <section class="card"><h3 class="card-h">Портрет группы</h3>
        ${g.notes.length ? `<ul class="ins tip">${g.notes.map(t => `<li>${icon('bulb')}<span>${esc(t)}</span></li>`).join('')}</ul>` : '<p>Сбалансированная группа без ярких перекосов.</p>'}
        ${legend(list)}${DOM_ORDER.map(k => dots(D.domains[k].name, list.map(p => ({ v: prof(p).dom[k].pct, c: color(p), t: p.name })))).join('')}
        ${dots('Честность-скромность', list.map(p => ({ v: prof(p).pct.hon, c: color(p), t: p.name })))}</section>
      <section class="card"><h3 class="card-h">Роли в команде</h3><div class="tbl"><table>${g.roles.map(x => `<tr><td><b>${esc(D.roles[x.id].name)}</b><br><span class="small muted">${esc(D.roles[x.id].d)}</span></td>
        <td class="nowrap">${ava(list[x.best])} ${esc(list[x.best].name)}</td><td class="nowrap"><span class="badge ${x.v >= 65 ? 'ok' : x.v >= 55 ? '' : 'warn'}">${r0(x.v)}</span></td></tr>`).join('')}</table></div>
        <p class="note">Для каждой роли показан самый подходящий участник.</p></section>
      <section class="card"><h3 class="card-h">Темперамент${withAtt.length >= 2 ? ' и привязанность' : ''}</h3><div class="maps">
        ${tempMap(list.map(p => Object.assign(tempPt(prof(p)), { c: color(p), t: p.name })))}
        ${withAtt.length >= 2 ? attMap(withAtt.map(p => ({ x: prof(p).att.avo, y: prof(p).att.anx, c: color(p), t: p.name }))) : ''}</div></section>
      <section class="card"><h3 class="card-h">Участники</h3><div class="list">${list.map(p => { const P = prof(p); return `<a class="list-item" href="#/p/${p.id}">${ava(p)}<span class="li-main"><span class="li-title">${esc(p.name)}</span>
        <span class="li-sub"><b>${P.type.code}</b> ${esc(D.types[P.type.code].name)} · ${esc(D.temperaments[P.temp.id].name)} · ${esc(D.roles[P.roles[0].id].name)}</span></span>${icon('chev', 'chev')}</a>`; }).join('')}</div></section>
      <p class="note">Это повод для разговора, а не приговор. <a href="#/theory/compat">Что говорит наука о совместимости</a></p>`;
    bindCtx();
    $('[data-seg="mode"]').onclick = e => { const b = e.target.closest('button'); if (!b) return; Store.d.mode = b.dataset.v; Store.save(); route(); };
  }

  // ───────── theory ─────────
  const EV = { 3: ['сильная научная база', 'ok'], 2: ['умеренная научная база', ''], 1: ['слабая научная база', 'warn'] };
  function vTheory(id) {
    if (id) {
      const t = D.theory.find(x => x.id === id);
      if (!t) return go('#/theory');
      setTitle(t.title, '#/theory');
      view().innerHTML = `<section class="card"><h2>${esc(t.title)}</h2><p><span class="badge ${EV[t.ev][1]}">${EV[t.ev][0]}</span></p>
        ${t.text.map(s => `<p>${esc(s)}</p>`).join('')}<p class="small"><b>В приложении:</b> ${esc(t.used)}.</p>
        <h3>Книги и работы</h3><ul class="books">${t.books.map(b => `<li>${esc(b)}</li>`).join('')}</ul></section>`;
      return;
    }
    setTitle('Теория');
    view().innerHTML = `<p class="muted">На чём построен тест: модели психологии личности, что о них говорят исследования и какие книги почитать.</p>
      <div class="list">${D.theory.map(t => `<a class="list-item" href="#/theory/${t.id}"><span class="li-main"><span class="li-title">${esc(t.title)}</span>
        <span class="li-sub"><span class="badge ${EV[t.ev][1]}">${EV[t.ev][0]}</span> ${esc(t.used)}</span></span>${icon('chev', 'chev')}</a>`).join('')}</div>`;
  }

  // ───────── settings ─────────
  let installEvt = null;
  window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); installEvt = e; });
  function vSettings() {
    setTitle('Настройки');
    const dn = done();
    view().innerHTML = `<div class="card">
        <div class="setting"><span class="label">Тема</span>${seg('theme', [['auto', 'Авто'], ['light', 'Светлая'], ['dark', 'Тёмная']], Store.d.theme)}</div>
        <div class="setting"><span class="label">Размер текста</span>${seg('fs', [[15, 'A−'], [16, 'A'], [18, 'A+'], [20, 'A++']], Store.d.fs)}</div></div>
      <div class="card"><h3 class="card-h">Данные</h3><p class="small">Все ответы хранятся только на этом устройстве. Чтобы перенести участников на другое устройство, скопируйте их коды и вставьте там через «Добавить по коду».</p>
        <div class="row"><button class="btn secondary" id="expBtn"${dn.length ? '' : ' disabled'}>Коды всех участников</button><button class="btn danger" id="wipeBtn"${people().length ? '' : ' disabled'}>Удалить всех</button></div></div>
      <div class="card"><h3 class="card-h">Установка</h3><p class="small">Сайт: <a href="https://iioverlordii.github.io/The-connection-between-us/" target="_blank" rel="noopener">iioverlordii.github.io/The-connection-between-us/</a></p>
        <p class="small">iPhone/iPad: откройте сайт в Safari → «Поделиться» → «На экран „Домой“». После первого запуска работает без интернета.</p>
        <p class="small">Android: Chrome → меню → «Установить приложение». Windows: <a href="https://github.com/IIOverlordII/The-connection-between-us/releases/latest" target="_blank" rel="noopener">Psychoprofile.exe</a> или Edge/Chrome → меню → «Приложения» → «Установить».</p>
        <button class="btn" id="installBtn"${installEvt ? '' : ' hidden'}>Установить приложение</button></div>
      <div class="card"><h3 class="card-h">О приложении</h3><p class="small">${E.N} вопросов в ${E.MODS.length} блоках. Вопросы о чертах личности адаптированы из открытой базы International Personality Item Pool (общественное достояние), остальные составлены для этого приложения по описаниям научных моделей (см. «Теория»).</p>
        <p class="small">Результаты — самоописание, а не диагноз. Если вас беспокоит эмоциональное состояние, обратитесь к психологу или психотерапевту.</p></div>`;
    $$('[data-seg]').forEach(sg => sg.onclick = e => {
      const b = e.target.closest('button'); if (!b) return;
      const k = sg.dataset.seg;
      Store.d[k] = k === 'fs' ? +b.dataset.v : b.dataset.v; Store.save(); applyPrefs(); route();
    });
    $('#expBtn').onclick = () => shareModal(dn);
    $('#wipeBtn').onclick = () => { if (confirm('Удалить всех участников и все ответы?')) { Store.d.people = []; Store.d.sel = []; cache.clear(); Store.save(); route(); } };
    const ib = $('#installBtn');
    if (ib) ib.onclick = () => { if (!installEvt) return; installEvt.prompt(); installEvt = null; ib.hidden = true; };
  }

  // ───────── routing ─────────
  function route() {
    const h = location.hash.replace(/^#\/?/, '');
    const [a, b, c] = h.split('/');
    closeModal(); setExtra(''); keyHandler = null;
    renderNav(a || '');
    switch (a) {
      case '': case undefined: vHome(); break;
      case 'new': vNew(); break;
      case 'take': vTake(b); break;
      case 'p': vReport(b, c); break;
      case 'import': vImport(b, c); break;
      case 'compare': vCompare(); break;
      case 'pair': vPair(b, c); break;
      case 'group': vGroup(b || ''); break;
      case 'theory': vTheory(b); break;
      case 'settings': vSettings(); break;
      default: vHome();
    }
    $('#view').focus({ preventScroll: true });
  }
  window.addEventListener('hashchange', () => { route(); window.scrollTo(0, 0); });
  applyPrefs();
  route();

  // offline cache on https; locally only with ?sw=1 so it does not get in the way of development
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.search.includes('sw=1'))) {
    navigator.serviceWorker.register('sw.js').catch(() => { /* offline cache unavailable */ });
  }
})();
