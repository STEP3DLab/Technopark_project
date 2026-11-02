/**
 * Motion planning for the RGSU × VGIK browser demonstrator.
 * These are visual simulator limits, not specifications for a physical robot.
 * All angles are degrees; focal length is millimetres; subject is 0–100 percent.
 */
export const POSE_LIMITS = Object.freeze({
  base: Object.freeze([-65, 65]),
  shoulder: Object.freeze([5, 80]),
  elbow: Object.freeze([-45, 110]),
  wrist: Object.freeze([-60, 60]),
  tilt: Object.freeze([-45, 45]),
  roll: Object.freeze([-45, 45]),
  focal: Object.freeze([18, 85]),
  subject: Object.freeze([0, 100]),
});

export const DEFAULT_POSE = Object.freeze({
  base: 0, shoulder: 40, elbow: 55, wrist: 0,
  tilt: 0, roll: 0, focal: 20, subject: 0,
});

export const DEFAULT_SETTINGS = Object.freeze({
  subjectType: 'robot', lighting: 'studio', autoAim: true,
  grid: true, path: true, frustum: false,
});

export const PROJECT_LIMITS = Object.freeze({
  minDuration: 1, maxDuration: 120,
  minFps: 1, maxFps: 60,
  maxKeyframes: 128, maxNameLength: 100,
  maxImportCharacters: 500000,
});

const POSE_KEYS = Object.keys(POSE_LIMITS);
const EASINGS = new Set(['smooth', 'linear', 'hold']);
const EPSILON = 1e-6;
const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const finite = (value) => typeof value === 'number' && Number.isFinite(value);
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const cleanText = (text, limit) => String(text).replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, limit);

/** Tolerant UI boundary: discard unknown properties and clamp valid numbers. */
export function sanitizePose(pose = {}, fallback = DEFAULT_POSE) {
  const source = isObject(pose) ? pose : {};
  const backup = isObject(fallback) ? fallback : DEFAULT_POSE;
  const result = {};
  for (const key of POSE_KEYS) {
    const value = finite(source[key]) ? source[key]
      : finite(backup[key]) ? backup[key] : DEFAULT_POSE[key];
    result[key] = clamp(value, ...POSE_LIMITS[key]);
  }
  return result;
}

function normalizeKeyframe(frame, index = 0, { strict = false } = {}) {
  if (!isObject(frame) || !finite(frame.time)) {
    throw new Error(`Ключ ${index + 1}: время должно быть конечным числом.`);
  }
  if (frame.time < 0 || frame.time > PROJECT_LIMITS.maxDuration) {
    throw new Error(`Ключ ${index + 1}: время должно быть от 0 до ${PROJECT_LIMITS.maxDuration} с.`);
  }
  if (!isObject(frame.pose)) {
    throw new Error(`Ключ ${index + 1}: отсутствует положение робота.`);
  }
  if (strict) {
    for (const key of POSE_KEYS) {
      if (frame.pose[key] !== undefined && !finite(frame.pose[key])) {
        throw new Error(`Ключ ${index + 1}: параметр «${key}» должен быть конечным числом.`);
      }
    }
  }
  const id = typeof frame.id === 'string' && frame.id.trim()
    ? cleanText(frame.id, 64) : `key-${index + 1}`;
  return { id, time: frame.time, pose: sanitizePose(frame.pose) };
}

/** Equal timestamps are resolved deterministically: the last supplied key wins. */
function sortAndMerge(frames) {
  const sorted = frames.slice().sort((a, b) => a.time - b.time);
  const result = [];
  for (const frame of sorted) {
    if (result.length && Math.abs(result[result.length - 1].time - frame.time) < EPSILON) {
      result[result.length - 1] = frame;
    } else result.push(frame);
  }
  return result;
}

/** Import boundary. Accept parsed JSON or a bounded JSON string. */
export function validateProject(input) {
  let source = input;
  if (typeof source === 'string') {
    if (source.length > PROJECT_LIMITS.maxImportCharacters) {
      throw new Error('Файл слишком большой. Максимальный размер JSON — 500 000 символов.');
    }
    try { source = JSON.parse(source); }
    catch { throw new Error('Не удалось прочитать JSON. Выберите сохранённый проект студии.'); }
  }
  if (!isObject(source)) throw new Error('Проект должен быть объектом JSON.');
  if (source.version !== 1) throw new Error('Эта версия проекта не поддерживается. Нужна версия 1.');
  if (!finite(source.duration) || source.duration < PROJECT_LIMITS.minDuration || source.duration > PROJECT_LIMITS.maxDuration) {
    throw new Error(`Длительность должна быть от ${PROJECT_LIMITS.minDuration} до ${PROJECT_LIMITS.maxDuration} с.`);
  }
  if (!Number.isInteger(source.fps) || source.fps < PROJECT_LIMITS.minFps || source.fps > PROJECT_LIMITS.maxFps) {
    throw new Error(`Частота должна быть целым числом от ${PROJECT_LIMITS.minFps} до ${PROJECT_LIMITS.maxFps} кадров/с.`);
  }
  const easing = source.easing ?? 'smooth';
  if (!EASINGS.has(easing)) throw new Error('Неизвестный тип движения. Доступны smooth, linear и hold.');
  if (source.settings !== undefined && !isObject(source.settings)) {
    throw new Error('Настройки сцены должны быть объектом.');
  }
  const incomingSettings = source.settings ?? {};
  const settings = {};
  for (const [key, fallback] of Object.entries(DEFAULT_SETTINGS)) {
    const value = incomingSettings[key] ?? fallback;
    if (typeof fallback === 'boolean' && typeof value !== 'boolean') {
      throw new Error(`Настройка «${key}» должна быть true или false.`);
    }
    if (key === 'subjectType' && !['robot', 'rocket', 'abstract'].includes(value)) {
      throw new Error('Неизвестный объект съёмки.');
    }
    if (key === 'lighting' && !['studio', 'warm', 'dramatic'].includes(value)) {
      throw new Error('Неизвестная схема освещения.');
    }
    settings[key] = value;
  }
  if (!Array.isArray(source.keyframes) || source.keyframes.length < 1 || source.keyframes.length > PROJECT_LIMITS.maxKeyframes) {
    throw new Error(`В проекте должно быть от 1 до ${PROJECT_LIMITS.maxKeyframes} ключей.`);
  }
  if (source.name !== undefined && typeof source.name !== 'string') {
    throw new Error('Название проекта должно быть текстом.');
  }
  const ids = new Set();
  const frames = source.keyframes.map((frame, index) => {
    const key = normalizeKeyframe(frame, index, { strict: true });
    if (key.time > source.duration + EPSILON) throw new Error(`Ключ ${index + 1} находится за пределами длительности проекта.`);
    key.time = Math.min(source.duration, key.time);
    if (ids.has(key.id)) throw new Error(`Идентификатор ключа «${key.id}» повторяется.`);
    ids.add(key.id);
    return key;
  });
  // Build a new whitelisted object, including for JSON containing __proto__.
  return {
    version: 1,
    name: cleanText(source.name ?? 'Первый дубль', PROJECT_LIMITS.maxNameLength) || 'Первый дубль',
    duration: source.duration,
    fps: source.fps,
    easing,
    settings,
    keyframes: sortAndMerge(frames),
  };
}

export function createProject(options = {}) {
  const duration = options.duration ?? 8;
  return validateProject({
    version: 1,
    name: options.name ?? 'Первый дубль · облёт',
    duration,
    fps: options.fps ?? 12,
    easing: options.easing ?? 'smooth',
    settings: options.settings,
    keyframes: options.keyframes ?? [
      { id: 'orbit-1', time: 0, pose: { ...DEFAULT_POSE, base: -22, subject: 0 } },
      { id: 'orbit-2', time: duration / 2, pose: { ...DEFAULT_POSE, base: 0, subject: 50 } },
      { id: 'orbit-3', time: duration, pose: { ...DEFAULT_POSE, base: 22, subject: 100 } },
    ],
  });
}

/** Pure sampling, suitable for playback, timeline scrubbing and frame export. */
export function sampleTimeline(keyframes, time, { easing = 'smooth' } = {}) {
  const frames = sortAndMerge((Array.isArray(keyframes) ? keyframes : [])
    .filter((key) => isObject(key) && finite(key.time) && isObject(key.pose)));
  if (!frames.length) return sanitizePose();
  const t = finite(time) ? time : 0;
  if (t <= frames[0].time) return sanitizePose(frames[0].pose);
  if (t >= frames[frames.length - 1].time) return sanitizePose(frames[frames.length - 1].pose);
  let right = 1;
  while (right < frames.length && frames[right].time < t) right++;
  if (Math.abs(frames[right].time - t) < EPSILON) return sanitizePose(frames[right].pose);
  const start = frames[right - 1];
  const end = frames[right];
  const a = sanitizePose(start.pose);
  const b = sanitizePose(end.pose);
  let alpha = clamp((t - start.time) / (end.time - start.time), 0, 1);
  if (easing === 'hold') alpha = 0;
  else if (easing !== 'linear') alpha = alpha * alpha * (3 - 2 * alpha);
  const pose = {};
  for (const key of POSE_KEYS) pose[key] = a[key] + (b[key] - a[key]) * alpha;
  return pose;
}

/** Replace matching ID or timestamp without modifying caller-owned arrays. */
export function upsertKeyframe(keyframes, frame) {
  const current = (Array.isArray(keyframes) ? keyframes : []).map((key, index) => normalizeKeyframe(key, index));
  const next = normalizeKeyframe(frame, current.length);
  const result = current.filter((key) => key.id !== next.id && Math.abs(key.time - next.time) >= EPSILON);
  result.push(next);
  if (result.length > PROJECT_LIMITS.maxKeyframes) throw new Error(`Достигнут предел: ${PROJECT_LIMITS.maxKeyframes} ключей.`);
  return sortAndMerge(result);
}

export function removeKeyframe(keyframes, id) {
  return (Array.isArray(keyframes) ? keyframes : [])
    .filter((key) => key.id !== id)
    .map((key, index) => normalizeKeyframe(key, index));
}

/**
 * Export an explicit, readable simulation sequence. This is intentionally not
 * a firmware dialect, G-code, ROS command stream or physical robot controller.
 * The final timeline endpoint is included as a final reference still.
 */
export function toProgram(input) {
  const project = validateProject(input);
  const frameIntervals = Math.ceil(project.duration * project.fps);
  const count = frameIntervals + 1;
  const number = (value) => Number(value.toFixed(3)).toString();
  const lines = [
    '; РГСУ × ВГИК · программа визуального симулятора',
    '; Учебный формат. Не является программой для физического робота.',
    '; J1…J6 — градусы; FOCAL — мм; SUBJECT — положение персонажа, %.',
    '; Последняя точка включена как завершающий опорный кадр.',
    `PROJECT ${JSON.stringify(project.name)}`,
    `FPS ${project.fps}`,
    `DURATION ${number(project.duration)}`,
    `EASING ${project.easing.toUpperCase()}`,
    `SCENE ${project.settings.subjectType.toUpperCase()}`,
    `LIGHTING ${project.settings.lighting.toUpperCase()}`,
    `AUTO_AIM ${project.settings.autoAim ? 'ON' : 'OFF'}`,
    `FRAMES ${count}`,
    '',
  ];
  for (let frame = 0; frame <= frameIntervals; frame++) {
    const time = frame === frameIntervals ? project.duration : frame / project.fps;
    const pose = sampleTimeline(project.keyframes, time, { easing: project.easing });
    lines.push(
      `AT ${number(time)}s`,
      `MOVE J1=${number(pose.base)} J2=${number(pose.shoulder)} J3=${number(pose.elbow)} J4=${number(pose.wrist)} J5=${number(pose.tilt)} J6=${number(pose.roll)} FOCAL=${number(pose.focal)} SUBJECT=${number(pose.subject)}`,
      'WAIT UNTIL_POSE_READY',
      `CAPTURE FRAME=${String(frame + 1).padStart(4, '0')}`,
    );
  }
  lines.push('END');
  return lines.join('\n');
}
