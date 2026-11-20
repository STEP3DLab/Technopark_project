// Численные пределы формата импорта. Мощность в ваттах, время в секундах.
const MAX_ROWS = 100_000;
const MAX_TEXT_LENGTH = 8 * 1024 * 1024;
const MAX_LINES = 200_002;
const MAX_LINE_LENGTH = 1024;
const MAX_TIME = 1e12;
const MAX_POWER = 1e9;
const MIN_POSITIVE = 1e-100;
const COLUMNS = ['time_s', 'ch1_W', 'ch2_W'];
const DECIMAL = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i;

function* csvLines(text) {
  const ending = /\r\n|[\r\n]/g;
  let start = 0;
  for (let number = 1; ; number++) {
    if (number > MAX_LINES) throw new RangeError('В CSV больше 200 002 физических строк.');
    const next = ending.exec(text);
    const end = next ? next.index : text.length;
    if (end - start > MAX_LINE_LENGTH) {
      throw new RangeError(`Длина строки ${number} превышает 1024 символа.`);
    }
    yield {number, line: text.slice(start, end)};
    if (!next) return;
    start = ending.lastIndex;
  }
}

function trimField(value) {
  return value.replace(/^[ \t]+|[ \t]+$/g, '');
}

function csvFields(line, separator, where) {
  const fields = [];
  let value = '';
  let state = 'plain';
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (state === 'quoted') {
      if (c !== '"') value += c;
      else if (line[i + 1] === '"') {
        value += '"';
        i++;
      } else state = 'closed';
    } else if (c === separator) {
      if (fields.length === 2) throw new Error(`Ожидаются три поля ${where}.`);
      fields.push(trimField(value));
      value = '';
      state = 'plain';
    } else if (state === 'closed') {
      if (c !== ' ' && c !== '\t') throw new Error(`Лишний символ после кавычки ${where}.`);
    } else if (c === '"') {
      if (trimField(value)) throw new Error(`Кавычка внутри открытого поля ${where}.`);
      value = '';
      state = 'quoted';
    } else value += c;
  }
  if (state === 'quoted') throw new Error(`Незакрытая кавычка ${where}.`);
  fields.push(trimField(value));
  if (fields.length !== 3) throw new Error(`Ожидаются три поля ${where}.`);
  return fields;
}

function readNumber(field, name, separator, where) {
  if (field === '') {
    if (name === 'time_s') throw new Error(`Пропущено время ${where}.`);
    return null;
  }
  const token = separator === ';' ? field.replace(',', '.') : field;
  if (!DECIMAL.test(token)) throw new Error(`Некорректное число ${name} ${where}.`);
  const value = Number(token);
  if (value === 0) {
    // Number('1e-400') округляет положительное значение до нуля.
    if (/[1-9]/.test(token.split(/e/i, 1)[0])) {
      throw new RangeError(`Модуль ${name} ${where} слишком мал для представления.`);
    }
    return 0;
  }
  return value;
}

function checkNumber(value, name, maximum, where) {
  if (!Number.isFinite(value) || value < 0 || value > maximum) {
    throw new RangeError(`Значение ${name} ${where} должно быть конечным числом от 0 до ${maximum}.`);
  }
  if (value > 0 && value < MIN_POSITIVE) {
    throw new RangeError(`Положительное значение ${name} ${where} должно быть не меньше 1e-100.`);
  }
}

function checkRow(row, lastTime, where) {
  if (!row || typeof row !== 'object' || Array.isArray(row)) {
    throw new TypeError(`Ожидается запись с полями t, a, b ${where}.`);
  }
  checkNumber(row.t, 'time_s', MAX_TIME, where);
  if (row.t <= lastTime) throw new Error(`Время ${where} должно быть больше предыдущего.`);
  if (row.a !== null) checkNumber(row.a, 'ch1_W', MAX_POWER, where);
  if (row.b !== null) checkNumber(row.b, 'ch2_W', MAX_POWER, where);
}

function checkRows(rows) {
  if (!Array.isArray(rows)) throw new TypeError('Ожидается массив записей.');
  if (rows.length > MAX_ROWS) throw new RangeError('Поддерживается до 100 000 записей.');
  let lastTime = -1;
  for (let i = 0; i < rows.length; i++) {
    checkRow(rows[i], lastTime, `в записи ${i + 1}`);
    lastTime = rows[i].t;
  }
}

/** Разбирает UTF-8 CSV после декодирования в строку. Возвращает {rows, synthetic}. */
export function parsePowerCsv(text) {
  if (typeof text !== 'string') throw new TypeError('Ожидается текст CSV.');
  if (text.length > MAX_TEXT_LENGTH) throw new RangeError('Размер CSV превышает 8 388 608 символов.');
  const rows = [];
  let separator = null;
  let synthetic = false;
  let lastTime = -1;
  for (const {line, number} of csvLines(text.replace(/^\uFEFF/, ''))) {
    const record = trimField(line);
    if (!record) continue;
    const where = `в строке ${number}`;
    if (record.startsWith('#')) {
      if (record !== '# SYNTHETIC' || separator !== null || synthetic) {
        throw new Error(`Недопустимая строка метаданных ${where}. Метку # SYNTHETIC можно указать один раз перед заголовком.`);
      }
      synthetic = true;
      continue;
    }
    if (separator === null) {
      separator = record.includes(';') ? ';' : ',';
      const header = csvFields(record, separator, where);
      if (!COLUMNS.every((name, i) => header[i] === name)) {
        throw new Error(`Ожидаются столбцы time_s, ch1_W, ch2_W в указанном порядке ${where}.`);
      }
      continue;
    }
    if (rows.length >= MAX_ROWS) throw new RangeError(`Число записей превысило 100 000 ${where}.`);
    const fields = csvFields(record, separator, where);
    const [t, a, b] = fields.map((field, i) => readNumber(field, COLUMNS[i], separator, where));
    const row = {t, a, b};
    checkRow(row, lastTime, where);
    rows.push(row);
    lastTime = t;
  }
  if (separator === null) throw new Error('В CSV отсутствует заголовок time_s,ch1_W,ch2_W.');
  return {rows, synthetic};
}

// Десятичные метки позволяют сравнивать, например, шаг от 0.7 до 0.8 с порогом 0.1 с.
// Целые коэффициенты также сохраняют точность разностей при большом начале шкалы.
function decimalParts(value) {
  if (Number.isSafeInteger(value)) return {coefficient: BigInt(value), exponent: 0};
  const [mantissa, power = '0'] = String(value).split('e');
  const [whole, fraction = ''] = mantissa.split('.');
  return {coefficient: BigInt(whole + fraction), exponent: Number(power) - fraction.length};
}

function coefficientAt(value, exponent) {
  if (value.exponent === exponent) return value.coefficient;
  return value.coefficient * 10n ** BigInt(value.exponent - exponent);
}

function difference(start, end) {
  const exponent = Math.min(start.exponent, end.exponent);
  return {coefficient: coefficientAt(end, exponent) - coefficientAt(start, exponent), exponent};
}

function asNumber(value) {
  if (value.exponent === 0) return Number(value.coefficient);
  return Number(`${value.coefficient}e${value.exponent}`);
}

function withinLimit(interval, limit) {
  const exponent = Math.min(interval.exponent, limit.exponent);
  return coefficientAt(interval, exponent) <= coefficientAt(limit, exponent);
}

/** Умножает нижнюю медиану длительности шага на три. Для 0–1 записей возвращает 1 с. */
export function suggestGap(rows) {
  checkRows(rows);
  if (rows.length < 2) return 1;
  const steps = [];
  let previous = decimalParts(rows[0].t);
  for (let i = 1; i < rows.length; i++) {
    const current = decimalParts(rows[i].t);
    steps.push(asNumber(difference(previous, current)));
    previous = current;
  }
  steps.sort((a, b) => a - b);
  const median = decimalParts(steps[Math.floor((steps.length - 1) / 2)]);
  return asNumber({coefficient: 3n * median.coefficient, exponent: median.exponent});
}

// Компенсированное суммирование сохраняет небольшие слагаемые рядом с большими.
class Sum {
  total = 0;
  correction = 0;

  add(value) {
    const next = this.total + value;
    this.correction += this.total >= value ? (this.total - next) + value : (value - next) + this.total;
    this.total = next;
  }

  value() {
    return this.total + this.correction;
  }
}

function newChannel() {
  return {n: 0, minW: null, maxW: null, intervals: 0, coverage: new Sum(), energy: new Sum()};
}

function recordChannel(channel, value, previousValue, intervalS) {
  if (value === null) return false;
  channel.minW = channel.n === 0 ? value : Math.min(channel.minW, value);
  channel.maxW = channel.n === 0 ? value : Math.max(channel.maxW, value);
  channel.n++;
  if (previousValue === null || intervalS === 0) return false;
  channel.intervals++;
  channel.coverage.add(intervalS);
  channel.energy.add((previousValue + value) / 2 * intervalS);
  return true;
}

function channelResult(channel) {
  const {n, minW, maxW, intervals} = channel;
  return {n, minW, maxW, intervals, coveredS: channel.coverage.value(), energyJ: intervals ? channel.energy.value() : null};
}

/** Считает интегралы по соседним отсчётам исходной записи. Единицы результата — Вт, с и Дж. */
export function analysePower(rows, maxGapSeconds, onStep) {
  if (!Number.isFinite(maxGapSeconds) || maxGapSeconds <= 0) {
    throw new RangeError('Предельный шаг должен быть конечным положительным числом секунд.');
  }
  checkRows(rows);
  const a = newChannel();
  const b = newChannel();
  const commonCoverage = new Sum();
  let commonIntervals = 0;
  const limit = decimalParts(maxGapSeconds);
  let firstTime = null;
  let previousTime = null;
  let previous = null;
  for (const [index, row] of rows.entries()) {
    const time = decimalParts(row.t);
    let intervalS = 0;
    if (previousTime) {
      const interval = difference(previousTime, time);
      if (withinLimit(interval, limit)) intervalS = asNumber(interval);
    } else firstTime = time;
    if (onStep) onStep(index, intervalS > 0);
    const coveredA = recordChannel(a, row.a, previous?.a ?? null, intervalS);
    const coveredB = recordChannel(b, row.b, previous?.b ?? null, intervalS);
    if (coveredA && coveredB) {
      commonIntervals++;
      commonCoverage.add(intervalS);
    }
    previous = row;
    previousTime = time;
  }
  return {
    nRows: rows.length,
    elapsedS: firstTime ? asNumber(difference(firstTime, previousTime)) : 0,
    maxGapSeconds,
    channels: {a: channelResult(a), b: channelResult(b)},
    commonCoveredS: commonCoverage.value(),
    commonIntervals,
  };
}
