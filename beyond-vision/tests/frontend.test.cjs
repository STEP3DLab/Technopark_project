const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');
const root=path.resolve(__dirname,'..');
test('participant bundle contains no passwords, roster, scoring key or names of the study paintings',()=>{
  const bundle=fs.readdirSync(root).filter(n=>n.endsWith('.js')||n.endsWith('.html')).map(n=>fs.readFileSync(path.join(root,n),'utf8')).join('\n');
  for(const name of ['Купание красного коня','Спальня в Арле','Утро в сосновом лесу','password_hash','APP_SECRET'])assert.ok(!bundle.includes(name));
  assert.ok(!/mode\s*:\s*['"]no-cors/.test(bundle));
});
test('question schedule includes all three panels and accessible rating labels',async()=>{
  const {createSteps}=await import('../questions.js');
  const steps=createSteps(['S-A','K-Б','M-В']);
  assert.equal(steps.length,22);assert.equal(steps.filter(s=>s.required).length,3);
  assert.equal(steps.filter(s=>s.kind==='scale').length,6);assert.ok(steps.filter(s=>s.kind==='scale').every(s=>s.labels.length===5));
  assert.equal(new Set(steps.map(s=>s.id)).size,steps.length);
});
test('assets and module imports resolve inside the delivered site',()=>{
  for(const name of fs.readdirSync(root).filter(n=>n.endsWith('.js'))){const text=fs.readFileSync(path.join(root,name),'utf8');for(const match of text.matchAll(/from\s+['"](\.\/[^'"]+)['"]/g))assert.ok(fs.existsSync(path.resolve(root,match[1])),`${name}: ${match[1]}`)}
  for(const asset of ['assets/mark.svg','assets/relief.svg','assets/visit-guide.pdf'])assert.ok(fs.existsSync(path.join(root,asset)));
});
