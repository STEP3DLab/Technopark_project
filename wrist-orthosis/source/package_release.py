"""Optimize the CAD renders and build the downloadable manufacturing kit."""
from pathlib import Path
from PIL import Image
import zipfile, hashlib

P=Path(__file__).resolve().parents[1]
for src in (P/'assets').glob('*.png'):
    dst=src.with_suffix('.webp')
    if not dst.exists() or dst.stat().st_mtime<src.stat().st_mtime:
        Image.open(src).convert('RGB').save(dst,quality=90,method=6)
files=[P/'model.scad',P/'build.py',P/'README.md',P/'files/GUIDE_RU.md',P/'files/BOM.csv',P/'files/manifest.json',P/'files/assembly.glb',P/'files/assembly-studio.glb',*sorted((P/'files/stl').glob('*.stl'))]
with zipfile.ZipFile(P/'files/wrist-orthosis-complete.zip','w',zipfile.ZIP_DEFLATED) as archive:
    for file in files:
        archive.write(file,file.relative_to(P))
(P/'files/SHA256SUMS.txt').write_text(''.join(f'{hashlib.sha256(f.read_bytes()).hexdigest()}  {f.relative_to(P)}\n' for f in files))
print('Packaged',len(files),'files;',len(list((P/'assets').glob('*.webp'))),'CAD images')
