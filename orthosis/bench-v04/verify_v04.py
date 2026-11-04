"""Release regressions for the local CAD viewer, nominal winding and printable files."""
import csv, hashlib, json, math, re, struct, zipfile
from html.parser import HTMLParser
from pathlib import Path
ROOT=Path(__file__).resolve().parent
class References(HTMLParser):
    def __init__(self):
        super().__init__(); self.urls=[]; self.ids=set()
    def handle_starttag(self,tag,attrs):
        a=dict(attrs)
        if 'id' in a:
            assert a['id'] not in self.ids,a['id']
            self.ids.add(a['id'])
        key={'a':'href','script':'src','img':'src','image':'href','link':'href','option':'value'}.get(tag)
        if key and key in a:self.urls.append(a[key])
def verify():
    h=References();h.feed((ROOT/'index.html').read_text())
    for url in h.urls:
        if url.startswith('https://'):continue
        path,_,anchor=url.partition('#')
        if path:
            p=ROOT/path
            assert p.is_file() or (p/'index.html').is_file(),url
        elif anchor:assert anchor in h.ids,url
    files=ROOT/'files'
    with zipfile.ZipFile(files/'Orthosis_V04_Manual_Bench.zip') as archive:
        assert archive.testzip() is None
        assert len([p for p in archive.namelist() if p.endswith('.stl')])==5
        for row in archive.read('SHA256SUMS.txt').decode().splitlines():
            h,name=row.split('  ',1)
            assert h==hashlib.sha256(archive.read(name)).hexdigest()==hashlib.sha256((files/name).read_bytes()).hexdigest()
    raw=(files/'Orthosis_V04_manual_rig.glb').read_bytes()
    magic,v,size,jslen,tag=struct.unpack_from('<4sIII4s',raw)
    assert magic==b'glTF' and v==2 and tag==b'JSON' and size==len(raw)
    g=json.loads(raw[20:20+jslen]);offset=28+jslen
    assert len(g['buffers'])==1 and g['buffers'][0]['byteLength']+offset==size
    assert len(g['meshes'])==23 and g['nodes'][0]['scale']==[.001]*3
    def acc(i):
        a=g['accessors'][i];b=g['bufferViews'][a['bufferView']]
        c={'VEC3':3,'SCALAR':1,'VEC4':4}[a['type']]
        fmt={5126:'f',5123:'H',5125:'I'}[a['componentType']]
        assert b['byteLength']==struct.calcsize(fmt)*a['count']*c
        return struct.unpack_from('<'+str(a['count']*c)+fmt,raw,offset+b.get('byteOffset',0))
    animation=g['animations'][0];assert len(animation['channels'])==3
    for sampler in animation['samplers']:
        times=acc(sampler['input']);assert times[0]==0 and abs(times[-1]-8)<1e-5
    for branch,sign in [('A',1),('B',-1)]:
        m=next(m for m in g['meshes'] if m['name']=='Cord '+branch);p=m['primitives'][0]
        base=acc(p['attributes']['POSITION']);angles=m['extras']['sampleAngles']
        for theta in [-90,0,90]:
            shift=acc(p['targets'][angles.index(theta)]['POSITION'])
            assert abs(shift[0]+sign*12*math.radians(theta))<1e-4
            assert abs(base[0]-92)<1e-4
    with (files/'cable/manual_run.csv').open(encoding='utf-8-sig') as f:rows=list(csv.reader(f,delimiter=';'))[1:]
    assert len(rows)==13 and rows[3][1]=='90' and rows[9][1]=='-90'
    assert (files/'Orthosis_V04_Test_Sheet.pdf').read_bytes().startswith(b'%PDF-')
    checks=json.loads((files/'rig/motion_checks.json').read_text());assert checks['worst_continuous_overlap_mm3']==0
    print('V04 links, five printable STL, package integrity, assembly and both animated cable branches verified.')
if __name__=='__main__':verify()
