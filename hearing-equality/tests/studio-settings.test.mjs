import test from 'node:test';
import assert from 'node:assert/strict';
import { createStudioLink, readStudioSettings } from '../app/studio-settings.js';

const base = 'https://step3dlab.github.io/Technopark_project/hearing-equality/app/';

test('valid shared settings override saved preferences field by field', () => {
  const result = readStudioSettings('?mode=compare&speed=0.5&scene=light&outfit=indigo', {
    mode: 'reference', speed: '0.75', scene: 'dark', outfit: 'slate',
  });
  assert.deepEqual(result, { mode: 'compare', speed: 0.5, scene: 'light', outfit: 'indigo' });
});

test('missing and invalid URL values fall back to saved valid preferences', () => {
  assert.deepEqual(readStudioSettings('?mode=unknown&speed=3&outfit=', {
    mode: 'reference', speed: 0.75, scene: 'light', outfit: 'slate',
  }), { mode: 'reference', speed: 0.75, scene: 'light', outfit: 'slate' });
});

test('invalid or unavailable saved preferences use the supported defaults', () => {
  const defaults = { mode: 'avatar', speed: 1, scene: 'dark', outfit: 'teal' };
  assert.deepEqual(readStudioSettings(), defaults);
  assert.deepEqual(readStudioSettings('?speed=Infinity&scene=%3Cscript%3E', {
    mode: 'cinema', speed: NaN, scene: null, outfit: 'red',
  }), defaults);
});

test('URL reader ignores playback, tour, position and unknown parameters', () => {
  assert.deepEqual(readStudioSettings('?autoplay=1&tour=true&playing=1&time=1.2&word=hello&custom=x', {
    autoplay: true, tour: true, playing: true, time: 1.2,
  }), { mode: 'avatar', speed: 1, scene: 'dark', outfit: 'teal' });
});

test('shared links contain only the selected word and allowed still-view settings', () => {
  const href = createStudioLink(base + '?autoplay=1&tour=true&time=1.2&utm_source=old#player', {
    word: 'question', mode: 'compare', speed: 0.5, scene: 'light', outfit: 'slate',
    autoplay: true, tour: true, time: 0.9, custom: 'value',
  });
  const url = new URL(href);
  assert.equal(url.origin + url.pathname, base);
  assert.equal(url.hash, '');
  assert.deepEqual(Object.fromEntries(url.searchParams), {
    word: 'question', mode: 'compare', speed: '0.5', scene: 'light', outfit: 'slate',
  });
  assert.deepEqual(readStudioSettings(url.search), {
    mode: 'compare', speed: 0.5, scene: 'light', outfit: 'slate',
  });
});

test('link generation rejects malformed word identifiers and invalid settings', () => {
  for (const word of ['', '../question', 'hello&autoplay=1', '<script>', 'Вопрос', 'a'.repeat(41), null]) {
    const url = new URL(createStudioLink(base, {
      word, mode: 'other', speed: -1, scene: 'red', outfit: 'other',
    }));
    assert.deepEqual(Object.fromEntries(url.searchParams), {
      mode: 'avatar', speed: '1', scene: 'dark', outfit: 'teal',
    });
  }
});
