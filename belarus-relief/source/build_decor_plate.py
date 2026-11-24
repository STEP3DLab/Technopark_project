#!/usr/bin/env python3
"""Export and verify the 13 detail build items as an open, millimetre-based Core 3MF."""
import json
from pathlib import Path
from xml.etree import ElementTree as E
from zipfile import ZipFile, ZIP_DEFLATED
from itertools import combinations
import numpy as np
import trimesh

root=Path(__file__).resolve().parents[1]
CORE='http://schemas.microsoft.com/3dmanufacturing/core/2015/02'
E.register_namespace('',CORE)
def tag(name): return '{'+CORE+'}'+name
def fmt(v): return f'{v:.7f}'.rstrip('0').rstrip('.') or '0'
def posfmt(t): return '1 0 0 0 1 0 0 0 1 '+' '.join(fmt(v) for v in t)
def check_rects(boxes):
    for (_,a),(_,b) in combinations(boxes,2):
        dx=max(a[0,0]-b[1,0],b[0,0]-a[1,0],0.0)
        dy=max(a[0,1]-b[1,1],b[0,1]-a[1,1],0.0)
        assert np.hypot(dx,dy)>=3.0, (a,b)
slots={'bison':(3,3),'mogilev-label':(66,3),'vitebsk-label':(66,16),
       'gomel-label':(66,29),'brest-label':(3,41),'grodno-label':(37,41),
       'minsk-label':(76,41),'brest-star':(3,55.25),'grodno-star':(20,55.25),
       'vitebsk-star':(37,55.25),'mogilev-star':(54,55.25),
       'gomel-star':(71,55.25),'minsk-star':(91,55.25)}
parts={p['id']:p for p in json.loads((root/'data/decor.json').read_text())['parts']}
bison=json.loads((root/'data/bison.json').read_text())
parts['bison']={'file':bison['path'],'name':'Зубр','kind':'bison'}
model=E.Element(tag('model'),{'unit':'millimeter','{http://www.w3.org/XML/1998/namespace}lang':'ru-RU'})
E.SubElement(model,tag('metadata'),{'name':'Title'}).text='Беларусь — комплект декора, 13 изделий'
E.SubElement(model,tag('metadata'),{'name':'Description'}).text='Плоской стороной к столу. Для MSLA назначьте ориентацию и поддержки для своего профиля. Рабочая зона 115 × 75 мм включает поля.'
resources=E.SubElement(model,tag('resources')); build=E.SubElement(model,tag('build'))
mesh_ids={}; bounds={}; boxes=[]
for key,(x,y) in slots.items():
    p=parts[key]; f=p['file']
    if f not in mesh_ids:
        mesh=trimesh.load(root/f,process=True)
        assert mesh.is_watertight and mesh.is_winding_consistent and mesh.volume>0
        obj_id=str(len(mesh_ids)+1); mesh_ids[f]=obj_id; bounds[f]=mesh.bounds
        name='Звезда '+str(p['tip_span_mm'])+' мм' if p['kind']=='star' else p['name']
        obj=E.SubElement(resources,tag('object'),{'id':obj_id,'type':'model','name':name})
        geom=E.SubElement(obj,tag('mesh')); v=E.SubElement(geom,tag('vertices')); faces=E.SubElement(geom,tag('triangles'))
        for point in mesh.vertices:E.SubElement(v,tag('vertex'),dict(zip(('x','y','z'), map(fmt,point))))
        for face in mesh.faces:E.SubElement(faces,tag('triangle'),dict(zip(('v1','v2','v3'), map(str,face))))
    low=bounds[f][0]
    t=np.array([x,y,0.0])-low
    E.SubElement(build,tag('item'),{'objectid':mesh_ids[f],'partnumber':key,'transform':posfmt(t)})
    boxes.append((key,bounds[f]+t))
check_rects(boxes)
file=root/'models/decor-plate.3mf'
with ZipFile(file,'w',compression=ZIP_DEFLATED,compresslevel=7) as dest:
    dest.writestr('[Content_Types].xml','''<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/></Types>''')
    dest.writestr('_rels/.rels','''<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Target="/3D/3dmodel.model" Id="rel0" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/></Relationships>''')
    dest.writestr('3D/3dmodel.model',E.tostring(model,encoding='utf-8',xml_declaration=True))
# Independent load through a second reader checks occurrence transforms and mesh units.
verify=trimesh.load_scene(file)
remote=[]
for node in verify.graph.nodes_geometry:
    mat,geom=verify.graph[node]; m=verify.geometry[geom].copy();m.apply_transform(mat)
    assert abs(m.bounds[0,2])<1e-5 and m.is_watertight
    remote.append((node,m.bounds))
assert len(mesh_ids)==10 and len(remote)==13
check_rects(remote)
area=verify.bounds[1]-verify.bounds[0]
plate_max=verify.bounds[1]
assert plate_max[0]+3<115 and plate_max[1]+3<75
print(file, 'models',len(mesh_ids),'instances',len(remote),'extents mm',area,
      'occupied bounds',verify.bounds.tolist())
