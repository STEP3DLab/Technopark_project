"""V02 bench CAD: paired-groove knee spool, fixed Bowden sheath stop, motor spool.
NOT an approved assistive device; use on an unloaded test rig only.
"""
from pathlib import Path
import sys,math,csv,json
import cadquery as cq
import trimesh
import numpy as np
from kinematics import P,export
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'source'))
from clean_stl import clean_stl
HERE=Path(__file__).resolve().parent
OUT=HERE/'files'
for folder in ['STL','STEP']:(OUT/folder).mkdir(exist_ok=True,parents=True)
PARTS={}
def cylinder(rad,length,pos,axis=(1,0,0)):
    return cq.Solid.makeCylinder(rad,length,cq.Vector(*pos),cq.Vector(*axis))
def box(dx,dy,dz,pos,r=0):
    s=cq.Workplane('XY').box(dx,dy,dz)
    if r:s=s.edges().fillet(r)
    return s.translate(pos).val()
def beam(a,b,r):
    va,vb=cq.Vector(*a),cq.Vector(*b)
    return cq.Solid.makeCylinder(r,(vb-va).Length,va,(vb-va).normalized())
def put(code,name,s,note,color):
    s=s.clean()
    assert s.isValid() and len(s.Solids())==1 and s.Volume()>0,(code,len(s.Solids()))
    PARTS[code]=(name,s,note,color)
R=float(P['joint_pulley_pitch_radius'])
# B01 attaches via two provisional M3 standoffs to A10 inner bearing retainer;
# face x74.6 is flush with A10 at x74.6..76.6.
drum=cylinder(R-1,16,(52,0,0))
for x in [52,58,66]:drum=drum.fuse(cylinder(R+4.5,2,(x,0,0)))
for y in [-14,14]:drum=drum.fuse(cylinder(4.7,6.6,(68,y,0)))
drum=drum.cut(cylinder(4.25,23,(52,0,0)))
for y in [-14,14]:drum=drum.cut(cylinder(1.8,25,(51,y,0)))
for x,y in [(56,-25),(64,25)]:drum=drum.cut(cylinder(1.35,7,(x-3.5,y,0)))
put('B01','Двухканальный коленный барабан',drum,
    'R31.5; two M3 holes match A10 nominally; fastening and cable ferrules NOT load verified.',
    (0.93,0.59,0.30))
# B02 is stationary. Mounting holes are aligned with existing A01 through-X
# holes at z=140 and z=160. Guide diameter 5.4, provisional tubing OD5.
plate=box(8,29,38,(116,0,150),2)
for z in [140,160]:plate=plate.cut(cylinder(2.75,12,(110,0,z)))
bridge=beam((119,-14,150),(120,-28,150),5.5)
bridge=bridge.fuse(beam((120,-28,150),(62,-28,125),5.5))
bridge=bridge.fuse(beam((62,-28,125),(62,-28,53),5.5))
guide=box(26,80,14,(61,0,51),1.8)
guide=guide.fuse(bridge).fuse(plate)
for x,y in [(56,-R),(64,R)]:guide=guide.cut(cylinder(2.7,20,(x,y,40),(0,0,1)))
put('B02','Фиксатор оболочек Bowden',guide,
    'Two ID5.4 passages, provisional M5 mount to A01 at z140/160; not strength rated.',
    (0.33,0.78,0.68))
# B03 on unselected motor: assumes output shaft diameter 8 mm.
r=float(P['motor_spool_pitch_radius'])
motor=cylinder(r-1,14,(37,-127,234))
for x in [37,43,49]:motor=motor.fuse(cylinder(r+3.5,2,(x,-127,234)))
motor=motor.cut(cylinder(4.10,14,(37,-127,234)))
for x,y in [(40,-137),(47,-117)]:motor=motor.cut(cylinder(1.2,4,(x-2,y,234)))
put('B03','Двухканальный барабан мотор-редуктора',motor,
    'R12, ID8.2 ASSUMED. Real shaft, reducer, brake and mounting pattern not selected.',
    (0.80,0.84,0.89))
assembly=cq.Assembly(name='V02_DUAL_BOWDEN_BENCH_CONCEPT')
for code,(name,shape,note,col) in PARTS.items():
    assembly.add(shape,name=code,color=cq.Color(*col))
    cq.exporters.export(shape,str(OUT/'STEP'/f'{code}.step'))
    bbox=shape.BoundingBox()
    lens=[bbox.xlen,bbox.ylen,bbox.zlen]
    thin=lens.index(min(lens))
    mesh=shape
    if thin==0:mesh=mesh.rotate((0,0,0),(0,1,0),90)
    elif thin==1:mesh=mesh.rotate((0,0,0),(1,0,0),90)
    b=mesh.BoundingBox()
    mesh=mesh.translate((-(b.xmin+b.xmax)/2,-(b.ymin+b.ymax)/2,-b.zmin))
    p=OUT/'STL'/f'{code}.stl'
    cq.exporters.export(mesh,str(p),tolerance=.075,angularTolerance=.12)
    clean_stl(p)
assembly.save(str(OUT/'Orthosis_V02_drive_concept.step'))
assembly.save(str(OUT/'Orthosis_V02_drive_raw.glb'))
# Merge each named part's CAD surface patches, keeping all triangles and locations.
raw=trimesh.load(OUT/'Orthosis_V02_drive_raw.glb',force='scene')
merged=trimesh.Scene()
for code in PARTS:
    patches=[]
    for node in raw.graph.nodes_geometry:
        cur=node
        while raw.graph.transforms.parents.get(cur) not in (None,'V02_DUAL_BOWDEN_BENCH_CONCEPT'):
            cur=raw.graph.transforms.parents[cur]
        if cur!=code:continue
        mat,gid=raw.graph.get(node)
        patch=raw.geometry[gid].copy()
        patch.apply_transform(mat)
        patches.append(patch)
    assert patches,code
    mesh=trimesh.util.concatenate(patches)
    rgba=np.rint(np.array([*PARTS[code][3],1.])*255).astype(np.uint8)
    mesh.visual=trimesh.visual.ColorVisuals(mesh=mesh,vertex_colors=np.tile(rgba,(len(mesh.vertices),1)))
    merged.add_geometry(mesh,node_name=code,geom_name=code)
assert len(merged.geometry)==3
(OUT/'Orthosis_V02_drive_concept.glb').write_bytes(merged.export(file_type='glb'))
(OUT/'Orthosis_V02_drive_raw.glb').unlink()
with (OUT/'BOM_V02.csv').open('w',encoding='utf-8-sig',newline='') as f:
    w=csv.writer(f,delimiter=';');w.writerow(['Код','Наименование','Количество','Тип','Статус','Примечание'])
    for code,(name,shape,note,col) in PARTS.items():
        w.writerow([code,name,1,'PETG: стендовый тест','Не испытано под нагрузкой',note])
    for code,name,num,note in [
        ('R07','Dyneema inner cable Ø2',2,'end fitting not selected'),
        ('R08','Bowden PTFE sheath OD5 ID3',2,'curvature and length not verified'),
        ('R09','motor gearbox with brake',1,'not selected'),
        ('R10','cable pretension mechanism',2,'not designed')]:
        w.writerow([code,name,num,'purchased/assumed','Unverified',note])
export()
report={'revision':'V02_kinematic_concept_bench_only','parts':{},'assumptions':P,
        'disclaimer':'Bench geometry only; no clinical safety, cable anchor strength, or fatigue testing.'}
for code,(name,shape,note,col) in PARTS.items():
    b=shape.BoundingBox()
    report['parts'][code]={'name':name,'volume_cm3':round(shape.Volume()/1000,2),
      'bbox_mm':[round(b.xlen,2),round(b.ylen,2),round(b.zlen,2)],
      'stl_bytes':(OUT/'STL'/f'{code}.stl').stat().st_size}
(OUT/'manifest.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
print('V02 built:',list(PARTS),'GLB=',(OUT/'Orthosis_V02_drive_concept.glb').stat().st_size)
