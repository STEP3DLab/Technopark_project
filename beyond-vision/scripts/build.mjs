import fs from 'node:fs/promises';
import path from 'node:path';
const root=path.resolve(import.meta.dirname,'..');
await fs.mkdir(path.join(root,'dist'),{recursive:true});
for(const name of ['index.html','styles.css','app.js','booking.js','audio.js','api.js','config.js','questions.js','storage.js','assets']){
  await fs.cp(path.join(root,name),path.join(root,'dist',name),{recursive:true});
}
console.log('Static preview updated. The GitHub Pages source is the project root.');
