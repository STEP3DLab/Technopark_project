"""Build the readable guides, integrity manifest and standalone LM-04B kit."""
import hashlib
import html
import os
from pathlib import Path
import re
import subprocess
import zipfile

ROOT = Path(__file__).resolve().parent
ASSETS = ROOT.parent / "assets"
ARCHIVE = ROOT / "LM-04B-kit.zip"
DOCS = ["START.md","electronics/README.md","mechanics/README.md","firmware/README.md",
        "desktop/README.md","data/FORMAT.md","platform/comparison.md",
        "workshop/BUILD.md","workshop/METHOD.md","workshop/SYSTEM.md",
        "qualification/README.md"]
SHARED = ["inter.woff2","plex.woff2","mark.svg","inter-OFL.txt","plex-OFL.txt"]

def kept(p):
    return (p.is_file() and not set(p.parts) & {"__pycache__", "node_modules", ".venv"}
            and not any(s.startswith(".") for s in p.relative_to(ROOT).parts)
            and p.name not in {ARCHIVE.name,"SHA256SUMS"}
            and p.suffix not in {".pyc",".kicad_prl",".tmp",".bak"})

def render():
    for name in DOCS:
        src=ROOT/name
        body=subprocess.check_output(["pandoc","--from=gfm+tex_math_dollars","--to=html5","--mathml","--wrap=none",str(src)],text=True)
        def local_link(m):
            path,anchor=m.group(1).split("#",1) if "#" in m.group(1) else (m.group(1),"")
            if ":" in path or path.startswith("/") or not path:return m.group(0)
            dest=(src.parent/path).resolve()
            if dest.is_dir():dest=dest/"README.md"
            if dest not in [ROOT/d for d in DOCS]:return m.group(0)
            out=os.path.relpath(dest.with_suffix(".html"),src.parent)
            return 'href="'+out+('#'+anchor if anchor else '')+'"'
        body=re.sub(r'href="([^"]+)"',local_link,body)
        title=html.escape(src.read_text(encoding="utf-8").splitlines()[0].lstrip("# "))
        home=os.path.relpath(ROOT/"index.html",src.parent)
        css=os.path.relpath(ROOT/"bench.css",src.parent)
        src.with_suffix(".html").write_text(f'''<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>{title} · LM-04B</title><link rel="stylesheet" href="{css}"></head><body class="guide"><header><div class="wrap top"><a class="brand" href="{home}"><span class="brandmark"></span>Lumen<span>Lab</span></a><a class="repo" href="{home}">К стенду LM-04B ↗</a></div></header><main class="wrap reading">{body}</main></body></html>''',encoding="utf-8")

def main():
    render()
    files=sorted(p for p in ROOT.rglob("*") if kept(p))
    sums="".join(f"{hashlib.sha256(p.read_bytes()).hexdigest()}  {p.relative_to(ROOT).as_posix()}\n" for p in files)
    (ROOT/"SHA256SUMS").write_text(sums,encoding="utf-8")
    prefix="LM-04B/"
    def add(z,name,data):
        item=zipfile.ZipInfo(prefix+name,(2026,11,20,0,0,0))
        item.compress_type=zipfile.ZIP_DEFLATED
        item.external_attr=(0o100644<<16)
        z.writestr(item,data,compresslevel=9)
    with zipfile.ZipFile(ARCHIVE,"w") as z:
        add(z,"README.txt","LM-04B. Руководство: bench/START.html. Схема и монтаж: bench/electronics/. "
            "Печать и крепёж: bench/mechanics/. Полный образ: bench/firmware/. "
            "Для локального журнала выполните python -m http.server 8000 из этой папки и откройте http://localhost:8000/bench/. "
            "Файл bench/SHA256SUMS содержит хеши исходной поставки.\n")
        add(z,"index.html",'<meta charset="utf-8"><meta http-equiv="refresh" content="0;url=bench/"><a href="bench/">LM-04B</a>')
        for p in files:
            add(z,"bench/"+p.relative_to(ROOT).as_posix(),p.read_bytes())
        add(z,"bench/SHA256SUMS",sums)
        for name in SHARED:add(z,"assets/"+name,(ASSETS/name).read_bytes())
    with zipfile.ZipFile(ARCHIVE) as z:
        if z.testzip() is not None:raise RuntimeError("Archive CRC check failed")
        for p in files:
            if z.read(prefix+"bench/"+p.relative_to(ROOT).as_posix())!=p.read_bytes():raise RuntimeError(str(p))
    print(f"{len(files)} source files, {ARCHIVE.stat().st_size} bytes, SHA-256 {hashlib.sha256(ARCHIVE.read_bytes()).hexdigest()}")

if __name__=="__main__":
    main()
