import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {analysePower, parsePowerCsv, suggestGap} from '../analysis.mjs';

const header = 'time_s,ch1_W,ch2_W';
const fixture = name => readFile(new URL('../data/' + name, import.meta.url), 'utf8');
const row = (t, a, b) => ({t, a, b});
const emptyChannel = {n: 0, minW: null, maxW: null, intervals: 0, coveredS: 0, energyJ: null};

test('учебный CSV сохраняет происхождение и даёт контрольные интегралы', async () => {
  const example = await fixture('power-example.csv');
  const {rows, synthetic} = parsePowerCsv(example);
  assert.equal(synthetic, true);
  assert.equal(suggestGap(rows), 1.5);
  assert.deepEqual(analysePower(rows, 1.5), {
    nRows: 20, elapsedS: 12, maxGapSeconds: 1.5,
    channels: {
      a: {n: 19, minW: 0.09, maxW: 0.81, intervals: 16, coveredS: 8, energyJ: 3.765},
      b: {n: 19, minW: 0.05, maxW: 0.74, intervals: 16, coveredS: 8, energyJ: 2.985},
    },
    commonCoveredS: 7, commonIntervals: 14,
  });
  const records = rows.map(r => [r.t, r.a, r.b].join(','));
  assert.deepEqual(parsePowerCsv(['# SYNTHETIC', header, ...records].join('\n')), {rows, synthetic});
});

test('пустой шаблон допускает импорт без ложных нулевых интегралов', async () => {
  const input = parsePowerCsv(await fixture('power-template.csv'));
  assert.deepEqual(input, {rows: [], synthetic: false});
  assert.deepEqual(analysePower([], 1), {
    nRows: 0, elapsedS: 0, maxGapSeconds: 1,
    channels: {a: emptyChannel, b: emptyChannel}, commonCoveredS: 0, commonIntervals: 0,
  });
});

test('CSV понимает BOM, CRLF, кавычки, пропуски, десятичную запятую и экспоненту', () => {
  const input = '\uFEFF\r\n# SYNTHETIC\r\n "time_s" ; "ch1_W";"ch2_W"\r\n' +
    ' "-0,00" ; "1,25e-2" ; ""\r\n\t\r\n " +5,0e-1 " ; ; 2.5\r\n';
  assert.deepEqual(parsePowerCsv(input), {synthetic: true, rows: [row(0, 0.0125, null), row(0.5, null, 2.5)]});
  assert.deepEqual(parsePowerCsv(header + '\r0,,\r.5,".25",+4e-2\r'), {
    synthetic: false, rows: [row(0, null, null), row(0.5, 0.25, 0.04)],
  });
});

test('заголовок, метаданные, строка и число полей проверяются целиком', () => {
  for (const bad of [
    '', '\n# SYNTHETIC\n', 'time_s,ch2_W,ch1_W', 'time_ms,ch1_W,ch2_W',
    'time_s,ch1_mW,ch2_W', 'time_s,ch1_w,ch2_W', 'time_s,ch1_W,ch2_W,tag',
    '# comment\n' + header, '# SYNTHETIC\n# SYNTHETIC\n' + header,
    header + '\n# SYNTHETIC', header + '\n0,1', header + '\n0,1,2,', header + '\n0,1,2,3',
  ]) assert.throws(() => parsePowerCsv(bad), undefined, bad);
  assert.throws(() => parsePowerCsv(header + '\n0,1,2\n\n1,2,3,4'), /строке 4/);
  assert.throws(() => parsePowerCsv(null), /текст CSV/);
});

test('ошибочные кавычки, смешанные разделители и многострочные числа отклоняются', () => {
  for (const record of ['"0,1,2', '0,1,2"', '0,"1"x,2', '0,"1""2",3', '0,"1,2",3', '0,"1\n2",3']) {
    assert.throws(() => parsePowerCsv(header + '\n' + record), /строке 2/, record);
  }
  assert.throws(() => parsePowerCsv('time_s;ch1_W;ch2_W\n0;1,2.0;4'), /ch1_W/);
});

test('время обязательно, неотрицательно и строго возрастает', () => {
  for (const records of [',1,2', '-1,1,2', '1,1,2\n1,3,4', '2,1,2\n1,3,4', '1,,\n1.00000000000000001,,']) {
    assert.throws(() => parsePowerCsv(header + '\n' + records), undefined, records);
  }
});

test('числа должны быть конечными, неотрицательными и в пределах расчётного формата', () => {
  for (const token of ['NaN', 'Infinity', '-Infinity', '1e99999', '-0.2', '1 W', '1 000', '0x20', 'null', '.', '+', '1e', '1e-101', '1e-9999', '-1e-9999', '1000000001']) {
    assert.throws(() => parsePowerCsv(header + '\n0,' + token + ',2'), /ch1_W/, token);
  }
  assert.throws(() => parsePowerCsv(header + '\n1e13,1,2'), /time_s/);
  assert.deepEqual(parsePowerCsv(header + '\n0,1e-100,-0e-999\n1e12,1e9,3').rows,
    [row(0, 1e-100, 0), row(1e12, 1e9, 3)]);
});

test('пределы размера проверяются и для исходного текста, и для массива записей', () => {
  assert.throws(() => parsePowerCsv(' '.repeat(8 * 1024 * 1024 + 1)), /размер/i);
  assert.throws(() => parsePowerCsv(header + '\n' + '0'.repeat(1025)), /1024/);
  assert.throws(() => parsePowerCsv('\n'.repeat(200_003)), /200 002/);
  assert.throws(() => analysePower(Array(100_001), 1), /100 000/);
  const records = Array.from({length: 100_001}, (_, i) => i + ',,');
  assert.throws(() => parsePowerCsv([header, ...records].join('\n')), /100 000/);
});

test('пропуск каждого канала, неравномерный шаг и длинный разрыв учитываются раздельно', () => {
  const rows = [row(0, 1, 2), row(1, 3, 4), row(1.5, null, 2), row(2.5, 1, null),
    row(4, 5, 8), row(8, 9, 10), row(8.5, 0, 0)];
  assert.deepEqual(analysePower(rows, 1.5), {
    nRows: 7, elapsedS: 8.5, maxGapSeconds: 1.5,
    channels: {
      a: {n: 6, minW: 0, maxW: 9, intervals: 3, coveredS: 3, energyJ: 8.75},
      b: {n: 6, minW: 0, maxW: 10, intervals: 3, coveredS: 2, energyJ: 7},
    },
    commonCoveredS: 1.5, commonIntervals: 2,
  });
});

test('одиночные значения задают экстремумы, обе границы требуются для интеграла', () => {
  const single = analysePower([row(4, 0, null)], 1);
  assert.deepEqual(single.channels.a, {...emptyChannel, n: 1, minW: 0, maxW: 0});
  assert.deepEqual(single.channels.b, emptyChannel);
  assert.equal(single.elapsedS, 0);
  const isolated = analysePower([row(0, 4, null), row(1, null, 1), row(2, 1, null)], 20);
  assert.deepEqual(isolated.channels.a, {...emptyChannel, n: 2, minW: 1, maxW: 4});
  assert.equal(isolated.commonCoveredS, 0);
  const singleChannel = analysePower([row(0, 0, null), row(0.25, 0, null), row(5, 6, null)], 0.25);
  assert.deepEqual(singleChannel.channels.a, {n: 3, minW: 0, maxW: 6, intervals: 1, coveredS: 0.25, energyJ: 0});
  assert.deepEqual(singleChannel.channels.b, emptyChannel);
  assert.equal(singleChannel.commonIntervals, 0);
});

test('аналитический интеграл линейного сигнала на неравномерной сетке выражен в джоулях', () => {
  const rows = [0, 0.125, 1.25, 1.5, 7.75].map(t => row(t, 2 * t + 1, 4 * t));
  const result = analysePower(rows, 10);
  assert.equal(result.channels.a.energyJ, 67.8125);
  assert.equal(result.channels.b.energyJ, 120.125);
  assert.equal(result.commonCoveredS, 7.75);
  assert.equal(analysePower([row(0, 1, null), row(3600, 1, null)], 3600).channels.a.energyJ, 3600);
});

test('десятичные метки точно сравниваются с пределом, в том числе при большом начале шкалы', () => {
  const rows = [0.1, 0.2, 0.3, 0.4, 0.7, 0.8, 0.9000000000000001].map(t => row(t, 1, 2));
  const actual = analysePower(rows, 0.1);
  assert.equal(actual.commonIntervals, 4);
  assert.equal(actual.commonCoveredS, 0.4);
  assert.equal(actual.channels.a.energyJ, 0.4);
  assert.equal(actual.channels.b.energyJ, 0.8);
  const epoch = analysePower([row(1_700_000_000, 2, 3), row(1_700_000_000.1, 2, 3), row(1_700_000_000.2, 2, 3)], 0.1);
  assert.equal(epoch.commonIntervals, 2);
  assert.equal(epoch.elapsedS, 0.2);
  assert.equal(epoch.channels.a.energyJ, 0.4);
  // Десятичная разность равна 1.0000000000000001, хотя Number округляет её до 1.
  assert.equal(analysePower([row(0.9999999999999999, 1, 1), row(2, 1, 1)], 1).commonIntervals, 0);
});

test('малые приращения на фоне большого интеграла сохраняются', () => {
  const rows = [row(0, 1e9, null), row(1e9, 1e9, null), row(1e9 + 0.5, null, null)];
  for (let i = 0; i <= 256; i++) rows.push(row(1e9 + 1 + i, 1, null));
  const result = analysePower(rows, 1e9);
  assert.equal(result.channels.a.energyJ, Number(1_000_000_000_000_000_256n));
  assert.equal(result.channels.a.coveredS, 1e9 + 256);
  assert.equal(analysePower([row(0, 1e-100, null), row(1e-100, 1e-100, null)], 1e-100).channels.a.energyJ, 1e-200);
});

test('предложенный предел использует нижнюю медиану и сохраняет исходные записи', () => {
  assert.equal(suggestGap([]), 1);
  assert.equal(suggestGap([row(3, null, null)]), 1);
  const rows = Object.freeze([0, 1, 101].map(t => Object.freeze(row(t, null, 1))));
  assert.equal(suggestGap(rows), 3);
  assert.equal(analysePower(rows, 3).channels.b.coveredS, 1);
  assert.equal(suggestGap([0.1, 0.2, 0.3, 0.4].map(t => row(t, 1, 1))), 0.3);
  assert.equal(suggestGap([0, 2, 3, 103].map(t => row(t, 1, 1))), 6);
});

test('анализ валидирует и прямые вызовы API', () => {
  for (const value of [NaN, Infinity, -1, 0, null, undefined, '1']) {
    assert.throws(() => analysePower([], value), /шаг/);
  }
  for (const rows of [null, {}, [null], [{t: 0, a: 1}], [row(2, Infinity, 0)],
    [row(0, 1, -1)], [row(0, 1, '2')], [row(0, null, null), row(0, 0, 0)], [row(5, 0, 1), row(3, 1, 2)]]) {
    assert.throws(() => analysePower(rows, 1));
    assert.throws(() => suggestGap(rows));
  }
});
