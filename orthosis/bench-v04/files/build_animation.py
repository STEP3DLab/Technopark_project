"""Create a portable animated glTF from the assembly's original CadQuery solids.

The adapter supplies parts in their world-space neutral position, already oriented.
Each mesh keeps the common vertical spindle as its local rotation axis.
"""
from pathlib import Path
import json, math, struct
import numpy as np
"""Nominal one-layer cable paths ending opposite the selected cheek apertures."""
import math
import numpy as np

SAMPLES = range(-120,121,15)
def cable_mesh(branch, theta):
    sign = 1 if branch == 'A' else -1
    z = 31.2 if branch == 'A' else 36.8
    start = math.radians(90*sign)
    wrap = math.radians(165 + sign*theta)
    phi = start + sign*np.linspace(0,wrap,63)
    # The exposed free end moves against the fixed base. The difference between
    # its travel and the increased length of the arc is zero.
    end_x = 92-sign*math.radians(theta)*12
    positions = np.vstack(([end_x,sign*12,z],np.array([12*np.cos(phi),12*np.sin(phi),np.full_like(phi,z)]).T))
    axis=np.vstack(([-1,0,0],np.array([-sign*np.sin(phi),sign*np.cos(phi),np.zeros_like(phi)]).T))
    side=np.cross(axis, [0,0,1])
    ring=np.arange(8)*math.tau/8
    normals=(np.cos(ring)[None,:,None]*side[:,None,:] + np.sin(ring)[None,:,None]*np.array([0,0,1]))
    points=positions[:,None,:]+normals # nominal diameter 2 mm
    f=[]
    for j in range(len(positions)-1):
        for k in range(8):
            a=8*j+k; b=8*j+((k+1)%8); f.extend([(a,b,b+8),(a,b+8,a+8)])
    return points.reshape(-1,3).astype('f4'),normals.reshape(-1,3).astype('f4'),np.array(f,'i4')


def normalise(v):
    return v / np.maximum(np.linalg.norm(v, axis=-1, keepdims=True), 1e-12)

def srgb_linear(v):
    x = np.asarray(v, dtype=float)
    return np.where(x <= .04045, x / 12.92, ((x+.055)/1.055)**2.4).tolist()

def build_scene(items, pivot, dest):
    gltf = {'asset': {'version':'2.0','generator':'STEP3D / V04 CAD bench'},'scene':0,'scenes':[{'nodes':[0]}],
            'nodes':[{'name':'Z-up CAD to glTF Y-up','children':[1,2],'scale':[.001,.001,.001],'rotation':[-2**-.5,0,0,2**-.5]},
                     {'name':'stationary','children':[]},{'name':'manual_spindle','children':[]}],
            'meshes':[], 'materials':[], 'accessors':[], 'bufferViews':[]}
    binary = bytearray()
    def accessor(array, form, component, target=None):
        array=np.ascontiguousarray(array)
        offset=len(binary); binary.extend(array.tobytes()); binary.extend(b'\0'*(-len(binary)%4))
        view={'buffer':0,'byteOffset':offset,'byteLength':array.nbytes}
        if target: view['target']=target
        gltf['bufferViews'].append(view)
        a={'bufferView':len(gltf['bufferViews'])-1,'componentType':component,'type':form,'count':len(array)}
        if form=='VEC3' or form=='SCALAR':
            a['min']=np.atleast_1d(array.min(axis=0)).tolist();a['max']=np.atleast_1d(array.max(axis=0)).tolist()
        gltf['accessors'].append(a);return len(gltf['accessors'])-1
    processed=[]
    for name,shape,moving,color in items:
        points,indices=shape.tessellate(.07,.23)
        verts=np.array([p.toTuple() for p in points],dtype='f4')-np.array(pivot,dtype='f4')
        idx=np.array(indices,dtype='i4')
        cross=np.cross(verts[idx[:,1]]-verts[idx[:,0]],verts[idx[:,2]]-verts[idx[:,0]])
        valid=np.linalg.norm(cross,axis=1)>1e-9;idx=idx[valid]; cross=cross[valid]
        normals=np.zeros_like(verts)
        for j in range(3): np.add.at(normals,idx[:,j],cross)
        normals=normalise(normals).astype('f4')
        # OCCT duplicates vertices across CAD face boundaries, preserving sharp edges.
        primitive={'attributes':{'POSITION':accessor(verts,'VEC3',5126,34962),'NORMAL':accessor(normals,'VEC3',5126,34962)},
                   'indices':accessor(idx.flatten().astype('u2' if len(verts)<65536 else 'u4'),'SCALAR',5123 if len(verts)<65536 else 5125,34963),'material':len(gltf['materials'])}
        gltf['materials'].append({'name':name,'pbrMetallicRoughness':{'baseColorFactor':[*srgb_linear(color),1],'metallicFactor':.05,'roughnessFactor':.65},'doubleSided':True})
        gltf['meshes'].append({'name':name,'primitives':[primitive]})
        gltf['nodes'][2 if moving else 1]['children'].append(len(gltf['nodes']))
        gltf['nodes'].append({'name':name,'mesh':len(gltf['meshes'])-1})
        processed.append((name,verts,normals,idx,moving,np.array(color)))
    cord_nodes=[]
    for branch,color in [('A',[.43,.98,.70]),('B',[1.,.48,.23])]:
        verts,normals,faces=cable_mesh(branch,0)
        targets=[]
        for deg in SAMPLES:
            vv,nn,_=cable_mesh(branch,deg)
            targets.append({'POSITION':accessor(vv-verts,'VEC3',5126,34962),'NORMAL':accessor(nn-normals,'VEC3',5126,34962)})
        pr={'attributes':{'POSITION':accessor(verts,'VEC3',5126,34962),'NORMAL':accessor(normals,'VEC3',5126,34962)},
            'indices':accessor(faces.flatten().astype('u2'),'SCALAR',5123,34963),'material':len(gltf['materials']),'targets':targets}
        gltf['materials'].append({'name':'Cord '+branch,'pbrMetallicRoughness':{'baseColorFactor':[*srgb_linear(color),1],'metallicFactor':0,'roughnessFactor':.8},'doubleSided':True})
        gltf['meshes'].append({'name':'Cord '+branch,'primitives':[pr],'weights':[0]*len(SAMPLES),'extras':{'sampleAngles':list(SAMPLES)}})
        cord_nodes.append(len(gltf['nodes']))
        gltf['nodes'][1]['children'].append(len(gltf['nodes']))
        gltf['nodes'].append({'name':'Ideal path '+branch,'mesh':len(gltf['meshes'])-1})
        processed.append(('Cord '+branch,verts,normals,faces,False,np.array(color)))
    # A complete demonstration cycle: neutral -> +90 -> neutral -> -90 -> neutral.
    times=np.array([0,2,4,6,8],dtype='f4')
    a=np.radians([0,90,0,-90,0])/2
    quats=np.stack((np.zeros(5),np.zeros(5),np.sin(a),np.cos(a)),axis=1).astype('f4')
    gltf['animations']=[{'name':'Ручной прогон ±90°','samplers':[{'input':accessor(times,'SCALAR',5126),'output':accessor(quats,'VEC4',5126),'interpolation':'LINEAR'}],'channels':[{'sampler':0,'target':{'node':2,'path':'rotation'}}]}]
    key_angles=list(range(0,91,15))+list(range(75,-91,-15))+list(range(-75,1,15))
    weights=np.zeros((len(key_angles),len(SAMPLES)),dtype='f4')
    for i,deg in enumerate(key_angles):weights[i,list(SAMPLES).index(deg)]=1
    gltf['animations'][0]['samplers'].append({'input':accessor(np.arange(len(key_angles),dtype='f4')/3,'SCALAR',5126),'output':accessor(weights.ravel(),'SCALAR',5126),'interpolation':'LINEAR'})
    for node in cord_nodes:gltf['animations'][0]['channels'].append({'sampler':1,'target':{'node':node,'path':'weights'}})
    gltf['buffers']=[{'byteLength':len(binary)}]
    js=json.dumps(gltf,ensure_ascii=False,separators=(',',':')).encode();js+=b' '*(-len(js)%4)
    dest.write_bytes(struct.pack('<4sII',b'glTF',2,28+len(js)+len(binary))+struct.pack('<I4s',len(js),b'JSON')+js+struct.pack('<I4s',len(binary),b'BIN\0')+binary)
    return processed


if __name__=="__main__":
    from rig.build_rig import scene_parts
    dest=Path(__file__).resolve().parent
    items=[(name,shape,rot,[int(col[1+k:3+k],16)/255 for k in (0,2,4)]) for name,shape,rot,col in scene_parts()]
    # A painted reference line, represented only in the illustrative GLB.
    import cadquery as cq
    indicator=cq.Solid.makeBox(.8,4.9,.05,cq.Vector(-.4,4.3,50.0))
    items.append(('Zero witness mark',indicator,True,[1.,.99,.9]))
    models=build_scene(items,(0,0,0),dest/'Orthosis_V04_manual_rig.glb')
    print('Built:',len(models),'components, triangles:',sum(len(p[3]) for p in models),flush=True)
