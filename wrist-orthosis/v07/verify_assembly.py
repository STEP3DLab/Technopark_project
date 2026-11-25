from pathlib import Path
import itertools,concurrent.futures,subprocess,json, tempfile
import numpy as np,trimesh as tm
P=Path(__file__).resolve().parent; D=P/'check_meshes'
meshes={p.stem:tm.load(p,force='mesh') for p in D.glob('*.stl') if not p.stem.startswith(('cable_','fastener_','belt_ref_'))}
pairs=[]
for a,b in itertools.combinations(sorted(meshes),2):
 ba,bb=meshes[a].bounds,meshes[b].bounds
 if np.all(np.minimum(ba[1],bb[1])-np.maximum(ba[0],bb[0])>0.005):pairs.append((a,b))
print('candidate pairs',len(pairs),pairs,flush=True)
def check(ab):
 a,b=ab
 # Internal servo envelope components are deliberately joined, not distinct parts.
 if a.startswith('motor_') and b.startswith('motor_') and {a,b} in ({'motor_body','motor_boss'},{'motor_body','motor_ears'}):
  return {'pair':[a,b],'status':'intentional_reference_union'}
 with tempfile.TemporaryDirectory() as td:
  td=Path(td); sc=td/'intersection.scad';out=td/'intersection.stl'
  sc.write_text(f'intersection(){{import("{D/(a+".stl")}");import("{D/(b+".stl")}");}}')
  p=subprocess.run(['openscad','-o',str(out),str(sc)],capture_output=True,text=True,timeout=45)
  if out.exists():
   m=tm.load(out,force='mesh');v=abs(float(m.volume));return {'pair':[a,b],'volume_mm3':round(v,6),'status':'overlap' if v>.01 else 'clear'}
  if 'empty' in p.stderr.lower():return {'pair':[a,b],'volume_mm3':0,'status':'clear'}
  return {'pair':[a,b],'status':'error','log':p.stderr[-300:]}
with concurrent.futures.ThreadPoolExecutor(max_workers=5) as e:
 result=list(e.map(check,pairs))
for r in result:print(r,flush=True)
report={'candidate_pairs':len(pairs),'all_pairs':len(meshes)*(len(meshes)-1)//2,'tested_parts':len(meshes),'method':'AABB filter then CGAL intersection on assembled meshes; fixed angular position; includes approximate servo envelope, not cable, belt or fastener reference envelopes; internal case unions excluded','results':result}
(P/'files'/'assembly_check.json').write_text(json.dumps(report,ensure_ascii=False,indent=2))
