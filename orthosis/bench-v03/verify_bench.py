"""Validate the V03 landing page, print package and published model links."""
from hashlib import sha256
from html.parser import HTMLParser
from pathlib import Path
import json
import struct
from zipfile import ZipFile

ROOT = Path(__file__).resolve().parent

class Links(HTMLParser):
    def __init__(self):
        super().__init__()
        self.urls = []
        self.ids = set()
    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if 'id' in attrs:
            assert attrs['id'] not in self.ids, attrs['id']
            self.ids.add(attrs['id'])
        keys = {'a': 'href', 'link': 'href', 'script': 'src', 'img': 'src', 'option': 'value'}
        key = keys.get(tag)
        if key and key in attrs:
            self.urls.append(attrs[key])

def check():
    page = Links()
    page.feed((ROOT / 'index.html').read_text())
    for url in page.urls:
        if url.startswith('https://'):
            continue
        path, _, anchor = url.partition('#')
        if path:
            assert (ROOT / path).is_file(), url
        elif anchor:
            assert anchor in page.ids, url
    files = ROOT / 'files'
    with ZipFile(files / 'Orthosis_V03_Bench.zip') as archive:
        assert archive.testzip() is None
        checksum_list = archive.read('SHA256SUMS.txt').decode().splitlines()
        for entry in checksum_list:
            digest, name = entry.split('  ', 1)
            assert sha256(archive.read(name)).hexdigest() == digest
            assert sha256((files / name).read_bytes()).hexdigest() == digest
        assert len([n for n in archive.namelist() if n.endswith('.stl')]) == 3
    regulator = json.loads((files / 'regulator/checks.json').read_text())
    drum = json.loads((files / 'drum/B04_check.json').read_text())
    for path in files.rglob('*.stl'):
        model = path.read_bytes()
        count, = struct.unpack_from('<I', model, 80)
        expected = drum['stl_mesh']['faces'] if path.stem == 'B04' else regulator[path.stem]['triangles']
        assert count == expected and len(model) == 84 + count * 50, path
        assert path.with_suffix('.step').read_bytes().startswith(b'ISO-10303-21;')
    assert regulator['base_slider_positions_checked'] == 33
    assert regulator['fastener_envelopes']['max_unintended_intersection_mm3'] == 0.0
    print('V03: site links, ZIP, component checksums and three CAD/STL pairs OK')
if __name__ == '__main__':
    check()
