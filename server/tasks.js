// Ежедневные задания. on(событие) возвращает, на сколько растёт прогресс.
// События: {type:'spin', rank} | {type:'sell', amount} | {type:'keep'}
import { randomInt } from 'node:crypto';
export const TASKS = {
  spin5:  { text: 'Сделайте 5 круток',                      target: 5,  reward: 20, on: e => e.type === 'spin' ? 1 : 0 },
  sell3:  { text: 'Продайте 3 номера',                      target: 3,  reward: 15, on: e => e.type === 'sell' ? 1 : 0 },
  keep2:  { text: 'Сохраните 2 номера в гараж',             target: 2,  reward: 15, on: e => e.type === 'keep' ? 1 : 0 },
  earn60: { text: 'Заработайте 60 монет продажей',          target: 60, reward: 30, on: e => e.type === 'sell' ? e.amount : 0 },
  unc:    { text: 'Найдите номер «Необычный» или выше',     target: 1,  reward: 25, on: e => e.type === 'spin' && e.rank >= 1 ? 1 : 0 },
  rare:   { text: 'Найдите номер «Редкий» или выше',        target: 1,  reward: 60, on: e => e.type === 'spin' && e.rank >= 2 ? 1 : 0 }
};
export function pickTasks(n) {
  const ids = Object.keys(TASKS);
  for (let i = ids.length - 1; i > 0; i--) { const j = randomInt(i + 1); [ids[i], ids[j]] = [ids[j], ids[i]]; }
  return ids.slice(0, n);
}
