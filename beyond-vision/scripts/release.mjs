import fs from 'node:fs/promises';
import path from 'node:path';
const root=path.resolve(import.meta.dirname,'..');
const version=process.argv[2];
if(!/^\d+\.\d+\.\d+$/.test(version||''))throw new Error('Pass a semantic version, for example 1.1.1.');
for(const name of (await fs.readdir(root)).filter(n=>n.endsWith('.js'))){
  const file=path.join(root,name);let text=await fs.readFile(file,'utf8');
  text=text.replace(/(from\s+['"]\.\/[^'"?]+\.js)(?:\?v=[^'"]+)?(['"])/g,`$1?v=${version}$2`);
  if(name==='config.js')text=text.replace(/version: '[^']+'/,`version: '${version}'`);
  await fs.writeFile(file,text);
}
const indexPath=path.join(root,'index.html');
let html=await fs.readFile(indexPath,'utf8');
html=html.replace(/((?:src|href)="(?:app\.js|styles\.css|assets\/mark\.svg))(?:\?v=[^"]+)?"/g,`$1?v=${version}"`);
await fs.writeFile(indexPath,html);
const packagePath=path.join(root,'package.json'),pkg=JSON.parse(await fs.readFile(packagePath,'utf8'));pkg.version=version;await fs.writeFile(packagePath,JSON.stringify(pkg)+'\n');
console.log(`Release ${version}: versioned HTML assets and complete module graph.`);
