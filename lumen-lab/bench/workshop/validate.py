#!/usr/bin/env python3
"""Reproduce the digital release checks. No physical results are generated.

Use Python with pyserial==3.5, littlefs-python==0.16.0, cadquery==2.7.0,
PyMuPDF; Node.js 22+, KiCad CLI 9.0.2 and pandoc must be on PATH.
"""
from pathlib import Path
import hashlib
from html.parser import HTMLParser
import json
import re
import subprocess
import sys
import tempfile
from datetime import datetime
from zoneinfo import ZoneInfo
from urllib.parse import unquote,urlsplit

ROOT=Path(__file__).resolve().parents[1]

def command(args):
    result=subprocess.run(args,cwd=ROOT,text=True,stdout=subprocess.PIPE,stderr=subprocess.STDOUT)
    if result.returncode:raise RuntimeError(' '.join(args)+'\n'+result.stdout)
    return result.stdout

def check_links():
    class Links(HTMLParser):
        def __init__(self):super().__init__();self.refs=[]
        def handle_starttag(self,tag,attrs):
            for key,value in attrs:
                if key in ('href','src') and value:self.refs.append(value)
    count=0
    for file in ROOT.rglob('*.html'):
        parser=Links();parser.feed(file.read_text(encoding='utf-8'))
        for ref in parser.refs:
            u=urlsplit(ref)
            if u.scheme or u.netloc or not u.path or u.path.startswith('/'):continue
            target=(file.parent/unquote(u.path)).resolve()
            # This report is written only after the other checks pass.
            if target==ROOT/'workshop/verification.json':count+=1;continue
            if not target.exists():raise RuntimeError('Broken local link: '+str(file.relative_to(ROOT))+' -> '+ref)
            count+=1
    return count

def main():
    import serial,littlefs,cadquery as cq,fitz
    assert serial.__version__=='3.5'
    node=command(['node','--test','--test-reporter=tap',*[str(p.relative_to(ROOT)) for p in sorted((ROOT/'checks').glob('*.test.mjs'))]])
    count=int(re.search(r'^# tests (\d+)',node,re.M)[1]);passed=int(re.search(r'^# pass (\d+)',node,re.M)[1])
    assert count==passed and re.search(r'^# skipped 0$',node,re.M)
    python=command([sys.executable,'-m','unittest','discover','-s','checks','-p','test_*.py','-v'])
    pycount=int(re.search(r'Ran (\d+) tests',python)[1]);assert 'skipped' not in python and '\nOK\n' in python
    for file in ROOT.rglob('*.mjs'):command(['node','--check',str(file.relative_to(ROOT))])
    kicad=command(['kicad-cli','--version']).strip()
    with tempfile.TemporaryDirectory() as directory:
        drc=Path(directory)/'drc.json';erc=Path(directory)/'erc.json'
        command(['kicad-cli','pcb','drc','--format','json','--schematic-parity','--exit-code-violations','-o',str(drc),'electronics/LM04B.kicad_pcb'])
        command(['kicad-cli','sch','erc','--format','json','--exit-code-violations','-o',str(erc),'electronics/LM04B.kicad_sch'])
        d=json.loads(drc.read_text());e=json.loads(erc.read_text())
        assert not d['violations'] and not d['unconnected_items'] and not d['schematic_parity']
        assert all(not s['violations'] for s in e['sheets'])
    geom=json.loads((ROOT/'workshop/thermal-block-validation.json').read_text())
    fixture=cq.importers.importStep(str(ROOT/'workshop/thermal-block.step')).val()
    assert fixture.isValid() and len(fixture.Solids())==1 and abs(fixture.Volume()-geom['volume_mm3'])<1e-4
    assert geom['step_sha256']==hashlib.sha256((ROOT/'workshop/thermal-block.step').read_bytes()).hexdigest()
    pdfs={}
    for name,pages in [('assembly-cards.pdf',4),('thermal-block.pdf',1)]:
        doc=fitz.open(ROOT/'workshop'/name);assert len(doc)==pages
        assert all(len(p.get_text())>800 for p in doc);pdfs[name]={'pages':len(doc),'text_present':True}
    import importlib.util
    spec=importlib.util.spec_from_file_location('kitrelease',ROOT/'release.py');module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module);module.render()
    links=check_links()
    inputs={str(p.relative_to(ROOT)):hashlib.sha256(p.read_bytes()).hexdigest() for p in ROOT.rglob('*') if p.is_file() and p.suffix in {'.mjs','.py','.kicad_sch','.kicad_pcb','.uf2','.step'} and '__pycache__' not in p.parts}
    report={'revision':'LM04B-B2','checkedAt':datetime.now(ZoneInfo('Europe/Moscow')).isoformat(timespec='seconds'),
      'scope':'Digital software, ECAD and CAD checks only. No physical acceptance is recorded.',
      'software':{'node_tests':count,'python_tests':pycount,'passed':passed+pycount,'failed':0,'skipped':0},
      'electronics':{'kicad_version':kicad,'erc_violations':0,'drc_violations':0,'unconnected':0,'schematic_parity_issues':0},
      'thermal_block':{'valid_step':True,'analytic_volume_matches':True,'physically_built':False},
      'pdfs':pdfs,'local_html_links_checked':links,'browser_test':'Independent interaction checks are outside this digital-check report.',
      'physical_logger_accepted':False,'medical_requirements_physically_confirmed':0,'medical_requirements_total':27,
      'inputSha256':dict(sorted(inputs.items()))}
    (ROOT/'workshop/verification.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    print(json.dumps({k:v for k,v in report.items() if k!='inputSha256'},ensure_ascii=False,indent=2))

if __name__=='__main__':main()
