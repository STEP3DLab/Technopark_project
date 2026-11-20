"""Regenerate the LM-04B two-channel USB thermometer carrier with KiCad 9 pcbnew.
Run with the Python interpreter that provides pcbnew (Debian: /usr/bin/python3).
Local Cartesian dimensions in mm. Origin is the south-west board corner, top view.
"""
import csv
import json
from pathlib import Path
import pcbnew as k
from schematic import uid, pico_names

OUT=Path(__file__).resolve().parents[1]
LIB=Path('/usr/share/kicad/footprints')
NAME='LM04B'
PULLUP='R_Axial_DIN0207_L6.3mm_D2.5mm_P7.62mm_Horizontal'
PICO='Pico_RP2040_Two_20P_Sockets'
BLOCK='Phoenix_MKDSN_1-5_3-5-08_1729131'
NAMES=('3V3','GND','DQ1','DQ2')
# Terminal references always run from south to north: 1=3V3, 2=data, 3=GND.
PADS={
 'U1':{'36':'3V3','38':'GND','4':'DQ1','5':'DQ2'},
 'J2':{'1':'3V3','2':'DQ1','3':'GND'},
 'J3':{'1':'3V3','2':'DQ2','3':'GND'},
 'R1':{'1':'3V3','2':'DQ1'},'R2':{'1':'3V3','2':'DQ2'},
}


def pos(x,y):
    return k.VECTOR2I(k.FromMM(x),k.FromMM(52-y))


def layers():
    names=[('Module','${KICAD9_FOOTPRINT_DIR}/Module.pretty'),
           ('Resistor_THT','${KICAD9_FOOTPRINT_DIR}/Resistor_THT.pretty'),
           ('MountingHole','${KICAD9_FOOTPRINT_DIR}/MountingHole.pretty'),
           ('LM04','${KIPRJMOD}/LM04.pretty')]
    table='(fp_lib_table\n  (version 7)\n'
    table+=''.join(f'  (lib (name "{n}")(type "KiCad")(uri "{uri}")(options "")(descr ""))\n' for n,uri in names)
    (OUT/'fp-lib-table').write_text(table+')\n')


def terminal_footprint():
    # Pin coordinates are in KiCad's local/screen orientation. The wire mouths face +X.
    def rect(x1,y1,x2,y2,layer,stroke):
        return f'(fp_rect (start {x1} {y1})(end {x2} {y2})(stroke(width {stroke})(type default))(fill none)(layer "{layer}"))'
    f=[f'(footprint "{BLOCK}" (version 20241229)(generator pcbnew)(layer "F.Cu")',
       '(descr "Phoenix Contact 1729131 MKDSN 1,5/3-5,08, horizontal wire entry to +X; locator centre pin 2")',
       '(property "Reference" "REF**" (at -7 0 0)(layer "F.SilkS")(effects(font(size 1 1)(thickness .15))))',
       '(property "Value" "1729131" (at 0 9 0)(layer "F.Fab")(effects(font(size 1 1)(thickness .15))))',
       '(attr through_hole)',rect(-4.10,-7.62,4.05,7.62,'F.Fab',.10),
       rect(-4.20,-7.72,4.15,7.72,'F.SilkS',.12),
       rect(-4.35,-7.87,4.30,7.87,'F.CrtYd',.05)]
    for n,y in enumerate((5.08,0,-5.08),1):
        shape='rect' if n==1 else 'circle'
        f.append(f'(pad "{n}" thru_hole {shape} (at 0 {y})(size 2.5 2.5)(drill 1.3)(layers "*.Cu" "*.Mask"))')
    f.append(')')
    (OUT/'LM04.pretty').mkdir(exist_ok=True)
    (OUT/'LM04.pretty'/(BLOCK+'.kicad_mod')).write_text('\n'.join(f)+'\n')


def pico_footprint():
    # Socket-only footprint for the original non-radio Pico. Local +Y is down the
    # module from the USB end; pin 1 is the origin, pin 40 is opposite it.
    f=[f'(footprint "{PICO}" (version 20241229)(generator pcbnew)(layer "F.Cu")',
       '(descr "RP2040 Raspberry Pi Pico only; two 1x20 2.54 mm sockets, spacing 17.78 mm. Pin 1 origin.")',
       '(property "Reference" "REF**" (at 8.89 52 0)(layer "F.SilkS")(effects(font(size 1 1)(thickness .15))))',
       '(property "Value" "Pico RP2040" (at 8.89 24 0)(layer "F.Fab")(effects(font(size 1 1)(thickness .15))))',
       '(attr through_hole)']
    def rect(x1,y1,x2,y2,layer,width):
        f.append(f'(fp_rect(start {x1} {y1})(end {x2} {y2})(stroke(width {width})(type default))(fill none)(layer "{layer}"))')
    rect(-1.61,-1.37,19.39,49.63,'F.Fab',.1)
    rect(4.87,-2.65,12.91,3.05,'F.Fab',.10)
    rect(-1.9,-2.9,19.68,49.9,'F.CrtYd',.05)
    for x in (0,17.78):
        rect(x-1.30,-1.24,x+1.30,49.50,'F.SilkS',.12)
    for num in range(1,41):
        x=0 if num<=20 else 17.78
        y=(num-1 if num<=20 else 40-num)*2.54
        shape='rect' if num==1 else 'circle'
        f.append(f'(pad "{num}" thru_hole {shape} (at {x} {y:.2f})(size 1.70 1.70)(drill 1)(layers "*.Cu" "*.Mask"))')
    f.append(')')
    (OUT/'LM04.pretty'/(PICO+'.kicad_mod')).write_text('\n'.join(f)+'\n')


def main():
    layers()
    terminal_footprint()
    pico_footprint()
    board=k.BOARD()
    board.SetCopperLayerCount(2)
    ds=board.GetDesignSettings()
    ds.SetBoardThickness(k.FromMM(1.6))
    ds.SetAuxOrigin(pos(0,0))
    nets={}
    unused={str(i):f'unconnected-(U1-{label}-Pad{i})' for i,label in enumerate(pico_names,1) if str(i) not in PADS['U1']}
    for n in [*NAMES,*unused.values()]:
        net=k.NETINFO_ITEM(board,n);board.Add(net);nets[n]=net

    def footprint(ref, lib, name, x,y, orientation, value):
        folder=OUT/'LM04.pretty' if lib=='LM04' else LIB/(lib+'.pretty')
        f=k.FootprintLoad(str(folder),name)
        if not f:
            raise RuntimeError(f'Missing footprint {lib}:{name}')
        f.SetFPID(k.LIB_ID(lib,name));f.SetReference(ref);f.SetValue(value)
        if ref in PADS:
            f.SetPath(k.KIID_PATH('/'+uid(ref)))
            f.SetSheetfile('LM04B.kicad_sch')
            f.SetSheetname('')
        f.SetPosition(pos(x,y));f.SetOrientationDegrees(orientation)
        f.Reference().SetVisible(False)
        for pad in f.Pads():
            n=PADS.get(ref,{}).get(pad.GetNumber())
            if ref=='U1' and not n:
                n=unused[pad.GetNumber()]
            if n: pad.SetNet(nets[n])
        board.Add(f)
        return f

    def line(layer,start,end,width):
        sh=k.PCB_SHAPE(board);sh.SetShape(k.SHAPE_T_SEGMENT);sh.SetLayer(layer)
        sh.SetStart(pos(*start));sh.SetEnd(pos(*end));sh.SetWidth(k.FromMM(width));board.Add(sh)

    def text(value,x,y,h=1,layer=None):
        obj=k.PCB_TEXT(board);obj.SetText(value);obj.SetLayer(k.F_SilkS if layer is None else layer)
        obj.SetPosition(pos(x,y));obj.SetTextSize(k.VECTOR2I(k.FromMM(h),k.FromMM(h)))
        obj.SetTextThickness(k.FromMM(max(.15,h*.15)));board.Add(obj)

    def route(name,layer,points,width):
        for p,q in zip(points,points[1:]):
            if p==q: continue
            t=k.PCB_TRACK(board);t.SetStart(pos(*p));t.SetEnd(pos(*q));t.SetLayer(layer)
            t.SetWidth(k.FromMM(width));t.SetNet(nets[name]);board.Add(t)

    def atpin(ref,pin):
        pad=ref.FindPadByNumber(str(pin))
        loc=pad.GetPosition()
        return (round(k.ToMM(loc.x),5),round(52-k.ToMM(loc.y),5))

    pico=footprint('U1','LM04',PICO,2.37,17.11,90,'Raspberry_Pi_Pico_RP2040')
    j2=footprint('J2','LM04',BLOCK,71,16.5,0,'T1')
    j3=footprint('J3','LM04',BLOCK,71,35.5,0,'T2')
    r1=footprint('R1','Resistor_THT',PULLUP,55,16.5,0,'4.7k')
    r2=footprint('R2','Resistor_THT',PULLUP,55,35.5,0,'4.7k')
    for index,point in enumerate(((5,5),(75,5),(75,47),(5,47)),1):
        h=footprint(f'H{index}','MountingHole','MountingHole_3.2mm_M3',*point,0,'M3_NPTH')
        h.SetAttributes(h.GetAttributes() | k.FP_BOARD_ONLY)
    assert atpin(pico,36)==(12.53,34.89) and atpin(pico,4)==(9.99,17.11)
    assert atpin(j2,1)==(71,11.42) and atpin(j3,3)==(71,40.58)

    loop=[(0,0),(80,0),(80,52),(0,52),(0,0)]
    for p,q in zip(loop,loop[1:]): line(k.Edge_Cuts,p,q,.05)
    f,b=k.F_Cu,k.B_Cu
    route('DQ1',f,[atpin(pico,4),(9.99,13.60),(12.59,11),(51,11),(55,7),(59,7),
                     (62.62,10.62),atpin(r1,2),atpin(j2,2)],.40)
    route('DQ2',f,[atpin(pico,5),(12.53,20.5),(15.03,23),(47,23),(52,28),
                     (56,28),(62.62,34.62),atpin(r2,2),atpin(j3,2)],.40)
    route('3V3',b,[atpin(pico,36),(12.53,38),(15.53,41),(49.5,41),atpin(r2,1)],.55)
    route('3V3',b,[atpin(r2,1),atpin(r1,1)],.55)
    route('3V3',b,[atpin(r2,1),(60.08,30.42),atpin(j3,1)],.55)
    route('3V3',b,[atpin(r1,1),(60.08,11.42),atpin(j2,1)],.55)
    route('GND',b,[atpin(pico,38),(7.45,40),(14.45,47),(60,47),(66.42,40.58),atpin(j3,3)],.55)
    route('GND',b,[atpin(j3,3),(74.7,40.58),(78,37.28),(78,25.08),(74.5,21.58),atpin(j2,3)],.55)

    text('LM-04B   USB THERMOMETER',31,46.2,1.2)
    text('PICO RP2040  /  USB WEST',29,5.6,1.05)
    text('R1 4K7',58.7,20,0.9);text('R2 4K7',58.7,39.0,0.9)
    for x,y,label in [(71,26,'T1 / T2')]:
        text(label,x,y,0.85)
    for y0 in (16.5,35.5):
        for off,lab in ((-5.08,'V'),(0,'D'),(5.08,'G')):
            text(lab,77.1,y0+off,0.95)
    text('V=3V3  D=DQ  G=GND',39,8.3,.88)
    text('T1',58,12.8,0.95);text('T2',58,31.5,0.95)
    board.SetFileName(str(OUT/(NAME+'.kicad_pcb')))
    k.SaveBoard(str(OUT/(NAME+'.kicad_pcb')),board)
    template=json.loads(Path('/usr/share/kicad/template/kicad.kicad_pro').read_text())
    template['meta']['filename']=NAME+'.kicad_pro'
    rules=template['board']['design_settings']['rules']
    rules.update({'min_clearance':.25,'min_track_width':.30,'min_through_hole_diameter':.6,
                  'min_copper_edge_clearance':.3})
    (OUT/(NAME+'.kicad_pro')).write_text(json.dumps(template,indent=2)+'\n')
    with (OUT/'connections.csv').open('w',encoding='utf-8-sig',newline='') as fh:
        wr=csv.writer(fh,delimiter=';');wr.writerow(['Цепь','Узел','Вывод','Назначение'])
        des={'3V3':'Выход 3,3 В Pico','GND':'Общая земля','DQ1':'Данные T1, GP2','DQ2':'Данные T2, GP3'}
        for net in NAMES:
            for ref,mp in PADS.items():
                for pin,name in mp.items():
                    if name==net: wr.writerow([net,ref,pin,des[net]])


if __name__=='__main__':
    main()
