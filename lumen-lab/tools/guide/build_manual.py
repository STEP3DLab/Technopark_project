"""Generate the LM-04 guide and UTF-8 bill of materials from the released CAD files.

Run with Python 3.11+ and cadquery, numpy, Pillow and reportlab installed:
    python tools/guide/build_manual.py
The script reads the assembly STEP and print-oriented STLs from dist/kit.
"""
import csv
import math
from pathlib import Path
import struct
import json

import cadquery as cq
import numpy as np
from OCP.Bnd import Bnd_Box
from OCP.BRepBndLib import BRepBndLib
from panel import panel_sheet
from drawings import draw_projection, place_image, render_mesh, shape_mesh, visible_edges
from layout import Manual, INK, SOFT, MINT, LINE, PAPER, TEAL, TINT

ROOT = Path(__file__).resolve().parents[2]
KIT = ROOT / "dist" / "kit" if (ROOT / "dist" / "kit").exists() else ROOT / "kit"
DOCS = KIT / "docs"
SPECS = (
    ("01", "base", "Основание", "01-base", 1, "#434E50"),
    ("02", "housing", "Корпус", "02-housing", 1, "#EEEDE5"),
    ("03", "panel", "Лицевая панель", "03-panel", 1, "#344143"),
    ("04", "screen", "Вставка экрана", "04-screen", 1, "#2E3A3F"),
    ("05", "marker", "Метка канала", "05-marker", 4, "#6FDEC0"),
)
COLORS = {rec[1]: rec[-1] for rec in SPECS}
COLORS["screw"] = "#939D9D"
NORMAL = np.array([0., -math.sin(math.radians(20)), math.cos(math.radians(20))])


def number(value, digits=1):
    return f"{value:.{digits}f}".rstrip("0").rstrip(".").replace(".", ",")


def mm_box(values):
    return " × ".join(number(n) for n in values)


def stl_limits(path):
    data = path.read_bytes()
    nfaces = struct.unpack_from("<I", data, 80)[0] if len(data) >= 84 else 0
    if len(data) == 84 + 50 * nfaces and nfaces:
        records = np.ndarray(shape=(nfaces,), dtype=[("normal", "<f4", 3), ("tri", "<f4", (3,3)),
                                                       ("attribute", "<u2")], buffer=data, offset=84)
        vertices = records["tri"].reshape(-1, 3)
    else:
        vertices = np.array([[float(n) for n in line.split()[1:]] for line in
                             data.decode("ascii").splitlines() if line.strip().startswith("vertex ")])
    if vertices.size == 0:
        raise ValueError(f"Empty STL: {path}")
    return vertices.min(axis=0), vertices.max(axis=0)


class Model:
    def __init__(self):
        assembly = cq.Assembly.load(str(KIT / "lm04-assembly.step"))
        self.shapes = {}
        self.meshes = {}
        for shape, path, location, _ in assembly:
            key = path.split("/")[-1].lower()
            # CadQuery's STEP reader can suffix imported compound names with a space.
            key = key.split(" ")[0]
            group = key.split("-")[0]
            if group not in COLORS:
                raise ValueError(f"Unrecognised part in STEP: {path}")
            shape = shape.located(location)
            self.shapes[key] = shape
            self.meshes[key] = shape_mesh(shape, COLORS[group])
        required = {"base", "housing", "panel", "screen"} | {
            f"{name}-{i}" for name in ("marker", "screw") for i in range(1, 5)}
        if self.shapes.keys() != required:
            raise ValueError("Part set differs from workshop guide: " + str(self.shapes.keys()))
        self.all = cq.Compound.makeCompound(list(self.shapes.values()))
        b = Bnd_Box()
        BRepBndLib.AddOptimal_s(self.all.wrapped, b, False, False)
        xmin, ymin, zmin, xmax, ymax, zmax = b.Get()
        self.size = (xmax - xmin, ymax - ymin, zmax - zmin)
        verified = json.loads((KIT / "lm04-geometry.json").read_text())
        if not np.allclose(self.size, verified["envelope_mm"], atol=.002):
            raise ValueError(f"STEP and geometry record disagree: {self.size}")
        self.part_size = {}
        for code, _, _, name, _, _ in SPECS:
            lo, hi = stl_limits(KIT / "print" / f"{name}.stl")
            self.part_size[code] = hi - lo
            if abs(lo[2]) > 0.02:
                raise ValueError(f"Unexpected build-plate offset for {name}: {lo[2]}")
        if abs(self.size[0] - 180) > .1 or abs(self.size[1] - 134) > .1:
            raise ValueError(f"Unexpected assembly envelope: {self.size}")

    def illustration(self, groups=None, shifts=None, view=(.74,-1.20,.80), width=1000):
        groups = set(groups or COLORS)
        shifts = shifts or {}
        scene = []
        for key, (v, i, color) in self.meshes.items():
            group = key.split("-")[0]
            if group in groups:
                delta = np.asarray(shifts.get(key, shifts.get(group, [0., 0., 0.])))
                scene.append((v + delta, i, color))
        return render_mesh(scene, direction=view, width=width)


def bom(model):
    records = []
    for code, group, name, stem, count, _ in SPECS:
        dims = mm_box(model.part_size[code])
        if code == "05":
            dims = "Ø" + number(model.part_size[code][0]) + " × " + number(model.part_size[code][2], 2)
        records.append([f"LM04-{code}", "Деталь FDM", name, count, "шт", dims + " мм",
                        "PLA или PETG", f"print/{stem}.stl"])
    records += [
        ["K01", "Крепёж", "Винт самонарезающий с потайной головкой", 4, "шт", "ST2,9 × 16; DIN 7982",
         "Головка входит в зенковку Ø6,6 мм. Подобрать ручную отвёртку по шлицу.", ""],
        ["M01", "Расходный материал", "Двусторонняя монтажная лента", 250, "мм", "ширина 10 мм; толщина 0,2 мм",
         "Взять 250 мм на комплект, вырезать полоски шириной 8 мм и диски Ø8 мм. Плотная плёнка без пены.", ""],
        ["M02", "Необязательная маркировка", "Самоклеящийся лист под имеющийся принтер", 1, "лист", "A4",
         "Печатать страницу 6 в масштабе 100 %. Выбрать один вариант экрана и четыре метки.", "docs/guide.pdf#page=6"],
        ["Итого", "Детали FDM", "Печатные детали", 8, "шт", "5 разных STL", "", ""],
        ["Итого", "Крепёж", "Винты", 4, "шт", "1 типоразмер", "", ""],
        ["Итого", "Расходный материал", "Монтажная лента", 250, "мм", "отрезок шириной 10 мм", "", ""],
        ["Итого", "Необязательная маркировка", "Самоклеящиеся листы", 1, "лист", "1 лист на комплект", "", ""],
    ]
    with (DOCS / "bom.csv").open("w", encoding="utf-8-sig", newline="") as dest:
        writer = csv.writer(dest, delimiter=";")
        writer.writerow(["Позиция", "Группа", "Наименование", "Количество", "Ед. изм.",
                         "Номинал", "Примечание", "Путь от папки kit"])
        writer.writerows(records)


def cover(d, m):
    d.header("Пульт «Люмен»", "Изготовление и сборка пассивного макета LM-04")
    d.box(16, 58, 178, 113, TINT, radius=3)
    # Design data in this guide is generated from the same STEP as the web model.
    place_image(d, m.illustration(width=1500), (26, 65, 158, 94))
    d.tag(23, 164.4, "СБОРОЧНАЯ МОДЕЛЬ")
    d.text(187, 164.4, "Вид спереди и справа", 8.3, color=SOFT, align="right")
    for x, value, unit in [(16, mm_box(m.size), "Габариты, мм"),
                           (100, "20°", "Наклон панели"),
                           (147, "8", "Печатных деталей")]:
        d.text(x, 189.2, value, 16, d.bold)
        d.text(x, 196.5, unit, 9.1, color=SOFT)
    d.line(16, 204, 194, 204)
    d.paragraph(16, 215.5, 175,
                "Макет помогает оценить положение пульта на столе, читаемость условного экрана "
                "и удобство расположения четырёх меток каналов.", 11.0, INK, 5.7)
    y = d.paragraph(16, 238.2, 178,
                    "Откройте сборку STEP в CAD, загрузите пять STL из папки print в слайсер "
                    "и сверьте детали с ведомостью. Для механической сборки нужны четыре винта "
                    "и тонкая монтажная лента.", 10.1, SOFT, 5.3)
    d.paragraph(16, max(y + 4, 260.0), 177,
                "Геометрия проверена в CAD. Посадки и устойчивость предстоит подтвердить на первом отпечатке.",
                9.9, TEAL, 5.1)
    d.footer()


def envelope(d, m):
    d.header("Габаритный чертёж", "Размеры в миллиметрах. За базу по высоте принята нижняя плоскость основания.")
    top = visible_edges(m.all, (0,0,1), (1,0,0))
    d.tag(16, 58.5, "ВИД СВЕРХУ")
    xy, _ = draw_projection(d, top, (47, 72, 115, 78.5))
    xmin, ymin, xmax, ymax = top.box
    lx, by = xy(xmin, ymin)
    rx, ty = xy(xmax, ymax)
    d.dim_h(lx, rx, ty, ty - 6.4, number(m.size[0]))
    d.dim_v(lx, lx - 9, ty, by, number(m.size[1]))
    d.text(104.5, by + 6.1, "Передняя сторона", 8, color=SOFT, align="center")
    d.line(16, 161.5, 194, 161.5)
    d.tag(16, 171.2, "ВИД СПРАВА")
    side = visible_edges(m.all, (1,0,0), (0,1,0))
    xy, _ = draw_projection(d, side, (51, 179, 109, 61.5))
    xmin, ymin, xmax, ymax = side.box
    lx, by = xy(xmin, ymin)
    rx, ty = xy(xmax, ymax)
    d.dim_h(lx, rx, by, by + 7.5, number(m.size[1]))
    d.dim_v(rx, rx + 8.4, ty, by, number(m.size[2]))
    d.text(16, 259.5, "20°", 14, d.bold, TEAL)
    d.paragraph(34, 258.7, 159, "Наклон лицевой плоскости к основанию. Ширину и длину "
                        "снимайте по нижней плите, высоту — по верхней точке корпуса.",
                9.8, SOFT, 5.0)
    d.footer()


def parts(d, m):
    d.header("Детали и материалы", "Ведомость на один пульт. Размеры печатных деталей даны в ориентации STL на столе принтера.")
    x0, x1, x2, x3 = 16, 44, 132, 189
    d.box(16, 57, 178, 10, TINT)
    for x, text in ((19,"Поз."),(x1,"Деталь и файл"),(x2,"Габарит, мм")):
        d.text(x, 63.6, text, 8.4, d.bold, SOFT)
    d.text(x3, 63.6, "Шт.", 8.4, d.bold, SOFT, "right")
    for row, (code, _, name, stem, count, _) in enumerate(SPECS):
        top = 67 + row * 14
        d.text(19, top+6.4, "LM04-" + code, 8.3, d.mono)
        d.text(x1, top+5.7, name, 9.7, d.bold)
        d.text(x1, top+10.6, stem + ".stl", 7.9, d.mono, SOFT)
        dims = mm_box(m.part_size[code])
        if code == "05":
            dims = "Ø" + number(m.part_size[code][0]) + " × " + number(m.part_size[code][2], 2)
        if code in ["03","04"]:
            dims = " × ".join(number(x,2) for x in m.part_size[code])
        d.text(x2, top+7.4, dims, 8.8)
        d.text(x3, top+7.4, str(count), 9.7, d.bold, align="right")
        d.line(16, top+14, 194, top+14)
    d.text(16, 151, "Крепёж и расходники", 14, d.bold)
    d.paragraph(16, 159.4, 178,
                "Четыре винта с потайной головкой DIN 7982 ST2,9 × 16. Тонкая двусторонняя "
                "лента шириной 10 мм и толщиной 0,2 мм — отрезок 250 мм. Для маркировки "
                "подойдёт один лист самоклеящейся бумаги A4.", 10.1, INK, 5.0)
    d.line(16, 177.5, 194, 177.5)
    d.text(16, 188, "Печать", 14, d.bold)
    d.paragraph(16, 196.5, 84,
                "Напечатайте все STL в масштабе 100 %, в миллиметрах и в сохранённой ориентации. "
                "Основание и корпус лежат плоской стороной вниз. Для остальных деталей "
                "плоская оборотная сторона уже обращена к столу.", 10.1, INK, 5.35)
    d.text(109, 188, "Первая примерка", 14, d.bold)
    d.paragraph(109, 196.5, 84,
                "Сначала напечатайте панель, вставку экрана и одну метку. Каждая вставка должна "
                "свободно входить в своё гнездо. Номинальный боковой зазор 0,25 мм на сторону. "
                "После примерки допечатайте три метки. Координаты и глубины гнёзд приведены в panel.pdf.", 10.1, INK, 5.35)
    d.paragraph(16, 245.6, 178,
                "Для первой печати PLA или PETG подойдут сопло 0,4 мм, слой 0,2 мм, три стенки и "
                "заполнение 15–20 %. Просмотрите траектории и используйте температурный профиль "
                "вашего материала. Проверьте, что основание 180 × 134 мм помещается на столе "
                "вместе с выбранной каймой.", 9.5, SOFT, 5.1)
    d.footer()


def assembly(d, m):
    d.header("Сборка пульта", "Сначала соберите и разберите детали насухо. Наклейте вставки после проверки посадок.")
    entries = [
        ("01", "Совместите корпус с основанием",
         "Положите корпус на мягкую подкладку лицевой стороной вниз. Приложите основание "
         "зенковками наружу. Совместите четыре пары отверстий.",
         ["base","housing"], {"housing": [0,0,20]}, (.8,-1.25,.92)),
        ("02", "Закрепите основание",
         "Наживите четыре винта со стороны основания. Затягивайте ручной отвёрткой по "
         "диагонали до касания головок с зенковками.",
         ["base","housing","screw"], {"screw": [0,0,-13]}, (.6,-1.12,-.93)),
        ("03", "Вклейте лицевую панель",
         "Установите пульт на стол. Нарежьте четыре полоски ленты 30 × 8 мм, разместите их "
         "по краям оборота панели. Совместите панель с гнездом и прижмите.",
         ["base","housing","panel"], {"panel": NORMAL*21}, (.78,-1.18,.92)),
        ("04", "Установите экран и метки",
         "На оборот экрана приклейте две полоски 25 × 8 мм, на метки — четыре кружка Ø8 мм. "
         "Поставьте вставки в свои гнёзда. Маркировка для лицевой стороны — на стр. 6.",
         ["base","housing","panel","screen","marker"], {"screen":NORMAL*16,"marker":NORMAL*16}, (.69,-1.0,.91)),
    ]
    for i, (num, head, body, groups, offsets, view) in enumerate(entries):
        col = i % 2; row = i // 2
        x = (16,109)[col]; t = (56,165)[row]
        d.box(x, t, 84, 48, TINT, radius=2)
        im = m.illustration(groups, offsets, view=view, width=720)
        place_image(d, im, (x+8, t+3, 68, 42))
        d.tag(x, t+56, "ШАГ "+num)
        d.text(x, t+63, head, 10.8, d.bold)
        d.paragraph(x, t+70.2, 84, body, 9.6, INK, 4.85)
    d.footer()


def fixation(d, m):
    d.header("Крепление и контроль", "Номиналы для проверки первого экземпляра. Подпишите лист после сборки.")
    d.tag(16, 56.8, "ОСНОВАНИЕ СНИЗУ")
    under = visible_edges(m.shapes["base"], (0,0,-1), (1,0,0))
    xy, _ = draw_projection(d, under, (24, 69.5, 80, 57.0))
    lx, bottom = xy(-65,-45)
    rx, top = xy(65,45)
    d.dim_h(lx,rx,top,top-13,"130")
    d.dim_v(lx,lx-15,top,bottom,"90")
    d.text(63, 134.5, "По осям от середины плиты ±65 и ±45 мм", 7.9, color=SOFT, align="center")
    # Schematic through the fastener axis. All labelled bore dimensions are nominal in CAD.
    d.tag(119, 56.8, "СЕЧЕНИЕ ОТВЕРСТИЯ")
    center, width, interface, zscale = 147, 23, 98, 1.70
    d.box(center-width, interface-24, 2*width, 24, "#E6EFE9")
    d.box(center-width, interface, 2*width, 8*zscale, "#CDDDDC")
    d.box(center-1.2*zscale, interface-10*zscale, 2.4*zscale, 10*zscale, PAPER)
    d.box(center-1.7*zscale, interface, 3.4*zscale, 8*zscale, PAPER)
    c = d.canvas
    shoulder = interface + (8 - 1.6)*zscale
    underside = interface + 8*zscale
    pts = [d.pt(center-1.7*zscale,shoulder),d.pt(center+1.7*zscale,shoulder),
           d.pt(center+3.3*zscale,underside),d.pt(center-3.3*zscale,underside)]
    path = c.beginPath();path.moveTo(*pts[0])
    for pt in pts[1:]:
        path.lineTo(*pt)
    path.close();c.setFillColor(PAPER);c.drawPath(path,stroke=0,fill=1)
    for side in (-1,1):
        d.line(center+side*1.2*zscale, interface-10*zscale, center+side*1.2*zscale, interface, INK, 0.23)
        d.line(center+side*1.7*zscale, interface, center+side*1.7*zscale, shoulder, INK, 0.23)
        d.line(center+side*1.7*zscale, shoulder, center+side*3.3*zscale, underside, INK, 0.23)
        d.line(center+side*1.7*zscale,interface,center+side*width,interface,INK,0.23)
    d.line(center-1.2*zscale,interface-10*zscale,center+1.2*zscale,interface-10*zscale,INK,0.23)
    d.line(center,68,center,118,SOFT,.12,dash=(1,.9))
    d.text(center-11.5, interface-9.1, "корпус", 6.9, d.body, SOFT, "center")
    d.text(center-13.2, interface+8.1, "основание", 6.4, d.body, SOFT, "center")
    d.text(center, 124.6, "Гнездо Ø2,4 глубиной 10", 8.1, color=INK, align="center")
    d.text(center, 130, "Отверстие Ø3,4, зенковка Ø6,6", 8.1, color=INK, align="center")
    d.line(16, 142, 194, 142)
    d.text(16, 154.7, "Проверка готового макета", 15, d.bold)
    checks = [
        ("Опора", "Пульт устойчив на ровном столе. Головки винтов утоплены или заподлицо."),
        ("Корпус", "Основание прилегает к корпусу. Стык ровный по всему периметру."),
        ("Панель", "Панель прилегает к уступу и сохраняет положение при лёгком нажатии."),
        ("Вставки", "Экран и все четыре метки установлены ровно и держатся на ленте."),
    ]
    for i,(name, note) in enumerate(checks):
        y=167+i*13.6
        d.box(16,y-4.3,3.6,3.6,stroke=SOFT)
        d.text(24, y-.4, name, 9.6, d.bold)
        d.paragraph(52, y-.4, 142, note, 9.4, INK, 4.6)
        d.line(16,y+6.2,194,y+6.2)
    d.text(16, 233.5, "Размеры по факту, мм", 9.3, d.bold)
    d.line(65,235,194,235)
    d.text(16, 248, "Замечания", 9.3, d.bold)
    d.line(47,249.5,194,249.5)
    d.text(16, 263, "Сборщик", 9.3, d.bold)
    d.line(41,264.3,116,264.3)
    d.text(124, 263, "Дата", 9.3, d.bold)
    d.line(139,264.3,194,264.3)
    d.footer()


def screen_sticker(d,x,y,active_count):
    width,height=92.0,52.0
    d.box(x,y,width,height,"#182623",radius=4)
    d.text(x+5.0,y+7.0,"ЛЮМЕН   /   LM-04",8.9,d.bold,"#EAF3EB")
    d.text(x+width-5,y+7.0,"МАКЕТ",7,d.mono,"#A5EAC5","right")
    d.line(x+5,y+10.2,x+width-5,y+10.2,"#557167",.2)
    d.text(x+5,y+19.5,"Каналы",14,d.bold,"#ECF4EE")
    d.text(x+width-5,y+19.2,str(active_count)+" / 4",10,d.mono,"#B3EAC8","right")
    for i in range(4):
        bx=x+5+i*20.6
        selected=i<active_count
        d.box(bx,y+25.0,18.0,12.0,"#B4F0C9" if selected else "#32413B",radius=1.7)
        d.text(bx+9,y+33.0,f"{i+1:02d}",12,d.mono,"#193C2B" if selected else "#A4B7AE","center")
    d.text(x+5,y+45.5,"Демонстрационный режим",7.7,d.body,"#B2CCBC")
    for i in range(4):
        cx=x+110+(i%2)*18
        cy=y+14+(i//2)*19
        d.circle(cx,cy,5.1,"#AFE5CD",INK,.15)
        d.text(cx,cy+1.75,f"{i+1:02d}",10,d.mono,INK,"center")


def decals(d, m):
    d.header("Маркировка для печати", "Напечатайте эту страницу на самоклеящемся листе A4. В окне печати выберите «Фактический размер» или масштаб 100 %.")
    d.tag(27, 66, "ВАРИАНТ С ДВУМЯ КАНАЛАМИ")
    screen_sticker(d,27,72,2)
    d.tag(27, 143, "ВАРИАНТ С ЧЕТЫРЬМЯ КАНАЛАМИ")
    screen_sticker(d,27,149,4)
    d.text(27, 216.8, "Проверка масштаба", 13, d.bold)
    d.paragraph(27, 224.7, 158, "До вырезания измерьте отрезок и квадрат по меткам ниже. Вырежьте один "
                "экран по границе цветного поля и четыре диска по контуру. По периметру вставок останется "
                "ободок шириной 1 мм.", 9.6, INK, 5.1)
    d.line(27,251.5,77,251.5,INK,.3)
    for x in (27,77):
        d.line(x,248.9,x,254.1,INK,.3)
    d.text(52,259.5,"50 мм",9,d.mono,TEAL,"center")
    d.box(107,244,20,20,stroke=INK,weight=.25)
    d.text(132,255.8,"20 × 20 мм",9,d.mono,TEAL)
    d.footer()


def main():
    DOCS.mkdir(parents=True, exist_ok=True)
    model = Model()
    bom(model)
    doc = Manual(DOCS / "guide.pdf")
    for page in (cover,envelope,parts,assembly,fixation,decals):
        print(page.__name__, flush=True)
        page(doc,model)
    doc.finish()
    panel_sheet(model, DOCS / "panel.pdf")


if __name__ == "__main__":
    main()
