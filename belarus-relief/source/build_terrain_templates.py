"""Vector mounting drawings, in true dimensions; no rasterisation."""
import json
from pathlib import Path
from xml.etree import ElementTree as ET

import numpy as np
from reportlab.pdfgen.canvas import Canvas
from reportlab.lib.pagesizes import A4, landscape
from reportlab.lib.units import mm
from reportlab.lib import colors
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont

BASE = Path(__file__).resolve().parents[1]
DEST = BASE / "templates"
DX, DY = 30.3, 65.0
REGIONS = {"brest": (91, 33), "grodno": (77, 127), "vitebsk": (209, 266),
           "minsk": (160, 139), "mogilev": (272, 143), "gomel": (232, 53)}
NAMES = {"brest": "Брест", "grodno": "Гродно", "vitebsk": "Витебск",
         "minsk": "Минск", "mogilev": "Могилёв", "gomel": "Гомель"}


def register_fonts():
    if "Mounting" in pdfmetrics.getRegisteredFontNames():
        return
    from matplotlib import get_data_path
    path = Path(get_data_path()) / "fonts/ttf/DejaVuSans.ttf"
    pdfmetrics.registerFont(TTFont("Mounting", path))


class Geometry:
    """A common, physical-coordinate drawing program for PDF and SVG."""
    def __init__(self):
        self.objects = []

    def path(self, points, stroke="#25372e", width=.21, closed=False, dashed=False):
        self.objects.append(("path", points, stroke, width, closed, dashed))

    def rect(self, x, y, w, h, stroke="#49544b", width=.19, dashed=False):
        self.path([(x,y),(x+w,y),(x+w,y+h),(x,y+h)], stroke, width, True, dashed)

    def text(self, x, y, value, size=2.3, color="#465445"):
        self.objects.append(("text",x,y,value,size,color))

    def cross(self, x, y, stroke="#8e362a", span=2.1):
        self.path([(x-span,y),(x+span,y)],stroke,.18)
        self.path([(x,y-span),(x,y+span)],stroke,.18)

    def draw_pdf(self, canvas):
        for kind,*args in self.objects:
            if kind == "text":
                x,y,s,size,col=args
                canvas.setFillColor(colors.HexColor(col))
                canvas.setFont("Mounting",size)
                canvas.drawCentredString(x,y,s)
                continue
            points,col,width,closed,dashed=args
            canvas.setStrokeColor(colors.HexColor(col));canvas.setLineWidth(width)
            canvas.setDash([1.1,.8] if dashed else [])
            path=canvas.beginPath()
            path.moveTo(*points[0])
            for point in points[1:]: path.lineTo(*point)
            if closed: path.close()
            canvas.drawPath(path)
        canvas.setDash([])

    def save_svg(self, fname):
        el=ET.Element("svg",{"xmlns":"http://www.w3.org/2000/svg","width":"420mm","height":"390mm","viewBox":"0 0 420 390"})
        for kind,*args in self.objects:
            if kind=="text":
                x,y,s,size,col=args
                item=ET.SubElement(el,"text",{"x":f"{x:.3f}","y":f"{390-y:.3f}","text-anchor":"middle","font-size":str(size),"font-family":"DejaVu Sans, sans-serif","fill":col});item.text=s
                continue
            pts,col,width,closed,dashed=args
            item=ET.SubElement(el, "polygon" if closed else "polyline",{"points":" ".join(f"{x:.3f},{390-y:.3f}" for x,y in pts),"fill":"none","stroke":col,"stroke-width":str(width)})
            if dashed: item.set("stroke-dasharray","1.1 .8")
        ET.ElementTree(el).write(fname,encoding="utf-8",xml_declaration=True)


def geometry(regions):
    g=Geometry()
    g.rect(.12,.12,419.76,389.76,"#282d2b",.24)
    g.rect(5,5,410,380,"#697268",.19,True)
    g.rect(40,12,340,38,"#8e362a",.28,True)
    g.text(210,31,"ЛЕНТА / 340 × 38 мм",3.1,"#7d3328")
    g.text(210,24,"Середина тесьмы по оси задника",2.4)
    for r in regions:
        p=np.array(r["outline"])+[DX,DY]
        g.path(p,"#23392b",.23,True)
        px,py=REGIONS[r["id"]];g.text(DX+px,DY+py,r["name"].replace(" область",""),3.1)
    seats=json.loads((BASE/"source/decor_seats.json").read_text())
    for s in seats:
        x,y=s["x"]+DX,s["y"]+DY
        if s["shape"]=="circle":
            g.cross(x,y,"#823d32",2.2)
            t=np.linspace(0,2*np.pi,65);r=s["radius"]
            g.path(np.c_[x+r*np.cos(t),y+r*np.sin(t)],"#936458",.14,True,True)
        else:
            g.rect(s["xmin"]+DX,s["ymin"]+DY,s["xmax"]-s["xmin"],s["ymax"]-s["ymin"],"#966b5d",.13,True)
            g.text(x,y-.9,NAMES[s["region"]],2.3,"#764c39")
    bison=np.asarray(json.loads((BASE/"source/bison_outline_mm.json").read_text()))+[DX+77.5,DY+57.0]
    g.path(bison,"#75503d",.2,True,True)
    g.text(DX+102,DY+68,"Зубр",2.6,"#704b3e")
    # A true 50 mm gauge clear of the map.
    g.path([(23,365),(73,365)],"#2f3e33",.26)
    for x in [23,33,43,53,63,73]:
        g.path([(x,363.2),(x,366.8)],"#2f3e33",.23)
    g.text(48,369,"50 мм",2.5)
    for x,y in [(210,4),(210,386),(4,195),(416,195)]:
        g.cross(x,y,"#52594e",1.6)
    return g


def text_mm(c,x,y,s,size=3.,color="#26382b"):
    c.setFillColor(colors.HexColor(color));c.setFont("Mounting",size);c.drawString(x,y,s)


def make_templates(regions, seats=None):
    DEST.mkdir(exist_ok=True,parents=True);register_fonts()
    g=geometry(regions)
    g.save_svg(DEST/"assembly-1to1.svg")
    pdf=Canvas(str(DEST/"assembly-1to1.pdf"),pagesize=(460*mm,430*mm),pageCompression=1)
    pdf.setTitle("Монтажный шаблон 1:1 — задник 420 × 390 мм")
    pdf.scale(mm,mm)
    text_mm(pdf,20,419,"Беларусь / Монтажный шаблон",4)
    text_mm(pdf,20,413,"Размер задника 420 × 390 мм. Единицы — миллиметры. Печать 100 %, контрольный отрезок 50 мм.",2.55)
    pdf.saveState();pdf.translate(20,18);g.draw_pdf(pdf);pdf.restoreState()
    text_mm(pdf,20,10,"Сплошная линия — граница детали. Пунктир — проём, лента и зоны декора. Крест в круге — центр звезды.",2.5)
    pdf.showPage();pdf.save()
    a4=Canvas(str(DEST/"assembly-a4.pdf"),pagesize=landscape(A4),pageCompression=1)
    a4.setTitle("Монтажный шаблон 1:1 — 4 листа A4")
    # x overlap 20 mm, y overlap 10 mm; physical margins 10 mm left, 5 mm top/bottom.
    for letter,ox,oy in [("A1",0,190),("A2",200,190),("B1",0,0),("B2",200,0)]:
        a4.saveState();a4.scale(mm,mm)
        a4.saveState()
        clip=a4.beginPath();clip.rect(10,5,220,200);a4.clipPath(clip,stroke=0,fill=0)
        a4.translate(10-ox,5-oy);g.draw_pdf(a4)
        marks=Geometry()
        # Both overlapping sheets contain the complete cross and its target ring.
        for x,y in [(210,15),(210,105),(210,195),(210,285),(210,375),(18,195),(107,195),(312,195),(402,195)]:
            marks.cross(x,y,"#8f3434",2.2)
            t=np.linspace(0,2*np.pi,24)
            marks.path(np.c_[x+1.1*np.cos(t),y+1.1*np.sin(t)],"#8f3434",.14,True)
        marks.draw_pdf(a4);a4.restoreState()
        x=237
        text_mm(a4,x,188,letter,8)
        text_mm(a4,x,179,"Монтажный шаблон",3.15)
        text_mm(a4,x,171,"Беларусь / 1:1",2.9)
        for i,line in enumerate(["A1   A2   /   верх","B1   B2   /   низ","","A4 горизонтально.","Печатать 100 %,","без подгонки.","","Совместите красные","кресты на просвет.","Нахлёст слева/справа","20 мм, по высоте 10 мм.","","Подрежьте край одного","листа по центрам меток.","Склейте листы сзади.","","Контроль 50 мм:"]):
            text_mm(a4,x,159-i*4.8,line,2.65)
        scale=Geometry();scale.path([(x,71),(x+50,71)],"#26382b",.28)
        for n in range(6):scale.path([(x+n*10,69),(x+n*10,73)],"#26382b",.22)
        scale.draw_pdf(a4)
        for i,line in enumerate(["Сплошные линии —","контуры областей.","Пунктир — проём,","лента и зоны декора.","Крест в круге внутри","карты — центр звезды.","","Задник 420 × 390 мм."]):
            text_mm(a4,x,60-i*4.9,line,2.55)
        a4.restoreState();a4.showPage()
    a4.save()
