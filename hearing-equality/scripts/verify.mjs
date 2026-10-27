import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {createCatalog,matchText,validateMotion} from '../app/catalog.js';
const manifest=JSON.parse(readFileSync(new URL('../app/assets/sources/slovo-sources.json',import.meta.url)));
const catalog=createCatalog(manifest.samples);
assert.equal(catalog.length,6);
assert.equal(new Set(catalog.map(x=>x.id)).size,6);
for(const item of catalog){
  assert.equal(matchText(item.text,catalog).id,item.id);
  const bytes=readFileSync(new URL('../app/'+item.video.slice(2),import.meta.url));
  const hash=createHash('sha256').update(bytes).digest('hex');
  assert.equal(hash,item.provenance.sha256);
  const motion=validateMotion(JSON.parse(readFileSync(new URL('../app/'+item.motion.slice(2),import.meta.url))));
  assert.equal(motion.source_sha256,hash);assert.equal(motion.frames.length,Number(item.provenance.annotation.length));
  for(const key of ['pose','left','right','face'])assert.equal(motion.tracking_counts[key],motion.frames.filter(f=>f[key]).length);
  console.log(`${item.id}: ${motion.frames.length} frames, video SHA-256 and motion provenance verified`);
}
for(const text of ['не работать','не хорошо','да нет','Да?','Работать!','привет друг','эвакуация','<script>alert(1)</script>',''])assert.equal(matchText(text,catalog),null,text);
console.log('6 records and 9 unsupported/meaning-changing inputs verified. Linguistic comprehension has not been tested.');
