// Сервер без внешних зависимостей (только встроенные модули Node.js 18+).
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { generate, evaluate, present } from './engine.js';
import { verifyInitData } from './verify.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const BOT_TOKEN = process.env.BOT_TOKEN || '';
const DEV_MODE = process.env.DEV_MODE === '1';           // только для локальных тестов!
const DATA_FILE = process.env.DATA_FILE || path.join(here, '..', 'data', 'db.json');
const PORT = process.env.PORT || 3000;
const CFG = { startCoins: 100, spinCost: 10, garageSize: 12 };

// Паки: каждый файл packs/*.json — отдельная страна (DLC = новый файл).
const packs = {};
for (const f of fs.readdirSync(path.join(here, '..', 'packs')).filter(f => f.endsWith('.json'))) {
  const p = JSON.parse(fs.readFileSync(path.join(here, '..', 'packs', f), 'utf8'));
  packs[p.id] = p;
}
const ACTIVE_PACK = 'ru';

// Хранилище: один JSON-файл (для прототипа). Для продакшена замените на PostgreSQL.
let db = { players: {} };
try { db = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')); } catch {}
function save() {
  fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
  fs.writeFileSync(DATA_FILE + '.tmp', JSON.stringify(db));
  fs.renameSync(DATA_FILE + '.tmp', DATA_FILE);
}
const player = id => (db.players[id] ??= { coins: CFG.startCoins, pending: null, garage: [], nextId: 1 });

const send = (res, code, body) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(body)); };
const fail = (res, code, error) => send(res, code, { error });

function userFrom(req) {
  const h = req.headers.authorization || '';
  if (h.startsWith('tma ')) { const u = verifyInitData(h.slice(4), BOT_TOKEN); return u && String(u.id); }
  if (DEV_MODE && h.startsWith('dev ')) return 'dev-' + h.slice(4).replace(/\W/g, '').slice(0, 20);
  return null;
}
const readBody = req => new Promise(r => {
  let s = ''; req.on('data', c => { if (s.length < 1e4) s += c; });
  req.on('end', () => { try { r(JSON.parse(s || '{}')); } catch { r({}); } });
});

const view = p => ({
  coins: p.coins,
  pending: p.pending && present(packs[p.pending.pack], p.pending),
  garage: p.garage.map(g => ({ id: g.id, ...present(packs[g.plate.pack], g.plate) })),
  config: { ...CFG, tiers: packs[ACTIVE_PACK].tiers.map(t => t.name) }
});

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  res.setHeader('Access-Control-Allow-Origin', process.env.FRONT_ORIGIN || '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }

  if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/index.html')) {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    return res.end(fs.readFileSync(path.join(here, '..', 'web', 'index.html')));
  }
  if (!url.pathname.startsWith('/api/')) return fail(res, 404, 'not_found');

  const uid = userFrom(req);
  if (!uid) return fail(res, 401, 'unauthorized');
  const p = player(uid);
  const route = req.method + ' ' + url.pathname;

  if (route === 'GET /api/state') return send(res, 200, view(p));

  if (route === 'POST /api/spin') {
    if (p.pending) return fail(res, 409, 'resolve_pending');
    if (p.coins < CFG.spinCost) return fail(res, 402, 'no_coins');
    p.coins -= CFG.spinCost;
    p.pending = generate(packs[ACTIVE_PACK]);
    save(); return send(res, 200, view(p));
  }
  if (route === 'POST /api/sell') {
    if (!p.pending) return fail(res, 409, 'nothing_pending');
    p.coins += evaluate(packs[p.pending.pack], p.pending).price; p.pending = null;
    save(); return send(res, 200, view(p));
  }
  if (route === 'POST /api/keep') {
    if (!p.pending) return fail(res, 409, 'nothing_pending');
    if (p.garage.length >= CFG.garageSize) return fail(res, 409, 'garage_full');
    p.garage.push({ id: p.nextId++, plate: p.pending }); p.pending = null;
    save(); return send(res, 200, view(p));
  }
  if (route === 'POST /api/sell-garage') {
    const { id } = await readBody(req);
    const i = p.garage.findIndex(g => g.id === id);
    if (i < 0) return fail(res, 404, 'not_found');
    p.coins += evaluate(packs[p.garage[i].plate.pack], p.garage[i].plate).price; p.garage.splice(i, 1);
    save(); return send(res, 200, view(p));
  }
  fail(res, 404, 'not_found');
});
server.listen(PORT, () => console.log('Plate Hunter on :' + PORT + (DEV_MODE ? ' [DEV_MODE]' : '')));
