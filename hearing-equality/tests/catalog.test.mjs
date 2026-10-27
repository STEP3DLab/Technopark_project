import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {createCatalog,matchText,validateMotion} from '../app/catalog.js';

const manifest=JSON.parse(readFileSync(new URL('../app/assets/sources/slovo-sources.json',import.meta.url)));
const catalog=createCatalog(manifest.samples);
test('case, trailing punctuation and whitespace are accepted',()=>{
  assert.equal(matchText('  ПРИВЕТ!  ',catalog)?.id,'hello');
  assert.equal(matchText('привет',catalog)?.id,'hello');
  assert.equal(matchText('Да',catalog)?.id,'yes');
});
test('unknown phrases and negations cannot become a different message',()=>{
  for(const input of ['не хорошо','да, но не сейчас','привет друг','не работать','Да?','Работать!','<script>alert(1)</script>','','эвакуация']){
    assert.equal(matchText(input,catalog),null,input);
  }
});
test('all source clips match the source hashes and motion provenance',()=>{
  for(const item of catalog){
    const videoPath=new URL('../app/'+item.video.slice(2),import.meta.url);
    const source=readFileSync(videoPath);
    const hash=createHash('sha256').update(source).digest('hex');
    assert.equal(hash,item.provenance.sha256,item.id);
    const motionPath=new URL('../app/'+item.motion.slice(2),import.meta.url);
    assert.ok(existsSync(motionPath),item.id);
    const data=validateMotion(JSON.parse(readFileSync(motionPath)));
    assert.equal(data.source_sha256,hash,item.id);
    assert.equal(data.frames.length,Number(item.provenance.annotation.length),item.id);
    assert.ok(data.tracking_counts.pose>0,item.id);
    assert.ok(data.tracking_counts.left+data.tracking_counts.right>0,item.id);
    for(const frame of data.frames){
      for(const key of ['pose','left','right','face']){
        if(frame[key])assert.ok(frame[key].flat().every(Number.isFinite),`${item.id}/${key}`);
      }
    }
  }
});
