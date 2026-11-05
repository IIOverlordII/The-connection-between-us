// Saving to Google Drive. After "Sign in with Google" the app keeps one hidden file (between-us.json) in the user's
// own Drive, in the app's private folder (appDataFolder), and merges it with this device's data. No server of ours
// is involved: the browser talks to Google directly. While CLIENT_ID is empty the feature is hidden.
(function (root) {
  'use strict';
  // Google Cloud → Google Auth Platform → Clients → the web client's ID (…apps.googleusercontent.com).
  // Its "Authorized JavaScript origins" must list every address the app is opened from.
  const CLIENT_ID = '299674430190-184dfge6svvesbpccm4lpobqc70qbnmm.apps.googleusercontent.com';
  const DRIVE = 'https://www.googleapis.com/auth/drive.appdata';
  const SCOPE = DRIVE + ' email';
  const NAME = 'between-us.json';
  const API = 'https://www.googleapis.com';
  const enabled = !!CLIENT_ID;
  const host = () => (root.location && root.location.hostname) || '';
  // Google signs in only on the origins listed for the client: not in the Windows program (file://) or on old copies
  const available = () => enabled && /^(www\.)?aureliel\.store$|\.workers\.dev$|^localhost$|^127\.0\.0\.1$/.test(host());
  const err = code => Object.assign(new Error(code), { code });

  // ───────── merging ─────────
  // People and games are matched by id and the newer copy wins; upd is set by stamp() whenever an item changes.
  // Deletions are kept in gone { 'p:<id>' | 'g:<id>' | 'lic': time } so that they reach the other devices too.
  const KEEP_GONE = 400 * 864e5;
  const ver = x => (x && (x.upd || x.checked || x.created)) || 0;
  const body = x => { const { upd, ...rest } = x; return JSON.stringify(rest); };
  function items(d) {
    const out = [];
    (d.people || []).forEach(x => out.push(['p:' + x.id, x]));
    (d.games || []).forEach(x => out.push(['g:' + x.id, x]));
    if (d.lic) out.push(['lic', d.lic]);
    return out;
  }
  // what the items looked like at the last save, to tell which ones the next save changed
  const snapshot = d => new Map(items(d).map(([k, x]) => [k, body(x)]));
  // gives changed items upd = now, records removed ones in d.gone and updates snap; true when anything changed
  function stamp(d, snap, now = Date.now()) {
    let changed = false;
    const seen = new Set();
    for (const [k, x] of items(d)) {
      seen.add(k);
      const j = body(x);
      if (snap.get(k) !== j) { x.upd = now; snap.set(k, j); changed = true; }
    }
    for (const k of Array.from(snap.keys())) {
      if (!seen.has(k)) { snap.delete(k); (d.gone = d.gone || {})[k] = now; changed = true; }
    }
    if (d.gone) Object.keys(d.gone).forEach(k => { if (now - d.gone[k] > KEEP_GONE) delete d.gone[k]; });
    return changed;
  }
  // this device's data (a) merged with the Drive copy (b): { people, games, lic, gone }
  function merge(a, b) {
    const gone = Object.assign({}, a.gone);
    Object.entries(b.gone || {}).forEach(([k, v]) => { if (!(gone[k] >= v)) gone[k] = v; });
    const alive = (k, x) => !(gone[k] >= ver(x));
    const list = (p, la, lb) => {
      const other = new Map((lb || []).map(x => [x.id, x])), out = [];
      (la || []).forEach(x => {
        const y = other.get(x.id), w = y && ver(y) > ver(x) ? y : x;
        other.delete(x.id);
        if (alive(p + w.id, w)) out.push(w);
      });
      other.forEach(y => { if (alive(p + y.id, y)) out.push(y); });
      return out;
    };
    const lic = [a.lic, b.lic].filter(Boolean).sort((x, y) => ver(y) - ver(x))[0];
    const m = { people: list('p:', a.people, b.people), games: list('g:', a.games, b.games), gone };
    if (lic && alive('lic', lic)) m.lic = lic;
    return m;
  }
  // the Drive copy as written by this app; anything malformed is left out
  function clean(x) {
    const o = x && typeof x === 'object' ? x : {};
    const people = (Array.isArray(o.people) ? o.people : []).filter(p => p && typeof p.id === 'string' && typeof p.name === 'string'
      && typeof p.ans === 'string' && Array.isArray(p.mods) && Array.isArray(p.todo));
    const games = (Array.isArray(o.games) ? o.games : []).filter(g => g && typeof g.id === 'string' && Array.isArray(g.ids) && Array.isArray(g.players) && Array.isArray(g.me));
    const gone = {};
    if (o.gone && typeof o.gone === 'object') Object.entries(o.gone).forEach(([k, v]) => { if (typeof v === 'number') gone[k] = v; });
    const m = { people, games, gone };
    if (o.lic && typeof o.lic.code === 'string' && typeof o.lic.txn === 'string') m.lic = o.lic;
    return m;
  }
  const sig = d => JSON.stringify([d.people || [], d.games || [], d.lic || null, Object.entries(d.gone || {}).sort()]);
  const shown = d => JSON.stringify([d.people || [], d.games || [], d.lic || null]);

  // ───────── Google token ─────────
  // A token comes only from Google's sign-in window, which browsers let open only right after a click.
  // It lasts about an hour; it is kept for this tab only (sessionStorage), never in the saved data.
  const TOKEN_KEY = 'between-us-gtoken';
  let token = null;
  try {
    const s = JSON.parse(root.sessionStorage.getItem(TOKEN_KEY) || 'null');
    if (s && typeof s.v === 'string' && s.exp > Date.now()) token = s;
  } catch (e) { /* no sessionStorage */ }
  const hasToken = () => !!token && token.exp > Date.now() + 30e3;
  function setToken(v, seconds) {
    token = v ? { v, exp: Date.now() + (seconds || 3600) * 1000 } : null;
    try { if (token) root.sessionStorage.setItem(TOKEN_KEY, JSON.stringify(token)); else root.sessionStorage.removeItem(TOKEN_KEY); } catch (e) { /* tab-only token */ }
  }

  // Google's sign-in script is loaded only for people who use this
  let script = null;
  const oauth = () => root.google && root.google.accounts && root.google.accounts.oauth2;
  function load() {
    script = script || new Promise((resolve, reject) => {
      if (oauth()) { resolve(oauth()); return; }
      const s = document.createElement('script');
      s.src = 'https://accounts.google.com/gsi/client';
      s.async = true;
      s.onload = () => (oauth() ? resolve(oauth()) : reject(err('load')));
      s.onerror = () => { script = null; reject(err('load')); };
      document.head.appendChild(s);
    });
    return script;
  }

  let client = null, waiting = null;
  // call straight from a click: opens Google's window (it closes by itself when access was granted before).
  // Resolves the account's email ('' if Google didn't give it); rejects with code popup | closed | denied | login | load.
  function signIn(hint) {
    if (!oauth()) return load().then(() => signIn(hint)); // after loading, the browser may block the window: then a second click works
    const o = oauth();
    return new Promise((resolve, reject) => {
      if (waiting) waiting.reject(err('closed'));
      waiting = { resolve, reject };
      client = client || o.initTokenClient({
        client_id: CLIENT_ID, scope: SCOPE,
        callback: r => {
          const w = waiting; waiting = null;
          if (!w) return;
          if (!r || r.error || !r.access_token) { w.reject(err(r && r.error === 'access_denied' ? 'denied' : 'login')); return; }
          if (!o.hasGrantedAllScopes(r, DRIVE)) { w.reject(err('denied')); return; }
          setToken(r.access_token, +r.expires_in || 3600);
          email().then(w.resolve, () => w.resolve(''));
        },
        error_callback: e => {
          const w = waiting; waiting = null;
          if (w) w.reject(err(e && e.type === 'popup_failed_to_open' ? 'popup' : 'closed'));
        }
      });
      client.requestAccessToken(hint ? { prompt: '', hint } : { prompt: 'select_account' });
    });
  }
  function signOut() {
    const o = oauth();
    if (token && o) { try { o.revoke(token.v, () => {}); } catch (e) { /* signed out locally anyway */ } }
    setToken(null);
  }

  // ───────── Drive ─────────
  async function call(method, path, opts = {}) {
    if (!hasToken()) throw err('login');
    let r;
    try {
      r = await fetch(API + path, { method, headers: Object.assign({ authorization: 'Bearer ' + token.v }, opts.headers), body: opts.body });
    } catch (e) { throw err('network'); }
    if (r.status === 401) { setToken(null); throw err('login'); }
    if (r.status === 403 && /insufficient|scope/i.test(await r.clone().text().catch(() => ''))) throw err('denied');
    if (r.status === 404) return null;
    if (!r.ok) throw err('drive');
    return r.json().catch(() => ({})); // a damaged file counts as empty and gets rewritten
  }
  async function email() {
    const j = await call('GET', '/oauth2/v3/userinfo');
    return (j && typeof j.email === 'string' && j.email) || '';
  }
  async function find() {
    const q = encodeURIComponent(`name='${NAME}'`);
    const j = await call('GET', `/drive/v3/files?spaces=appDataFolder&q=${q}&fields=files(id)&orderBy=modifiedTime%20desc&pageSize=10`);
    return j && Array.isArray(j.files) && j.files[0] ? j.files[0].id : null;
  }
  async function write(id, data) {
    const text = JSON.stringify(data);
    if (id) {
      const j = await call('PATCH', `/upload/drive/v3/files/${encodeURIComponent(id)}?uploadType=media&fields=id`, { headers: { 'content-type': 'application/json' }, body: text });
      if (j) return j.id || id;
    }
    const b = 'between-us-' + Math.random().toString(36).slice(2);
    const meta = JSON.stringify({ name: NAME, parents: ['appDataFolder'], mimeType: 'application/json' });
    const multipart = `--${b}\r\ncontent-type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n--${b}\r\ncontent-type: application/json\r\n\r\n${text}\r\n--${b}--`;
    const j = await call('POST', '/upload/drive/v3/files?uploadType=multipart&fields=id', { headers: { 'content-type': `multipart/related; boundary=${b}` }, body: multipart });
    if (!j || !j.id) throw err('drive');
    return j.id;
  }
  // one round: reads the Drive copy, merges it with `local` ({ people, games, lic, gone }) and writes the result back
  // when Drive lacks something. Resolves { data, fid, changed } — changed: this device has to show something new.
  async function exchange(local, fid) {
    let id = fid || null;
    let remote = id ? await call('GET', `/drive/v3/files/${encodeURIComponent(id)}?alt=media`) : null;
    if (!remote) {
      id = await find();
      remote = id ? await call('GET', `/drive/v3/files/${encodeURIComponent(id)}?alt=media`) : null;
    }
    const r = clean(remote), m = merge(local, r);
    if (!id || !remote || sig(m) !== sig(r)) id = await write(id, Object.assign({ v: 1, app: 'between-us', saved: Date.now() }, m));
    return { data: m, fid: id, changed: shown(m) !== shown(local) };
  }

  root.Sync = { enabled, available, hasToken, setToken, load, signIn, signOut, exchange, snapshot, stamp, merge, clean };
})(typeof window !== 'undefined' ? window : globalThis);
