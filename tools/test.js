// Автотест: движок, подпись Telegram, игровой цикл, ежедневки, коллекции.
import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { generate, evaluate, plateText, plateKeys } from '../server/engine.js';

const TOKEN = '123456:TEST-TOKEN', PORT = 3911, DB = '/tmp/ph-test.json';
const pack = JSON.parse(fs.readFileSync(new URL('../packs/ru.json', import.meta.url)));

// --- 1. Движок
const e = (letters, digits, region) => evaluate(pack, { pack: 'ru', letters, digits, region });
assert.equal(e('АМР', '123', '16').hits.some(h => h.name === 'Лесенка'), true);
assert.equal(e('ААА', '777', '77').total, Math.round((30 + 10 + 30 + 10 + 8) * 1.5));
assert.equal(e('АМР', '199', '199').hits.some(h => h.name === 'Цифры = регион'), true);
assert.equal(e('АВЕ', '358', '16').total, 0);
for (let i = 0; i < 20000; i++) { const p = generate(pack); assert.match(p.digits, /^(?!000)\d{3}$/); assert.ok(pack.regions.includes(p.region)); }
assert.equal(plateText({ letters: 'АВС', digits: '123' }), 'А123ВС');
assert.deepEqual(plateKeys(pack, { pack: 'ru', letters: 'АВЕ', digits: '121', region: '78' }), ['region:78', 'rule:Зеркальные цифры']);
for (const c of pack.collections) for (const en of c.entries) assert.match(en.key, /^(region|rule):/);

// --- 2. Данные для сервера: игрок 1 со «вчерашним» днём, игрок 2 почти собрал коллекцию «Москва»
const sign = (user, token = TOKEN) => {
  const p = new URLSearchParams({ auth_date: String(Math.floor(Date.now() / 1000)), user: JSON.stringify(user) });
  const check = [...p.entries()].map(([k, v]) => `${k}=${v}`).sort().join('\n');
  const secret = crypto.createHmac('sha256', 'WebAppData').update(token).digest();
  p.set('hash', crypto.createHmac('sha256', secret).update(check).digest('hex'));
  return p.toString();
};
const stale = { date: '2000-01-01', free: false, tasks: [] };
const moscow = pack.collections.find(c => c.id === 'moscow');
const found2 = {}; for (const en of moscow.entries.filter(x => x.key !== 'region:77')) found2['ru|' + en.key] = true;
fs.writeFileSync(DB, JSON.stringify({ players: {
  1: { coins: 100, pending: null, garage: [], nextId: 1, found: {}, done: {}, daily: stale },
  2: { coins: 100, pending: { pack: 'ru', letters: 'АВЕ', digits: '123', region: '77' }, garage: [], nextId: 1, found: found2, done: {}, daily: stale }
} }));

const srv = spawn('node', ['server/server.js'], { env: { ...process.env, PORT, BOT_TOKEN: TOKEN, DATA_FILE: DB }, stdio: 'ignore' });
await new Promise(r => setTimeout(r, 700));
const call = async (path, method = 'GET', auth, body) => {
  const r = await fetch(`http://localhost:${PORT}${path}`, { method, headers: { Authorization: auth, 'Content-Type': 'application/json' }, body: body && JSON.stringify(body) });
  return { status: r.status, json: await r.json() };
};
try {
  const A = 'tma ' + sign({ id: 1, first_name: 'Тест' }), B = 'tma ' + sign({ id: 2 });
  assert.equal((await call('/api/state', 'GET', 'tma ' + sign({ id: 1 }, 'WRONG:TOKEN'))).status, 401);
  assert.equal((await call('/api/state', 'GET', 'dev 1')).status, 401);

  // Новый день: бесплатная крутка и ровно 3 разных задания
  let st = (await call('/api/state', 'GET', A)).json;
  assert.equal(st.daily.free, true); assert.equal(st.daily.tasks.length, 3);
  assert.equal(new Set(st.daily.tasks.map(t => t.id)).size, 3); assert.equal(st.coins, 100);
  assert.equal((await call('/api/state', 'GET', A)).json.daily.tasks.map(t => t.id).join(), st.daily.tasks.map(t => t.id).join()); // задания стабильны

  const n = { spins: 0, sells: 0, keeps: 0, earned: 0, unc: 0, rare: 0 };
  const spin = async () => { const r = await call('/api/spin', 'POST', A); assert.equal(r.status, 200); n.spins++;
    if (r.json.pending.rank >= 1) n.unc++; if (r.json.pending.rank >= 2) n.rare++; return r.json; };
  const sell = async () => { const r = await call('/api/sell', 'POST', A); n.sells++; return r.json; };

  let s = await spin(); assert.equal(s.coins, 100);                 // первая крутка бесплатна
  assert.equal(s.daily.free, false);
  assert.equal((await call('/api/spin', 'POST', A)).status, 409);   // нельзя крутить, пока не решили судьбу номера
  assert.ok((await call('/api/state', 'GET', A)).json.pending);     // номер не теряется при перезагрузке
  const price = s.pending.price; n.earned += price;
  s = await sell(); assert.equal(s.coins, 100 + price);
  const before = s.coins; s = await spin(); assert.equal(s.coins, before - 10); n.earned += s.pending.price; await sell();  // вторая стоит 10
  for (let i = 0; i < 6; i++) { s = await spin(); n.earned += s.pending.price; await sell(); }

  // Сохранение: считаем, какие записи коллекций должны открыться
  const kept = [];
  for (let i = 0; i < 3; i++) { s = await spin(); kept.push(s.pending); const r = await call('/api/keep', 'POST', A); n.keeps++; assert.equal(r.status, 200); }
  st = (await call('/api/state', 'GET', A)).json;
  assert.equal(st.garage.length, 3);
  const expectKeys = new Set(kept.flatMap(p => ['region:' + p.region, ...p.hits.map(h => 'rule:' + h.name)]));
  for (const c of st.collections) for (const en of c.entries) assert.equal(en.found, expectKeys.has(en.key), en.key);

  // Прогресс заданий считается точно
  const want = { spin5: n.spins, sell3: n.sells, keep2: n.keeps, earn60: n.earned, unc: n.unc, rare: n.rare };
  const cap = { spin5: 5, sell3: 3, keep2: 2, earn60: 60, unc: 1, rare: 1 };
  for (const t of st.daily.tasks) assert.equal(t.progress, Math.min(cap[t.id], want[t.id]), t.id);

  // Награды: готовые забираем один раз, неготовые нельзя
  for (const t of st.daily.tasks) {
    const c0 = (await call('/api/state', 'GET', A)).json.coins, r = await call('/api/claim-task', 'POST', A, { id: t.id });
    if (t.progress >= t.target) { assert.equal(r.status, 200); assert.equal(r.json.coins, c0 + t.reward); assert.equal((await call('/api/claim-task', 'POST', A, { id: t.id })).status, 409); }
    else assert.equal(r.status, 409);
  }
  assert.equal((await call('/api/claim-task', 'POST', A, { id: 'nope' })).status, 404);

  // Продажа из гаража, двойная продажа невозможна
  const g = st.garage[0], c1 = (await call('/api/state', 'GET', A)).json.coins;
  assert.equal((await call('/api/sell-garage', 'POST', A, { id: g.id })).json.coins, c1 + g.price);
  assert.equal((await call('/api/sell-garage', 'POST', A, { id: g.id })).status, 404);

  // Игрок 2 добирает последнюю запись коллекции «Москва»: награда начисляется один раз
  let r = await call('/api/keep', 'POST', B);
  assert.equal(r.json.coins, 100 + moscow.reward); assert.match(r.json.notice, /Москва/);
  assert.equal(r.json.collections.find(c => c.id === 'moscow').done, true);
  console.log('Все проверки пройдены');
} finally { srv.kill(); }
