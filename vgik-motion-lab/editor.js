/** Pure editor/session state for the virtual RGSU × VGIK studio. */
import { POSE_LIMITS, sanitizePose, validateProject, sampleTimeline, upsertKeyframe } from './motion.js';

const HISTORY_LIMIT = 30;
const SESSION_LIMIT = 1000000;
const EPSILON = 1e-6;
const POSE_KEYS = Object.keys(POSE_LIMITS);
const PRESETS = new Set(['orbit', 'dolly', 'crane']);
const object = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const finite = (value) => typeof value === 'number' && Number.isFinite(value);
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const samePose = (a, b) => POSE_KEYS.every((key) => a[key] === b[key]);
const sample = (project, time) => sampleTimeline(project.keyframes, time, { easing: project.easing });

function coreSnapshot(source, strict = false) {
  if (!object(source)) throw new Error('Не удалось прочитать состояние редактора.');
  const project = validateProject(source.project);
  if (strict && !finite(source.time)) throw new Error('Время редактора должно быть конечным числом.');
  const time = clamp(finite(source.time) ? source.time : 0, 0, project.duration);
  if (strict && !object(source.pose)) throw new Error('В сохранённой сессии отсутствует поза робота.');
  if (strict) {
    for (const key of POSE_KEYS) {
      if (source.pose[key] !== undefined && !finite(source.pose[key])) {
        throw new Error(`Параметр сессии «${key}» должен быть конечным числом.`);
      }
    }
    if (source.dirty !== undefined && typeof source.dirty !== 'boolean') {
      throw new Error('Признак черновика должен быть true или false.');
    }
  }
  const pose = sanitizePose(source.pose, sample(project, time));
  const selected = typeof source.selected === 'string'
    && project.keyframes.some((key) => key.id === source.selected && Math.abs(key.time - time) < EPSILON)
    ? source.selected : null;
  return {
    project, pose, time, selected,
    dirty: source.dirty === true,
    activePreset: PRESETS.has(source.activePreset) ? source.activePreset : null,
  };
}

function normalizedSnapshot(source, strict = false) {
  const snapshot = coreSnapshot(source, strict);
  snapshot.draftOrigin = null;
  if (snapshot.dirty) {
    if (object(source.draftOrigin)) {
      // Only one baseline level is allowed; nested history/origins are ignored.
      snapshot.draftOrigin = coreSnapshot(source.draftOrigin, strict);
      snapshot.draftOrigin.dirty = false;
    } else {
      snapshot.draftOrigin = {
        ...coreSnapshot(snapshot),
        pose: sample(snapshot.project, snapshot.time),
        dirty: false,
      };
    }
  }
  return snapshot;
}

/** A deep snapshot of editor fields only; scene/gallery/history stay external. */
export function snapshotEditor(state) {
  return normalizedSnapshot(state);
}

/** Restore only editor fields. History, future, renderer and captures survive. */
export function restoreEditor(state, snapshot) {
  const next = normalizedSnapshot(snapshot);
  for (const key of ['project', 'pose', 'time', 'selected', 'dirty', 'activePreset', 'draftOrigin']) {
    state[key] = next[key];
  }
  return state;
}

function pushBounded(state, key, snapshot) {
  if (!Array.isArray(state[key])) state[key] = [];
  state[key].push(snapshot);
  if (state[key].length > HISTORY_LIMIT) state[key].splice(0, state[key].length - HISTORY_LIMIT);
}

export function checkpointEditor(state) {
  const snapshot = snapshotEditor(state);
  pushBounded(state, 'history', snapshot);
  state.future = [];
  return snapshot;
}

/** Start one undoable draft for a complete slider/number-input editing gesture. */
export function setDraftPose(state, pose) {
  const next = sanitizePose(pose, state.pose);
  if (samePose(next, state.pose)) return false;
  if (!state.dirty) {
    state.draftOrigin = snapshotEditor(state);
    state.future = [];
  }
  state.pose = next;
  state.dirty = true;
  if (state.draftOrigin && samePose(next, state.draftOrigin.pose)) {
    state.dirty = false;
    state.draftOrigin = null;
  }
  return true;
}

/**
 * Save the displayed pose, even when explicitly adding a key without a draft.
 * Validation/upsert happen before history or state changes. Return true on
 * success (including an identical existing key); failure throws without loss.
 */
export function commitDraft(state, { id: requestedId } = {}) {
  const project = state.project;
  const position = clamp(finite(state.time) ? state.time : 0, 0, project.duration);
  const selected = project.keyframes.find((key) => key.id === state.selected && Math.abs(key.time - position) < EPSILON);
  const time = selected ? selected.time : clamp(Math.round(position * project.fps) / project.fps, 0, project.duration);
  const existing = selected ?? project.keyframes.find((key) => Math.abs(key.time - time) < EPSILON);
  const id = existing?.id ?? (typeof requestedId === 'string' && requestedId.trim()
    ? requestedId : `key-${globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`}`);
  const pose = sanitizePose(state.pose);
  const keyframes = upsertKeyframe(project.keyframes, { id, time, pose });
  const changed = state.dirty || !existing || !samePose(existing.pose, pose) || existing.time !== time;
  if (changed) {
    const baseline = state.dirty && state.draftOrigin ? snapshotEditor(state.draftOrigin)
      : state.dirty ? normalizedSnapshot({ ...state, pose: sample(project, position), dirty: false, draftOrigin: null })
        : snapshotEditor(state);
    pushBounded(state, 'history', baseline);
    state.future = [];
  }
  state.project = { ...project, keyframes };
  state.pose = pose;
  state.time = time;
  state.selected = keyframes.find((key) => Math.abs(key.time - time) < EPSILON)?.id ?? id;
  if (changed) state.activePreset = null;
  state.dirty = false;
  state.draftOrigin = null;
  return true;
}

/** Discard only the pending edit; existing undo/redo arrays remain untouched. */
export function discardDraft(state) {
  if (!state.dirty) return false;
  if (state.draftOrigin) restoreEditor(state, state.draftOrigin);
  else {
    state.pose = sample(state.project, state.time);
    state.dirty = false;
    state.draftOrigin = null;
  }
  return true;
}

export function undoEditor(state) {
  if (state.dirty) {
    const draft = snapshotEditor(state);
    discardDraft(state);
    pushBounded(state, 'future', draft);
    return true;
  }
  if (!state.history?.length) return false;
  const current = snapshotEditor(state);
  const previous = state.history.pop();
  restoreEditor(state, previous);
  pushBounded(state, 'future', current);
  return true;
}

export function redoEditor(state) {
  if (!state.future?.length) return false;
  const next = state.future[state.future.length - 1];
  const current = snapshotEditor(state);
  // Restoring an uncommitted draft must not create a duplicate undo checkpoint.
  if (!next.dirty) pushBounded(state, 'history', current);
  state.future.pop();
  restoreEditor(state, next);
  return true;
}

export function serializeSession(state) {
  return JSON.stringify({ format: 'kadr-session', version: 1, editor: snapshotEditor(state) });
}

/** Accept the previous raw project JSON and the current draft-aware envelope. */
export function restoreSession(text) {
  let source = text;
  if (typeof source === 'string') {
    if (source.length > SESSION_LIMIT) throw new Error('Сохранённая сессия слишком большая.');
    try { source = JSON.parse(source); }
    catch { throw new Error('Не удалось прочитать сохранённую сессию.'); }
  }
  if (!object(source)) throw new Error('Сохранённая сессия должна быть объектом JSON.');
  if (source.format === 'kadr-session') {
    if (source.version !== 1) throw new Error('Версия сохранённой сессии не поддерживается.');
    return normalizedSnapshot(source.editor, true);
  }
  const project = validateProject(source);
  return normalizedSnapshot({
    project, pose: sample(project, 0), time: 0,
    selected: project.keyframes.find((key) => key.time === 0)?.id ?? null,
    dirty: false, activePreset: null, draftOrigin: null,
  });
}
