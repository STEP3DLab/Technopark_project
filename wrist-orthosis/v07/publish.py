from pathlib import Path
import json,zipfile,hashlib,shutil
from urllib.parse import urlsplit,unquote
from html.parser import HTMLParser
import numpy as np,trimesh as tm,vtk
from vtk.util.numpy_support import numpy_to_vtk,numpy_to_vtkIdTypeArray
from trimesh.visual.material import PBRMaterial
from trimesh.visual.texture import TextureVisuals
from PIL import Image
P=Path(__file__).resolve().parent; F=P/'files'; A=P/'assets'; A.mkdir(exist_ok=True)
M=json.loads((F/'manifest.json').read_text())
assert M['revision']=='V07 bench' and len(M['parts'])==16 and all(p['watertight'] and p['connected'] for p in M['parts'])
assert M['gear_samples']==81 and M['max_sampled_profile_overlap_mm2']<1e-5
report=json.loads((F/'assembly_check.json').read_text())
assert all(r['status'] in ('clear','intentional_reference_union') for r in report['results']),report
scene=tm.load(F/'assembly.glb',force='scene')
meshes={}; data={}
def rgb(n):
 if n=='upper':return [233,238,247]
 if n=='lower':return [198,212,234]
 if n in ('plate','motorwall','supportwall'):return [8,37,103]
 if n in ('pinion','driven'):return [50,103,194]
 if n=='spool':return [154,185,226]
 if n.startswith(('motor_','belt_ref_')):return [32,41,60]
 if n.startswith('cable'):return [14,65,150]
 return [170,184,205]
for node in scene.graph.nodes_geometry:
 trans,geom=scene.graph[node];m=scene.geometry[geom].copy();m.apply_transform(trans)
 meshes[node]=m
 data[node]={'vertices':m.vertices.round(6).tolist(),'faces':m.faces.tolist()}
(F/'assembly-view.json').write_text(json.dumps(data,separators=(',',':')))
studio=tm.Scene()
for n,m in meshes.items():
 c=m.copy();c.visual=TextureVisuals(material=PBRMaterial(name=n,baseColorFactor=rgb(n)+[255],metallicFactor=.05 if n in ('upper','lower','plate','motorwall','supportwall') else .18,roughnessFactor=.36))
 studio.add_geometry(c,node_name=n,geom_name=n)
(F/'assembly-studio.glb').write_bytes(studio.export(file_type='glb'))
def actor(mesh,col):
 points=vtk.vtkPoints();points.SetData(numpy_to_vtk(np.array(mesh.vertices,dtype=np.float64),deep=True))
 faces=np.c_[np.full(len(mesh.faces),3,dtype=np.int64),np.array(mesh.faces,dtype=np.int64)].ravel()
 cells=vtk.vtkCellArray();cells.SetCells(len(mesh.faces),numpy_to_vtkIdTypeArray(faces,deep=True))
 poly=vtk.vtkPolyData();poly.SetPoints(points);poly.SetPolys(cells)
 normals=vtk.vtkPolyDataNormals();normals.SetInputData(poly);normals.SetFeatureAngle(35);normals.SplittingOn();normals.ConsistencyOn();normals.ComputePointNormalsOn();normals.Update()
 mapper=vtk.vtkPolyDataMapper();mapper.SetInputConnection(normals.GetOutputPort());mapper.ScalarVisibilityOff()
 ac=vtk.vtkActor();ac.SetMapper(mapper);pr=ac.GetProperty();pr.SetColor(*(np.array(col)/255));pr.SetAmbient(.28);pr.SetDiffuse(.78);pr.SetSpecular(.16);pr.SetSpecularPower(35);pr.SetInterpolationToPhong();return ac
def render(name,selected,direction=(-1.5,1.2,1.25),size=(1200,900),offsets=None,up=(0,0,1),custom=None):
 renderer=vtk.vtkRenderer();renderer.SetBackground(.90,.93,.97);renderer.SetBackground2(.98,.99,1);renderer.GradientBackgroundOn()
 rw=vtk.vtkRenderWindow();rw.SetOffScreenRendering(1);rw.AddRenderer(renderer);rw.SetSize(*size);rw.SetMultiSamples(4)
 allv=[]; offset=offsets or {}; pool=custom or meshes
 for n in selected:
  m=pool[n].copy();m.apply_translation(offset.get(n,[0,0,0]));renderer.AddActor(actor(m,rgb(n)));allv.append(m.vertices)
 verts=np.concatenate(allv);direction=np.asarray(direction,dtype=float);direction/=np.linalg.norm(direction);up=np.asarray(up,dtype=float);right=np.cross(up,direction);right/=np.linalg.norm(right);up=np.cross(direction,right);up/=np.linalg.norm(up)
 center=(verts.min(0)+verts.max(0))/2
 for a in (right,up):
  q=verts@a;center=center+((q.max()+q.min())/2-center@a)*a
 dv=verts-center;scale=max(np.max(np.abs(dv@up)),np.max(np.abs(dv@right))*size[1]/size[0])*1.13
 camera=renderer.GetActiveCamera();camera.SetFocalPoint(*center);camera.SetPosition(*(center+direction*500));camera.SetViewUp(*up);camera.ParallelProjectionOn();camera.SetParallelScale(scale);renderer.ResetCameraClippingRange()
 renderer.RemoveAllLights()
 for loc,intensity in [(center+direction*200+up*280-right*160,.85),(center+direction*180-up*35+right*200,.45),(center-direction*170+up*160,.35)]:
  light=vtk.vtkLight();light.SetLightTypeToSceneLight();light.SetPosition(*loc);light.SetFocalPoint(*center);light.SetIntensity(intensity);renderer.AddLight(light)
 rw.Render();w=vtk.vtkWindowToImageFilter();w.SetInput(rw);w.SetInputBufferTypeToRGB();w.ReadFrontBufferOff();w.Update()
 png=A/(name+'.png');wr=vtk.vtkPNGWriter();wr.SetFileName(str(png));wr.SetInputConnection(w.GetOutputPort());wr.Write();rw.Finalize()
 with Image.open(png) as img:img.convert('RGB').save(A/(name+'.webp'),quality=91,method=4)
 png.unlink();print('Rendered',name,flush=True)
alln=list(meshes)
visible=[n for n in alln if not n.startswith('belt_ref_')]
def match(prefixes):return [n for n in alln if any(n==p or n.startswith(p) for p in prefixes)]
groups={'shells':['upper','lower'],'cassette':['plate','motorwall','supportwall'],'servo':match(['motor_','plate','belt_ref_','pinion','motorwall']),'gears':['pinion','driven'],'spool':match(['shaft','spool','bush_','spacer_','collar_']),'guide':match(['upper','cable_'])}
render('hero',visible,size=(1500,1120))
render('side',visible,direction=(-1,0,0),size=(1500,900))
render('top',visible,direction=(0,0,1),up=(0,1,0))
off={}
for n in visible:
 if n=='lower':off[n]=[0,0,-45]
 elif n=='upper':off[n]=[0,0,0]
 elif n=='plate':off[n]=[0,0,18]
 elif n=='motorwall' or n.startswith(('motor_','fastener_horn')):off[n]=[-35,0,33]
 elif n=='supportwall':off[n]=[35,0,33]
 else:off[n]=[0,0,48]
render('exploded',visible,offsets=off,size=(1500,1120))
for name,ids in groups.items():
 render(name,ids,direction=(-1.4,-.8,1.1) if name in ('servo','gears','cassette') else (-1.5,1.2,1.25),offsets={'upper':[0,0,35]} if name=='shells' else None)
stages=[groups['shells'],['upper','plate'],groups['cassette'],groups['cassette']+groups['spool'],groups['cassette']+groups['spool']+groups['gears'],alln]
for i,ids in enumerate(stages):render('step-'+str(i+1),list(dict.fromkeys(ids)),offsets={'upper':[0,0,35]} if i==0 else None)
render('drive',[n for n in alln if n not in ('upper','lower') and not n.startswith('cable_')],direction=(-1.5,-.7,1.2))
render('motor-pad',['plate'],direction=(-1.5,-.7,1.2))
for p in M['parts']:
 n=p['id'];m=tm.load(F/'stl'/(n+'.stl'),force='mesh');render('part-'+n,[n],size=(720,540),custom={n:m})
# Archive contains exact original model, original build and verification scripts, generated geometry and actual rendered CAD views.
files=[P/'model.scad',P/'build.py',P/'verify_assembly.py',P/'publish.py',P/'README.md',P/'BOM.csv',F/'manifest.json',F/'assembly_check.json',F/'assembly.glb',F/'assembly-studio.glb',*sorted((F/'stl').glob('*.stl')),*sorted(A.glob('*.webp'))]
with zipfile.ZipFile(F/'wrist-orthosis-v07.zip','w',zipfile.ZIP_DEFLATED,compresslevel=6) as z:
 for f in files:z.write(f,f.relative_to(P))
with zipfile.ZipFile(F/'wrist-orthosis-v07.zip') as z:
 assert z.testzip() is None and len([n for n in z.namelist() if n.endswith('.stl')])==16
(F/'SHA256SUMS.txt').write_text(''.join(f'{hashlib.sha256(f.read_bytes()).hexdigest()}  {f.relative_to(P)}\n' for f in files))
# Switch the public guide only once the release is complete and all local links exist.
root=P.parent
class Page(HTMLParser):
 def __init__(self):super().__init__();self.links=[];self.ids=set()
 def handle_starttag(self,tag,attrs):
  d=dict(attrs)
  if 'id' in d:
   assert d['id'] not in self.ids,('duplicate ID',d['id']);self.ids.add(d['id'])
  for key in ('src','href'):
   if d.get(key):self.links.append(d[key])
for src,dest in [('index.html',root/'index.html'),('report.html',root/'report.html'),('hub.html',root.parent/'x.lab/index.html')]:
 page=Page();page.feed((P/'page'/src).read_text())
 for ref in page.links:
  u=urlsplit(ref)
  if u.scheme or u.netloc:continue
  if not u.path:
   if u.fragment:assert unquote(u.fragment) in page.ids,ref
  else:
   assert (dest.parent/unquote(u.path)).resolve().exists(),('missing',src,ref)
for name in ['index.html','report.html','site.js','studio.js','software-viewer.js']:shutil.copyfile(P/'page'/name,root/name)
shutil.copyfile(P/'page/hub.html',root.parent/'x.lab/index.html')
print('V07 release complete: 16 STL, checked assembly, archive and verified website links')
