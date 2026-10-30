"""Package the downloaded CC0 Quaternius Standard glTF as a small offline GLB.
Usage: python scripts/prepare-stock-avatar.py /path/to/Universal_Base_Characters
Keeps the artist surface, joint hierarchy and bind matrices; subdivides garment boundaries with interpolated skin weights. Samples the
artist's base-color textures into vertex colors; adds simple uniform materials.
No source images are modified. Hair is the pack's original SimpleParted mesh.
"""
import sys,json,struct,hashlib,copy
from pathlib import Path
import numpy as np
from PIL import Image
src=Path(sys.argv[1]);base=src/'Base Characters/Godot - UE'
hair=src/'Hairstyles/Origin at 0/glTF (Godot)'
g=json.loads((base/'Superhero_Male_FullBody.gltf').read_text())
h=json.loads((hair/'Hair_SimpleParted.gltf').read_text())
source_bin=(base/g['buffers'][0]['uri']).read_bytes();hair_bin=(hair/h['buffers'][0]['uri']).read_bytes()
DT={5120:'i1',5121:'u1',5122:'<i2',5123:'<u2',5125:'<u4',5126:'<f4'}
NC={'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4,'MAT4':16}
def read(doc,blob,idx):
 a=doc['accessors'][idx];v=doc['bufferViews'][a['bufferView']];typ=np.dtype(DT[a['componentType']]);n=NC[a['type']];off=v.get('byteOffset',0)+a.get('byteOffset',0)
 ar=np.ndarray((a['count'],n),dtype=typ,buffer=blob,offset=off,strides=(v.get('byteStride',n*typ.itemsize),typ.itemsize)).copy()
 if a.get('normalized') and a['componentType']!=5126:ar=ar.astype('f4')/np.iinfo(typ).max
 return ar
blob=bytearray();views=[];accessors=[]
def add(ar,ctype,kind):
 ar=np.asarray(ar,dtype=DT[ctype]);blob.extend(b'\0'*(-len(blob)%4));offset=len(blob);raw=ar.tobytes();blob.extend(raw);vi=len(views);views.append({'buffer':0,'byteOffset':offset,'byteLength':len(raw)})
 ac={'bufferView':vi,'componentType':ctype,'count':len(ar),'type':kind}
 if kind=='VEC3':ac.update(min=ar.min(axis=0).tolist(),max=ar.max(axis=0).tolist())
 accessors.append(ac);return len(accessors)-1
materials=[]
def mat(name,color=None,roughness=.7):
 m={'name':name,'pbrMetallicRoughness':{'baseColorFactor':color or [1,1,1,1],'metallicFactor':0,'roughnessFactor':roughness},'doubleSided':False};materials.append(m);return len(materials)-1
skinmat=mat('Skin_Quaternius');browmat=mat('Brows',[.16,.095,.065,1],roughness=.9);eyemat=mat('Eyes',roughness=.35);hairmat=mat('Hair',[.075,.042,.027,1],roughness=.85)
shirtmat=mat('RGSU_Navy_Shirt',[.022,.055,.13,1],.92);pantsmat=mat('Slate_Trousers',[.033,.047,.065,1],.95);shoemat=mat('Shoes',[.018,.025,.038,1],.82)
headJoint=g['skins'][0]['joints'].index(next(i for i,n in enumerate(g['nodes']) if n.get('name')=='Head'))
nodes=copy.deepcopy(g['nodes']);root=nodes[68];root['children']=[64];meshes=[]
def bake(doc,folder,p,uv):
 material=doc['materials'][p['material']];ti=material['pbrMetallicRoughness']['baseColorTexture']['index'];im=doc['images'][doc['textures'][ti]['source']];path=folder/im['uri']
 img=np.asarray(Image.open(path).convert('RGB'))/255.;height,width=img.shape[:2];x=np.clip((uv[:,0]*width).astype(int),0,width-1);y=np.clip((uv[:,1]*height).astype(int),0,height-1);rgb=img[y,x]
 return np.where(rgb<=.04045,rgb/12.92,((rgb+.055)/1.055)**2.4).astype('f4')
def appendmesh(name,attrs,indices,material):
 # Compact each material group so the CPU and GPU transform only used vertices.
 flat=np.array(indices,dtype=np.uint16).reshape(-1);unique,inverse=np.unique(flat,return_inverse=True);compact={}
 for name_,idx_ in attrs.items():
  a_=accessors[idx_];v_=views[a_['bufferView']];n_=NC[a_['type']]
  ar_=np.frombuffer(bytes(blob),dtype=DT[a_['componentType']],count=a_['count']*n_,offset=v_['byteOffset']).reshape(-1,n_)[unique]
  compact[name_]=add(ar_,a_['componentType'],a_['type'])
 attrs=compact;indices=inverse
 m=len(meshes);meshes.append({'name':name,'primitives':[{'attributes':attrs,'indices':add(np.array(indices).reshape(-1,1),5123,'SCALAR'),'material':material}]});nodes.append({'name':name,'mesh':m,'skin':0});root['children'].append(len(nodes)-1)
def region(point):
 x,y,z=point;ax=abs(x)
 if ax>.68:return 'LeftHand' if x>0 else 'RightHand'
 if y<.13:return 'Shoes'
 if y<.94:return 'Trousers'
 if ax<.42 and y<1.58 and (ax>.09 or y<1.49+2.5*ax*ax):return 'Shirt'
 return 'BodySkin'
def refine_boundaries(arrays,indices):
 # Subdivide only garment boundaries. Interpolated skin weights keep seams
 # attached to the artist's original surface without jagged triangle-sized cuffs.
 values={k:list(v) for k,v in arrays.items()};edge_cache={};result=[]
 def midpoint(a,b):
  key=tuple(sorted([int(a),int(b)]))
  if key in edge_cache:return edge_cache[key]
  index=len(values['POSITION']);edge_cache[key]=index
  for name in ['POSITION','NORMAL','TEXCOORD_0']:values[name].append((values[name][a]+values[name][b])*.5)
  weights={}
  for vertex in [a,b]:
   for joint,weight in zip(values['JOINTS_0'][vertex],values['WEIGHTS_0'][vertex]):weights[int(joint)]=weights.get(int(joint),0)+float(weight)*.5
  pairs=sorted(weights.items(),key=lambda x:x[1],reverse=True)[:4]
  pairs+= [(0,0)]*(4-len(pairs));total=sum(w for _,w in pairs)
  values['JOINTS_0'].append(np.array([j for j,_ in pairs]));values['WEIGHTS_0'].append(np.array([w/total for _,w in pairs]))
  return index
 def split(tri,depth):
  labels={region(values['POSITION'][v]) for v in tri};labels.add(region(np.mean([values['POSITION'][v] for v in tri],axis=0)))
  if depth==0 or len(labels)==1:result.append(tri);return
  a,b,c=tri;ab=midpoint(a,b);bc=midpoint(b,c);ca=midpoint(c,a)
  for child in [[a,ab,ca],[ab,b,bc],[ca,bc,c],[ab,bc,ca]]:split(child,depth-1)
 for tri in indices:split(tri,3)
 return {k:np.asarray(v) for k,v in values.items()},np.asarray(result)
for mi,m in enumerate(g['meshes']):
 p=m['primitives'][0];attrs={};arrays={key:read(g,source_bin,val) for key,val in p['attributes'].items() if key in ['POSITION','NORMAL','TEXCOORD_0','JOINTS_0','WEIGHTS_0']};ix=read(g,source_bin,p['indices']).reshape(-1,3)
 if mi==2:arrays,ix=refine_boundaries(arrays,ix)
 for key in ['POSITION','NORMAL','JOINTS_0','WEIGHTS_0']:attrs[key]=add(arrays[key],5123 if key=='JOINTS_0' else 5126,'VEC4' if key in ['JOINTS_0','WEIGHTS_0'] else 'VEC3')
 attrs['COLOR_0']=add(bake(g,base,p,arrays['TEXCOORD_0']),5126,'VEC3')
 if mi<2:appendmesh('Eyebrows' if mi==0 else 'Eyes',attrs,ix,browmat if mi==0 else eyemat);continue
 pos=arrays['POSITION'];groups={n:[] for n in ['BodySkin','LeftHand','RightHand','Shirt','Trousers','Shoes']}
 for tri in ix:groups[region(pos[tri].mean(axis=0))].append(tri)
 plain={k:v for k,v in attrs.items() if k!='COLOR_0'}
 for name,indices in groups.items():
  if indices:appendmesh(name,plain if name in ['Shirt','Trousers','Shoes'] else attrs,indices,{'Shirt':shirtmat,'Trousers':pantsmat,'Shoes':shoemat}.get(name,skinmat))
p=h['meshes'][0]['primitives'][0];position=read(h,hair_bin,p['attributes']['POSITION']);normal=read(h,hair_bin,p['attributes']['NORMAL']);uv=read(h,hair_bin,p['attributes']['TEXCOORD_0']);indices=read(h,hair_bin,p['indices']);count=len(position)
attrs={'POSITION':add(position,5126,'VEC3'),'NORMAL':add(normal,5126,'VEC3'),'COLOR_0':add(bake(h,hair,p,uv),5126,'VEC3'),'JOINTS_0':add(np.tile([headJoint,0,0,0],(count,1)),5123,'VEC4'),'WEIGHTS_0':add(np.tile([1,0,0,0],(count,1)),5126,'VEC4')};appendmesh('Hair_SimpleParted',attrs,indices,hairmat)
# Remove unused original mesh nodes without renumbering the skeleton.
for i in [65,66,67]:nodes[i]={'name':'UnusedSourceNode'+str(i)}
skins=copy.deepcopy(g['skins']);skins[0]['inverseBindMatrices']=add(read(g,source_bin,skins[0]['inverseBindMatrices']),5126,'MAT4')
# Remove intermediate full-body arrays: only the compact material meshes ship.
used=set()
for mesh in meshes:
 for primitive in mesh['primitives']:used.update(primitive['attributes'].values());used.add(primitive['indices'])
used.add(skins[0]['inverseBindMatrices'])
oldblob,oldviews,oldaccessors=bytes(blob),views,accessors
blob=bytearray();views=[];accessors=[];remap={}
for old in sorted(used):
 a=oldaccessors[old];v=oldviews[a['bufferView']]
 ar=np.frombuffer(oldblob,dtype=DT[a['componentType']],count=a['count']*NC[a['type']],offset=v['byteOffset']).reshape(-1,NC[a['type']])
 remap[old]=add(ar,a['componentType'],a['type'])
for mesh in meshes:
 for primitive in mesh['primitives']:
  primitive['attributes']={k:remap[v] for k,v in primitive['attributes'].items()};primitive['indices']=remap[primitive['indices']]
skins[0]['inverseBindMatrices']=remap[skins[0]['inverseBindMatrices']]
out={'asset':{'version':'2.0','generator':'Hearing Equality stock avatar compiler','copyright':'Quaternius / CC0-1.0'},'scene':0,'scenes':[{'nodes':[68]}],'nodes':nodes,'skins':skins,'meshes':meshes,'materials':materials,'buffers':[{'byteLength':len(blob)}],'bufferViews':views,'accessors':accessors,'extras':{'source':'https://quaternius.com/packs/universalbasecharacters.html','license':'CC0-1.0','adaptation':'Artist surface and bind rig; garment boundary subdivision with interpolated weights; texture colors baked to vertices; navy uniform; SimpleParted hair'}}
js=json.dumps(out,separators=(',',':')).encode();js+=b' '*(-len(js)%4);blob+=b'\0'*(-len(blob)%4);glb=struct.pack('<III',0x46546c67,2,12+8+len(js)+8+len(blob))+struct.pack('<II',len(js),0x4e4f534a)+js+struct.pack('<II',len(blob),0x004e4942)+blob
target=Path(__file__).resolve().parents[1]/'app/assets/models/quaternius-communicator.glb';target.write_bytes(glb)
(target.parent/'QUATERNIUS-LICENSE.txt').write_text('\n'.join(line.rstrip() for line in (src/'License_Standard.txt').read_text().splitlines())+'\n')
print(json.dumps({'bytes':len(glb),'sha256':hashlib.sha256(glb).hexdigest(),'bones':len(skins[0]['joints']),'meshes':len(meshes),'source_body_vertices':len(pos),'triangles':sum(accessors[p['indices']]['count']//3 for m in meshes for p in m['primitives'])}))
