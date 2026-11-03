"""Готовит app/ к публикации: проверяет данные, обновляет офлайн-кэш (sw.js) и версии в index.html.

    python tools/build.py

Контент (вопросы, шкалы, тексты) лежит прямо в app/js/data.js — сборка его не генерирует, только проверяет.
"""
import hashlib, json, pathlib, re, shutil, subprocess, sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
APP = ROOT / 'app'
errors = []

# ───────────── проверка данных (через node, если он есть) ─────────────
node = shutil.which('node')
if node:
    check = r"""
global.window = globalThis;
require(process.argv[1] + '/js/data.js'); require(process.argv[1] + '/js/engine.js');
require(process.argv[1] + '/js/game-data.js'); require(process.argv[1] + '/js/game.js');
const D = PSY, err = [];
const mods = new Set(D.modules.map(m => m.id));
D.items.forEach(([s, k, t], i) => {
  if (!D.scales[s]) err.push(`item ${i}: unknown scale ${s}`);
  if (k !== 1 && k !== -1) err.push(`item ${i}: key must be 1 or -1`);
  if (!t || t.length < 6) err.push(`item ${i}: empty text`);
});
Object.entries(D.scales).forEach(([id, s]) => {
  if (!mods.has(s.mod)) err.push(`scale ${id}: unknown module ${s.mod}`);
  if (!D.items.some(it => it[0] === id)) err.push(`scale ${id}: no items`);
});
Object.keys(D.types).length === 16 || err.push('types: need 16');
if (D.items.length > 255) err.push('items: share code stores the count in one byte');
const cats = new Set(GAME.cats.map(c => c.id));
GAME.q.forEach((q, i) => {
  if (!cats.has(q[0])) err.push(`game q${i}: unknown category ${q[0]}`);
  if (q.length < 4 || q.length > 6) err.push(`game q${i}: needs 2–4 options`);
});
if (GAME.q.length > 65535) err.push('game: ids are stored in two bytes');
console.log(JSON.stringify({ err, items: D.items.length, mods: Engine.modCount, game: GAME.q.length }));
"""
    r = subprocess.run([node, '-e', check, str(APP)], capture_output=True, text=True, encoding='utf-8')
    if r.returncode:
        errors.append('node: ' + r.stderr.strip()[:500])
    else:
        info = json.loads(r.stdout)
        errors += info['err']
        print(f"items: {info['items']} {info['mods']}, game questions: {info['game']}")
else:
    print('node не найден — проверка data.js пропущена')

# ───────────── офлайн-кэш ─────────────
files = sorted(str(p.relative_to(APP)).replace('\\', '/') for p in APP.rglob('*') if p.is_file() and p.name != 'sw.js')
h = hashlib.sha1()
for f in files:
    if f != 'index.html':
        h.update(f.encode() + (APP / f).read_bytes())
digest = h.hexdigest()[:10]
index = APP / 'index.html'
text = index.read_text(encoding='utf-8')
text = re.sub(r'((?:src|href)="(?:css|js)/[^"?]+)(?:\?v=[^"]*)?"', rf'\1?v={digest}"', text)
index.write_text(text, encoding='utf-8', newline='\n')
sw = (ROOT / 'tools' / 'sw.template.js').read_text(encoding='utf-8')
sw = sw.replace('__VERSION__', digest).replace('__FILES__', json.dumps(['./'] + files, ensure_ascii=False))
(APP / 'sw.js').write_text(sw, encoding='utf-8', newline='\n')
print(f'sw: {len(files)} files, version {digest}')

if errors:
    print(f'\n{len(errors)} problem(s):')
    for e in errors:
        print(' -', e)
    sys.exit(1)
