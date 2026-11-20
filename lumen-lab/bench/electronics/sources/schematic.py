"""Generate an editable, self-contained KiCad 9 schematic and local library."""
from pathlib import Path
from uuid import uuid5, NAMESPACE_URL
import json
import re

OUT=Path(__file__).resolve().parents[1]
def uid(key):
    return str(uuid5(NAMESPACE_URL,'https://step3dlab.github.io/lumen-lab/lm04b/'+key))
ROOT=uid('sheet')
PICO_FP='LM04:Pico_RP2040_Two_20P_Sockets'
TERM_FP='LM04:Phoenix_MKDSN_1-5_3-5-08_1729131'
RES_FP='Resistor_THT:R_Axial_DIN0207_L6.3mm_D2.5mm_P7.62mm_Horizontal'
def q(text): return json.dumps(str(text),ensure_ascii=False)
def f(n): return f'{n:.4f}'.rstrip('0').rstrip('.') if n else '0'
def eff(size=1.27,hidden=False,align=''):
    return f'(effects(font(size {size} {size}))'+(f'(justify {align})' if align else '')+('(hide yes)' if hidden else '')+')'
def prop(name,value,x,y,hidden=False):
    return f'(property {q(name)} {q(value)} (at {f(x)} {f(y)} 0){eff(hidden=hidden)})'

pico_names=('GP0 GP1 GND GP2 GP3 GP4 GP5 GND GP6 GP7 GP8 GP9 GND GP10 GP11 GP12 GP13 GND GP14 GP15 '
            'GP16 GP17 GND GP18 GP19 GP20 GP21 GND GP22 RUN GP26_ADC0 GP27_ADC1 AGND GP28_ADC2 ADC_VREF 3V3_OUT 3V3_EN GND VSYS VBUS').split()
PICO=[(i,label,(-20.32 if i<=20 else 20.32),24.13-2.54*((i-1) if i<=20 else 40-i),0 if i<=20 else 180)
      for i,label in enumerate(pico_names,1)]
RES=[(1,'~',-5.08,0,0),(2,'~',5.08,0,180)]
TERM=[(1,'3V3',-10.16,5.08,0),(2,'DQ',-10.16,0,0),(3,'GND',-10.16,-5.08,0)]
META={
    'Pico-RP2040':('U',(-15.24,26.67,15.24,-26.67),PICO,PICO_FP,'https://datasheets.raspberrypi.com/pico/pico-datasheet.pdf'),
    'R':('R',(-2.54,.85,2.54,-.85),RES,RES_FP,''),
    'SensorTerminal':('J',(-5.08,7.62,5.08,-7.62),TERM,TERM_FP,'https://www.phoenixcontact.com/en-us/products/1729131'),
}
def symbol(name,prefix=''):
    ref,rect,pins,fp,url=META[name]
    x1,y1,x2,y2=rect
    nd=('(pin_names(offset .75)(hide yes))' if name=='R' else '(pin_names(offset .75))')
    parts=[f'(symbol {q(prefix+name)} {nd} (exclude_from_sim no)(in_bom yes)(on_board yes)',
           prop('Reference',ref,0,y1+3.81),prop('Value',name,0,y1+1.27),prop('Footprint',fp,0,0,True),prop('Datasheet',url,0,0,True),
           f'(symbol "{name}_0_1"(rectangle (start {f(x1)} {f(y1)})(end {f(x2)} {f(y2)})(stroke(width .254)(type default))(fill(type background))))',
           f'(symbol "{name}_1_1"']
    for num,lab,x,y,angle in pins:
        length=abs(x-x1) if angle==0 else abs(x-x2)
        parts.append(f'(pin passive line (at {f(x)} {f(y)} {angle})(length {f(length)})(name {q(lab)} {eff(.95)})(number "{num}" {eff(.9)}))')
    return '\n'.join(parts)+'))'

def wire(start,end,key):
    return f'(wire(pts(xy {f(start[0])} {f(start[1])})(xy {f(end[0])} {f(end[1])}))(stroke(width 0)(type default))(uuid "{uid(key)}"))'
def glabel(net,x,y,direction,key):
    angle=0 if direction==1 else 180
    return f'(global_label "{net}"(shape bidirectional)(at {f(x)} {f(y)} {angle}){eff(.95,align="left" if angle==0 else "right")}(uuid "{uid(key)}"))'
def annotation(text,x,y,size):
    return f'(text {q(text)} (exclude_from_sim no)(at {f(x)} {f(y)} 0){eff(size,align="left")}(uuid "{uid(text)}"))'

def instance(ref,name,value,x,y,netmap):
    _,rect,pins,fp,url=META[name];top=rect[1]
    one=[f'(symbol(lib_id "LM04:{name}")(at {f(x)} {f(y)} 0)(unit 1)(exclude_from_sim no)(in_bom yes)(on_board yes)(dnp no)(uuid "{uid(ref)}")',
         prop('Reference',ref,x,y-top-5.08),prop('Value',value,x,y-top-2.54),
         prop('Footprint',fp,x,y,True),prop('Datasheet',url,x,y,True)]
    external=[]
    for num,lab,px,py,angle in pins:
        one.append(f'(pin "{num}"(uuid "{uid(ref+"-"+str(num))}"))')
        wx,wy=x+px,y-py
        if num not in netmap:
            external.append(f'(no_connect (at {f(wx)} {f(wy)})(uuid "{uid("nc"+ref+str(num))}"))');continue
        dr=-1 if angle==0 else 1
        dx=7.62 if ref!='U1' or num not in (4,38) else 12.70
        ex=wx+dr*dx
        external.append(wire((wx,wy),(ex,wy),f'{ref}stub{num}'))
        external.append(glabel(netmap[num],ex,wy,dr,f'{ref}label{num}'))
    one.append(f'(instances(project "LM04B"(path "/{ROOT}"(reference "{ref}")(unit 1)))))')
    return '\n'.join(external+one)

def main():
    library='(kicad_symbol_lib(version 20241209)(generator "kicad_symbol_editor")(generator_version "9.0")\n'
    (OUT/'LM04.kicad_sym').write_text(library+'\n'.join(symbol(k) for k in META)+'\n)\n')
    (OUT/'sym-lib-table').write_text('(sym_lib_table(version 7)(lib(name "LM04")(type "KiCad")(uri "${KIPRJMOD}/LM04.kicad_sym")(options "")(descr "Local symbols")))\n')
    doc=[f'(kicad_sch(version 20250114)(generator "eeschema")(generator_version "9.0")(uuid "{ROOT}")(paper "A4")',
         '(title_block(title "LM-04B / USB thermometer")(rev "B")(company "Lumen Lab | RGSU"))',
         '(lib_symbols'+'\n'.join(symbol(n,'LM04:') for n in META)+')',
         annotation('LM-04B   •   Двухканальный USB-термометр',24.13,25.4,2.54),
         annotation('Шины данных раздельные. Оба датчика питаются от выхода 3V3 платы Pico.',24.13,33.02,1.52),
         annotation('Каналы T1 / T2  ·  внешние DS18B20+ в корпусе TO-92',123.19,45.72,1.6),
         instance('U1','Pico-RP2040','Raspberry_Pi_Pico_RP2040',63.5,86.36,{4:'DQ1',5:'DQ2',36:'3V3',38:'GND'}),
         instance('R1','R','4.7k',147.32,66.04,{1:'3V3',2:'DQ1'}),
         instance('R2','R','4.7k',147.32,102.87,{1:'3V3',2:'DQ2'}),
         instance('J2','SensorTerminal','T1',214.63,66.04,{1:'3V3',2:'DQ1',3:'GND'}),
         instance('J3','SensorTerminal','T2',214.63,102.87,{1:'3V3',2:'DQ2',3:'GND'}),
         annotation('J2.1 / J3.1 → VDD (вывод 3)     ·     J2.2 / J3.2 → DQ (вывод 2)     ·     J2.3 / J3.3 → GND (вывод 1)',24.13,132.08,1.45),
         annotation('U1 устанавливается в две гнездовые колодки 1 × 20. Крестами обозначены выводы без соединений на носителе.',24.13,141.0,1.3),
         '(sheet_instances(path "/"(page "1")))(embedded_fonts no))']
    (OUT/'LM04B.kicad_sch').write_text('\n'.join(doc)+'\n')

if __name__=='__main__':main()
