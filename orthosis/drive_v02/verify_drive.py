"""Sampled BREP collision checks for V02; do not claim continuous-safe motion."""
from pathlib import Path
import math,json
import trimesh,cadquery as cq
from kinematics import state,P
ROOT=Path(__file__).resolve().parents[1]
OUT=Path(__file__).resolve().parent/'files'
def load(path):return cq.importers.importStep(str(path)).val()
def volume(a,b):
    aa,bb=a.BoundingBox(),b.BoundingBox()
    for k in 'xyz':
        if min(getattr(aa,k+'max'),getattr(bb,k+'max'))-max(getattr(aa,k+'min'),getattr(bb,k+'min'))<.001:return 0.
    return a.intersect(b).Volume()
def verify():
    new={p:load(OUT/'STEP'/f'{p}.step') for p in ['B01','B02','B03']}
    old={p:load(ROOT/'STEP'/f'{p}.step') for p in
         ['A01','A02','A03','A04','A05','A06','A07','A10','A11','R02','R04','R05']}
    checks=[]
    for angle in range(0,121,10):
        drum=new['B01'].rotate((0,0,0),(1,0,0),-angle)
        cases=[('B01','B02',drum,new['B02'])]
        cases += [('B01',p,drum,old[p]) for p in ['A01','A03','A05','A07','R02','R04','R05']]
        cases += [('B02',p,new['B02'],old[p].rotate((0,0,0),(1,0,0),-angle))
                  for p in ['A02','A04','A06','A10','A11']]
        cases += [('B03','R05',new['B03'],old['R05'])]
        hits=[{'a':a,'b':b,'volume_mm3':round(volume(s,t),4)}
              for a,b,s,t in cases if volume(s,t)>.05]
        checks.append({'angle_deg':angle,'collisions_over_0_05_mm3':hits})
    assert not any(row['collisions_over_0_05_mm3'] for row in checks),checks
    print('CAD: 13 discrete angles, no sampled solid overlaps >0.05 mm3')
    meshreport={}
    for code in new:
        m=trimesh.load_mesh(OUT/'STL'/f'{code}.stl')
        assert m.is_watertight and m.is_winding_consistent and m.volume>0,code
        meshreport[code]={'watertight':True,'triangles':len(m.faces),'bbox_mm':[round(x,2) for x in m.extents]}
    for angle in [0,30,60,90,120]:
        s=state(angle)
        assert abs(s.cable_flex_delta_mm+s.cable_extend_delta_mm)<1e-8
        assert abs(s.motor_output_turns*2*math.pi*P['motor_spool_pitch_radius']-s.cable_flex_delta_mm)<1e-8
        assert abs(s.ideal_tension_difference_N*P['joint_pulley_pitch_radius']/1000-P['nominal_demo_joint_torque_Nm'])<1e-8
    report={'angles_deg':list(range(0,121,10)),'checks':checks,'stl':meshreport,
      'disclaimer':'Sampled 3D-solid collision test only. No load, continuous cable contact, friction, human fit or clinical validation.'}
    (OUT/'verification_v02.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
    return report
if __name__=='__main__':verify()
