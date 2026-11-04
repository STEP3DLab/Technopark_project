"""Parametric active-knee orthosis LAYOUT prototype, millimetres.
Not a patient-ready device. Run with Python 3.11+ and cadquery==2.7.0.
See README_RU.md for assumptions, unresolved interfaces and test limits.
"""
from pathlib import Path
import json, math, csv, sys
import cadquery as cq
from clean_stl import clean_stl

ROOT = Path(__file__).resolve().parents[1]
P = json.loads((Path(__file__).parent/'parameters.json').read_text())
for folder in ['STEP','STL','checks','preview']:
    (ROOT/folder).mkdir(exist_ok=True)
PARTS = {}
INST = []
FILLET_LOG = []
BLUE=(0.15,0.34,0.45); TEAL=(0.20,0.62,0.61); DARK=(0.22,0.26,0.29)
ORANGE=(0.94,0.51,0.20); STEEL=(0.68,0.71,0.74); LIGHT=(0.72,0.79,0.80)

def box(dx,dy,dz,at=(0,0,0),r=0):
    s=cq.Workplane('XY').box(dx,dy,dz)
    if r: s=s.edges().fillet(r)
    return s.translate(at).val()

def cyl(radius,length,at=(0,0,0),axis=(0,0,1)):
    return cq.Solid.makeCylinder(radius,length,cq.Vector(*at),cq.Vector(*axis))

def fillet(s,r,label):
    try:
        out=cq.Workplane(obj=s).edges().fillet(r).val()
        assert out.isValid()
        FILLET_LOG.append({'feature':label,'radius':r,'applied':True})
        return out
    except Exception as e:
        FILLET_LOG.append({'feature':label,'radius':r,'applied':False,'reason':str(e)[:160]})
        return s

def sector_xy(ri,ro,deg0,deg1,h,z=0):
    def point(r,a):
        a=math.radians(a); return (r*math.cos(a),r*math.sin(a))
    mid=(deg0+deg1)/2
    return (cq.Workplane('XY').moveTo(*point(ro,deg0))
            .threePointArc(point(ro,mid),point(ro,deg1)).lineTo(*point(ri,deg1))
            .threePointArc(point(ri,mid),point(ri,deg0)).close().extrude(h).translate((0,0,z)).val())

def sector_x(ri,ro,deg0,deg1,length,x):
    # Angle zero points down (-Z); increasing angles turn toward posterior (-Y).
    def point(r,a):
        a=math.radians(a); return (-r*math.sin(a),-r*math.cos(a))
    mid=(deg0+deg1)/2
    return (cq.Workplane('YZ').moveTo(*point(ro,deg0))
            .threePointArc(point(ro,mid),point(ro,deg1)).lineTo(*point(ri,deg1))
            .threePointArc(point(ri,mid),point(ri,deg0)).close().extrude(length).translate((x,0,0)).val())

def slot_x(length,width,depth,x,y,z,angle=90):
    return cq.Workplane('YZ',origin=(x,y,z)).slot2D(length,width,angle).extrude(depth).val()

def cuff(radius,z0):
    start=90+(360-P['cuff_wrap_degrees'])/2
    end=start+P['cuff_wrap_degrees']
    h=P['cuff_band_height']
    s=fillet(sector_xy(radius,radius+P['cuff_wall'],start,end,h,z0),2,'cuff exterior')
    # Shallow inset for a removable 5 mm EVA strip; inset is not a snap fit.
    s=s.cut(sector_xy(radius-.1,radius+1,start+5,end-5,h-8,z0+4))
    for a in [start+11,end-11]:
        cut=slot_x(P['strap_slot_length'],P['strap_slot_width'],20,radius-5,0,z0+h/2)
        s=s.cut(cut.rotate((0,0,0),(0,0,1),a))
    return s

def register(code,name,s,qty=1,color=BLUE,kind='printed',notes=''):
    s=s.clean()
    solids=list(s.Solids())
    if not s.isValid() or len(solids)!=1 or s.Volume()<=0:
        raise RuntimeError(f'{code}: invalid or disconnected shape; solids={len(solids)}')
    PARTS[code]={'shape':s,'name':name,'qty':qty,'color':color,'kind':kind,'notes':notes}
    print('part',code,name,'vol',round(s.Volume()/1000,2),flush=True)
    return s

def instance(code,s=None,name=None,group='fixed'):
    INST.append({'code':code,'shape':s if s is not None else PARTS[code]['shape'],
                 'name':name or code,'group':group})

def xhole(s,rad,y,z,x=60,length=65):
    return s.cut(cyl(rad,length,(x,y,z),(1,0,0)))

# A01: stationary thigh plate, receiver and lower open cuff form one print.
thigh=fillet(cyl(54,12,(96,0,0),(1,0,0)),2,'thigh hinge plate')
thigh=thigh.fuse(box(16,36,125,(104,0,107.5),2)) # z45..170
thigh=thigh.fuse(cuff(P['thigh_inner_radius'],68))
thigh=thigh.fuse(box(13,24,28,(90.5,0,90),2))
thigh=thigh.cut(box(8.6,24.6,109,(104,0,119.5))) # z65..174
for z in [140,160]: thigh=xhole(thigh,2.75,0,z)
thigh=xhole(thigh,P['axis_clearance']/2,0,0)
for a in [171]+[a+189 for a in P['flexion_stop_positions']]:
    for radius in [41,48]:
        thigh=xhole(thigh,1.7,-radius*math.sin(math.radians(a)),-radius*math.cos(math.radians(a)))
register('A01','Бедренная рама с неподвижной щекой',thigh,notes='Длина от оси до торца приемника 170; 4 отверстия для фиксации упоров при 120°.')
instance('A01')

# A02: floating shin hub; two actual 608 pockets on opposite faces.
shin=cyl(35,16.8,(76.6,0,0),(1,0,0))
shin=fillet(shin,2,'shin hub exterior')
shin=shin.fuse(box(16,36,148,(87.4,0,-106),2)) # -180..-32
shin=shin.fuse(sector_x(32,48,176,184,9.4,86))
shin=shin.fuse(cuff(P['shin_inner_radius'],-174))
shin=shin.fuse(box(15.4,24,28,(72.2,0,-152),2))
shin=shin.cut(box(8.6,24.6,119,(87.4,0,-124.5))) # -184..-65
for z in [-140,-160]: shin=xhole(shin,2.75,0,z)
shin=xhole(shin,8,0,0)
shin=shin.cut(cyl(P['bearing_od_pocket']/2,7.0,(76.6,0,0),(1,0,0)))
shin=shin.cut(cyl(P['bearing_od_pocket']/2,7.0,(86.4,0,0),(1,0,0)))
for yy in [-14,14]: shin=xhole(shin,1.7,yy,0)
register('A02','Голенная рама с подвижной ступицей',shin,notes='2 посадки Ø22.025×7; центральная перемычка 2.8; упорный выступ ±4°.')
instance('A02',group='moving')

def slider(code,xc,length,negative=False):
    zcenter=(100+length)/2
    s=box(8,24,length-100,(xc,0,zcenter),2)
    for z in range(110,191,10): s=xhole(s,2.75,0,z)
    for z in [length-30,length-10]: s=xhole(s,2.75,0,z)
    if negative: s=s.mirror('XY')
    register(code,'Телескопическая вставка '+('голени' if negative else 'бедра'),s,color=TEAL,
             notes='Регулировка ±30 мм, шаг 10 мм; два поперечных M5; зазор 0.3 на сторону.')
    instance(code,group='moving' if negative else 'fixed')

slider('A03',104,P['thigh_nominal_length'])
slider('A04',87.4,P['shin_nominal_length'],True)

def end_cuff(code,radius,end,innerx,negative=False,motor=False):
    s=cuff(radius,end-44)
    # Flat lateral mating face ends at the slider inner face.
    s=s.fuse(box(innerx-(radius+4),24,38,((innerx+radius+4)/2,0,end-22),2))
    for zz in [end-30,end-10]: s=xhole(s,2.75,0,zz,x=radius-5)
    if motor:
        s=s.fuse(box(44,14,32,(0,-89,end-22),2))
        for xx in [-14,14]: s=s.cut(cyl(2.75,25,(xx,-105,end-22),(0,1,0)))
    else:
        s=s.fuse(box(30,14,30,(22,-63,end-22),2))
        for xx in [14,30]: s=s.cut(cyl(1.7,22,(xx,-78,end-22),(0,1,0)))
    if negative: s=s.mirror('XY')
    register(code,'Проксимальная бедренная манжета' if motor else 'Дистальная голенная манжета',s,color=TEAL)
    instance(code,group='moving' if negative else 'fixed')

end_cuff('A05',P['thigh_inner_radius'],P['thigh_nominal_length'],100,motor=True)
end_cuff('A06',P['shin_inner_radius'],P['shin_nominal_length'],83.4,negative=True)

# A07: universal carrier; all motor interfaces are assumptions, not a motor model.
tray=box(88,62,8,(0,-127,212),2)
tray=tray.fuse(box(88,6,40,(0,-99,232),2))
for xx in [-14,14]: tray=tray.cut(cyl(2.75,10,(xx,-104,238),(0,1,0)))
for xx in [-27,27]:
    # Through-slots for cradle straps, not a claimed motor bolt pattern.
    cut=cq.Workplane('XY',origin=(xx,-132,207)).slot2D(32,4,90).extrude(10).val()
    tray=tray.cut(cut)
for xx in [-39,39]:
    for yy in [-151,-108]: tray=tray.cut(cyl(1.7,12,(xx,yy,206)))
tray=tray.cut(cyl(2.8,50,(22,-100,207)))
register('A07','Универсальная площадка привода',tray,color=ORANGE,notes='Макет двигателя Ø36×70; крепление лентами. Чертеж реального двигателя требуется.')
instance('A07')

cover=box(94,68,50,(0,-127,241),2).cut(box(88,62,49,(0,-127,237.5)))
cover=cover.cut(box(90,12,42,(0,-96,235))) # open front at carrier bracket
for xx in [-30,-15,0,15,30]: cover=cover.cut(box(5,40,8,(xx,-127,265),2))
register('A08','Эскизный кожух привода',cover,color=LIGHT,notes='Съемный компоновочный кожух; крепление и охлаждение уточнить после выбора привода.')
# Cover is supplied but intentionally not in the open assembly preview.

# Exchangeable stop, radial holes accept M3. One shape placed twice.
stop=sector_x(37,51,175,185,9.4,86)
for rr in [41,48]: stop=xhole(stop,1.7,0,rr)
register('A09','Сменный механический упор',stop,qty=2,color=ORANGE,
         notes='Один тип упора; перестановка по отверстиям 0/30/60/90/120°. Требует проверки прочности и угла контакта.')
instance('A09',stop.rotate((0,0,0),(1,0,0),9),name='A09_extension')
instance('A09',stop.rotate((0,0,0),(1,0,0),-(P['assembled_flexion_stop']+9)),name='A09_flexion')

ret=cyl(17,2,(74.6,0,0),(1,0,0)).cut(cyl(7.5,2,(74.6,0,0),(1,0,0)))
for yy in [-14,14]: ret=xhole(ret,1.7,yy,0)
register('A10','Кольцо удержания наружной обоймы',ret,qty=2,color=DARK,notes='2 одинаковых кольца; M3; не заменяют осевые металлические дистанционные втулки.')
instance('A10',name='A10_inner',group='moving')
instance('A10',ret.translate((18.8,0,0)),name='A10_outer',group='moving')

# Distal M5 tensioner: printed housing + metal screw / eyelet to be specified.
anchor=box(36,20,34,(22,-80,-248),2)
anchor=anchor.cut(box(14,12,20,(22,-80,-247),2))
anchor=anchor.cut(cyl(2.75,38,(22,-80,-268)))
for xx in [14,30]: anchor=anchor.cut(cyl(1.7,26,(xx,-94,-248),(0,1,0)))
register('A11','Корпус регулировки троса M5',anchor,color=ORANGE,
         notes='Модель корпуса. Резьба, металлический коуш, гайки и разгрузка оболочки подбираются отдельно.')
instance('A11',group='moving')

sensor=box(40,25,14,(0,0,0),2).cut(box(30,15,8.1,(0,0,3.05)))
sensor=sensor.cut(cyl(2,48,(-24,0,0),(1,0,0)))
for xx in [-16,16]: sensor=sensor.cut(cyl(1.7,20,(xx,0,-10)))
register('A12','Опциональный карман тензодатчика',sensor,color=TEAL,
         notes='Внутренняя полость 30×15×8; не включен в силовую цепь, модель датчика отсутствует.')

# A13/A14: articulated guard element and lid; the continuous tube closes the gaps.
link=box(20.6,3,12,(0,-4.5,0),1)
for sg in [-1,1]:
    link=link.fuse(box(3,12,12,(sg*5.5,0,0),1))
    link=link.fuse(box(3,8,8,(sg*8.8,0,7)))
    link=link.fuse(cyl(4,3,(sg*8.8-1.5,0,10),(1,0,0)))
    link=link.fuse(cyl(4,3,(sg*5.5-1.5,0,-10),(1,0,0)))
    link=link.fuse(box(3,6,6,(sg*5.5,0,-6)))
for xx in [-8.5,8.5]:
    link=link.fuse(box(6,12,10,(xx,0,0),1))
    link=link.cut(cyl(1.7,20,(xx,-10,0),(0,1,0)))
for zz in [-10,10]: link=xhole(link,1.7,0,zz,x=-12,length=24)
register('A13','Звено шарнирной защиты троса',link,qty=5,color=DARK,
         notes='Шаг 20 мм; боковые оси M3; внутренний просвет 8 мм; зазор в шарнире 0.3 на сторону. Стендовый образец.')
lid=box(23,3,12,(0,7.5,0),1)
for xx in [-8.5,8.5]: lid=lid.cut(cyl(1.7,8,(xx,4,0),(0,1,0)))
register('A14','Крышка звена защиты',lid,qty=5,color=TEAL,
         notes='Крышка на двух M3 через боковые бобышки; отдельно проверить удержание и щели между звеньями.')
for i,z in enumerate([40,20,0,-20,-40]):
    instance('A13',link.translate((22,-100,z)),name=f'A13_{i+1}',group='guard')
    instance('A14',lid.translate((22,-100,z)),name=f'A14_{i+1}',group='guard')

def guide(code,length,zcenter):
    s=cyl(5,length,(22,-100,zcenter-length/2)).cut(cyl(2.8,length,(22,-100,zcenter-length/2)))
    register(code,'Прямая защитная гильза '+str(length)+' мм',s,color=LIGHT,
             notes='Внутренний Ø5.6 под принятую PTFE трубку Ø5. Не силовой упор оболочки; крепления пока не рассчитаны.')
    instance(code,group='guard')
guide('A15',140,130)
guide('A16',160,-140)

# Fit coupon: bearing diameters and screw holes for an actual printer calibration.
coupon=box(110,36,10,(0,0,5),2)
for xx,dd in [(-38,22.00),(-10,22.05),(18,22.10)]:
    coupon=coupon.cut(cyl(dd/2,7,(xx,0,3)))
    coupon=coupon.cut(cyl(4.1,12,(xx,0,-1)))
for yy,dd in [(-10,3.4),(0,4.0),(10,5.5)]: coupon=coupon.cut(cyl(dd/2,12,(44,yy,-1)))
register('A17','Калибр посадок 608 и отверстий',coupon,color=ORANGE,
         notes='Карманы слева направо Ø22.00/22.05/22.10, глубина 7; отверстия 3.4/4.0/5.5. Печатать первым.')

# Purchased/reference geometry. Do not print these parts.
bear=cyl(11,7,(76.6,0,0),(1,0,0)).cut(cyl(4,7,(76.6,0,0),(1,0,0)))
register('R01','Подшипник 608 габарит',bear,qty=2,color=STEEL,kind='purchased',notes='8×22×7; кольца показаны упрощенно, без шариков.')
instance('R01',name='R01_a',group='moving')
instance('R01',bear.translate((9.8,0,0)),name='R01_b',group='moving')
shaft=cyl(4,48,(70,0,0),(1,0,0))
register('R02','Стальная ось Ø8 габарит',shaft,color=STEEL,kind='purchased',notes='Упрощенный гладкий стержень. М8 резьба, головка и гайка не моделировались; гладкая шейка в подшипниках.')
instance('R02')
spacer=cyl(6,2.8,(83.6,0,0),(1,0,0)).cut(cyl(4.1,2.8,(83.6,0,0),(1,0,0)))
register('R03','Межопорная металлическая втулка',spacer,color=STEEL,kind='purchased',notes='Ø12/Ø8.2×2.8; проверить по внутренним кольцам выбранного 608.')
instance('R03',group='moving')
spacer2=cyl(6,2.6,(93.4,0,0),(1,0,0)).cut(cyl(4.1,2.6,(93.4,0,0),(1,0,0)))
register('R04','Наружная металлическая втулка',spacer2,color=STEEL,kind='purchased')
instance('R04')
motor=cyl(P['motor_envelope_diameter_assumed']/2,P['motor_envelope_length_assumed'],(-35,-127,234),(1,0,0))
register('R05','Условный объем мотор редуктора',motor,color=STEEL,kind='reference',notes='Ø36×70 принято автором; не спецификация привода.')
instance('R05')
tube=cyl(2.5,440,(22,-100,-220)).cut(cyl(1.5,440,(22,-100,-220)))
register('R06','PTFE трубка габарит прямой участок',tube,color=ORANGE,kind='reference',notes='Ø5/Ø3; условная прямая трасса, концевые участки и радиусы изгиба не разработаны.')
instance('R06',group='guard')

def assembly(name,angle=0,include_guard=True):
    a=cq.Assembly(name=name)
    for i in INST:
        if i['group']=='guard' and not include_guard: continue
        s=i['shape']
        if i['group']=='moving' and angle: s=s.rotate((0,0,0),(1,0,0),-angle)
        a.add(s,name=i['name'],color=cq.Color(*PARTS[i['code']]['color']))
    return a

if __name__=='__main__':
    report=[]
    for code,p in PARTS.items():
        shape=p['shape']; b=shape.BoundingBox()
        cq.exporters.export(shape,str(ROOT/'STEP'/f'{code}.step'))
        stl_info=None
        if p['kind']=='printed':
            # Normalize as a separate part; choose the thinnest box dimension as Z.
            lens=[b.xlen,b.ylen,b.zlen]; thin=lens.index(min(lens))
            stl=shape
            if thin==0: stl=stl.rotate((0,0,0),(0,1,0),90)
            elif thin==1: stl=stl.rotate((0,0,0),(1,0,0),90)
            bb=stl.BoundingBox()
            stl=stl.translate((-(bb.xmin+bb.xmax)/2,-(bb.ymin+bb.ymax)/2,-bb.zmin))
            cq.exporters.export(stl,str(ROOT/'STL'/f'{code}.stl'),tolerance=.07,angularTolerance=.10)
            clean_stl(ROOT/'STL'/f'{code}.stl')
            stl_info={'z_axis_from': 'XYZ'[thin], 'note':'CAD orientation only; review support and strength before slicing'}
        report.append({'code':code,'name':p['name'],'quantity':p['qty'],'kind':p['kind'],
                       'valid_brep':shape.isValid(),'solids':len(shape.Solids()),
                       'volume_cm3':round(shape.Volume()/1000,3),
                       'bounding_box_mm':[round(b.xlen,3),round(b.ylen,3),round(b.zlen,3)],
                       'stl_transform':stl_info,'notes':p['notes']})
    a=assembly('Orthosis_V01_LAYOUT_0deg')
    a.save(str(ROOT/'Orthosis_V01_assembly.step'))
    a.save(str(ROOT/'Orthosis_V01_assembly.glb'))
    assembly('Orthosis_V01_STRUCTURAL_90deg',90,False).save(str(ROOT/'Orthosis_V01_structural_90deg.step'))
    (ROOT/'checks'/'geometry.json').write_text(json.dumps(report,ensure_ascii=False,indent=2))
    (ROOT/'checks'/'fillets.json').write_text(json.dumps(FILLET_LOG,ensure_ascii=False,indent=2))
    with (ROOT/'BOM.csv').open('w',encoding='utf-8-sig',newline='') as f:
        w=csv.writer(f,delimiter=';');w.writerow(['Код','Наименование','Количество','Тип','Объем 1 детали см3','X мм','Y мм','Z мм','Примечание'])
        for p in report: w.writerow([p['code'],p['name'],p['quantity'],p['kind'],p['volume_cm3'],*p['bounding_box_mm'],p['notes']])
    print('EXPORTED',len(PARTS),'types;',len(INST),'instances',flush=True)
