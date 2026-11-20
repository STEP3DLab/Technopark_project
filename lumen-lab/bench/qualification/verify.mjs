#!/usr/bin/env node
// Recompute a downloaded evidence package without the website or dependencies.
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {ROLES,evaluateSuite,parseReference,TESTS} from './engine.mjs';
import {readTemperature} from '../protocol.mjs';
export function verifyPackage(data) {
  if(data?.version!=='LM04B-evidence/2'||!data.files||typeof data.files!=='object')throw Error('Unknown evidence package version.');
  const runs={},references={},manual={};let total=0;
  for(const [role,f] of Object.entries(data.files)){
    if(!f||!['utf-8','base64'].includes(f.encoding)||typeof f.data!=='string'||f.data.length>24*1024*1024)throw Error('Invalid file.');
    const bytes=Buffer.from(f.data,f.encoding==='utf-8'?'utf8':'base64');total+=bytes.length;
    if(bytes.length>16*1024*1024||total>64*1024*1024)throw Error('Evidence package is too large.');
    if(createHash('sha256').update(bytes).digest('hex')!==f.sha256)throw Error('SHA-256 mismatch: '+f.name);
    const text=new TextDecoder('utf-8',{fatal:true});
    if(Object.hasOwn(ROLES,role))runs[role]={session:readTemperature(text.decode(bytes))};
    else if(/^ref:point[012]$/.test(role))references[role.slice(4)]={parsed:parseReference(text.decode(bytes))};
    else if(!/^manual:B0[123]$/.test(role))throw Error('Unknown evidence role.');
  }
  for(const t of TESTS.filter(t=>t.manual))manual[t.id]={...data.manual?.[t.id],evidence:data.files['manual:'+t.id]?[data.files['manual:'+t.id].sha256]:[]};
  if(data.planSha256&&data.planSha256!==createHash('sha256').update(JSON.stringify(data.plan)).digest('hex'))throw Error('Plan SHA-256 mismatch.');
  return evaluateSuite({plan:data.plan,runs,references,manual});
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  try{if(!process.argv[2])throw Error('Usage: node qualification/verify.mjs <evidence.json>');const bytes=await readFile(process.argv[2]);if(bytes.length>103*1024*1024)throw Error('File too large.');const result=verifyPackage(JSON.parse(bytes));console.log(JSON.stringify(result,null,2));process.exitCode=result.outcome==='ready_for_review'?0:2}
  catch(e){console.error(e.message);process.exitCode=1}
}
