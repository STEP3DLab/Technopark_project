'use strict';

// Prices and masses in the catalogue are whole roubles and grams.
function leastCostPacks(options, target, limit = 1000000, goal = 'cost') {
  if (!Number.isSafeInteger(target) || target <= 0 || !options.length || options.length > 2) return null;
  const [bulk, other] = [...options].sort((a, b) =>
    a.price * b.grams - b.price * a.grams || b.grams - a.grams);
  const single = Math.ceil(target / bulk.grams);
  if (!other) {
    return single > limit ? null : {lines:[[bulk, single]], cost:single * bulk.price, grams:single * bulk.grams, count:single};
  }
  // One exchange replaces a batch of the less economical pack by exactly the same mass.
  // Beyond one full exchange from the first feasible quantity, the price cannot improve.
  let common = bulk.grams, rest = other.grams;
  while (rest) [common, rest] = [rest, common % rest];
  const first = Math.max(0, Math.ceil((target - limit * bulk.grams) / other.grams));
  const last = Math.min(limit, Math.ceil(target / other.grams), first + bulk.grams / common - 1);
  let best = null;
  for (let n = first; n <= last; n++) {
    const m = Math.max(0, Math.ceil((target - n * other.grams) / bulk.grams));
    const cost = m * bulk.price + n * other.price;
    const grams = m * bulk.grams + n * other.grams;
    const count = m + n;
    if (best) {
      const difference = goal === 'surplus'
        ? grams - best.grams || cost - best.cost
        : cost - best.cost || grams - best.grams;
      if (difference > 0 || (difference === 0 && count >= best.count)) continue;
    }
    best = {lines:[[bulk, m], [other, n]].filter(([, qty]) => qty), cost, grams, count};
  }
  return best;
}
