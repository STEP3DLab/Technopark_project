import test from 'node:test';
import assert from 'node:assert/strict';
import {DEFAULT_PLAN,TESTS,evaluateRun,evaluateSuite,parseReference,compareReference,decision,validatePlan} from '../qualification/engine.mjs';
import {readTemperature,canonicalTemperature} from '../protocol.mjs';
import {verifyPackage} from '../qualification/verify.mjs';
import {createHash} from 'node:crypto';

function rom(seed){const data=[0x28,seed,2,3,4,5,6];let crc=0;for(const b of data){let v=b;for(let i=0;i<8;i++){const bit=(crc^v)&1;crc>>=1;if(bit)crc^=0x8c;v>>=1}}return [...data,crc].map(v=>v.toString(16).padStart(2,'0')).join('')}
const plan=()=>({...DEFAULT_PLAN,device:'TEST-FIXTURE',operator:'Software test only',board:'0123456789abcdef',rom1:rom(1),rom2:rom(2),reference:'TEST REFERENCE',certificate:'SOFTWARE TEST',physicalDeclaration:true,methodDeclaration:true});
function run({n=60,period=1000,boot='1111111111111111',a=20,b=20,absent=null,synthetic=false}={}) {
  const p=plan(),frames=[];
  for(let i=0;i<n;i++)frames.push({v:'LM04B/1',board:p.board,boot,seq:i,ms:750+i*period,
    t1:{id:absent==='t1'?null:p.rom1,c:absent==='t1'?null:a,s:absent==='t1'?'no_sensor':'ok'},
    t2:{id:absent==='t2'?null:p.rom2,c:absent==='t2'?null:b,s:absent==='t2'?'no_sensor':'ok'}});
  return readTemperature([JSON.stringify({type:'LM04B-file',synthetic}),...frames.map(r=>JSON.stringify(r))].join('\n'));
}
function reference(value=20){return parseReference('seq,ref_C\n'+Array.from({length:10},(_,i)=>(i*6)+','+value).join('\n'))}
function completeProject(){const p=plan(),roles={baseline:run(),restart:run({n:10,boot:'2222222222222222'}),onlyT1:run({n:10,absent:'t2'}),onlyT2:run({n:10,absent:'t1'}),endurance:run({n:1801})};
  const refs={};for(let i=0;i<3;i++){const value=p.targetsC[i];roles['point'+i]=run({a:value,b:value});refs['point'+i]={parsed:reference(value)}}
  return {plan:p,runs:Object.fromEntries(Object.entries(roles).map(([k,s])=>[k,{session:s}])),references:refs,
    manual:Object.fromEntries(TESTS.filter(t=>t.manual).map(t=>[t.id,{status:'pass',note:'Software fixture, never physical measurement.',evidence:['TEST']}]))};
}
test('an empty workspace cannot pass any acceptance check',()=>{const r=evaluateSuite({plan:{...DEFAULT_PLAN}});assert.equal(r.complete,0);assert.equal(r.outcome,'incomplete');assert.equal(r.total,12)});
test('continuous two-channel run passes a functional criterion',()=>assert.equal(evaluateRun(run(),'baseline',plan()).status,'pass'));
test('synthetic temperature records cannot pass',()=>assert.equal(evaluateRun(run({synthetic:true}),'baseline',plan()).status,'fail'));
test('recording from a different board fails',()=>{const p=plan();p.board='ffffffffffffffff';assert.equal(evaluateRun(run(),'baseline',p).status,'fail')});
test('a changed sensor ROM fails',()=>{const p=plan();p.rom1=rom(4);assert.equal(evaluateRun(run(),'baseline',p).status,'fail')});
test('the same ROM cannot be assigned to both inputs',()=>{const p=plan();p.rom2=p.rom1;assert.equal(evaluateRun(run(),'baseline',p).status,'fail')});
test('insufficient frame count fails',()=>assert.equal(evaluateRun(run({n:59}),'baseline',plan()).status,'fail'));
test('a burst of frames does not satisfy elapsed duration',()=>assert.equal(evaluateRun(run({period:500}),'baseline',plan()).status,'fail'));
test('a sequence-number gap fails',()=>{const s=run();s.rows[30].seq++;s.missed=1;assert.equal(evaluateRun(s,'baseline',plan()).status,'fail')});
test('a long interval fails even with consecutive seq',()=>{const s=run();for(let i=30;i<s.rows.length;i++)s.rows[i].ms+=700;assert.equal(evaluateRun(s,'baseline',plan()).status,'fail')});
test('one absent channel is expected only in its own scenario',()=>{const s=run({n:10,absent:'t2'});assert.equal(evaluateRun(s,'onlyT1',plan()).status,'pass');assert.equal(evaluateRun(s,'onlyT2',plan()).status,'fail')});
test('endurance is evaluated by device time, not number of rows alone',()=>{assert.equal(evaluateRun(run({n:1801}),'endurance',plan()).status,'pass');assert.equal(evaluateRun(run({n:1801,period:999}),'endurance',plan()).status,'fail')});
test('reference CSV accepts decimal comma only with semicolon separator',()=>assert.deepEqual(parseReference('seq;ref_C\n1;20,125\n2;20,25').rows,[{seq:1,refC:20.125},{seq:2,refC:20.25}]));
test('reference CSV rejects duplicate seq, missing numbers and extra columns',()=>{for(const csv of ['seq,ref_C\n1,20\n1,21','seq,ref_C\n1,','seq,ref_C\n1,20,5'])assert.throws(()=>parseReference(csv))});
test('comparison passes with a stable, matched reference',()=>{const r=compareReference(run(),reference(),plan(),0);assert.equal(r.status,'pass');assert.equal(r.metrics.channels[0].errorC,0);assert.ok(r.metrics.channels[0].expandedC>0)});
test('reported uncertainty equals the documented independent-components budget',()=>{const p=plan(),r=compareReference(run(),reference(),p,0);const expected=2*Math.hypot(.2/2,.0625/Math.sqrt(12),.2/Math.sqrt(3),.05/Math.sqrt(3));assert.ok(Math.abs(r.metrics.channels[0].expandedC-expected)<1e-12)});
test('a synthetic reference can never close a physical comparison',()=>{const ref=reference();ref.synthetic=true;assert.equal(compareReference(run(),ref,plan(),0).status,'fail')});
test('a reference paired with nonexistent frame numbers fails',()=>{const ref=reference();ref.rows[9].seq=1000;assert.equal(compareReference(run(),ref,plan(),0).status,'fail')});
test('reference coverage and number of pairs both matter',()=>{const ref=reference();ref.rows=ref.rows.slice(0,9);assert.equal(compareReference(run(),ref,plan(),0).status,'fail');const ref2=reference();ref2.rows.forEach((r,i)=>r.seq=i);assert.equal(compareReference(run(),ref2,plan(),0).status,'fail')});
test('reference mean must lie in its declared temperature point',()=>assert.equal(compareReference(run(),reference(20),plan(),1).status,'fail'));
test('unstable input is rejected before uncertainty calculation',()=>{const s=run();s.rows[40].t1.c=21;assert.equal(compareReference(s,reference(),plan(),0).status,'fail')});
test('large errors fail while an interval touching the limit is indeterminate',()=>{assert.equal(compareReference(run({a:22,b:22}),reference(),plan(),0).status,'fail');assert.equal(compareReference(run({a:20.875,b:20.875}),reference(),plan(),0).status,'indeterminate')});
test('guard-band rule treats equality and the uncertainty band explicitly',()=>{assert.equal(decision(.75,.25,1),'pass');assert.equal(decision(1.25,.25,1),'indeterminate');assert.equal(decision(1.251,.25,1),'fail')});
test('all computational checks only lead to review, never an approval certificate',()=>{const r=evaluateSuite(completeProject());assert.equal(r.complete,12);assert.equal(r.outcome,'ready_for_review');assert.equal(r.requiresResponsibleReview,true)});
test('a manual checkbox without attached evidence does not pass',()=>{const project=completeProject();project.manual.B02.evidence=[];assert.equal(evaluateSuite(project).complete,11)});
test('the restart scenario requires a new boot identifier',()=>{const project=completeProject();project.runs.restart=project.runs.baseline;assert.equal(evaluateSuite(project).results.find(r=>r.id==='B08').status,'fail')});
test('a physical declaration and responsible person are required for review',()=>{const project=completeProject();project.plan.physicalDeclaration=false;assert.equal(evaluateSuite(project).outcome,'incomplete');project.plan.physicalDeclaration=true;project.plan.operator='';assert.equal(evaluateSuite(project).outcome,'incomplete')});
test('invalid or unsupported plan numbers are refused',()=>{for(const value of [NaN,Infinity,-1,0,'1'])assert.throws(()=>validatePlan({...plan(),toleranceC:value}));assert.throws(()=>validatePlan({...plan(),targetsC:[10,20,30]}))});
function packageWithRun(s){const data=canonicalTemperature(s),bytes=Buffer.from(data);return {version:'LM04B-evidence/2',plan:plan(),manual:{},files:{baseline:{name:'SOFTWARE-FIXTURE.jsonl',size:bytes.length,encoding:'utf-8',data,sha256:createHash('sha256').update(bytes).digest('hex')}}}}
test('independent verification rejects a modified source file',()=>{const pkg=packageWithRun(run());pkg.files.baseline.data+=' ';assert.throws(()=>verifyPackage(pkg),/SHA-256 mismatch/)});
test('independent verification recomputes and ignores an invented assessment',()=>{const pkg=packageWithRun(run({synthetic:true}));pkg.assessment={outcome:'ready_for_review',complete:12};assert.equal(verifyPackage(pkg).results.find(r=>r.id==='B04').status,'fail')});
test('independent verification preserves BOM and CRLF original bytes',()=>{const pkg=packageWithRun(run()),f=pkg.files.baseline;const raw=Buffer.from('\uFEFF'+f.data.replaceAll('\n','\r\n'));f.data=raw.toString('base64');f.encoding='base64';f.sha256=createHash('sha256').update(raw).digest('hex');assert.equal(verifyPackage(pkg).results.find(r=>r.id==='B04').status,'pass')});
