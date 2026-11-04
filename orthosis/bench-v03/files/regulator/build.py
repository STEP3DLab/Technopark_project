"""V03 manual bench fixture, mm. Run with CadQuery 2.x and numpy."""
from pathlib import Path
from collections import Counter
import json, struct
import numpy as np
import cadquery as cq
from cadquery import Vector as V

OUT = Path(__file__).resolve().parent
TRAVEL = 8

def box(x,y,z,dx,dy,dz):
    return cq.Solid.makeBox(dx,dy,dz,V(x,y,z))

def bore(x,y,z,r,h,axis):
    return cq.Solid.makeCylinder(r,h,V(x,y,z),V(*axis))

def hex_x(x,y,z,depth):
    return cq.Workplane('YZ',origin=(x,y,z)).polygon(6,8.4/np.cos(np.pi/6)).extrude(depth).val()

def fixture():
    plate=box(0,-15,0,62,30,6)
    for y in (-11.2,8.8):
        plate=plate.fuse(box(15,y,6,36,2.4,3))
    plate=plate.fuse(box(7,-8.5,6,8,17.5,13))
    plate=plate.cut(bore(6,3.5,13,2.8,11,(1,0,0))).cut(hex_x(11,3.5,13,5))
    for x in (4.5,57.5):
        for y in (-10.5,10.5):
            plate=plate.cut(bore(x,y,-1,2.2,8,(0,0,1)))
    plate=plate.cut(bore(32,-3.5,-1,2.2,8,(0,0,1)))
    nut=cq.Workplane('XY',origin=(32,-3.5,-1)).polygon(6,7.3/np.cos(np.pi/6)).extrude(4.4).val()
    return plate.cut(nut).clean()

def carriage():
    part=box(0,-8.5,6,24,17,4).fuse(box(16,-8.5,10,8,17,16))
    for x in (5,13):
        part=part.cut(bore(x,-3.5,5,2.3,6,(0,0,1)))
    part=part.cut(box(5,-5.8,5,8,4.6,6))
    # Clearance pocket for the clamp washer and cap at the short-travel end.
    part=part.cut(bore(13,-3.5,10,5.2,6.2,(0,0,1)))
    return part.cut(bore(15,0,21,1.6,10,(1,0,0))).cut(bore(19,0,21,2.7,6,(1,0,0))).clean()

def mesh_checks(path):
    data=path.read_bytes(); n=struct.unpack_from('<I',data,80)[0]
    assert len(data)==84+50*n
    edges=Counter(); directed=Counter(); volume=0.0
    for i in range(n):
        p=np.array(struct.unpack_from('<9f',data,96+50*i)).reshape(3,3)
        assert np.linalg.norm(np.cross(p[1]-p[0],p[2]-p[0]))>1e-10
        volume+=np.dot(p[0],np.cross(p[1],p[2]))/6
        tri=list(map(tuple,p))
        for a,b in zip(tri,tri[1:]+tri[:1]):
            edges[tuple(sorted((a,b)))]+=1; directed[a,b]+=1
    assert all(k==2 for k in edges.values()) and all(directed[b,a]==v for (a,b),v in directed.items()) and volume>0
    return dict(triangles=n,mesh_volume_mm3=round(volume,2),edge_incidence_two=True,consistent_winding=True)

if __name__=='__main__':
    base,slide=fixture(),carriage(); checks={}; assy=cq.Assembly(name='V03_bench_printed_parts')
    for tag,part in [('C01_base',base),('C02_slide',slide)]:
        assert part.isValid() and len(part.Solids())==1
        printable=part.translate(V(0,0,-6)) if tag.startswith('C02') else part
        cq.exporters.export(printable,str(OUT/(tag+'.step')))
        p=OUT/(tag+'.stl'); cq.exporters.export(printable,str(p),tolerance=.04,angularTolerance=.1)
        checks[tag]=mesh_checks(p)
        imported=cq.importers.importStep(str(OUT/(tag+'.step'))).val()
        assert imported.isValid() and abs(imported.Volume()-part.Volume())<.001
    for i in range(2):
        assy.add(base,name=f'base_{i}',loc=cq.Location(V(0,36*i,0)))
        assy.add(slide,name=f'slide_{i}',loc=cq.Location(V(23,36*i,0)))
    # Smooth conservative envelopes around nominal screw threads.
    # Datum: top of bench plate z=0; envelope is for M4x10, washer t=0.8.
    washer=bore(32,-3.5,10,4.5,.8,(0,0,1)).cut(bore(32,-3.5,10,2.15,.8,(0,0,1)))
    m4=bore(32,-3.5,.8,2,10,(0,0,1)).fuse(bore(32,-3.5,10.8,3.5,4,(0,0,1)))
    nut5=cq.Workplane('YZ',origin=(11,3.5,13)).polygon(6,8/np.cos(np.pi/6)).extrude(4).val()
    assert m4.intersect(base).Volume()<1e-7 and nut5.intersect(base).Volume()<1e-7
    max_overlap=0.0
    for dx in np.linspace(19,27,33):
        top=slide.translate(V(dx,0,0))
        head=dx+16-40
        m5=bore(head,3.5,13,2.5,40,(1,0,0)).fuse(bore(head-5,3.5,13,4.25,5,(1,0,0)))
        for a,b in [(top,base),(top,m4),(top,washer),(m5,base),(m5,top),(m5,m4),(m5,washer)]:
            max_overlap=max(max_overlap,abs(a.intersect(b).Volume()))
    assert max_overlap<1e-7
    checks['fastener_envelopes']={'positions_checked':33,'max_unintended_intersection_mm3':max_overlap,
        'M4x10_tip_above_bench_mm':0.8,'M4x10_nominal_nut_overlap_mm':2.6,
        'M5x40_distance_under_head_to_rear_wall_mm':[4,12]}
    assy.save(str(OUT/'pair_midstroke.step'))
    checks['travel_mm']=TRAVEL; checks['base_slider_positions_checked']=33
    (OUT/'checks.json').write_text(json.dumps(checks,indent=2)+'\n')
