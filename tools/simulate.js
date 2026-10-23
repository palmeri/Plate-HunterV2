// Симуляция баланса: node tools/simulate.js [пак] [круток]
import fs from 'node:fs';
import { generate, evaluate } from '../server/engine.js';
const id = process.argv[2] || 'ru', N = +process.argv[3] || 1_000_000, COST = 10;
const pack = JSON.parse(fs.readFileSync(new URL(`../packs/${id}.json`, import.meta.url)));
const rnd = n => Math.floor(Math.random() * n);
const tiers = pack.tiers.map(() => 0), hitCount = {}; let sum = 0, pts = 0, max = 0;
for (let i = 0; i < N; i++) {
  const e = evaluate(pack, generate(pack, rnd));
  tiers[e.rank]++; sum += e.price; pts += e.total; max = Math.max(max, e.total);
  for (const h of e.hits) hitCount[h.name] = (hitCount[h.name] || 0) + 1;
}
console.log(`Пак ${id}, круток: ${N}`);
console.log(`Средняя цена продажи: ${(sum / N).toFixed(2)} при цене крутки ${COST} -> возврат ${(100 * sum / N / COST).toFixed(1)}%`);
console.log(`Средние очки: ${(pts / N).toFixed(2)}, максимум: ${max}`);
pack.tiers.forEach((t, i) => console.log(`  ${t.name.padEnd(12)} ${(100 * tiers[i] / N).toFixed(3)}%`));
console.log('Частота правил:');
for (const [k, v] of Object.entries(hitCount).sort((a, b) => b[1] - a[1])) console.log(`  ${k.padEnd(30)} ${(100 * v / N).toFixed(3)}%`);
