// Portable, explicitly exported personal movement shortcuts. Never a RSL model.
import { sequenceQuality } from './recognizer.js';
export const PROFILE_LIMIT = 12;
export const PROFILE_MAX_BYTES = 2 * 1024 * 1024;
const key = text => text.normalize('NFKC').toLocaleLowerCase('ru').replace(/[.!]+$/u, '').trim();
const boundedSequence = sequence => {
  if (!Array.isArray(sequence) || sequence.length < 6 || sequence.length > 600) throw new Error('В образце должно быть от 6 до 600 кадров.');
  const clean = sequence.map(frame => {
    if (!frame || ![0,1,2].includes(frame.hands) || !Array.isArray(frame.points) || frame.points.length !== 46) throw new Error('Неверный формат координат образца.');
    const points = frame.points.map(point => {
      if (point === null) return null;
      if (!Array.isArray(point) || point.length !== 2 || point.some(n => !Number.isFinite(n) || Math.abs(n) > 100)) throw new Error('Координаты образца повреждены.');
      return [...point];
    });
    return {points, hands:frame.hands};
  });
  const sampled = clean.length <= 40 ? clean : Array.from({length:40},(_,i)=>clean[Math.round(i*(clean.length-1)/39)]);
  const issue = sequenceQuality(sampled); if (issue) throw new Error(issue);
  return sampled;
};
export function validateProfile(value, catalog = []) {
  if (!value || value.format !== 'hearing-equality-personal' || value.version !== 1 || !Array.isArray(value.samples) || !value.samples.length || value.samples.length > PROFILE_LIMIT) throw new Error('Нужен файл личных образцов этого приложения: от 1 до 12 записей.');
  const groups = new Map();
  return value.samples.map(sample => {
    if (typeof sample?.text !== 'string') throw new Error('В образце отсутствует подпись.');
    const text = sample.text.trim();
    if (!text || text.length > 120 || /[\u0000-\u001f\u007f]/u.test(text)) throw new Error('Подпись должна содержать от 1 до 120 символов без управляющих знаков.');
    const label = key(text), known = catalog.find(item=>key(item.text)===label || item.aliases?.some(alias=>key(alias)===label));
    if (!groups.has(label)) groups.set(label,known?.id || `personal-${groups.size+1}`);
    return {id:groups.get(label),text:known?.text || text,origin:'custom',sequence:boundedSequence(sample.sequence)};
  });
}
export function serializeProfile(samples) {
  const validated=validateProfile({format:'hearing-equality-personal',version:1,samples});
  return JSON.stringify({format:'hearing-equality-personal',version:1,createdAt:new Date().toISOString(),
    notice:'Личные подписи к движениям, не проверенный словарь РЖЯ. Содержит координаты тела и кистей; видео и история диалога не входят.',
    samples:validated.map(({text,sequence})=>({text,sequence}))},null,0);
}
export function parseProfile(text,catalog=[]) {
  if (typeof text!=='string' || text.length>PROFILE_MAX_BYTES) throw new Error('Файл слишком большой: максимум 2 МБ.');
  let value;try{value=JSON.parse(text);}catch{throw new Error('Не удалось прочитать JSON. Выберите ранее сохранённый профиль.');}
  return validateProfile(value,catalog);
}
export function mergeProfiles(existing,incoming,catalog=[]) {
  // Rebuild all IDs from labels so an imported ID can never masquerade as a built-in word.
  const unique=[], seen=new Set();
  for(const sample of [...existing,...incoming]) {
    const fingerprint=key(sample.text)+'\n'+JSON.stringify(boundedSequence(sample.sequence));
    if(!seen.has(fingerprint)){seen.add(fingerprint);unique.push(sample);}
  }
  if(unique.length>PROFILE_LIMIT)throw new Error('Вместе получится больше 12 образцов. Текущие записи сохранены: сначала удалите ненужные.');
  return validateProfile({format:'hearing-equality-personal',version:1,samples:unique},catalog);
}
