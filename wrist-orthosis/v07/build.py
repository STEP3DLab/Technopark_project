from pathlib import Path
import subprocess, json, zipfile, os, concurrent.futures
import numpy as np, trimesh as tm
from trimesh.transformations import rotation_matrix, translation_matrix
from shapely.geometry import Polygon
from shapely.affinity import rotate,translate
P=Path(__file__).resolve().parent; F=P/'files'; S=F/'stl'; S.mkdir(parents=True,exist_ok=True)
parts=['upper','lower','plate','motorwall','supportwall','driven','pinion','spool','bush','shaft','spacer2','spacer3','collar','fit_coupon','servo_coupon','guide_coupon']
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
a=section('driven',4);b=section('pinion',10);over=[];clear=[]
for t in np.linspace(0,4,81):
 aa=rotate(a,t,origin=(0,0));bb=translate(rotate(b,10-5*t,origin=(0,0)),yoff=-21.7);over.append(aa.intersection(bb).area);clear.append(aa.distance(bb))
assert max(over)<1e-5,(max(over),clear)
scene=tm.Scene(); nodes={}
def put(name,mesh,matrix,col,group=''):
 m=transform(mesh,matrix);m.visual.face_colors=col;scene.add_geometry(m,node_name=name,geom_name=name);nodes[name]=m
white=[234,238,240,255];grey=[163,179,191,255];blue=[69,116,142,255];gold=[231,158,59,255];teal=[111,165,169,255];metal=[152,155,165,255]
put('upper',raw['upper'],T(0,0,2)@R(-90,[1,0,0]),white);put('lower',raw['lower'],T(0,0,-2)@R(180,[0,1,0])@R(-90,[1,0,0]),grey)
put('plate',raw['plate'],T(0,0,38),blue);put('motorwall',raw['motorwall'],T(0,0,2)@R(90,[0,1,0]),blue);put('supportwall',raw['supportwall'],T(0,0,2)@R(-90,[0,1,0]),blue)
def ax(name,p,x,y,z,col,phase=0,offset=0):put(name,raw[p],T(x,y,z+2)@R(90,[0,1,0])@R(phase,[0,0,1])@T(0,0,offset),col)
ax('driven','driven',-20,65,61,gold);ax('pinion','pinion',-20.5,43.3,61,gold,10,-6);ax('spool','spool',-6,65,61,teal);ax('shaft','shaft',-34,65,61,metal);ax('bush_left','bush',-29.4,65,61,grey);put('bush_right',raw['bush'],T(29.4,65,63)@R(-90,[0,1,0]),grey);ax('spacer_left','spacer2',-21.8,65,61,grey);ax('spacer_middle','spacer2',-8,65,61,grey);ax('spacer_right','spacer3',19.2,65,61,grey);ax('collar_left','collar',-33.6,65,61,metal);ax('collar_right','collar',29.6,65,61,metal)
# Reference geometry, not printable: motor housing and cable path.
def refbox(name,lo,size,color):put(name,tm.creation.box(size),T(*(np.array(lo)+np.array(size)/2)),color)
# Exact modeled motor envelope + flange, boss, spline and horn reference. Actual interface dimensions require measurement.
import tempfile
for name in ['motor_body','motor_ears','motor_boss','motor_spline','motor_horn']:
 with tempfile.TemporaryDirectory() as td:
  out=Path(td)/(name+'.stl');subprocess.run(['openscad','-o',str(out),'-D',f'part="{name}"',str(P/'model.scad')],check=True,capture_output=True)
  col=[42,49,58,255] if name=='motor_body' else [72,80,92,255] if name in ('motor_ears','motor_boss','motor_horn') else [186,159,92,255]
  put(name,tm.load(out,force='mesh'),T(0,0,2),col)
# Visual reference hardware, not part of the printable set (no threads modeled).
# These are nominal envelopes only; verify purchased fasteners and horn by trial fit.
def screw_ref(name,x0,xseat,xend,y,z,head_d,shank_d):
 head=tm.creation.cylinder(radius=head_d/2,segment=[[x0,y,z],[xseat,y,z]],sections=32)
 shank=tm.creation.cylinder(radius=shank_d/2,segment=[[xseat,y,z],[xend,y,z]],sections=32)
 put(name,tm.util.concatenate([head,shank]),np.eye(4),[157,166,176,255])
for i,k in enumerate([-1,1]):
 y=43.3+k*6.6*np.sin(np.deg2rad(10));z=63-k*6.6*np.cos(np.deg2rad(10))
 # head on gear side, recessed to keep its axial end clear of driven wheel
 screw_ref('fastener_horn_'+str(i),-20.7,-22.7,-28.7,y,z,3.8,2)
for i,(a,b) in enumerate(zip([[0,65,55],[0,106,46],[0,125,46],[0,147,46]],[[0,106,46],[0,125,46],[0,147,46],[0,160,46]])):
 m=tm.creation.cylinder(radius=.65,segment=[a,b],sections=12);put('cable_'+str(i),m,np.eye(4),[195,106,35,255])
# Flexible retention belts: illustrative envelopes only, not printable.
for i,x in enumerate([-61.5,-46.5]):
 lo=9.5; hi=57.5; bottom=37.45; top=73.65; width=8; thick=1.1
 segs=[]
 for yy,zz,dy,dz in [((lo+hi)/2,top,hi-lo,thick),(lo,(bottom+top)/2,thick,top-bottom),(hi,(bottom+top)/2,thick,top-bottom),((lo+hi)/2,bottom,hi-lo,thick)]:
  m=tm.creation.box([width,dy,dz]);m.apply_translation([x,yy,zz]);segs.append(m)
 put('belt_ref_'+str(i),tm.util.concatenate(segs),np.eye(4),[37,45,62,255])
(P/'check_meshes').mkdir(exist_ok=True)
for n,m in nodes.items(): m.export(P/'check_meshes'/(n+'.stl'))
# Native model units mm; GLB preview retains mm. Each printable mesh centered and seated on build plate.
(F/'assembly.glb').write_bytes(scene.export(file_type='glb'))
manifest={'revision':'V07 bench','units':'mm','gear_ratio':'5:1','gear_pair':[18,90],'module_mm':.4,'center_distance_mm':21.7,'gear_outer_diameters_mm':[8.0,36.8],'shell_length_mm':110,'inner_width_mm':[88,78],'inner_height_without_gap_mm':[62,54],'guide_length_mm':72,'guide_extension_mm':50,'guide_holes_y_mm':[106,125,147],'guide_width_mm':28,'guide_integral_with_upper_shell':True,'guide_hole_diameter_mm':6.2,'guide_eye_outer_diameter_mm':16,'guide_chamfer_mm':1.2,'guide_chamfer_angle_deg':45,'guide_entry_diameter_mm':8.6,'guide_thickness_mm':7,'guide_root_width_mm':38,'gear_tooth_thinning_mm':0.14,'gear_samples':81,'max_sampled_profile_overlap_mm2':float(max(over)),'min_sampled_clearance_mm':float(min(clear)),'servo_support':{'integral_with_plate':True,'shelf_top_z_mm':50.95,'body_bottom_z_mm':50.95,'flat_support_mm':[41.6,56.5,14.95],'raised_stops':False,'slot_size_mm':[10.4,3.8],'belt_width_mm':8,'belt_count':2,'reference_dimensions_confirmed':False},'shell_strap_slots':{'count_per_half':4,'size_mm':[26,5.5],'integral_through_wall':True,'center_z_mm':10,'y_mm':[22,83]},'wrist_position_estimated':True,'parts':[]}
for p,m in raw.items():
 m=m.copy();m.apply_translation([-m.bounds[:,0].mean(),-m.bounds[:,1].mean(),-m.bounds[0,2]]);m.export(S/(p+'.stl'));manifest['parts'].append({'id':p,'triangles':len(m.faces),'size_mm':np.round(m.extents,2).tolist(),'watertight':bool(m.is_watertight),'connected':True,'volume_mm3':round(float(m.volume),2)})
(F/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2))
print(json.dumps(manifest,ensure_ascii=False,indent=2))
