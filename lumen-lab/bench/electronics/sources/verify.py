"""Independent layout, wiring, drill and schematic checks. Run with KiCad's Python."""
from collections import defaultdict, deque
import hashlib, html, json, pathlib, re, subprocess, tempfile
import xml.etree.ElementTree as ET
import pcbnew as k

P=pathlib.Path(__file__).resolve().parents[1]
EXPECTED={'3V3':{'U1.36','J2.1','J3.1','R1.1','R2.1'},
          'GND':{'U1.38','J2.3','J3.3'},'DQ1':{'U1.4','R1.2','J2.2'},'DQ2':{'U1.5','R2.2','J3.2'}}
def xy(p):return(round(p.x/1e6,5),round(p.y/1e6,5))
def digest(file):return hashlib.sha256(file.read_bytes()).hexdigest()

def drills(file):
    tool=0; diam={}; holes=defaultdict(list)
    for ln in file.read_text().splitlines():
        m=re.fullmatch(r'T(\d+)C([\d.]+)',ln)
        if m: diam[int(m[1])]=float(m[2]);continue
        m=re.fullmatch(r'T(\d+)',ln)
        if m: tool=int(m[1]);continue
        m=re.fullmatch(r'X([-\d.]+)Y([-\d.]+)',ln)
        if m: holes[diam[tool]].append((float(m[1]),float(m[2])))
    return dict(holes)

def draw_svg(board,trackdata,padmap):
    # The original PCB origin is the northwest corner in KiCad. The dimensioned
    # manufacturing origin is southwest. SVG intentionally keeps KiCad's top view.
    out=['<svg xmlns="http://www.w3.org/2000/svg" viewBox="-3 -3 86 58" role="img" aria-labelledby="title desc">',
         '<title id="title">Монтажная карта LM-04B, вид сверху</title>',
         '<desc id="desc">USB слева, два датчика справа. Рисунок построен по площадкам и дорожкам платы KiCad.</desc>',
         '<rect x="0" y="0" width="80" height="52" rx=".75" fill="#173a37" stroke="#142a27" stroke-width=".45"/>']
    def rect(x,y,w,h,fill,stroke='',sw=.22,r=0):
        out.append(f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{r}" fill="{fill}" stroke="{stroke or "none"}" stroke-width="{sw}"/>')
    def circle(x,y,r,fill,stroke='',sw=.25):
        out.append(f'<circle cx="{x}" cy="{y}" r="{r}" fill="{fill}" stroke="{stroke or "none"}" stroke-width="{sw}"/>')
    def txt(x,y,t,size,color='#f4faf6',a='middle',bold=False):
        out.append(f'<text x="{x}" y="{y}" text-anchor="{a}" font-size="{size}" font-weight="{700 if bold else 500}" font-family="DejaVu Sans, sans-serif" fill="{color}">{html.escape(t)}</text>')
    for net,tracks in trackdata.items():
        for (a,b,layer,w) in tracks:
            col='#66a58d' if layer=='B' else '#c7b77c'
            out.append(f'<path d="M{a[0]} {a[1]}L{b[0]} {b[1]}" fill="none" stroke="{col}" stroke-width="{w}" opacity=".65"/>')
    for x,y in ((5,5),(75,5),(5,47),(75,47)):
        circle(x,y,2.75,'#41645c');circle(x,y,1.6,'#f4f8f7')
    rect(1.0,15.5,51,21,'#2b6960','#b3dfcf',.21,1.15)
    rect(-.33,21.87,5.6,8.26,'#c6d0cb','#71867c',.15,.35)
    rect(.1,23.18,2.7,5.9,'#596d64')
    for (ref,pin),(x,y) in padmap.items():
        if ref=='U1':
            circle(x,y,.88,'#cebd85');circle(x,y,.40,'#414940')
    txt(26.5,24.6,'U1  /  PICO RP2040',2.0,bold=True)
    txt(26.5,28.5,'USB',1.45);txt(26.5,31.3,'3V3 LOGIC',1.02,'#d1ede2')
    txt(3.5,40,'1',1.3,'#ecfaff');txt(3.5,13.4,'40',1.3)
    for ref,wy in [('R1',16.5),('R2',35.5)]:
        y=52-wy
        out.append(f'<path d="M55 {y} H62.62" stroke="#bfcac5" stroke-width=".55"/>')
        rect(55.66,y-1.22,6.3,2.44,'#ebc57a','#886d39',.13,.7)
        txt(58.81,y+.42,'4K7',1.18,'#503e26',bold=True)
        txt(58.8,y-2.5,ref,1.4)
    for ref,wy in [('J2',16.5),('J3',35.5)]:
        y=52-wy
        rect(66.9,y-7.62,8.15,15.24,'#297253','#9acdb3',.2,.35)
        for off,lab in [(-5.08,'G'),(0,'D'),(5.08,'V')]:
            circle(70,y+off,1.23,'#afc2b4','#526e5e',.16)
            out.append(f'<path d="M69.15 {y+off+.6}l1.7 -1.2" stroke="#506a59" stroke-width=".3"/>')
            txt(77,y+off+.5,lab,1.45)
        txt(64.2,y+.54,ref,1.55,'#ecf6f0',bold=True)
    txt(24,6.5,'LM-04B',2.6,'#d4eddf',bold=True)
    txt(30,46.7,'V 3V3     D DQ     G GND',1.46,'#d5e9de')
    out.append('</svg>')
    (P/'pcb-top.svg').write_text('\n'.join(out),encoding='utf-8')

def main():
    board=k.LoadBoard(str(P/'LM04B.kicad_pcb'))
    assert board.GetCopperLayerCount()==2 and board.GetDesignSettings().GetBoardThickness()==1600000
    pads=defaultdict(set);padmap={};nodes_by_net=defaultdict(list)
    graphs=defaultdict(lambda:defaultdict(set));trackdata=defaultdict(list)
    for f in board.GetFootprints():
        ref=f.GetReference()
        for pad in f.Pads():
            pt=xy(pad.GetPosition());pin=pad.GetNumber();n=pad.GetNetname()
            padmap[ref,pin]=pt
            if n not in EXPECTED:continue
            pads[n].add(ref+'.'+pin);nodes_by_net[n].append(pt)
            graphs[n]['F',pt].add(('B',pt));graphs[n]['B',pt].add(('F',pt))
    assert dict(pads)==EXPECTED,(pads,EXPECTED)
    for t in board.GetTracks():
        n=t.GetNetname();assert n in EXPECTED
        a,b=xy(t.GetStart()),xy(t.GetEnd());lay={k.F_Cu:'F',k.B_Cu:'B'}[t.GetLayer()]
        graphs[n][lay,a].add((lay,b));graphs[n][lay,b].add((lay,a))
        trackdata[n].append((a,b,lay,t.GetWidth()/1e6))
    for n,graph in graphs.items():
        first=next(iter(graph));vis={first};q=deque([first])
        while q:
            u=q.popleft()
            for v in graph[u]:
                if v not in vis:vis.add(v);q.append(v)
        assert len(vis)==len(graph),f'Open copper on {n}'
    with tempfile.TemporaryDirectory() as d:
        p=pathlib.Path(d)/'nets.xml'
        subprocess.run(['kicad-cli','sch','export','netlist','--format','kicadxml','-o',str(p),str(P/'LM04B.kicad_sch')],check=True)
        nets={n.get('name'):{v.get('ref')+'.'+v.get('pin') for v in n.findall('node')}
              for n in ET.parse(p).findall('./nets/net') if n.get('name') in EXPECTED}
    assert nets==EXPECTED
    plated=drills(P/'gerbers/LM04B-PTH.drl')
    mount=drills(P/'gerbers/LM04B-NPTH.drl')
    assert {d:len(coords) for d,coords in plated.items()}=={.8:4,1.0:40,1.3:6}
    assert set(mount[3.2])=={(5.,5.),(75.,5.),(75.,47.),(5.,47.)}
    report={'board_sha256':digest(P/'LM04B.kicad_pcb'),'schematic_sha256':digest(P/'LM04B.kicad_sch'),
            'matrix':'Coordinates are mm from southwest. Four intentionally distinct functional nets.',
            'nets':{n:{'pads':sorted(EXPECTED[n]),'routed_segments':len(trackdata[n]),'continuous':True} for n in EXPECTED},
            'schematic_matches_board':True,'plated_drills':{str(d):len(pts) for d,pts in plated.items()},
            'nonplated_mounting_holes_mm':{'diameter':3.2,'xy':sorted(mount[3.2])},'physically_built':False}
    drc=json.loads((P/'reports/drc.json').read_text());erc=json.loads((P/'reports/erc.json').read_text())
    assert not (drc['violations'] or drc['unconnected_items'] or drc['schematic_parity'])
    assert all(not sheet['violations'] for sheet in erc['sheets'])
    (P/'reports/connectivity.json').write_text(json.dumps(report,indent=2)+'\n')
    draw_svg(board,trackdata,padmap)
    print('4 functional nets continuous; schematic and independent pad sets agree; PTH 50, NPTH 4.')
if __name__=='__main__': main()
