"""Static QA of the public V01 demo and all downloadable files. No external dependency."""
from pathlib import Path
from html.parser import HTMLParser
import csv,hashlib,json,re,struct,zipfile
ROOT=Path(__file__).resolve().parent
PAGE=ROOT/'index.html'
class Links(HTMLParser):
    def __init__(self):
        super().__init__()
        self.urls=[]
    def handle_starttag(self,tag,attrs):
        d=dict(attrs)
        if tag in ('a','script','link') and (tag!='link' or d.get('rel')=='stylesheet'):
            for attr in ('href','src'):
                if attr in d:self.urls.append(d[attr])

def main():
    html=PAGE.read_text(encoding='utf-8')
    js=(ROOT/'app.js').read_text(encoding='utf-8')
    all_links=Links();all_links.feed(html)
    assert all_links.urls
    for link in all_links.urls:
        if link.startswith('./'):
            path=(ROOT/link[2:])
            assert path.is_file(),f'Broken link {link}'
    for x in ['viewport','partGrid','bedWidth','bedDepth','bedSummary','angle','play','verification']:
        assert ('id="'+x+'"') in html or ('class="'+x+'"') in html,x
    assert 'THREE' in js and 'STLLoader' in js and 'GLTFLoader' in js
    assert 'printFootprint' in js and 'fitsBed' in js and 'moveNames' in js
    assert 'fallback.js' in html and (ROOT/'fallback.js').is_file()
    assert 'drive-visual.js' in js and (ROOT/'drive-visual.js').is_file()
    assert 'id="driveStroke"' in html and 'id="driveToggle"' in html
    assert len(re.findall(r'<article class="pcard" data-code="A\d{2}"',html))==17
    match=re.search(r'const printSize=\{(.*?)\};',js,re.S)
    assert match,'Missing dimensions'
    size=json.loads('{'+re.sub(r'\b(A\d{2}):',r'"\1":',match.group(1))+'}')
    assert len(size)==17

    stls=sorted((ROOT/'files/STL').glob('A*.stl'))
    steps=sorted((ROOT/'files/STEP').glob('*.step'))
    assert len(stls)==17 and len(steps)==23,(len(stls),len(steps))
    for stl in stls:
        b=stl.read_bytes()
        count=struct.unpack_from('<I',b,80)[0]
        assert len(b)==84+50*count and count>0,stl.name
        mn=[float('inf')]*3; mx=[-float('inf')]*3
        for i in range(count):
            x=struct.unpack_from('<12f',b,84+50*i)
            for k in range(3):
                vv=(x[3+k],x[6+k],x[9+k])
                mn[k]=min(mn[k],*vv);mx[k]=max(mx[k],*vv)
        ext=[mx[i]-mn[i] for i in range(3)]
        expected=size[stl.stem]
        assert all(abs(ext[i]-expected[i])<.20 for i in range(3)),(stl.name,ext,expected)
    print('Verified 17 printable STL triangle payloads and displayed model dimensions')

    archive=ROOT/'files/Orthosis_V01_CAD.zip'
    checksum=hashlib.sha256(archive.read_bytes()).hexdigest()
    manifest=json.loads((ROOT/'files/manifest.json').read_text())
    assert checksum==manifest['zip_sha256']
    with zipfile.ZipFile(archive) as z:
        assert any(name.endswith('/source/build_orthosis.py') for name in z.namelist())
        assert len([name for name in z.namelist() if re.search(r'/STL/A\d{2}\.stl$',name)])==17
    with (ROOT/'files/BOM.csv').open(encoding='utf-8-sig',newline='') as f:
        bom=list(csv.DictReader(f,delimiter=';'))
    printed=[i for i in bom if i['Тип']=='printed']
    assert len(printed)==17 and sum(int(x['Количество']) for x in printed)==27
    glb=(ROOT/'files/Orthosis_V01_assembly.glb').read_bytes()
    magic,version,size_glb=struct.unpack_from('<4sII',glb)
    assert magic==b'glTF' and version==2 and len(glb)==size_glb
    blocklen,typ=struct.unpack_from('<I4s',glb,12)
    assert typ==b'JSON'
    gltf=json.loads(glb[20:20+blocklen])
    count=len(gltf.get('meshes',[]))
    assert count>=31
    if count>31:print('Warning: original CAD patches still published, optimizer pending:',count)
    else:print('Viewer GLB optimized:',count,'meshes')
    v02=ROOT/'drive_v02'/'files'
    assert (v02/'Orthosis_V02_drive_concept.glb').is_file()
    assert len(list((v02/'STL').glob('B*.stl')))==3
    assert len(list((v02/'STEP').glob('B*.step')))==3
    assert (v02/'Orthosis_V02_drive_concept.step').stat().st_size>100000
    assert (v02/'Orthosis_V02_Bowden_CAD.zip').stat().st_size>100000
    assert (v02/'motion_table.csv').is_file() and (v02/'verification_v02.json').is_file()
    print('Verified V02: 3 added STL and STEP models, web GLB, assembly and motion data')
    print('Orthosis public downloads and local source verified')

if __name__=='__main__':main()
