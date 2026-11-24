"""Generate the original editable textile design and its one-sheet A3 printing master.

The output is a modern stylisation drawn for the Belarus panel, not a facsimile
of a named historical sash. Run with Inkscape, ReportLab and PyMuPDF installed.
"""
from pathlib import Path
from tempfile import TemporaryDirectory
import math
import numpy as np
import contourpy
from PIL import Image, ImageFilter
from shapely.geometry import LineString
import subprocess
import fitz
from reportlab.lib import colors
from reportlab.lib.pagesizes import A3, landscape
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen.canvas import Canvas

ROOT = Path(__file__).resolve().parents[1]
PRINT = ROOT / 'print'
PRINT.mkdir(exist_ok=True)


def trace_woven_field():
    """Trace the flower field of the approved artwork as editable ink-colour paths."""
    crop = Image.open(ROOT/'source/sash-ornament-reference.png').convert('RGB')
    clean = crop.filter(ImageFilter.MedianFilter(3)).filter(ImageFilter.GaussianBlur(.47))
    indexed = clean.quantize(colors=19, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE)
    colors = np.array(indexed.getpalette()[:57]).reshape(-1,3)
    grid = np.array(indexed)
    w,h = indexed.size
    body = [f'<g id="approved-floral-weave" transform="translate(148 49) scale({3104/w:.7f} {282/h:.7f})" fill-rule="evenodd">']
    color_order = np.argsort(-np.bincount(grid.ravel(), minlength=len(colors)))
    for index in color_order:
        color = '#%02x%02x%02x'%tuple(colors[index])
        if not np.any(grid == index):
            continue
        segments = contourpy.contour_generator(z=np.pad((grid==index).astype(float),1)).lines(.5)
        contours=[]
        for segment in segments:
            ring=LineString(segment-1).simplify(.28)
            xy = np.array(ring.coords)[:-1]
            if len(xy) < 3:
                continue
            contours.append('M'+'L'.join(f'{x:.1f},{y:.1f}' for x,y in xy)+'Z')
        body.append(f'<path fill="{color}" d="{"".join(contours)}"/>')
    body.append('</g>')
    return ''.join(body)


def svg_sash():
    out=['''<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 3400 380" width="340mm" height="38mm">
<title>Цветочная полоса — стилизация по мотивам слуцкого пояса</title>
<defs>
<linearGradient id="gold" x2="0" y2="1" gradientUnits="objectBoundingBox" gradientTransform="scale(1 1)">
  <stop stop-color="#bf873d"/><stop offset=".3" stop-color="#d4ad63"/><stop offset=".63" stop-color="#c89c50"/><stop offset="1" stop-color="#c29043"/>
</linearGradient>
<pattern id="threads" width="5" height="5" patternUnits="userSpaceOnUse"><path d="M0 1L5 0 M0 4L5 3" fill="none" stroke="#f6dda3" stroke-width=".65" opacity=".35"/><path d="M1 0V5" stroke="#60402b" stroke-width=".4" opacity=".37"/></pattern>
<pattern id="chain" width="18" height="12" patternUnits="userSpaceOnUse"><path d="M0 6L4 3L9 6L13 9L18 6 M0 6L4 9L9 6L13 3L18 6" stroke="#f2cc80" stroke-width="2.1" fill="none"/></pattern>
<pattern id="braid" width="21" height="18" patternUnits="userSpaceOnUse"><path d="M-5 18L13 0 M5 18L23 0 M15 18L33 0" stroke="#bd8036" stroke-width="7"/><path d="M-5 18L13 0 M5 18L23 0 M15 18L33 0" stroke="#f2ca79" stroke-width="3"/><path d="M-2 18L16 0 M8 18L26 0" stroke="#fff0b0" stroke-width=".7"/></pattern>
</defs>''']
    # Tassel threads. Each strand forms a near-catenary curve with a twisted highlight.
    for side in (0,1):
        out.append('<g id="fringe-%d" transform="%s">'%(side, 'translate(3400 0) scale(-1 1)' if side else ''))
        for i in range(58):
            y=39+i*5.3
            tip=4+15*(.5+.5*math.sin(i*2.39)) + (10 if i in (0,1,56,57) else 0)
            lift=27*((i-28.5)/28.5)+4*math.sin(i*1.77)
            col=['#bb873d','#d7a759','#f1cd87','#a77636','#e0b86c'][i%5]
            p=f'M109 {y:.1f} C78 {y+2*math.sin(i):.1f},38 {y+lift*.7+5*math.sin(i*.82):.1f},{tip:.1f} {y+lift:.1f}'
            out.append(f'<path d="{p}" fill="none" stroke="{col}" stroke-width="4.7" stroke-linecap="round"/>')
        out.append('</g>')
    out.append('''<g id="woven-body">
<rect x="92" y="24" width="3216" height="332" rx="4" fill="#aa793e"/>
<rect x="96" y="24" width="3208" height="332" rx="3" fill="url(#gold)" stroke="#69493c" stroke-width="3"/>
<rect x="108" y="34" width="3184" height="312" fill="none" stroke="#714241" stroke-width="8"/>
<rect x="108" y="34" width="3184" height="312" fill="none" stroke="#e0ae60" stroke-width="2" stroke-dasharray="4 5"/>
<rect x="124" y="45" width="3152" height="290" fill="none" stroke="#354e58" stroke-width="7"/>
<rect x="125" y="46" width="3150" height="288" fill="none" stroke="#e4c383" stroke-width="2" stroke-dasharray="7 6"/>
<rect x="142" y="53" width="3116" height="274" fill="none" stroke="#a34342" stroke-width="4"/>
''')
    out.append(trace_woven_field())
    out.append('''<rect x="94" y="24" width="3212" height="332" fill="url(#threads)"/>
<g id="selvage">
<path d="M119 29H3280 M119 351H3280" stroke="#f0c77e" stroke-width="6" stroke-dasharray="6 4 2 3"/>
<rect x="91" y="22" width="21" height="336" rx="4" fill="url(#braid)" stroke="#ab7834" stroke-width="2"/>
<rect x="3288" y="22" width="21" height="336" rx="4" fill="url(#braid)" stroke="#ab7834" stroke-width="2"/>
</g></g></svg>''')
    return '\n'.join(out)


def make_pdf(vector_pdf, out_path):
    with TemporaryDirectory() as tmp:
        bg=Path(tmp)/'bg.pdf'
        c=Canvas(str(bg), pagesize=landscape(A3))
        c.setTitle('Орнаментальная полоса — печатный оригинал, А3, 1:1')
        pdfmetrics.registerFont(TTFont('DV','/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'))
        pdfmetrics.registerFont(TTFont('DVB','/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'))
        def label(x,y,s,font='DV',size=10,color='#2d382d'):
            c.setFont(font,size);c.setFillColor(colors.HexColor(color));c.drawString(x*mm,y*mm,s)
        label(32,258,'Орнаментальная полоса','DVB',24)
        label(32,246,'Панно «Беларусь»  /  Стилизация по мотивам слуцкого пояса  /  A3 · 1:1',size=10)
        # Registration ticks are outside the 340 × 38 mm image.
        c.setLineWidth(.35);c.setStrokeColor(colors.HexColor('#595f54'))
        for x in [40,380]:
            for y in [139,177]:
                v=-1 if y==139 else 1
                u=-1 if x==40 else 1
                c.line((x+u*1.5)*mm,y*mm,(x+u*4.5)*mm,y*mm)
                c.line(x*mm,(y+v*1.5)*mm,x*mm,(y+v*4.5)*mm)
        label(40,114,'Габарит макета с бахромой — 340 × 38 мм. Напечатайте в масштабе 100%.','DVB',11)
        label(40,104,'Для полноцветного переноса используйте белый матовый полиэфирный сатин. Файл дан в прямом чтении.')
        label(40,95,'Зеркальное отражение для перевода на ткань при необходимости задаёт мастерская в программе печати.')
        label(40,86,'При тканой отделке выведите центральную часть длиной 320 мм и добавьте по 10 мм настоящей бахромы.')
        label(40,77,'На макете оставлен прозрачный фон. Вариант для бумажной вставки — вырезать по внешнему контуру.')
        c.setLineWidth(.7);c.line(40*mm,48*mm,90*mm,48*mm)
        for x in [40,90]:c.line(x*mm,46.5*mm,x*mm,49.5*mm)
        label(40,38,'Контрольный отрезок 50 мм',size=9)
        c.showPage();c.save()
        doc=fitz.open(bg); layer=fitz.open(vector_pdf); page=doc[0]
        unit=72/25.4
        rect=fitz.Rect(40*unit,(297-177)*unit,380*unit,(297-139)*unit)
        page.show_pdf_page(rect,layer,0,overlay=True)
        doc.save(out_path,garbage=4,deflate=True)
        doc.close();layer.close()


if __name__=='__main__':
    svg=PRINT/'sash.svg'
    svg.write_text(svg_sash())
    with TemporaryDirectory() as tmp:
        temp_pdf=Path(tmp)/'vector.pdf'
        subprocess.run(['inkscape',str(svg),'--export-text-to-path',f'--export-filename={temp_pdf}'],check=True)
        png=PRINT/'sash-texture.png'
        subprocess.run(['inkscape',str(svg),'--export-width=2550',f'--export-filename={png}'],check=True)
        make_pdf(temp_pdf,PRINT/'sash-1to1.pdf')
