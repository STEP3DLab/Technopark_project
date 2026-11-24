"""Build an offline, self-contained glTF/GLB display assembly from manufacturing STLs.

Run: python source/build_assembly.py  (requires Python 3, numpy and Pillow).
For the software renderer's display LOD: python source/build_assembly.py --compact
(requires the supplementary vtk package).
Millimetres in all source dimensions. The glTF scene uses metres, +X east,
+Y north/up, +Z in front of the art. Its origin is the centre of the backing.
Textures, geometry and PBR materials are embedded.
"""
from pathlib import Path
import io
import json
import sys
import struct
import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / 'data'
OUTPUT = ROOT / 'models' / 'panel.glb'
BOARD = (420, 390, 6)
OUTER = (450, 420)
VELVET_Z = 0.0
MAP_FROM_BACKING = np.array([30.3, 65.0, 0.0])
BOARD_ORIGIN = np.array([-210.0, -195.0, 0.0])
MAP_ORIGIN = BOARD_ORIGIN + MAP_FROM_BACKING

REGION_COLORS = {
    'brest': '#989341', 'grodno': '#306945', 'vitebsk': '#728c4e',
    'minsk': '#9a9d58', 'mogilev': '#89884b', 'gomel': '#687f44',
}
EXPLOSION_MM = {
    'brest': [-20,-10,13], 'grodno': [-29,4,32], 'vitebsk': [1,26,30],
    'minsk': [0,2,44], 'mogilev': [29,3,29], 'gomel': [18,-15,17],
}


def data(name):
    return json.loads((DATA / name).read_text())


def b4(buffer, fill=b'\0'):
    return buffer + fill * ((-len(buffer)) % 4)


def srgb_hex(hex_color):
    rgb = np.array(list(bytes.fromhex(hex_color.removeprefix('#')))) / 255.0
    return np.where(rgb <= 0.04045, rgb / 12.92, ((rgb + 0.055) / 1.055) ** 2.4).round(7).tolist()


class Glb:
    def __init__(self):
        self.bin = bytearray()
        self.doc = {'asset': {'version':'2.0', 'generator':'Technopark / Belarus panel assembly'},
                    'scene':0, 'scenes':[{'name':'Рельеф Беларуси', 'nodes':[]}],
                    'nodes':[], 'meshes':[], 'materials':[], 'bufferViews':[], 'accessors':[],
                    'textures':[], 'images':[], 'samplers':[{'magFilter':9729,'minFilter':9987,
                                                             'wrapS':10497,'wrapT':10497}]}

    def push(self, key, item):
        self.doc[key].append(item)
        return len(self.doc[key])-1

    def raw(self, contents, target=None):
        start = len(self.bin)
        self.bin.extend(b4(contents))
        view = {'buffer':0, 'byteOffset':start, 'byteLength':len(contents)}
        if target is not None:
            view['target'] = target
        return self.push('bufferViews', view)

    def accessor(self, values, *, indices=False, bounds=False):
        array = np.asarray(values)
        if indices:
            dtype = '<u2' if array.max() < 65536 else '<u4'
            component_type = 5123 if dtype == '<u2' else 5125
            array = array.astype(dtype).reshape(-1)
            kind = 'SCALAR'
        else:
            array = np.ascontiguousarray(array, dtype='<f4')
            component_type = 5126
            kind = {2:'VEC2', 3:'VEC3',4:'VEC4'}[array.shape[1]]
        a = {'bufferView':self.raw(array.tobytes(),34963 if indices else 34962),
             'componentType':component_type, 'count':len(array), 'type':kind}
        if bounds:
            a['min'] = array.min(axis=0).tolist()
            a['max'] = array.max(axis=0).tolist()
        return self.push('accessors',a)

    def texture(self, png, name):
        im = self.push('images',{'bufferView':self.raw(png), 'mimeType':'image/png','name':name})
        return self.push('textures',{'source':im,'sampler':0})

    def material(self, name, color, metal=0., rough=0.8, texture=None, mask=False):
        pbr = {'baseColorFactor':srgb_hex(color)+[1.0],'metallicFactor':metal,'roughnessFactor':rough}
        if texture is not None:
            pbr['baseColorTexture']={'index':texture}
        mat={'name':name,'pbrMetallicRoughness':pbr}
        if mask: mat.update(alphaMode='MASK',alphaCutoff=0.2,doubleSided=True)
        return self.push('materials',mat)

    def primitive(self, verts, normals, faces, material, uv=None):
        attributes={'POSITION':self.accessor(np.asarray(verts) * 0.001, bounds=True),
                    'NORMAL':self.accessor(normals)}
        if uv is not None: attributes['TEXCOORD_0']=self.accessor(uv)
        return {'attributes':attributes,'indices':self.accessor(faces,indices=True),'material':material}

    def node(self, name, primitives, *, parent=None, translation=None, extras=None):
        node={'name':name}
        if primitives:
            node['mesh']=self.push('meshes',{'name':name, 'primitives':primitives})
        if translation is not None: node['translation']=(np.asarray(translation)*.001).tolist()
        if extras: node['extras']=extras
        idx=self.push('nodes',node)
        (self.doc['scenes'][0]['nodes'] if parent is None else self.doc['nodes'][parent].setdefault('children',[])).append(idx)
        return idx

    def save(self, destination):
        self.doc['buffers']=[{'byteLength':len(self.bin)}]
        js=b4(json.dumps(self.doc, ensure_ascii=False, separators=(',',':')).encode(), b' ')
        binary=bytes(self.bin)
        payload=(struct.pack('<II',len(js),0x4e4f534a)+js+
                 struct.pack('<II',len(binary),0x004e4942)+binary)
        destination.write_bytes(struct.pack('<4sII',b'glTF',2,len(payload)+12)+payload)


def read_triangles(path):
    raw=Path(path).read_bytes()
    n=struct.unpack_from('<I',raw,80)[0]
    if len(raw)!=84+n*50: raise ValueError(f'Not a binary STL: {path}')
    triangles=np.ndarray((n,3,3), dtype='<f4',buffer=raw,offset=96,strides=(50,12,4))
    return triangles.copy()


def stl_primitive(glb, triangles, material, flat=False):
    # Split side and bottom normals at the cap of a relief while smoothing its terrain.
    tris=np.asarray(triangles)
    face_norm=np.cross(tris[:,1]-tris[:,0],tris[:,2]-tris[:,0])
    area=np.linalg.norm(face_norm,axis=1)
    valid=area>1.e-9
    tris,face_norm,area=tris[valid],face_norm[valid],area[valid]
    unit=face_norm/area[:,None]
    if flat:
        positions=tris.reshape(-1,3)
        return glb.primitive(positions, np.repeat(unit,3,axis=0), np.arange(len(positions)), material)
    group=np.where(unit[:,2]>.32,1,np.where(unit[:,2]<-.32,-1,0))
    keys=np.column_stack([tris.reshape(-1,3), np.repeat(group,3)])
    unique,inv=np.unique(keys,axis=0,return_inverse=True)
    inv=inv.reshape(-1,3)
    normals=np.zeros((len(unique),3))
    for col in range(3): np.add.at(normals, inv[:,col], face_norm)
    length=np.linalg.norm(normals,axis=1)
    normals/=np.maximum(length[:,None],1.e-12)
    normals[length<1.e-12]=[0,0,1]
    return glb.primitive(unique[:,:3],normals,inv,material)


def textured_quads(glb, quads, mat):
    positions=[]; normals=[]; faces=[]; uvs=[]
    for points,texture_coords in quads:
        q=np.asarray(points,dtype=float)
        n=np.cross(q[1]-q[0],q[2]-q[0]); n/=np.linalg.norm(n)
        start=len(positions)
        positions.extend(q); normals.extend([n]*4); uvs.extend(texture_coords)
        faces.extend([[start,start+1,start+2],[start,start+2,start+3]])
    return glb.primitive(positions,normals,faces,mat,uvs)


def png_bytes(arr):
    stream=io.BytesIO()
    Image.fromarray(arr.astype('uint8')).save(stream,format='PNG',optimize=True)
    return stream.getvalue()


def material_textures():
    rng=np.random.default_rng(31)
    y,x=np.mgrid[:96,:384]
    # Grain runs along the rail; repeating strip has continuous sine coordinates.
    wave=(np.sin(2*np.pi*(y/9 + .27*np.sin(2*np.pi*x/384) + .09*np.cos(4*np.pi*x/384)))+
          .46*np.cos(2*np.pi*(y/4.1+.22*np.sin(4*np.pi*x/384))))
    tone=wave*4.4 + rng.normal(0,1.9,x.shape)
    wood=np.clip(np.array([79,58,45])+tone[...,None]*np.array([1,.81,.65]),0,255)
    y,x=np.mgrid[:96,:96]
    weave=(1.05*np.cos(x*np.pi)+.92*np.cos(y*np.pi)+rng.normal(0,2,(96,96)))
    velvet=np.clip(np.array([113,16,31])+weave[...,None]*np.array([1,.4,.5]),0,255)
    return png_bytes(wood),png_bytes(velvet)


def box_faces(x1,y1,x2,y2,z1,z2):
    a=(x1,y1,z1); b=(x2,y1,z1); c=(x2,y2,z1); d=(x1,y2,z1)
    e=(x1,y1,z2); f=(x2,y1,z2); g=(x2,y2,z2); h=(x1,y2,z2)
    return [[a,d,c,b],[e,f,g,h],[a,b,f,e],[b,c,g,f],[c,d,h,g],[d,a,e,h]]


def add_frame_and_backing(glb):
    wood,velvet=material_textures()
    rails=glb.material('Рама · тонированная сосна','#ffffff',0,.61,glb.texture(wood,'Волокна сосны'))
    lining=glb.material('Внутренний кант · светлый клён','#ccb897',0,.64)
    plywood=glb.material('Берёзовая фанера','#a38159',0,.85)
    fabric=glb.material('Бордовый велюр','#ffffff',0,.98,glb.texture(velvet,'Фактура велюра'))
    uv=[(0,1),(1,1),(1,0),(0,0)]
    backing_quads=[(q,uv) for q in box_faces(-210,-195,210,195,-6.4,-.4)]
    glb.node('Задник · фанера 420 × 390 × 6', [textured_quads(glb,backing_quads,plywood)])
    fabric_uv=[(0,13),(14,13),(14,0),(0,0)]
    glb.node('Велюр', [textured_quads(glb, [([(-210,-195,0),(210,-195,0),(210,195,0),(-210,195,0)],fabric_uv)], fabric)])
    # Counter-clockwise points at each inset. With a 20 mm rail the rear rabbet
    # extends out by 6 mm and fits the backing with 1 mm clearance per side.
    def corners(inset,z):
        x1=-225+inset; x2=225-inset; y1=-210+inset; y2=210-inset
        return [(x1,y1,z),(x2,y1,z),(x2,y2,z),(x1,y2,z)]
    profile=[(0,-9),(0,9.4),(1.5,11),(5,11),(13.8,9.7),(15.7,9.3),(17.6,9.1),
             (20,7.4),(20,0),(14,0),(14,-9),(0,-9)]
    sides=['Нижняя','Правая','Верхняя','Левая']
    for side in range(4):
        mats={rails:[], lining:[]}
        for k,(z0,z1) in enumerate(zip(profile,profile[1:])):
            first=corners(*z0); second=corners(*z1)
            j=(side+1)%4
            q=[first[side], first[j],second[j],second[side]]
            v0=z0[0]/20 + z0[1]/20; v1=z1[0]/20 + z1[1]/20
            mats[lining if k==5 else rails].append((q,[(0,v0),(1,v0),(1,v1),(0,v1)]))
        glb.node(sides[side]+' рейка', [textured_quads(glb,q,mat) for mat,q in mats.items() if q])


def decimate(tris, reduction):
    """Display LOD only. The manufacturing meshes and downloadable master remain intact."""
    import vtk
    from vtk.util.numpy_support import numpy_to_vtk, numpy_to_vtkIdTypeArray, vtk_to_numpy
    pos, indices = np.unique(tris.reshape(-1, 3), axis=0, return_inverse=True)
    points = vtk.vtkPoints()
    points.SetData(numpy_to_vtk(np.ascontiguousarray(pos), deep=True))
    faces = vtk.vtkCellArray()
    offsets = np.arange(0, len(indices) + 1, 3, dtype=np.int64)
    faces.SetData(numpy_to_vtkIdTypeArray(offsets, deep=True),
                  numpy_to_vtkIdTypeArray(indices.reshape(-1).astype(np.int64), deep=True))
    surface = vtk.vtkPolyData()
    surface.SetPoints(points)
    surface.SetPolys(faces)
    reducer = vtk.vtkQuadricDecimation()
    reducer.SetInputData(surface)
    reducer.SetTargetReduction(reduction)
    reducer.VolumePreservationOn()
    reducer.Update()
    mesh = reducer.GetOutput()
    vertices = vtk_to_numpy(mesh.GetPoints().GetData())
    ids = vtk_to_numpy(mesh.GetPolys().GetConnectivityArray()).reshape(-1, 3)
    return vertices[ids]


def build(compact=False):
    glb=Glb()
    add_frame_and_backing(glb)
    terrain=data('terrain.json'); decor=data('decor.json'); bison=data('bison.json')
    seats=data('seat_heights.json')
    group={}; mats={}
    for region in terrain['regions']:
        key=region['id']
        mats[key]=glb.material(region['name'],REGION_COLORS[key],0.0,.78)
        group[key]=glb.node(region['name'],None,translation=MAP_ORIGIN,
                            extras={'part':key,'explode':(np.array(EXPLOSION_MM[key])*.001).tolist()})
        stl=read_triangles(ROOT/region['path'])
        if compact: stl=decimate(stl, .80)
        glb.node('Рельеф · '+region['name'],[stl_primitive(glb,stl,mats[key])],parent=group[key])
    gilt=glb.material('Чеканная позолота','#e5b75c',.66,.32)
    ruby=glb.material('Рубиновая эмаль','#a81d37',.3,.19)
    bronze=glb.material('Патинированная бронза','#bf8d54',.66,.4)
    for obj in decor['parts']:
        triangles=read_triangles(ROOT/obj['file'])
        region=obj['target_region']
        primitive=[]
        for surface,(a,b) in obj['materials_face_ranges'].items():
            material={'gilt':gilt, 'ruby':ruby, 'bronze':bronze,'carrier':mats[region]}[surface]
            primitive.append(stl_primitive(glb,triangles[a:b],material, flat=(obj['kind']=='star')))
        name=('Звезда · ' if obj['kind']=='star' else 'Надпись · ')+obj['name']
        glb.node(name,primitive,parent=group[region],translation=obj['translation_mm'])
    stl=read_triangles(ROOT/bison['path'])
    if compact: stl=decimate(stl,.82)
    glb.node('Зубр', [stl_primitive(glb,stl,bronze)],parent=group['brest'],
             translation=[*bison['origin_xy_mm'],seats['bison']])
    # Top has transparent background at the fringes, cream backing beneath central woven area.
    sash=bison['sash']
    png=(ROOT/sash['texture']).read_bytes()
    ribbon=glb.material('Орнаментальная лента','#ffffff',.04,.84,glb.texture(png,'Тканый орнамент'),mask=True)
    fabric_base=glb.material('Торец льняной ленты','#ab885b',.01,.85)
    x,y=40-210,12-195; w,h=sash['width_mm'],sash['height_mm']; fringe=sash['fringe_per_end_mm']
    uv=[(0,1),(1,1),(1,0),(0,0)]
    core=[(q,uv) for q in box_faces(x+fringe,y+.5,x+w-fringe,y+h-.5,.03,.71)]
    quad=[(x,y,.74),(x+w,y,.74),(x+w,y+h,.74),(x,y+h,.74)]
    glb.node('Орнаментальная лента', [textured_quads(glb,core,fabric_base),textured_quads(glb,[(quad,uv)],ribbon)],
             extras={'explode':[0,-.013,.014]})
    dest=OUTPUT.with_name('panel-cpu.glb') if compact else OUTPUT
    glb.save(dest)
    print(f'{dest.name}: {len(glb.doc["nodes"])} узлов, {len(glb.doc["meshes"])} объектов, {dest.stat().st_size:,} байтов')


if __name__=='__main__':
    build('--compact' in sys.argv)
