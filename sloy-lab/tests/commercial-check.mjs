/**
 * Read-only release checks for the static public site. No npm or network needed.
 * Run: node tests/commercial-check.mjs (from any working directory).
 * This is a source/link regression check, not a browser or search ranking audit.
 */
import {readFile, readdir, stat} from 'node:fs/promises';
import {dirname, extname, relative, resolve, sep} from 'node:path';
import {fileURLToPath} from 'node:url';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const siteBase=new URL('https://step3dlab.github.io/Technopark_project/sloy-lab/');
const failures=[], warnings=[], pages=new Map(), canonicalOwners=new Map();
let referenceCount=0, jsonCount=0, faqCount=0;
const fail=(file,message)=>failures.push(`${file}: ${message}`);
const label=file=>relative(root,file).split(sep).join('/');
const entities={amp:'&',lt:'<',gt:'>',quot:'"',apos:"'",nbsp:' ',ndash:'–',mdash:'—',hellip:'…',laquo:'«',raquo:'»'};
function decode(value=''){
  return value.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi,(whole,code)=>{
    if(code[0]!=='#')return entities[code.toLowerCase()]??whole;
    const number=code[1].toLowerCase()==='x'?parseInt(code.slice(2),16):Number(code.slice(1));
    return number>0&&number<=0x10ffff?String.fromCodePoint(number):whole;
  });
}
const normalize=text=>decode(text).replace(/\s+/gu,' ').trim();
const voidTags=new Set('area base br col embed hr img input link meta param source track wbr'.split(' '));
const rawTags=new Set(['script','style','textarea','title']);
const blockTags=new Set('address article aside blockquote body br dd details div dl dt fieldset figcaption figure footer form h1 h2 h3 h4 h5 h6 header hr html li main nav ol p pre section summary table tbody td th tr ul'.split(' '));

// A small source tokenizer with quoted attributes and raw-text handling. Unlike a
// tag regex, it does not interpret JavaScript/JSON strings or quoted > as HTML.
function parseHTML(source){
  const document={tag:'#document',attrs:{},children:[]},nodes=[],stack=[document];
  const appendText=text=>{if(text)stack.at(-1).children.push({text});};
  const lower=source.toLowerCase();let position=0;
  while(position<source.length){
    const opening=source.indexOf('<',position);
    if(opening<0){appendText(source.slice(position));break;}
    appendText(source.slice(position,opening));
    if(source.startsWith('<!--',opening)){
      const ending=source.indexOf('-->',opening+4);position=ending<0?source.length:ending+3;continue;
    }
    let ending=opening+1,quote='';
    for(;ending<source.length;ending++){
      const c=source[ending];if(quote){if(c===quote)quote='';}else if(c==='"'||c==="'")quote=c;else if(c==='>')break;
    }
    const token=source.slice(opening+1,ending);position=Math.min(ending+1,source.length);
    const match=token.match(/^\s*(\/?)\s*([a-z][\w:-]*)/i);if(!match)continue;
    const tag=match[2].toLowerCase();
    if(match[1]){
      for(let i=stack.length-1;i>0;i--)if(stack[i].tag===tag){stack.length=i;break;}
      continue;
    }
    const attrs={};const attributeText=token.slice(match[0].length);
    for(const attr of attributeText.matchAll(/([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g)){
      attrs[attr[1].toLowerCase()]=decode(attr[2]??attr[3]??attr[4]??'');
    }
    const node={tag,attrs,children:[],parent:stack.at(-1)};nodes.push(node);stack.at(-1).children.push(node);
    if(rawTags.has(tag)){
      const close=lower.indexOf(`</${tag}`,position);
      node.children.push({text:source.slice(position,close<0?source.length:close)});
      const closingEnd=close<0?-1:source.indexOf('>',close);
      position=closingEnd<0?source.length:closingEnd+1;continue;
    }
    if(!voidTags.has(tag)&&!token.trimEnd().endsWith('/'))stack.push(node);
  }
  return {document,nodes};
}
function textOf(node,visible=false){
  if(node.text!==undefined)return node.text;
  if(visible&&(['script','style','template'].includes(node.tag)||'hidden' in node.attrs||node.attrs['aria-hidden']==='true'))return '';
  const text=node.children.map(child=>textOf(child,visible)).join('');
  return visible&&blockTags.has(node.tag)?` ${text} `:text;
}
function isHidden(node){
  for(let parent=node;parent;parent=parent.parent)if('hidden' in parent.attrs||parent.attrs['aria-hidden']==='true'||parent.tag==='template')return true;
  return false;
}
function descendants(node,tag){
  return node.children.flatMap(child=>child.tag?[...(child.tag===tag?[child]:[]),...descendants(child,tag)]:[]);
}
function pageURL(file){return new URL(label(file),siteBase);}
function expectedCanonical(file){
  const url=pageURL(file);url.pathname=url.pathname.replace(/\/index\.html$/,'/');return url.href;
}
async function filesBelow(directory){
  const entries=await readdir(directory,{withFileTypes:true}),result=[];
  for(const entry of entries){
    if(entry.name.startsWith('.')||entry.name==='node_modules')continue;
    const path=resolve(directory,entry.name);
    if(entry.isDirectory())result.push(...await filesBelow(path));else if(entry.isFile())result.push(path);
  }
  return result;
}
const files=(await filesBelow(root)).sort();
for(const file of files.filter(file=>extname(file)==='.html')){
  const source=await readFile(file,'utf8'),tree=parseHTML(source),name=label(file),ids=new Set(),seenIDs=new Set();
  for(const node of tree.nodes){
    if(node.attrs.id){if(seenIDs.has(node.attrs.id))fail(name,`duplicate id="${node.attrs.id}"`);seenIDs.add(node.attrs.id);ids.add(node.attrs.id);}
    if(node.tag==='a'&&node.attrs.name)ids.add(node.attrs.name);
  }
  const headings=tree.nodes.filter(node=>node.tag==='h1');
  if(headings.length!==1)fail(name,`expected exactly 1 H1, found ${headings.length}`);
  const titles=tree.nodes.filter(node=>node.tag==='title');
  const descriptions=tree.nodes.filter(node=>node.tag==='meta'&&node.attrs.name?.toLowerCase()==='description');
  const canonicals=tree.nodes.filter(node=>node.tag==='link'&&node.attrs.rel?.toLowerCase().split(/\s+/).includes('canonical'));
  const title=normalize(titles[0]?textOf(titles[0]):''),description=normalize(descriptions[0]?.attrs.content??'');
  if(titles.length!==1||!title)fail(name,`expected 1 nonempty title, found ${titles.length}`);
  if(descriptions.length!==1||!description)fail(name,`expected 1 nonempty meta description, found ${descriptions.length}`);
  let canonical='';
  if(canonicals.length!==1)fail(name,`expected 1 canonical link, found ${canonicals.length}`);
  else{
    try{
      const raw=canonicals[0].attrs.href??'';
      if(!/^https:\/\//i.test(raw))throw new Error('must be absolute HTTPS');
      canonical=new URL(raw).href;
      if(canonical!==expectedCanonical(file))fail(name,`canonical ${canonical} does not match ${expectedCanonical(file)}`);
      if(canonicalOwners.has(canonical))fail(name,`canonical also used by ${canonicalOwners.get(canonical)}`);
      else canonicalOwners.set(canonical,name);
    }catch(error){fail(name,`invalid canonical (${error.message})`);}
  }
  const noindex=tree.nodes.some(node=>node.tag==='meta'&&['robots','googlebot','yandex'].includes(node.attrs.name?.toLowerCase())&&/\bnoindex\b/i.test(node.attrs.content??''));
  const base=tree.nodes.find(node=>node.tag==='base'&&node.attrs.href);
  let effectiveURL=pageURL(file);
  if(base){try{effectiveURL=new URL(base.attrs.href,effectiveURL);}catch{fail(name,'invalid base href');}}
  pages.set(file,{file,name,source,...tree,ids,title,description,canonical,noindex,effectiveURL});
}
if(!pages.size)fail('site','no HTML pages found');
for(const field of ['title','description']){
  const owners=new Map();
  for(const page of pages.values()){
    if(!page[field])continue;const key=page[field].toLocaleLowerCase('ru');
    if(owners.has(key))fail(page.name,`duplicate ${field}, also on ${owners.get(key)}`);else owners.set(key,page.name);
  }
}
async function targetFile(url){
  let pathname;try{pathname=decodeURIComponent(url.pathname);}catch{return null;}
  if(!pathname.startsWith(siteBase.pathname))return null;
  let file=resolve(root,pathname.slice(siteBase.pathname.length));
  if(file!==root&&!file.startsWith(root+sep))return null;
  try{if((await stat(file)).isDirectory())file=resolve(file,'index.html');if(!(await stat(file)).isFile())return null;return file;}catch{return null;}
}
async function checkReference(page,reference,kind){
  const raw=reference.trim();
  if(!raw){if(kind!=='href')fail(page.name,`empty ${kind}`);return;}
  if(/^(?:mailto|tel|sms|data|blob|javascript):/i.test(raw))return;
  let url;try{url=new URL(raw,page.effectiveURL);}catch{fail(page.name,`invalid ${kind}: ${raw}`);return;}
  if(!['http:','https:'].includes(url.protocol)||url.origin!==siteBase.origin)return;
  if(!url.pathname.startsWith(siteBase.pathname)){
    // Other sites in the shared GitHub Pages repository are outside this scope.
    if(!/^(?:https?:)?\/\//i.test(raw))warnings.push(`${page.name}: local reference outside site scope: ${raw}`);
    return;
  }
  referenceCount++;const target=await targetFile(url);
  if(!target){fail(page.name,`missing local ${kind}: ${raw}`);return;}
  if(url.hash&&pages.has(target)){
    let fragment;try{fragment=decodeURIComponent(url.hash.slice(1));}catch{fail(page.name,`malformed fragment: ${raw}`);return;}
    if(fragment&&!fragment.startsWith(':~:text=')&&!pages.get(target).ids.has(fragment))fail(page.name,`missing anchor #${fragment} in ${label(target)} (${raw})`);
  }
}
for(const page of pages.values()){
  for(const node of page.nodes){
    for(const attribute of ['href','src','poster','xlink:href']){
      if(!(attribute in node.attrs))continue;
      if(node.tag==='link'&&node.attrs.rel?.toLowerCase().split(/\s+/).includes('canonical'))continue;
      await checkReference(page,node.attrs[attribute],attribute);
    }
    if(node.attrs.srcset&&!node.attrs.srcset.trim().startsWith('data:')){
      for(const candidate of node.attrs.srcset.split(','))await checkReference(page,candidate.trim().split(/\s+/)[0],'srcset');
    }
  }
  const visibleFAQs=page.nodes.filter(node=>node.tag==='details'&&!isHidden(node)).map(detail=>{
    const summary=descendants(detail,'summary')[0];
    const question=normalize(summary?textOf(summary,true):'').replace(/\s*[+−×]\s*$/u,'');
    const answer=normalize(detail.children.filter(child=>child!==summary).map(child=>textOf(child,true)).join(''));
    return{question,answer};
  });
  const visitSchema=value=>{
    if(Array.isArray(value)){value.forEach(visitSchema);return;}
    if(!value||typeof value!=='object')return;
    const types=Array.isArray(value['@type'])?value['@type']:[value['@type']];
    if(types.includes('FAQPage')){
      const questions=Array.isArray(value.mainEntity)?value.mainEntity:[value.mainEntity];
      for(const entry of questions){
        faqCount++;
        const question=normalize(entry?.name??'');
        const answerNode=Array.isArray(entry?.acceptedAnswer)?entry.acceptedAnswer[0]:entry?.acceptedAnswer;
        const answer=normalize(textOf(parseHTML(answerNode?.text??'').document,true));
        const match=visibleFAQs.find(candidate=>candidate.question===question);
        if(!question||!answer)fail(page.name,'FAQPage contains an empty question or answer');
        else if(!match)fail(page.name,`FAQ question absent from visible details: ${question}`);
        else if(match.answer!==answer)fail(page.name,`FAQ answer differs from visible content: ${question}`);
      }
    }
    for(const child of Object.values(value))if(child&&typeof child==='object')visitSchema(child);
  };
  for(const node of page.nodes.filter(node=>node.tag==='script'&&node.attrs.type?.toLowerCase().trim()==='application/ld+json')){
    jsonCount++;
    try{visitSchema(JSON.parse(textOf(node)));}catch(error){fail(page.name,`invalid JSON-LD: ${error.message}`);}
  }
}

// Check local CSS resources and literal module imports too: these do not appear
// in HTML href/src but missing files can silently break the scene or typography.
for(const file of files.filter(file=>['.js','.mjs','.css'].includes(extname(file))&&!label(file).startsWith('tests/'))){
  const source=await readFile(file,'utf8'),page={name:label(file),effectiveURL:pageURL(file)};
  if(extname(file)==='.css'){
    for(const match of source.matchAll(/url\(\s*(['"]?)([^)'"\s]+)\1\s*\)/g))if(!match[2].startsWith('#'))await checkReference(page,match[2],'CSS url');
  }else{
    const imports=[...source.matchAll(/\b(?:import|export)\s*(?:[^'"\n]*?\bfrom\s*)?['"]([^'"]+)['"]/g)].map(match=>match[1]);
    imports.push(...[...source.matchAll(/\bimport\s*\(\s*(['"])([^'"]+)\1\s*\)/g)].map(match=>match[2]));
    for(const ref of new Set(imports))if(/^(?:\.\.?\/|\/)/.test(ref))await checkReference(page,ref,'module import');
  }
}

const sitemapPath=resolve(root,'sitemap.xml'),sitemapURLs=new Set();
try{
  const sitemap=await readFile(sitemapPath,'utf8');
  if(!/<urlset\b[^>]*>/i.test(sitemap)||!/<\/urlset>/i.test(sitemap))fail('sitemap.xml','expected a urlset XML document');
  for(const match of sitemap.matchAll(/<loc\b[^>]*>([\s\S]*?)<\/loc>/gi)){
    const raw=decode(match[1].trim());let url;
    try{url=new URL(raw);}catch{fail('sitemap.xml',`invalid URL: ${raw}`);continue;}
    if(sitemapURLs.has(url.href))fail('sitemap.xml',`duplicate URL: ${url.href}`);sitemapURLs.add(url.href);
    if(url.origin!==siteBase.origin||!url.pathname.startsWith(siteBase.pathname)||url.search||url.hash){fail('sitemap.xml',`URL outside canonical site scope: ${raw}`);continue;}
    const file=await targetFile(url),page=file?pages.get(file):null;
    if(!page){fail('sitemap.xml',`URL has no HTML page: ${raw}`);continue;}
    if(page.noindex)fail('sitemap.xml',`noindex page listed: ${page.name}`);
    if(url.href!==page.canonical)fail('sitemap.xml',`URL differs from page canonical: ${raw}`);
  }
  for(const page of pages.values())if(!page.noindex&&!sitemapURLs.has(page.canonical||expectedCanonical(page.file)))fail('sitemap.xml',`indexable page omitted: ${page.name}`);
}catch(error){fail('sitemap.xml',`cannot read sitemap (${error.code??error.message})`);}

console.log(`Commercial static check: ${pages.size} HTML pages, ${referenceCount} local references, ${jsonCount} JSON-LD blocks, ${faqCount} FAQ answers, ${sitemapURLs.size} sitemap URLs.`);
for(const warning of [...new Set(warnings)])console.log(`WARN ${warning}`);
for(const failure of failures)console.error(`FAIL ${failure}`);
console.log(failures.length?`FAILED: ${failures.length} issue(s). No files changed.`:'PASS: local links, anchors, metadata, structured data and sitemap are consistent.');
process.exitCode=failures.length?1:0;
