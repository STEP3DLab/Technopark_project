"""Check the complete static release: resources, anchors and download ZIP."""
from pathlib import Path
from html.parser import HTMLParser
from urllib.parse import urlsplit, unquote
import json, zipfile, re
from PIL import Image

P=Path(__file__).resolve().parents[1]
class Page(HTMLParser):
    def __init__(self):
        super().__init__();self.ids=set();self.links=[];self.images=[]
    def handle_starttag(self,tag,attrs):
        d=dict(attrs)
        if d.get('id'):
            assert d['id'] not in self.ids,('duplicate id',d['id'])
            self.ids.add(d['id'])
        for k in ['src','href']:
            if d.get(k):self.links.append(d[k])
        if tag=='img':self.images.append(d)

checked=0
for name in ['index.html','report.html']:
    page=Page();page.feed((P/name).read_text())
    for ref in page.links:
        u=urlsplit(ref)
        if u.scheme or u.netloc:continue
        if not u.path:
            if u.fragment:assert unquote(u.fragment) in page.ids,(name,ref)
        else:
            target=(P/unquote(u.path)).resolve()
            assert target.exists(),('missing file',name,ref)
        checked+=1
    for im in page.images:
        assert im.get('alt'),('missing alt',im)
        target=P/im['src']
        with Image.open(target) as image:
            assert image.width>=500 and image.height>=400,('low resolution',target)
for name in ['side','exploded','shells','cassette','servo','gears','spool','guide']:
    assert (P/f'assets/{name}.webp').is_file(),name
for i in range(1,7):assert (P/f'assets/step-{i}.webp').is_file()
for src in ['site.js','studio.js','software-viewer.js','vendor/OrbitControls.js','vendor/GLTFLoader.js','vendor/BufferGeometryUtils.js']:
    for imp in re.findall(r"(?:from\s*|import\s*\()'([^']+)'",(P/src).read_text()):
        if imp.startswith('.'):
            assert (P/src).parent.joinpath(imp.split('?')[0]).is_file(),(src,imp)
with zipfile.ZipFile(P/'files/wrist-orthosis-complete.zip') as z:
    assert z.testzip() is None
    assert len([n for n in z.namelist() if n.endswith('.stl')])==13
model=json.loads((P/'files/assembly-view.json').read_text())
assert len(model)==22 and all(v['vertices'] and v['faces'] for v in model.values())
print(f'PASS: {checked} local references; 30 CAD images; 13 STL in ZIP; 22 interactive CAD meshes')
