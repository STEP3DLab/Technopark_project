import test from 'node:test';
import assert from 'node:assert/strict';
import { createProject, DEFAULT_POSE, sampleTimeline } from './motion.js';
import {
  snapshotEditor, restoreEditor, checkpointEditor, setDraftPose, commitDraft,
  discardDraft, undoEditor, redoEditor, serializeSession, restoreSession,
} from './editor.js';

function editor(project = createProject(), time = 0) {
  return {
    project, time,
    pose: sampleTimeline(project.keyframes, time, { easing: project.easing }),
    selected: project.keyframes.find((key) => key.time === time)?.id ?? null,
    dirty: false, activePreset: 'orbit', draftOrigin: null, history: [], future: [],
  };
}

test('committing before navigation preserves the draft in saved project and session', () => {
  const state = editor(createProject(), 2);
  setDraftPose(state, { ...state.pose, shoulder: 63 });
  assert.equal(state.dirty, true);
  assert.equal(commitDraft(state, { id: 'new-pose' }), true);
  state.time = 4;
  state.pose = sampleTimeline(state.project.keyframes, 4);
  state.selected = 'orbit-2';
  const restored = restoreSession(serializeSession(state));
  assert.equal(restored.project.keyframes.find((key) => key.id === 'new-pose').pose.shoulder, 63);
  assert.equal(restored.time, 4);
  assert.equal(restored.dirty, false);
});

test('key-limit failure leaves pose, project, selection and history untouched', () => {
  const project = createProject({ keyframes: Array.from({ length: 128 }, (_, i) => ({
    id: `key-${i}`, time: i * 8 / 127, pose: { ...DEFAULT_POSE },
  })) });
  const state = editor(project, 4.1);
  checkpointEditor(state);
  setDraftPose(state, { ...state.pose, base: 30 });
  const before = JSON.stringify(state);
  assert.throws(() => commitDraft(state, { id: 'too-many' }), /128/);
  assert.equal(JSON.stringify(state), before);
  assert.equal(state.dirty, true);
});

test('editing a selected fractional key preserves its identity and exact time', () => {
  const project = createProject({ keyframes: [
    { id: 'start', time: 0, pose: { ...DEFAULT_POSE } },
    { id: 'fraction', time: 2.37, pose: { ...DEFAULT_POSE } },
    { id: 'end', time: 8, pose: { ...DEFAULT_POSE } },
  ] });
  const state = editor(project, 2.37);
  setDraftPose(state, { ...state.pose, base: 19 });
  commitDraft(state);
  assert.equal(state.project.keyframes.length, 3);
  assert.equal(state.selected, 'fraction');
  assert.equal(state.time, 2.37);
  assert.equal(state.project.keyframes[1].pose.base, 19);
});

test('new key snaps to nearest frame while a stale selected ID is not overwritten', () => {
  const state = editor(createProject(), 2.37);
  state.selected = 'orbit-1';
  setDraftPose(state, { ...state.pose, base: 19 });
  commitDraft(state, { id: 'snapped' });
  assert.equal(state.time, 28 / 12);
  assert.equal(state.selected, 'snapped');
  assert.equal(state.project.keyframes.find((key) => key.id === 'orbit-1').pose.base, -22);
});

test('undo committed edits visibly returns pre-edit pose, time, selection and preset', () => {
  const state = editor();
  const before = snapshotEditor(state);
  setDraftPose(state, { ...state.pose, shoulder: 70 });
  commitDraft(state);
  const after = snapshotEditor(state);
  assert.equal(undoEditor(state), true);
  assert.deepEqual(snapshotEditor(state), before);
  assert.equal(redoEditor(state), true);
  assert.deepEqual(snapshotEditor(state), after);
  assert.equal(undoEditor(state), true);
  assert.deepEqual(snapshotEditor(state), before);
});

test('saving an identical existing pose succeeds without polluting undo or preset state', () => {
  const state = editor();
  assert.equal(commitDraft(state), true);
  assert.equal(state.history.length, 0);
  assert.equal(state.activePreset, 'orbit');
  assert.equal(state.project.keyframes.length, 3);
});

test('undo/redo an uncommitted draft preserves its origin without duplicate history', () => {
  const state = editor();
  checkpointEditor(state);
  const historySize = state.history.length;
  const before = snapshotEditor(state);
  setDraftPose(state, { ...state.pose, roll: 21 });
  const draft = snapshotEditor(state);
  assert.equal(undoEditor(state), true);
  assert.deepEqual(snapshotEditor(state), before);
  assert.equal(state.history.length, historySize);
  assert.equal(redoEditor(state), true);
  assert.deepEqual(snapshotEditor(state), draft);
  assert.equal(state.history.length, historySize);
  commitDraft(state);
  assert.equal(undoEditor(state), true);
  assert.deepEqual(snapshotEditor(state), before);
});

test('discard retains history; new edits clear abandoned redo branch; history is bounded', () => {
  const state = editor();
  for (let i = 0; i < 35; i++) checkpointEditor(state);
  assert.equal(state.history.length, 30);
  setDraftPose(state, { ...state.pose, roll: 18 });
  const history = state.history;
  assert.equal(discardDraft(state), true);
  assert.equal(state.history, history);
  setDraftPose(state, { ...state.pose, roll: 18 });
  undoEditor(state);
  assert.equal(state.future.length, 1);
  setDraftPose(state, { ...state.pose, roll: 22 });
  assert.equal(state.future.length, 0);
});

test('snapshot and restore are deep and affect only editor fields', () => {
  const state = editor();
  state.scene = { preserved: true };
  state.captures = [{ image: 'existing-take' }];
  const scene = state.scene, captures = state.captures, history = state.history;
  const snapshot = snapshotEditor(state);
  snapshot.project.keyframes[0].pose.base = 12;
  assert.equal(state.project.keyframes[0].pose.base, -22);
  restoreEditor(state, snapshot);
  assert.equal(state.project.keyframes[0].pose.base, 12);
  assert.equal(state.scene, scene);
  assert.equal(state.captures, captures);
  assert.equal(state.history, history);
  state.pose.base = 30;
  assert.notEqual(snapshot.pose.base, 30);
});

test('new sessions restore dirty pose and pre-edit origin without persisting history', () => {
  const state = editor(createProject(), 2);
  setDraftPose(state, { ...state.pose, shoulder: 68, focal: 28 });
  checkpointEditor(state);
  const encoded = serializeSession(state);
  const envelope = JSON.parse(encoded);
  assert.equal(envelope.format, 'kadr-session');
  assert.ok(!('history' in envelope.editor));
  assert.ok(!('future' in envelope.editor));
  assert.ok(!('draftOrigin' in envelope.editor.draftOrigin));
  const restored = restoreSession(encoded);
  assert.deepEqual(restored, snapshotEditor(state));
  const nextState = editor();
  restoreEditor(nextState, restored);
  assert.equal(nextState.dirty, true);
  assert.equal(nextState.pose.shoulder, 68);
  assert.equal(discardDraft(nextState), true);
  assert.equal(nextState.pose.shoulder, 40);
});

test('legacy raw project remains supported and creates a clean editor at start', () => {
  const project = createProject({ name: 'Старый проект' });
  const restored = restoreSession(JSON.stringify(project));
  assert.equal(restored.project.name, 'Старый проект');
  assert.equal(restored.time, 0);
  assert.equal(restored.pose.base, -22);
  assert.equal(restored.selected, 'orbit-1');
  assert.equal(restored.dirty, false);
});

test('untrusted sessions reject nonfinite data and strip unknown or nested state', () => {
  const encoded = JSON.parse(serializeSession(editor()));
  encoded.editor.time = Infinity;
  assert.throws(() => restoreSession(encoded), /конечным числом/);
  encoded.editor.time = 99;
  encoded.editor.pose.base = NaN;
  assert.throws(() => restoreSession(encoded), /конечным числом/);
  encoded.editor.pose.base = 999;
  encoded.editor.scene = { injected: true };
  encoded.editor.history = Array(1000).fill('ignored');
  encoded.editor.activePreset = 'unknown';
  const safe = restoreSession(encoded);
  assert.equal(safe.time, 8);
  assert.equal(safe.pose.base, 65);
  assert.equal(safe.activePreset, null);
  assert.ok(!('scene' in safe));
  assert.ok(!('history' in safe));
  assert.throws(() => restoreSession('{'), /прочитать/);
  assert.throws(() => restoreSession(' '.repeat(1000001)), /большая/);
  assert.throws(() => restoreSession({ ...encoded, version: 2 }), /Версия/);
});
