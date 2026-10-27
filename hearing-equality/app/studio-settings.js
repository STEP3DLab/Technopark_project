const choices = {
  mode: ['avatar', 'reference', 'compare'],
  speed: ['0.5', '0.75', '1'],
  scene: ['dark', 'light'],
  outfit: ['teal', 'indigo', 'slate'],
};
const defaults = { mode: 'avatar', speed: '1', scene: 'dark', outfit: 'teal' };

// A shared scene is deliberately a still view: URLs never start playback or a
// tour. Only these presentation settings may enter or leave the query string.
export function readStudioSettings(search = '', stored = {}) {
  const params = new URLSearchParams(search);
  const result = {};
  for (const [key, values] of Object.entries(choices)) {
    const requested = params.get(key);
    result[key] = values.includes(requested) ? requested :
      values.includes(String(stored[key])) ? String(stored[key]) : defaults[key];
  }
  result.speed = Number(result.speed);
  return result;
}

export function createStudioLink(href, settings = {}) {
  const url = new URL(href);
  url.search = '';
  url.hash = '';
  if (typeof settings.word === 'string' && /^[a-z0-9-]{1,40}$/.test(settings.word)) {
    url.searchParams.set('word', settings.word);
  }
  for (const [key, values] of Object.entries(choices)) {
    const value = String(settings[key]);
    url.searchParams.set(key, values.includes(value) ? value : defaults[key]);
  }
  return url.href;
}
