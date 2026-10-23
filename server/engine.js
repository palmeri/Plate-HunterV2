// Движок: читает правила из пака (packs/*.json), сам ничего не знает о конкретной стране.
import { randomInt } from 'node:crypto';

export const plateText = p => p.letters[0] + p.digits + p.letters.slice(1);

export function generate(pack, rnd = randomInt) {
  const L = () => pack.letters[rnd(pack.letters.length)];
  return {
    pack: pack.id,
    letters: L() + L() + L(),
    digits: String(rnd(999) + 1).padStart(3, '0'), // 001..999
    region: pack.regions[rnd(pack.regions.length)]
  };
}

const CHECKS = {
  sameDigits:     p => /^(\d)\1\1$/.test(p.digits),
  triple777:      p => p.digits === '777',
  smallDigits:    p => /^00[1-9]$/.test(p.digits),
  roundHundreds:  p => /^[1-9]00$/.test(p.digits),
  ladder: p => { const a = [...p.digits].map(Number);
    return (a[1] - a[0] === 1 && a[2] - a[1] === 1) || (a[0] - a[1] === 1 && a[1] - a[2] === 1); },
  mirror:         p => p.digits[0] === p.digits[2] && p.digits[0] !== p.digits[1],
  sameLetters:    p => p.letters[0] === p.letters[1] && p.letters[1] === p.letters[2],
  letterSeries:   (p, r) => r.list.includes(p.letters),
  regionIn:       (p, r) => r.list.includes(p.region),
  digitsEqRegion: p => p.digits === p.region
};

export function evaluate(pack, p) {
  const hits = [], groups = new Set();
  let total = 0;
  for (const r of pack.rules) {
    if (CHECKS[r.check](p, r)) { hits.push({ name: r.name, pts: r.pts }); total += r.pts; groups.add(r.group); }
  }
  if (groups.has('letters') && groups.has('digits')) total = Math.round(total * pack.comboMultiplier);
  let rank = 0;
  pack.tiers.forEach((t, i) => { if (total >= t.min) rank = i; });
  return { total, hits, rank, tier: pack.tiers[rank].name, price: pack.price.base + total * pack.price.perPoint };
}

export const present = (pack, p) => ({ text: plateText(p), region: p.region, ...evaluate(pack, p) });
