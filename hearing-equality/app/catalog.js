// Intentionally an exact, whole-message matcher. Unknown input is never shortened
// to known words: dropping a negation or qualifier would change its meaning.
export function normalizeText(value) {
  const normalized=String(value ?? '').normalize('NFKC').toLocaleLowerCase('ru-RU')
    .replace(/ё/g,'е').replace(/\s+/gu,' ').trim().replace(/\.$/u,'').trim();
  // Slovo's greeting label includes a typographical exclamation mark. This
  // single explicit orthographic alias does not generalize to other messages.
  return normalized==='привет!'?'привет':normalized;
}

export function createCatalog(samples) {
  if(!Array.isArray(samples))throw new Error('Некорректный словарь');
  return samples.map(s=>{
    if(!/^[a-z0-9-]+$/.test(s.id)||! /^[a-f0-9-]+\.mp4$/.test(s.file))throw new Error('Некорректный идентификатор записи');
    return {
      id:s.id, text:s.label.charAt(0).toLocaleUpperCase('ru-RU')+s.label.slice(1),
      sourceLabel:s.label, video:`./assets/sources/${s.file}`,
      motion:`./assets/motion/${s.file.replace('.mp4','.json')}`,
      status:'Аватар ожидает проверки РЖЯ', category:'Slovo · исходная запись',
      sourceName:'Исходная видеозапись Slovo', provenance:s,
    };
  });
}

export function matchText(text,catalog) {
  const normalized=normalizeText(text);
  if(!normalized)return null;
  return catalog.find(item=>normalizeText(item.text)===normalized)||null;
}

export function validateMotion(data) {
  if(!data||data.schema_version!==1||!Array.isArray(data.frames)||!data.frames.length||
    !Number.isFinite(data.fps)||data.fps<=0||!Number.isFinite(data.duration)||data.duration<=0||
    data.frame_count!==data.frames.length||!Array.isArray(data.face_indices))throw new Error('Некорректные данные движения');
  return data;
}
