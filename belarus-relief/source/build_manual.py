"""Generate the dimension drawing, Russian workshop booklet and assembly thumbnail."""
from pathlib import Path
import json, math, textwrap
from xml.sax.saxutils import escape
from io import BytesIO
from reportlab.pdfgen import canvas
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.lib.colors import HexColor
from reportlab.lib.utils import ImageReader
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.lib.styles import ParagraphStyle
from reportlab.platypus import Paragraph
from PIL import Image
from matplotlib import get_data_path

ROOT=Path(__file__).resolve().parents[1]
P=ROOT/'print'
P.mkdir(exist_ok=True)
font_dir=Path(get_data_path())/'fonts/ttf'
for name,file in [('Body','DejaVuSans.ttf'),('Strong','DejaVuSans-Bold.ttf'),('Display','DejaVuSerif.ttf')]:
    pdfmetrics.registerFont(TTFont(name,str(font_dir/file)))
ink='#24392f'; green='#284d3e'; muted='#57675e'; line='#bdcabf'; ochre='#996e3c'
def col(v): return HexColor(v)
def paragraph(c,text,x,y,w,size=10.5,leading=None,font='Body',color=ink):
    style=ParagraphStyle('p',fontName=font,fontSize=size,leading=leading or size*1.43,textColor=col(color),splitLongWords=1)
    p=Paragraph(escape(text),style);_,h=p.wrap(w,1000);p.drawOn(c,x,y-h);return y-h
def top(c,name,index):
    w,h=A4
    c.setFillColor(col(green));c.rect(0,h-14*mm,w,14*mm,fill=1,stroke=0)
    c.setFillColor(col('#ffffff'));c.setFont('Strong',9);c.drawString(15*mm,h-9*mm,'АТЛАС МАСТЕРСКОЙ  /  БЕЛАРУСЬ')
    c.setFont('Body',8.2);c.drawRightString(w-15*mm,h-9*mm,name)
    c.setStrokeColor(col(line));c.line(15*mm,15*mm,w-15*mm,15*mm)
    c.setFont('Body',8.2);c.setFillColor(col(muted));c.drawString(15*mm,10*mm,'Производственный проект  •  24.11.2026  •  размеры в мм')
    c.drawRightString(w-15*mm,10*mm,str(index))
def title(c,t,y=277*mm):
    return paragraph(c,t,15*mm,y,180*mm,22,28,'Display',green)-9
def small_title(c,t,y):
    return paragraph(c,t,15*mm,y,179*mm,13.5,17,'Strong',green)-4
def write_img(c,path,x,y,w,h):
    im=Image.open(path).convert('RGB');scale=min(w/im.width,h/im.height)
    sw,sh=im.width*scale,im.height*scale
    buf=BytesIO(); im.save(buf,'JPEG',quality=90,optimize=True); buf.seek(0)
    c.drawImage(ImageReader(buf),x+(w-sw)/2,y+(h-sh)/2,sw,sh)
def svg_frame():
    svg='''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 450 338" role="img"><rect width="450" height="338" rx="8" fill="#e9ede4"/><g fill="none" stroke="#365447" stroke-width="2"><rect x="77" y="52" width="273" height="255"/><rect x="89" y="64" width="249" height="231"/><path d="M77 52l12 12m249 0 12-12m0 255-12-12m-249 0-12 12"/></g><g fill="none" stroke="#a17e50" stroke-width="1.5"><rect x="86" y="61" width="255" height="237" stroke-dasharray="5 4"/><path d="M77 31H350m-273-6v12m273-12v12M367 52v255m-5-255h10m-10 255h10"/></g><g fill="#314e42" text-anchor="middle" font-family="sans-serif" font-size="17"><text x="212" y="24">450</text><text x="391" y="185">420</text><text x="213" y="160">Задник</text><text x="213" y="184" font-size="20">420 × 390</text><text x="213" y="212" font-size="14">световой проём 410 × 380</text></g></svg>'''
    (ROOT/'assets/frame.svg').write_text(svg)
def frame_pdf():
    c=canvas.Canvas(str(P/'frame.pdf'),pagesize=A4);c.setTitle('Рама и задник — раскрой')
    top(c,'РАСКРОЙ И СЕЧЕНИЕ',1); y=title(c,'Деревянная рама и задник')
    y=paragraph(c,'Размеры даны по готовой детали. Схемы без масштаба. Распил, выборку четверти и контрольную сухую сборку выполните до окраски.',15*mm,y,180*mm)
    x0,y0=28*mm,150*mm;s=.56
    cw,ch=450*s,420*s
    c.setStrokeColor(col(green));c.setLineWidth(1);c.setFillColor(col('#e0d1b6'));c.rect(x0,y0,cw,ch,fill=1)
    c.setFillColor(col('#fffefa'));c.rect(x0+20*s,y0+20*s,410*s,380*s,fill=1)
    for x,dx in [(x0,1),(x0+cw,-1)]:
        for yy,dy in [(y0,1),(y0+ch,-1)]:c.line(x,yy,x+dx*20*s,yy+dy*20*s)
    c.setDash(3,3);c.setStrokeColor(col(ochre));c.rect(x0+15*s,y0+15*s,420*s,390*s,fill=0);c.setDash()
    c.setFillColor(col(ink));c.setFont('Strong',11);c.drawCentredString(x0+cw/2,y0+ch/2+7,'Проём 410 × 380')
    c.setFont('Body',9);c.drawCentredString(x0+cw/2,y0+ch/2-10,'Пунктир — контур задника')
    def dimh(x1,x2,y,label):
        c.setStrokeColor(col(muted));c.line(x1,y,x2,y);c.line(x1,y-3,x1,y+3);c.line(x2,y-3,x2,y+3)
        c.setFont('Body',9);c.setFillColor(col(ink));c.drawCentredString((x1+x2)/2,y+4,label)
    dimh(x0,x0+cw,y0-12,'450')
    c.saveState();c.translate(x0-10,y0);c.rotate(90);dimh(0,ch,0,'420');c.restoreState()
    rx,ry=137*mm,186*mm;f=3
    v=[(0,0),(14,0),(14,9),(20,9),(20,20),(0,20)]
    path=c.beginPath()
    for i,(x,y) in enumerate(v):
        if i==0:path.moveTo(rx+f*x,ry+f*y)
        else:path.lineTo(rx+f*x,ry+f*y)
    path.close();c.setFillColor(col('#e0d1b6'));c.setStrokeColor(col(green));c.drawPath(path,fill=1)
    dimh(rx,rx+20*f,ry+20*f+9,'20');dimh(rx+14*f,rx+20*f,ry-9,'6')
    c.setFillColor(col(ink));c.setFont('Body',9);c.drawString(rx,ry-28,'Сечение рейки 20 × 20')
    c.drawString(rx,ry-42,'Четверть 6 × 9 с тыла')
    y=138*mm
    for name,body in [('Рейки','Две горизонтали 450 мм и две вертикали 420 мм по длинным наружным концам. Оба конца каждой детали под 45°. Чистовая длина 1740 мм. Заготовка 2000 мм покрывает пропилы и пробу.'),
    ('Основание','Фанера 420 × 390 × 6 мм. Тыльное окно четверти 422 × 392 мм. Номинальный зазор 1 мм на сторону проверяют с завёрнутым велюром. При толстой ткани уменьшите задник по результату сухой примерки.'),
    ('Монтажная система координат','Ноль — левый нижний угол задника при взгляде с лица. Световой проём от (5; 5) до (415; 385). Начало карты смещено на (30,3; 65). Габарит орнамента от (40; 12) до (380; 50), включая бахрому.'),
    ('Подвес','Уголки или шпонки укрепляют стыки рамки, поворотные фиксаторы держат задник. Два D-образных подвеса крепят к рейкам. Глубину сверления выбирают с учётом четверти и длины шурупа.')]:
        y=small_title(c,name,y);y=paragraph(c,body,15*mm,y,180*mm,9.7,14)-10
    if y<16*mm:raise ValueError(y)
    c.showPage();c.save()
def workbook():
    budget=json.loads((ROOT/'data/budget.json').read_text());work=json.loads((ROOT/'data/workshop.json').read_text());terrain=json.loads((ROOT/'data/terrain.json').read_text())
    c=canvas.Canvas(str(P/'workbook.pdf'),pagesize=A4);c.setTitle('Рельефная карта Беларуси — руководство мастерской')
    top(c,'ПАСПОРТ ИЗДЕЛИЯ',1);y=title(c,'Рельефная карта Беларуси')
    y=paragraph(c,'Утверждённый эскиз и рабочий маршрут изготовления одного панно.',15*mm,y,180*mm,11)
    write_img(c,ROOT/'assets/approved.webp',15*mm,102*mm,180*mm,145*mm)
    y=small_title(c,'Комплект перед началом работы',92*mm)
    for text in ['Карта 358 × 309 мм. Наружная рама 450 × 420 мм. Задник 420 × 390 × 6 мм. Готовая лента с бахромой 340 × 38 мм.',
    'FDM — шесть окрашиваемых областей. Фотополимер — зубр, шесть надписей, шесть звёзд. Всего 19 печатных изделий. Плоские площадки рассчитаны под комплект прилагаемых моделей.',
    'Начните с шаблона assembly-a4.pdf и пробной звезды. Файлы лежат в папках models, templates и print. Редактируемая калькуляция находится в downloads/specification.xlsx.']:
        y=paragraph(c,text,15*mm,y,180*mm,10,14)-6
    c.showPage();top(c,'РАЗМЕРЫ И МАТЕРИАЛЫ',2);y=title(c,'Спецификация печатных деталей')
    y=paragraph(c,'Размеры в мм. Ориентация областей при печати — общим плоским основанием на стол. Размеры по STL округлены до 0,1 мм.',15*mm,y,180*mm)-14
    for label,value in [('Деталь','X × Y × Z, мм')]+[(r['name'],' × '.join(('%0.1f'%u).replace('.',',') for u in r['dimensions_mm'])) for r in terrain['regions']]:
        c.setStrokeColor(col(line));c.line(15*mm,y+1,195*mm,y+1);c.setFillColor(col(ink));c.setFont('Body',10);c.drawString(17*mm,y-15,label);c.drawRightString(192*mm,y-15,value);y-=25
    y-=15
    for h,t in [('Звёзды и надписи','По одной звезде 17 мм для Минска и 14 мм для Гомеля, четыре по 12 мм для остальных городов. Базовая подложка каждого слова толщиной 0,65 мм, выступ букв 1,05 мм. Подложка в цвет области, буквы и зубр — патинированная бронза.'),
    ('Зубр и орнамент','Зубр 57,49 × 32,46 × 6,20 мм, мордой вправо, правее и выше надписи «Брест». Для орнамента — файл sash-1to1.pdf на А3. Бюджетное исполнение — печать по ткани, оригинал в SVG пригоден для подготовки других вариантов.'),
    ('Рельеф и посадки','Обобщённые относительные высоты получены из геометрии прежней модели STEP3DLab по данным Mapzen Terrain Tiles. База 4 мм и номинальный перепад 12 мм. После формирования монтажных площадок фактический верх регионов около 14,63 мм от задника. Звезда Бреста смещена на 4,5 мм к востоку, чтобы край луча лежал на детали.'),
    ('Шаблоны','assembly-a4.pdf — четыре листа A4, печатать 100%. assembly-1to1.pdf — мастер крупного формата. decor-placement.pdf — положение декора и подписи. frame.pdf — раскрой рейки и сечение четверти.')]:
        y=small_title(c,h,y);y=paragraph(c,t,15*mm,y,180*mm,9.7,14)-11
    c.showPage()
    for pair in range(4):
        top(c,'ТЕХНОЛОГИЧЕСКИЙ МАРШРУТ',3+pair);y=title(c,'Операции '+str(pair*2+1)+' и '+str(pair*2+2))
        for j,step in enumerate(work['steps'][pair*2:pair*2+2]):
            y=small_title(c,f'{pair*2+j+1:02d}  '+step['title'],y)
            y=paragraph(c,step['time']+'  •  '+step['tool'],15*mm,y,180*mm,9.1,13,'Body',muted)-8
            for k,action in enumerate(step['actions']):
                y=paragraph(c,str(k+1)+'. '+action,17*mm,y,177*mm,10,14.5)-5
            y=paragraph(c,'Контроль. '+step['check'],17*mm,y,177*mm,9.6,14,'Strong',green)-16
        if y<15*mm: raise ValueError((pair,y))
        c.showPage()
    top(c,'КАЛЬКУЛЯЦИЯ',7);y=title(c,'Расход и закупка')
    items=budget['items'];mat=sum(a['quantity']*a['unitPrice'] for a in items)
    buy=sum(math.ceil(a['quantity']/a['packQty']-1e-9)*a['packQty']*a['unitPrice'] for a in items)
    extra=sum(a['quantity']*a['unitPrice'] for a in budget['labor'])
    y=paragraph(c,f'Расход материалов и услуги около {mat:,.0f} ₽, закупка полных упаковок около {buy:,.0f} ₽. С учётом принятых ставок труда и оборудования полная себестоимость около {mat+extra:,.0f} ₽.'.replace(',',' '),15*mm,y,180*mm,11,16)-13
    for a in items:
        c.setStrokeColor(col(line));c.line(15*mm,y,195*mm,y)
        y-=4; yy=paragraph(c,a['name'],15*mm,y,116*mm,8.6,11.5)
        qty=('%.4f'%a['quantity']).rstrip('0').rstrip('.').replace('.',','); c.setFont('Body',8.7);c.setFillColor(col(ink));c.drawRightString(167*mm,y-9,qty+' '+a['unit']);c.drawRightString(195*mm,y-9,f"{a['quantity']*a['unitPrice']:.0f} ₽");y=min(yy,y-12)-4
    y-=7;y=small_title(c,'Планирование времени',y);y=paragraph(c,'Ручной труд 5–8 ч. Ориентир 2–3 календарных дня с сушкой и при наличии материалов. Печать на ткани у подрядчика может увеличить срок. Материалы считаются по расходу, полные упаковки — отдельная величина. Ставки условные, доставка отдельно. Готовый экземпляр физически ещё предстоит проверить.',15*mm,y,180*mm,9.8,14)
    c.showPage();c.save()

if __name__=='__main__':
    svg_frame();frame_pdf();workbook()
