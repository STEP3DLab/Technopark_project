"""Print-size fixed paper protractor for D01, zero toward +Y."""
from math import cos, radians, sin
from pathlib import Path
from xml.sax.saxutils import escape

OUT = Path(__file__).resolve().parent / "angle_dial.svg"
drawing=['<svg xmlns="http://www.w3.org/2000/svg" width="100mm" height="88mm" viewBox="0 0 100 88">',
         '<title>Ручной стенд B04. Неподвижная бумажная шкала. Масштаб 1:1</title>',
         '<rect width="100" height="88" fill="white"/>',
         '<g font-family="Arial, sans-serif" fill="#152c35" text-anchor="middle">']
def txt(x,y,s,size=2.4,weight='normal'):
    drawing.append(f'<text x="{x:.3f}" y="{y:.3f}" font-size="{size}" font-weight="{weight}">{escape(s)}</text>')
def line(x1,y1,x2,y2,width=.22,color='#182d36'):
    drawing.append(f'<line x1="{x1:.3f}" y1="{y1:.3f}" x2="{x2:.3f}" y2="{y2:.3f}" stroke="{color}" stroke-width="{width}"/>')
def circle(radius,color,width,extra=''):
    drawing.append(f'<circle cx="50" cy="36" r="{radius}" fill="none" stroke="{color}" stroke-width="{width}" {extra}/>')
def polar(r,angle):
    a=radians(angle)
    return 50-r*sin(a),36-r*cos(a)
txt(50,4.7,'B04   /   ШКАЛА РУЧНОГО ПРОГОНА',3.1,'bold')
circle(28,'#182d36',.2)
circle(10.3,'#182d36',.2)
for deg in range(-150,151,5):
    major=deg%30==0
    color='#92a0a2' if abs(deg)>120 else '#182d36'
    line(*polar(25.2 if major else 26.6,deg),*polar(27.55,deg),.35 if major else .15,color)
    if major and abs(deg)<=120:
        x,y=polar(22.7,deg)
        txt(x,y+.8, ('+' if deg>0 else '')+str(deg)+'°',2.2,'bold')
for deg in (-90,0,90):
    line(*polar(17.7,deg),*polar(19.8,deg),.4)
txt(50,35.8,'ВЫРЕЗАТЬ',2.25)
txt(50,39,'Ø20,6',2.1)
txt(50,56,'B04 / V04',2.3)
txt(50,59,'ВИД СВЕРХУ',1.8)
txt(50,69,'Направляющие справа (+X). Ноль сверху (+Y).',2.6)
txt(50,73,'Печать 100%. Вырезать оба контура и надеть на стойку до установки ротора.',2.15)
line(25,80,75,80,.32)
line(25,78.8,25,81.2,.3)
line(75,78.8,75,81.2,.3)
txt(50,85,'Контроль масштаба   ·   50,0 мм',2.3,'bold')
drawing.extend(['</g>','</svg>'])
OUT.write_text('\n'.join(drawing)+'\n')
