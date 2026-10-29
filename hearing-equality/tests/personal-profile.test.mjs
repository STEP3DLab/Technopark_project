import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseProfile,serializeProfile,mergeProfiles,PROFILE_MAX_BYTES} from '../app/personal-profile.js';
import {classify} from '../app/recognizer.js';
import {PHRASES,findPhrases} from '../app/phrasebook.js';
const library=JSON.parse(readFileSync(new URL('../app/assets/recognition-library.json',import.meta.url)));
const sequence=library.entries[0].sequence;
const sample={id:'untrusted',text:'Напишите ответ, пожалуйста',origin:'custom',sequence};
const wrap=samples=>JSON.stringify({format:'hearing-equality-personal',version:1,samples});
test('a personal movement survives export and import with equivalent matching distance and no conversation or media',()=>{
  const json=serializeProfile([{...sample,video:'private.mp4',history:['private message']}]);
  const restored=parseProfile(json);assert.equal(restored.length,1);assert.equal(restored[0].text,sample.text);
  assert.ok(restored[0].sequence.length<=40);assert.equal(restored[0].origin,'custom');
  assert.ok(!json.includes('private'));assert.equal(classify(sequence,restored).rankings[0].distance,0);
  assert.ok(classify(sequence,restored).accepted,'technical round trip only, not unseen-user recognition accuracy');
});
test('untrusted IDs cannot bind a different phrase to a built-in class, while same known label joins it',()=>{
  const catalog=[{id:'yes',text:'Да'}];
  const result=parseProfile(wrap([{...sample,id:'yes'},{...sample,text:'Да.'}]),catalog);
  assert.notEqual(result[0].id,'yes');assert.equal(result[1].id,'yes');assert.equal(result[1].text,'Да');
});
test('duplicate imports are idempotent and merge keeps existing labels and input arrays intact',()=>{
  const original=JSON.stringify(sample),a=parseProfile(wrap([sample]));
  const merged=mergeProfiles(a,parseProfile(serializeProfile(a)));
  assert.equal(merged.length,1);assert.equal(JSON.stringify(sample),original);
  const added=mergeProfiles(merged,parseProfile(wrap([{...sample,text:'Другая фраза'}])));
  assert.equal(added.length,2);assert.notEqual(added[0].id,added[1].id);
});
test('overflow, malformed frame shapes, coordinates, types and unsupported versions are rejected atomically',()=>{
  assert.throws(()=>parseProfile('x'.repeat(PROFILE_MAX_BYTES+1)),/большой/);
  assert.throws(()=>parseProfile('{'),/JSON/);
  assert.throws(()=>parseProfile(JSON.stringify({format:'hearing-equality-personal',version:2,samples:[sample]})),/Нужен/);
  const cases=[{...sample,text:''},{...sample,text:'x'.repeat(121)},{...sample,text:'line\nbreak'},
    {...sample,sequence:sequence.slice(0,2)}, {...sample,sequence:Array(601).fill(sequence[0])},
    {...sample,sequence:sequence.map(f=>({...f,points:[null]}))},
    {...sample,sequence:sequence.map(f=>({...f,hands:5}))},
    {...sample,sequence:sequence.map(f=>({...f,points:f.points.map(()=>[Infinity,0])}))}];
  for(const item of cases)assert.throws(()=>parseProfile(wrap([item])));
  const twelve=parseProfile(wrap(Array.from({length:12},(_,i)=>({...sample,text:`Фраза ${i}`}))));
  assert.throws(()=>mergeProfiles(twelve,[{...sample,text:'Тринадцатая'}]),/больше 12/);
  assert.equal(twelve.length,12);
});
test('phrase search crosses categories, handles case and ё, and never treats input as a regular expression',()=>{
  assert.equal(PHRASES.length,29);assert.ok(findPhrases('study').every(x=>x.group==='study'));
  assert.ok(findPhrases('shop','ЗАДАНИЕ').some(x=>x.group==='study'));
  assert.ok(findPhrases('everyday','идет').some(x=>x.text.includes('идёт')));
  assert.equal(findPhrases('study','<script>.*').length,0);
});
