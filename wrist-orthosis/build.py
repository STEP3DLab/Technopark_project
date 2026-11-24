from pathlib import Path
import subprocess, json, zipfile, os, concurrent.futures
import numpy as np, trimesh as tm
from trimesh.transformations import rotation_matrix, translation_matrix
from shapely.geometry import Polygon
from shapely.affinity import rotate,translate
P=Path(__file__).resolve().parent; F=P/'files'; S=F/'stl'; S.mkdir(parents=True,exist_ok=True)
parts=['upper','lower','plate','motorwall','supportwall','driven','pinion','spool','bush','shaft','spacer2','spacer3','collar']
def run(p):
 out=S/(p+'.stl'); subprocess.run(['openscad','-o',str(out),'-D',f'part="{p}"','-D','print_pose=true',str(P/'model.scad')],check=True,capture_output=True)
 m=tm.load(out,force='mesh'); assert m.is_watertight and m.is_winding_consistent and m.volume>0 and len(m.split(only_watertight=False))==1,p
 return p,m
with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool: raw=dict(pool.map(run,parts))
def R(deg,axis):return rotation_matrix(np.deg2rad(deg),axis)
def transform(mesh,mat):m=mesh.copy();m.apply_transform(mat);return m
def T(x,y,z):return translation_matrix([x,y,z])
def section(name,z):
 sec=raw[name].section([0,0,1],[0,0,z]);return max([Polygon(a[:,:2]) for a in sec.discrete],key=lambda x:x.area)
a=section('driven',4);b=section('pinion',7);over=[];clear=[]
for t in np.linspace(0,4,81):
 aa=rotate(a,t,origin=(0,0));bb=translate(rotate(b,10-5*t,origin=(0,0)),yoff=-32.4);over.append(aa.intersection(bb).area);clear.append(aa.distance(bb))
assert max(over)<1e-5,(max(over),clear)
scene=tm.Scene(); nodes={}
def put(name,mesh,matrix,col,group=''):
 m=transform(mesh,matrix);m.visual.face_colors=col;scene.add_geometry(m,node_name=name,geom_name=name);nodes[name]=m
white=[234,238,240,255];grey=[163,179,191,255];blue=[69,116,142,255];gold=[231,158,59,255];teal=[111,165,169,255];metal=[152,155,165,255]
put('upper',raw['upper'],T(0,0,2)@R(-90,[1,0,0]),white);put('lower',raw['lower'],T(0,0,-2)@R(180,[0,1,0])@R(-90,[1,0,0]),grey)
put('plate',raw['plate'],T(0,0,38),blue);put('motorwall',raw['motorwall'],T(0,0,2)@R(90,[0,1,0]),blue);put('supportwall',raw['supportwall'],T(0,0,2)@R(-90,[0,1,0]),blue)
def ax(name,p,x,y,z,col,phase=0,offset=0):put(name,raw[p],T(x,y,z+2)@R(90,[0,1,0])@R(phase,[0,0,1])@T(0,0,offset),col)
ax('driven','driven',-20,65,74,gold);ax('pinion','pinion',-20,32.6,74,gold,10,-3);ax('spool','spool',-6,65,74,teal);ax('shaft','shaft',-34,65,74,metal);ax('bush_left','bush',-29.4,65,74,grey);put('bush_right',raw['bush'],T(29.4,65,76)@R(-90,[0,1,0]),grey);ax('spacer_left','spacer2',-21.8,65,74,grey);ax('spacer_middle','spacer2',-8,65,74,grey);ax('spacer_right','spacer3',19.2,65,74,grey);ax('collar_left','collar',-33.4,65,74,metal);ax('collar_right','collar',29.4,65,74,metal)
# Reference geometry, not printable: motor housing and cable path.
def refbox(name,lo,size,color):put(name,tm.creation.box(size),T(*(np.array(lo)+np.array(size)/2)),color)
refbox('servo_body',[-60.8,2.2,65.95],[32.8,40.8,20.1],[42,49,58,255]);refbox('servo_flange',[-30.5,-2.1,65.95],[2.5,49.5,20.1],[59,66,75,255]);
for i,(a,b) in enumerate(zip([[0,65,68],[0,109,51],[0,127,51],[0,145,51]],[[0,109,51],[0,127,51],[0,145,51],[0,160,51]])):
 m=tm.creation.cylinder(radius=.65,segment=[a,b],sections=12);put('cable_'+str(i),m,np.eye(4),[195,106,35,255])
# Native model units mm; GLB preview retains mm. Each printable mesh centered and seated on build plate.
(F/'assembly.glb').write_bytes(scene.export(file_type='glb'))
manifest={'revision':'V01 bench','units':'mm','gear_ratio':'5:1','gear_pair':[18,90],'module_mm':.6,'center_distance_mm':32.4,'gear_samples':81,'max_sampled_profile_overlap_mm2':float(max(over)),'min_sampled_clearance_mm':float(min(clear)),'parts':[]}
for p,m in raw.items():
 m=m.copy();m.apply_translation([-m.bounds[:,0].mean(),-m.bounds[:,1].mean(),-m.bounds[0,2]]);m.export(S/(p+'.stl'));manifest['parts'].append({'id':p,'triangles':len(m.faces),'size_mm':np.round(m.extents,2).tolist(),'watertight':bool(m.is_watertight),'connected':True,'volume_mm3':round(float(m.volume),2)})
(F/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2))
with zipfile.ZipFile(F/'wrist-orthosis-v01.zip','w',zipfile.ZIP_DEFLATED) as z:
 for p in [P/'model.scad',P/'build.py',P/'README.md',F/'assembly.glb',F/'manifest.json',*S.glob('*.stl')]:z.write(p,p.relative_to(P))
print(json.dumps(manifest,ensure_ascii=False,indent=2))
