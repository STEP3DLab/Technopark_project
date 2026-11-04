"""Remove numerical pole degeneracies from an OpenCascade STL, in millimetres.
Weld precision 0.00001 mm; not a geometric hole-filling or shape-repair routine.
Rejects non-closed meshes rather than silently attempting arbitrary repair.
"""
import struct
import numpy as np

DTYPE=np.dtype([('normal','<f4',(3,)),('v','<f4',(3,3)),('attr','<u2')])

def clean_stl(path):
    data=path.read_bytes();count=struct.unpack('<I',data[80:84])[0]
    assert len(data)==84+count*50
    raw=np.frombuffer(data,offset=84,count=count,dtype=DTYPE)
    coords=np.round(raw['v'].reshape(-1,3).astype(float),5).astype('float32')
    coords[:,2]-=coords[:,2].min()
    vertices,inv=np.unique(coords,axis=0,return_inverse=True)
    faces=inv.reshape(-1,3)
    keep=(faces[:,0]!=faces[:,1])&(faces[:,1]!=faces[:,2])&(faces[:,0]!=faces[:,2])
    faces=faces[keep]
    assert len(np.unique(np.sort(faces,axis=1),axis=0))==len(faces)
    edges=np.vstack((faces[:,[0,1]],faces[:,[1,2]],faces[:,[2,0]]))
    edges.sort(axis=1)
    _,ct=np.unique(edges,axis=0,return_counts=True)
    assert np.all(ct==2),f'Non-manifold STL: {path.name}'
    xyz=vertices[faces]
    normals=np.cross(xyz[:,1]-xyz[:,0],xyz[:,2]-xyz[:,0])
    lengths=np.linalg.norm(normals,axis=1)
    assert np.all(lengths>0)
    result=np.zeros(len(faces),dtype=DTYPE)
    result['v']=xyz;result['normal']=normals/lengths[:,None]
    header=b'Orthosis V01 mm - CAD bench prototype - numerical pole degeneracies removed'
    path.write_bytes(header.ljust(80,b'\0')[:80]+struct.pack('<I',len(faces))+result.tobytes())
    return {'removed_zero_area_faces':int(count-len(faces)),'triangles':len(faces)}
