// Автотест: запускает сервер, подписывает initData как Telegram и проходит игровой цикл.
import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { generate, evaluate, plateText } from '../server/engine.js';

const TOKEN = '123456:TEST-TOKEN', PORT = 3911, DB = '/tmp/ph-test.json';
fs.rmSync(DB, { force: true });
const pack = JSON.parse(fs.readFileSync(new URL('../packs/ru.json', import.meta.url)));

// 1. Движок
const e = (letters, digits, region) => evaluate(pack, { pack: 'ru', letters, digits, region });
assert.equal(e('АВС'.replace('В','Е').replace('С','Х'), '123', '16').hits.some(h => h.name === 'Лесенка'), true);
assert.equal(e('ААА', '777', '77').total, Math.round((30 + 10 + 30 + 10 + 8) * 1.5)); // комбо буквы+цифры
assert.equal(e('АМР', '199', '199').hits.some(h => h.name === 'Цифры = регион'), true);
assert.equal(e('АВЕ', '358', '16').total, 0);
for (let i = 0; i < 20000; i++) { const p = generate(pack); assert.match(p.digits, /^(?!000)\d{3}$/); assert.ok(pack.regions.includes(p.region)); }
assert.equal(plateText({ letters: 'АВС', digits: '123' }), 'А123ВС');

// 2. Подпись initData
const sign = (user, token = TOKEN) => {
  const p = new URLSearchParams({ auth_date: String(Math.floor(Date.now() / 1000)), user: JSON.stringify(user) });
  const check = [...p.entries()].map(([k, v]) => `${k}=${v}`).sort().join('\n');
  const secret = crypto.createHmac('sha256', 'WebAppData').update(token).digest();
  p.set('hash', crypto.createHmac('sha256', secret).update(check).digest('hex'));
  return p.toString();
};

const srv = spawn('node', ['server/server.js'], { env: { ...process.env, PORT, BOT_TOKEN: TOKEN, DATA_FILE: DB }, stdio: 'ignore' });
await new Promise(r => setTimeout(r, 700));
const call = async (path, method = 'GET', auth, body) => {
  const r = await fetch(`http://localhost:${PORT}${path}`, { method, headers: { Authorization: auth, 'Content-Type': 'application/json' }, body: body && JSON.stringify(body) });
  return { status: r.status, json: await r.json() };
};
try {
  const A = 'tma ' + sign({ id: 1, first_name: 'Тест' });
  assert.equal((await call('/api/state', 'GET', 'tma ' + sign({ id: 1 }, 'WRONG:TOKEN'))).status, 401);
  assert.equal((await call('/api/state', 'GET', 'dev 1')).status, 401);             // dev выключен
  assert.equal((await call('/api/state', 'GET', A)).json.coins, 100);
  let r = await call('/api/spin', 'POST', A); assert.equal(r.json.coins, 90); assert.ok(r.json.pending);
  assert.equal((await call('/api/spin', 'POST', A)).status, 409);                    // нельзя крутить, пока не решили судьбу номера
  assert.ok((await call('/api/state', 'GET', A)).json.pending);                      // номер не теряется при перезагрузке
  const price = r.json.pending.price;
  r = await call('/api/sell', 'POST', A); assert.equal(r.json.coins, 90 + price);
  await call('/api/spin', 'POST', A); r = await call('/api/keep', 'POST', A);
  assert.equal(r.json.garage.length, 1);
  const gid = r.json.garage[0].id, gp = r.json.garage[0].price, before = r.json.coins;
  r = await call('/api/sell-garage', 'POST', A, { id: gid }); assert.equal(r.json.coins, before + gp);
  assert.equal((await call('/api/sell-garage', 'POST', A, { id: gid })).status, 404); // двойная продажа невозможна
  // деньги кончаются
  let last; for (let i = 0; i < 30; i++) { last = await call('/api/spin', 'POST', A); if (last.status === 200) await call('/api/keep', 'POST', A); else break; }
  assert.ok([402, 409].includes(last.status));
  console.log('Все проверки пройдены');
} finally { srv.kill(); }
