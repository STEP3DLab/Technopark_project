"""LM-04B rev B1. Корпус двухканального USB-термометра для стенда.
python -m pip install cadquery==2.7.0
python lm04b-housing.py --output ./out
Все размеры в мм. (0,0) — юго-западный угол платы-носителя. USB на западе.
Резьба крепежа в сборочной модели представлена диаметром сердцевины.
"""
from pathlib import Path
from dataclasses import dataclass
import argparse, json, math, struct
import cadquery as cq
import numpy as np
from OCP.Bnd import Bnd_Box
from OCP.BRepBndLib import BRepBndLib

W,D=90.,74.
CX,CY=40.,26.
FLOOR=3.
WALL=2.4
RIM=33.
LID=3.
BOARD_Z=9.
BOARD_T=1.6
HEADER=8.5
PICO_Z=BOARD_Z+BOARD_T+HEADER+2.5
MOUNTS=[(5,5),(75,5),(5,47),(75,47)]
STANDS=[(7.5,-5.2),(72.5,-5.2),(7.5,57.2),(72.5,57.2)]
TERM_Y=[16.5,35.5]
ROW_Y=[17.11,34.89]
SCREW_Y_OFFSETS=[-5.08,0,5.08]
STEP_X=[2.37+2.54*i for i in range(20)]
PALETTE={'tray':'#263b38','lid':'#e3e6da','carrier':'#1a7561','pico':'#26866c',
         'metal':'#a8b5b3','gold':'#d6aa58','socket':'#252d2c','terminal':'#438f72',
         'chip':'#222c2e','resistor':'#83abc5','ink':'#e2e8cf','amber':'#d1a367',
         'nut':'#9eaaa5','standoff':'#c2a15c'}


def rect(w,d,h,r=0,x=0,y=0,z=0):
    wp=cq.Workplane("XY")
    if r:
        wp=wp.sketch().rect(w,d).vertices().fillet(r).finalize()
    else:
        wp=wp.rect(w,d)
    return wp.extrude(h).translate((x,y,z)).val()


def cyl(d,h,x,y,z):
    return cq.Solid.makeCylinder(d/2,h,(x,y,z))


def blockhex(af,h,x,y,z):
    return cq.Workplane("XY").polygon(6,2*af/math.sqrt(3)).extrude(h).translate((x,y,z)).val()


def unite(shapes):
    return cq.Compound.makeCompound(shapes)


def diff(base, *cuts):
    return base.cut(*cuts).clean()


def edge_cut(wp,selector,size):
    return cq.Workplane(obj=wp).faces(selector).edges().chamfer(size).val()


def tray():
    body=edge_cut(rect(W,D,RIM,6,CX,CY),"<Z",.8)
    body=edge_cut(body,">Z",.40)
    chamber=rect(W-2*WALL,D-2*WALL,RIM+2,6-WALL,CX,CY,FLOOR)
    body=diff(body,chamber)
    feet=[cyl(8,BOARD_Z-FLOOR+.08,x,y,FLOOR-.08) for x,y in MOUNTS]
    body=body.fuse(*feet).clean()
    cuts=[]
    for x,y in MOUNTS:
        cuts.extend([cyl(3.4,BOARD_Z+1,x,y,-.1),blockhex(5.85,2.80,x,y,-.05)])
    for x,y in STANDS:
        cuts.extend([cyl(3.4,5,x,y,-.1),cq.Solid.makeCone(3.32,1.68,1.64,(x,y,-.02))])
    # Open at the top for vertical board extraction and preconnected probe leads.
    cuts.extend([rect(8,24,24,0,-4,26,14),
                 rect(8,37.4,28,0,84,26,10.8)])
    for y in TERM_Y:
        for dy in (-3.6,3.6):
            cuts.append(rect(8,1.8,3.8,0,84,y+dy,5.6))
    return diff(body,*cuts)


def lid():
    top=edge_cut(rect(W,D,LID,6,CX,CY,RIM),">Z",.8)
    cuts=[cyl(3.4,LID+1,x,y,RIM-.1) for x,y in STANDS]
    cuts.extend(rect(12.8,16.8,LID+1,2.1,71,y,RIM-.1) for y in TERM_Y)
    cuts.extend(rect(23.0,1.9,LID+1,.90,27,y,RIM-.1) for y in (6.5,10.3,14.1,17.9,21.7))
    cuts.append(rect(43,15,.7,2.0,27.5,37.0,RIM+LID-.32))
    return diff(top,*cuts)


@dataclass
class Part:
    id: str
    group: str
    color_key: str
    shape: cq.Shape


def board():
    # Connector/signal bores are nominal assembly envelopes. Production PCB uses its own drill file.
    holes=[cyl(3.2,2.,x,y,BOARD_Z-.2) for x,y in MOUNTS]
    holes += [cyl(1.0,2.,x,y,BOARD_Z-.2) for x in STEP_X for y in ROW_Y]
    holes += [cyl(1.3,2.,71,y+d,BOARD_Z-.2) for y in TERM_Y for d in SCREW_Y_OFFSETS]
    holes += [cyl(.9,2.,x,y,BOARD_Z-.2) for y in TERM_Y for x in (55.,62.62)]
    return diff(rect(80,52,BOARD_T,0,CX,CY,BOARD_Z),*holes)


def metal_screw(x,y,z,style):
    if style=='floor':
        # Nominal M3 x 6, flush 90-degree head. Thread core only.
        head=cq.Solid.makeCone(2.9,1.21,1.69,(x,y,.40))
        return head.fuse(cyl(2.42,4.35,x,y,2.05)).clean()
    length,diam,high=(6,5.7,1.65) if style=='lid' else (10,5.6,2.1)
    head=cq.Workplane(obj=cyl(diam,high,x,y,z)).faces(">Z").edges().fillet(.36).val()
    recess=blockhex(2.0 if style=='lid' else 2.0,.94,x,y,z+high-.86)
    return diff(head.fuse(cyl(2.42,length+.04,x,y,z-length)),recess)


def assembly():
    p=[]
    def add(id,group,c,s):p.append(Part(id,group,c,s))
    add('tray','tray','tray',tray());add('lid','lid','lid',lid())
    add('carrier','carrier','carrier',board())
    for i,(x,y) in enumerate(STANDS,1):
        s=diff(blockhex(5.5,30,x,y,FLOOR),cyl(2.65,31,x,y,FLOOR-.1))
        add(f'standoff-{i}','hardware','standoff',s)
        add(f'screw-base-{i}','hardware','metal',metal_screw(x,y,0,'floor'))
        add(f'screw-lid-{i}','lid-fasteners','metal',metal_screw(x,y,RIM+LID,'lid'))
    for i,(x,y) in enumerate(MOUNTS,1):
        add(f'nut-board-{i}','hardware','nut',
            diff(blockhex(5.5,2.4,x,y,.35),cyl(2.65,3,x,y,.15)))
        add(f'screw-board-{i}','hardware','metal',metal_screw(x,y,BOARD_Z+BOARD_T,'board'))
    z=BOARD_Z+BOARD_T
    for i,y in enumerate(ROW_Y,1):
        add(f'socket-{i}','headers','socket',rect(50.8,2.54,HEADER,0,26.50,y,z))
        add(f'pin-spacer-{i}','headers','socket',rect(50.8,2.54,2.5,0,26.50,y,z+HEADER))
    # Genuine Pico Rev3 mounting outline & holes, with simplified component envelopes.
    pico_board=rect(51,21,1,.75,26.5,26,PICO_Z)
    pico_holes=[cyl(2.1,1.2,x,y,PICO_Z-.1) for x in (3.,50.) for y in (20.3,31.7)]
    pico_holes += [cyl(1.,1.2,x,y,PICO_Z-.1) for x in STEP_X for y in ROW_Y]
    add('pico','pico','pico',diff(pico_board,*pico_holes))
    pads=[]
    for x in STEP_X:
        for y in ROW_Y:
            pads.append(diff(cyl(1.72,.045,x,y,PICO_Z+1),cyl(1.,.10,x,y,PICO_Z+.98)))
    add('pico-pads','pico-components','gold',unite(pads))
    add('rp2040','pico-components','chip',rect(7,7,.9,.25,24.5,26,PICO_Z+1))
    add('pico-flash','pico-components','chip',rect(3.0,4.0,.70,.15,32.7,26.6,PICO_Z+1))
    add('pico-button','pico-components','metal',rect(4.5,3.5,1.6,.3,11,28,PICO_Z+1))
    add('button-cap','pico-components','chip',rect(2.4,2,0.52,.3,11,28,PICO_Z+2.6))
    small=[rect(w,d,.57,.12,x,y,PICO_Z+1) for x,y,w,d in
           ((9.1,23.3,2.1,1.1),(13.6,22.3,1.6,1.),(19.3,23.,1.7,1.1),
            (27.1,31.6,1.7,1.0),(36.6,24.8,2.1,1.1),(41.8,28.1,2.1,1.1),
            (44,23,2.0,1.1),(17.1,28.9,1.6,1.1))]
    add('pico-smd','pico-components','amber',unite(small))
    # Micro-B reference shell. Matching is deliberate; USB signal wiring is inside the Pico only.
    q=PICO_Z+1.
    shell=rect(6.5,7.9,2.75,.3,2.7,26,q)
    mouth=rect(5.9,6.8,1.85,.18,2.1,26,q+.42)
    add('pico-usb','pico-components','metal',diff(shell,mouth))
    add('usb-tongue','pico-components','chip',rect(3.7,4.6,.48,.1,1.95,26,q+.70))
    # The wire entries and screw pockets face the real access openings.
    for i,y in enumerate(TERM_Y,1):
        blk=rect(8.15,15.24,10,.22,71,y,z)
        pockets=[]; slugs=[]
        for d in SCREW_Y_OFFSETS:
            pockets.append(cyl(3.6,3.0,71,y+d,z+7.3))
            pockets.append(rect(4.8,3.45,3.5,.35,73.8,y+d,z+2.7))
            screw=diff(cyl(3.15,.75,71,y+d,z+7.3),
                       rect(3.7,.65,.4,0,71,y+d,z+7.78))
            slugs.append(screw)
        add(f'terminal-{i}','terminals','terminal',diff(blk,*pockets))
        add(f'terminal-screws-{i}','terminals','metal',unite(slugs))
    for i,y in enumerate(TERM_Y,1):
        def xcyl(x0,length,d):
            return cq.Solid.makeCylinder(d/2,length,(x0,y,z+1.30),(1,0,0))
        add(f'resistor-{i}','resistors','resistor',xcyl(55.66,6.3,2.5))
        # Straight wire ends descend to the two actual THT pads.
        leads=[cyl(.53,3.8,x,y,z-2.5) for x in (55.,62.62)]
        leads.extend([xcyl(55.,.67,.53),xcyl(61.95,.67,.53)])
        add(f'resistor-leads-{i}','resistors','metal',unite(leads))
    return p


def exact_bounds(s):
    b=Bnd_Box();BRepBndLib.AddOptimal_s(s.wrapped,b,False,False)
    return np.array(b.Get()).reshape(2,3)


def stl_check(path):
    data=path.read_bytes();n=struct.unpack_from('<I',data,80)[0]
    assert len(data)==84+50*n
    dtype=np.dtype([('normal','<f4',3),('p','<f4',(3,3)),('end','<u2')])
    tris=np.frombuffer(data,dtype=dtype,offset=84)['p'].astype(float)
    _,inv=np.unique(np.round(tris.reshape((-1,3)),4),axis=0,return_inverse=True)
    faces=inv.reshape((-1,3))
    edges=np.concatenate([faces[:,[0,1]],faces[:,[1,2]],faces[:,[2,0]]])
    _,inv,counts=np.unique(np.sort(edges,axis=1),axis=0,return_inverse=True,return_counts=True)
    sign=np.where(edges[:,0]<edges[:,1],1,-1)
    assert np.all(counts==2) and np.all(np.bincount(inv.reshape(-1),weights=sign)==0)
    cross=np.cross(tris[:,1]-tris[:,0],tris[:,2]-tris[:,0])
    assert np.min(np.linalg.norm(cross,axis=1))>1.e-8
    assert np.einsum('ij,ij->',tris[:,0],cross)>0
    return int(n)


def glb_to_metres(path):
    # CadQuery 2.7 tessellates the STEP geometry in millimetres. glTF defines
    # metres, so apply one uniform scale to the scene root. The native exporter
    # already supplies the rotation from CAD Z-up to glTF Y-up.
    raw=path.read_bytes()
    size=struct.unpack_from('<I',raw,12)[0]
    descriptor=json.loads(raw[20:20+size])
    for root in descriptor['scenes'][descriptor.get('scene',0)]['nodes']:
        descriptor['nodes'][root]['scale']=[.001,.001,.001]
    encoded=json.dumps(descriptor,separators=(',',':')).encode()
    encoded+=b' '*((-len(encoded))%4)
    binary=raw[20+size:]
    total=20+len(encoded)+len(binary)
    path.write_bytes(struct.pack('<4sIII4s',b'glTF',2,total,len(encoded),b'JSON')+
                     encoded+binary)


def validations(p):
    byid={x.id:x.shape for x in p}
    fixed=unite([byid['tray'],*[x.shape for x in p if x.id.startswith('standoff-')]])
    cover=byid['lid']
    electronics=unite([x.shape for x in p if x.group in
                       ('carrier','headers','pico','pico-components','terminals','resistors')])
    def clear(a,b,note):
        vol=a.intersect(b).Volume()
        if vol>1e-5: raise RuntimeError(f'{note}: interference {vol:.6f} mm3')
    clear(byid['tray'],cover,'tray and lid')
    clear(cover,electronics,'lid over PCB')
    for lift in (0,1.5,5,12,24,36):
        clear(fixed,electronics.translate((0,0,lift)),f'PCB removal at {lift}')
    # Cable overmould reaches to the USB shell face (x=-0.55), with ±0.2 positioning allowance.
    usb=rect(37.9,20,11,1,-19.70,26,18.4)
    clear(fixed,usb,'USB plug / tray')
    clear(cover,usb,'USB plug / lid')
    clear(byid['carrier'],usb,'USB plug / carrier')
    for y in TERM_Y:
        for dy in SCREW_Y_OFFSETS:
            # Includes ±1 mm possible shift of a normal Ø4.5 straight tool.
            tool=cyl(6.5,24,71,y+dy,18.5)
            clear(cover,tool,'screwdriver clearance')
            wire=cq.Solid.makeCylinder(1.6,18,(75.075,y+dy,15.05),(1,0,0))
            clear(fixed,wire,'wire path')
            clear(cover,wire,'wire to lid')
    boardfix=[x.shape for x in p if x.id.startswith('screw-board-')]
    termparts=[x.shape for x in p if x.group=='terminals']
    clear(unite(boardfix),unite(termparts),'PCB screw heads vs Phoenix')
    return {'pcb_lift_test_mm':[0,1.5,5,12,24,36], 'screwdriver_sweep_d_mm':6.5,
            'lead_sweep_d_mm':3.2,'usb_overmold_test_mm':[20,11],
            'physical_assembly_tested':False}


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output',type=Path,default=Path.cwd()/'lm04b-out')
    out=parser.parse_args().output;out.mkdir(parents=True,exist_ok=True)
    (out/'print').mkdir(exist_ok=True)
    parts=assembly();cadasm=cq.Assembly(name='LM_04B_RB1');records=[]
    stats={}
    for part in parts:
        shape=part.shape
        if not shape.isValid():raise RuntimeError(part.id+' is invalid')
        hue=PALETTE[part.color_key]
        rgb=[int(hue[i:i+2],16)/255 for i in (1,3,5)]
        cadasm.add(shape,name=part.id,color=cq.Color(*rgb))
        if part.id in ('tray','lid'):
            s=shape.translate((0,0,-RIM)) if part.id=='lid' else shape
            assert len(s.Solids())==1
            path=out/'print'/('01-tray.stl' if part.id=='tray' else '02-lid.stl')
            cq.exporters.export(s,str(path),tolerance=.06,angularTolerance=.17)
            stats[part.id]=stl_check(path)
        angular=.38 if part.id in ('tray','lid') else (.95 if part.id=='pico-pads' else .68)
        verts,tri=shape.copy(mesh=False).tessellate(.14,angular)
        arr=np.round(np.array([v.toTuple() for v in verts]),3)
        arr[np.abs(arr)<.0005]=0
        records.append({'id':part.id,'group':part.group,'color':hue,
                        'vertices':arr.ravel().tolist(),'indices':np.array(tri).ravel().tolist()})
    (out/'view.json').write_text(json.dumps({'model':'LM-04B','revision':'B1','units':'mm',
        'axisUp':'Z','parts':records},separators=(',',':')),encoding='utf8')
    cadasm.export(str(out/'lm04b-housing.step'))
    cadasm.export(str(out/'lm04b-housing.glb'),exportType='GLTF',tolerance=.13,angularTolerance=.35)
    glb_to_metres(out/'lm04b-housing.glb')
    check=validations(parts)
    bb=exact_bounds(cadasm.toCompound())
    check.update({'assembly_bounds_mm':np.round(bb,3).tolist(),'stl_triangles':stats,
                  'cad_component_nodes':len(parts),'closed_oriented_stl':True})
    (out/'validation.json').write_text(json.dumps(check,indent=2)+'\n',encoding='utf8')
    print(check)

if __name__=='__main__':main()
