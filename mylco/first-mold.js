// Dimensions are in millimetres; master volume is calculated from the supplied STL.
const freeVolumeMl = 70 * 60 * 15 / 1000 - 7.524828871379327;
const gramsPerMold = freeVolumeMl * 1.12 * 1.10;
const publicPrices = [
  {grams:1020, price:1500, label:'1,02 кг', link:'https://mylco.ru/kupit-silikon-v-moskve/na-osnove-olova-1/alcorsil/alcorsil-20-1-05-kg?utm_source=mylco_studio&utm_medium=referral&utm_campaign=first_mold&utm_content=shell_small'},
  {grams:5010, price:5500, label:'5,01 кг', link:'https://mylco.ru/kupit-silikon-v-moskve/na-osnove-olova-1/alcorsil/alcorsil-20-5-01-kg?utm_source=mylco_studio&utm_medium=referral&utm_campaign=first_mold&utm_content=shell_large'}
];
const quantity = byId('mold-qty');
const fmtMix = new Intl.NumberFormat('ru-RU', {maximumFractionDigits:2});
function updateMoldOrder() {
  const count = quantity.valueAsNumber;
  const valid = Number.isInteger(count) && count >= 1 && count <= 10000;
  byId('mold-answer').hidden = !valid;
  quantity.setAttribute('aria-invalid', String(!valid));
  byId('mix-warning').textContent = valid ? '' : 'Введите целое число форм от 1 до 10 000.';
  if (!valid) return;
  const grams = gramsPerMold * count;
  const plan = leastCostPacks(publicPrices, Math.ceil(grams));
  byId('mix-total').textContent = fmtMix.format(grams) + ' г';
  byId('mix-packs').textContent = plan.lines.map(([pack, n]) => n + ' × ' + pack.label).join(' + ');
  byId('mix-price').textContent = fmtMix.format(plan.cost) + ' ₽';
  const planLink = 'materialy.html?material=alcorsil-20&via=first-mold&grams=' + Math.ceil(grams) + '#pack-calculator';
  const buyLink = byId('mix-buy');
  const singlePack = plan.count === 1;
  buyLink.href = singlePack ? plan.lines[0][0].link : planLink;
  buyLink.textContent = singlePack ? 'Купить Alcorsil 20 ↗' : 'Собрать набор упаковок →';
  buyLink.dataset.event = singlePack ? 'mold_purchase' : 'mold_pack_list';
  byId('mix-plan').href = planLink;
  byId('mix-plan').hidden = !singlePack;
}
quantity.addEventListener('input', updateMoldOrder);
updateMoldOrder();
