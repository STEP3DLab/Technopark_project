"""Rebuild the two workshop downloads. Works in checkout or under the GitHub Pages subdirectory."""
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED, ZipInfo
here=Path(__file__).resolve().parents[1]
kit=(here/'dist'/'kit') if (here/'dist'/'kit').is_dir() else here/'kit'
def pack(dest,files):
    with ZipFile(dest,'w',compression=ZIP_DEFLATED,compresslevel=8) as out:
        for path in sorted(files):
            meta=ZipInfo(str(path.relative_to(kit)).replace('\\','/'),date_time=(2026,11,20,0,0,0))
            meta.compress_type=ZIP_DEFLATED
            out.writestr(meta,path.read_bytes(),compresslevel=8)
pack(kit/'LM-04-print.zip',list((kit/'print').glob('*.stl')))
allfiles=[p for p in kit.rglob('*') if p.is_file() and p.suffix not in ('.zip','.pyc') and '__pycache__' not in p.parts and not p.name.startswith('.')]
pack(kit/'LM-04-kit.zip',allfiles)
