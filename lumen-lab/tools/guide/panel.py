"""Supplementary true-view, dimensioned inspection drawing of LM04-03."""
from layout import Manual, INK, SOFT, TEAL, TINT
from drawings import visible_edges, draw_projection


def panel_sheet(model, filename):
    page = Manual(filename, page_count=1)
    page.canvas.setTitle("LM04-03. Лицевая панель. Координаты и размеры гнёзд")
    page.header("Панель и посадочные места", "LM04-03. Вид по нормали к лицевой поверхности. Размеры в миллиметрах.")
    local_shape = model.shapes["panel"].rotate((0, 0, 0), (1, 0, 0), -20.0)
    view = visible_edges(local_shape, (0, 0, 1), (1, 0, 0))
    to_page, scale = draw_projection(page, view, (38, 66, 140, 89), weight=.25)
    xmin, ymin, xmax, ymax = view.box
    xzero, yzero = (xmin + xmax) / 2, (ymin + ymax) / 2
    at = lambda u,v: to_page(xzero + u, yzero + v)
    left, bottom = at(-81,-55)
    right, top = at(81,55)
    page.dim_h(left, right, top, top - 7.0, "162")
    page.dim_v(left, left - 7.0, top, bottom, "110")
    # Thin centre marks distinguish the reference axes from the physical edges.
    page.line(*at(-83, 0), *at(85, 0), SOFT, .14, dash=(2.4,1.2))
    page.line(*at(0, -57), *at(0, 58), SOFT, .14, dash=(2.4,1.2))
    page.text(*at(88.3, -1.4), "U", 8.1, page.mono, TEAL)
    page.text(*at(1.4, 56.2), "V", 8.1, page.mono, TEAL)
    page.text(*at(1.5, -4.4), "0", 7.3, page.mono, TEAL)
    for label, u, v in (("Э", -24, 6), ("1", 40, 16), ("2",62,16), ("3",40,-10), ("4",62,-10)):
        mx,my=at(u,v)
        page.text(mx, my+1.05, label, 8.3, page.bold, TEAL, "center")
    page.paragraph(16, 167.8, 178, "Начало координат — центр наружного контура панели. Ось U направлена вправо, "
                   "ось V — от оператора к верхней кромке. На чертеже указаны центры гнёзд.", 9.5, SOFT, 5.0)
    page.box(16, 182, 178, 9, TINT)
    columns=[(19,"Гнездо"),(82,"U"),(99,"V"),(116,"Размер"),(153,"Глубина")]
    for x, title in columns:
        page.text(x, 188.1, title, 8.9, page.bold, SOFT)
    rows=[("Э   Экран", "−24", "+6", "94,5 × 54,5", "1,6"),
          ("1   Метка канала 01", "+40", "+16", "Ø12,7", "1,4"),
          ("2   Метка канала 02", "+62", "+16", "Ø12,7", "1,4"),
          ("3   Метка канала 03", "+40", "−10", "Ø12,7", "1,4"),
          ("4   Метка канала 04", "+62", "−10", "Ø12,7", "1,4")]
    for i,row in enumerate(rows):
        y=197+i*8.5
        for j, ((x,_), text) in enumerate(zip(columns,row)):
            page.text(x,y,text,9.0, page.body if j == 0 else page.mono, INK)
        page.line(16,y+3,194,y+3)
    page.paragraph(16, 246.7, 178,
                   "Толщина панели 2,8 мм. Наружный радиус углов R8, радиус гнезда экрана R5,05. "
                   "В корпусе для самой панели предусмотрено гнездо 162,5 × 110,5 мм глубиной 1,8 мм. "
                   "Боковой зазор каждой вставки 0,25 мм. Под вставками учтена лента толщиной 0,2 мм.",
                   9.5, SOFT, 5.1)
    page.footer()
    page.finish()
