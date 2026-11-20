"""Small A4 layout vocabulary used by the LM-04 Russian workshop guide."""
import os
from pathlib import Path
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas
from reportlab.lib.utils import simpleSplit

INK = "#192F35"
SOFT = "#425C64"
TEAL = "#007C71"
MINT = "#B8EFE1"
LINE = "#BECFCF"
TINT = "#EFF6F4"
PAPER = "#FFFFFF"


def load_fonts():
    root = Path(os.environ.get("LM04_FONT_DIR", "/usr/share/fonts/truetype"))
    for alias, path, fallback in (
        ("LMText", "noto/NotoSans-Regular.ttf", "dejavu/DejaVuSans.ttf"),
        ("LMHeavy", "noto/NotoSans-Bold.ttf", "dejavu/DejaVuSans-Bold.ttf"),
        ("LMMono", "dejavu/DejaVuSansMono.ttf", "noto/NotoSansMono-Regular.ttf"),
    ):
        file = root / path
        if not file.is_file():
            file = root / fallback
        pdfmetrics.registerFont(TTFont(alias, str(file)))


class Manual:
    width = A4[0] / mm
    height = A4[1] / mm
    mm = mm
    body = "LMText"
    bold = "LMHeavy"
    mono = "LMMono"

    def __init__(self, filename, page_count=6):
        load_fonts()
        self.canvas = canvas.Canvas(str(filename), pagesize=A4, pageCompression=1,
                                    invariant=1)
        self.canvas.setTitle("Люмен LM-04. Изготовление и сборка пассивного макета")
        self.canvas.setAuthor("Проектный центр «Детский технопарк» РГСУ")
        self.canvas.setSubject("Сборочные чертежи, комплектующие и проверка первого экземпляра")
        self.page = 0
        self.page_count = page_count

    def pt(self, x, y):
        return x * mm, (self.height - y) * mm

    def line(self, x1, y1, x2, y2, color=LINE, weight=0.22, dash=None):
        c = self.canvas
        c.saveState()
        c.setStrokeColor(color)
        c.setLineWidth(weight * mm)
        c.setLineCap(1)
        if dash:
            c.setDash([v * mm for v in dash])
        c.line(*self.pt(x1, y1), *self.pt(x2, y2))
        c.restoreState()

    def box(self, x, y, width, height, fill=None, stroke=None, radius=0, weight=0.22):
        c = self.canvas
        c.saveState()
        if fill:
            c.setFillColor(fill)
        if stroke:
            c.setStrokeColor(stroke)
            c.setLineWidth(weight * mm)
        if radius:
            c.roundRect(x * mm, (self.height - y - height) * mm, width * mm, height * mm,
                        radius * mm, fill=int(bool(fill)), stroke=int(bool(stroke)))
        else:
            c.rect(x * mm, (self.height - y - height) * mm, width * mm, height * mm,
                   fill=int(bool(fill)), stroke=int(bool(stroke)))
        c.restoreState()

    def circle(self, x, y, radius, fill=None, stroke=None, weight=0.22):
        c = self.canvas
        c.saveState()
        if fill:
            c.setFillColor(fill)
        if stroke:
            c.setStrokeColor(stroke)
            c.setLineWidth(weight * mm)
        c.circle(*self.pt(x, y), radius * mm, fill=int(bool(fill)), stroke=int(bool(stroke)))
        c.restoreState()

    def text(self, x, y, text, size=10.5, face=None, color=INK, align="left"):
        c = self.canvas
        c.setFillColor(color)
        c.setFont(face or self.body, size)
        render = {"left": c.drawString, "center": c.drawCentredString, "right": c.drawRightString}
        render[align](*self.pt(x, y), str(text))

    def paragraph(self, x, y, width, text, size=10.3, color=INK,
                  leading=5.1, face=None):
        font = face or self.body
        lines = simpleSplit(text, font, size, width * mm)
        for line in lines:
            self.text(x, y, line, size, font, color)
            y += leading
        return y

    def tag(self, x, y, label, align="left"):
        self.text(x, y, label, 8.0, self.mono, TEAL, align)

    def header(self, title, subtitle=None):
        self.page += 1
        for index in range(4):
            self.line(16 + index * 1.28, 14.4, 19.6 + index * 1.28, 10.2, TEAL, 0.56)
        self.text(29, 14.2, "ЛЮМЕН", 10.5, self.bold)
        self.text(193, 14.0, "LM-04   /   РЕД. A", 8.5, self.mono, SOFT, "right")
        self.text(16, 32.8, title, 25, self.bold)
        if subtitle:
            self.paragraph(16, 43.0, 178, subtitle, 10.7, SOFT, 5.5)

    def footer(self):
        self.line(16, 279.5, 194, 279.5)
        self.text(16, 286.0, "Технопарк РГСУ  /  Макет без излучателя", 8.1, self.body, SOFT)
        self.text(194, 286.0, f"LM-04    {self.page:02d} / {self.page_count:02d}", 8.0, self.mono, SOFT, "right")
        self.canvas.showPage()

    def dim_h(self, x1, x2, geom_y, line_y, label):
        self.line(x1, geom_y, x1, line_y, TEAL, 0.17)
        self.line(x2, geom_y, x2, line_y, TEAL, 0.17)
        self.line(x1, line_y, x2, line_y, TEAL, 0.24)
        for x in (x1, x2):
            self.line(x - .9, line_y + 1.1, x + .9, line_y - 1.1, TEAL, .28)
        w = pdfmetrics.stringWidth(label, self.mono, 8.5) / mm
        middle = (x1 + x2) / 2
        self.box(middle - w/2 - 1.7, line_y - 2.1, w + 3.4, 4.2, PAPER)
        self.text(middle, line_y + 1.0, label, 8.5, self.mono, TEAL, "center")

    def dim_v(self, geom_x, line_x, y1, y2, label):
        self.line(geom_x, y1, line_x, y1, TEAL, 0.17)
        self.line(geom_x, y2, line_x, y2, TEAL, 0.17)
        self.line(line_x, y1, line_x, y2, TEAL, 0.24)
        for y in (y1, y2):
            self.line(line_x - .9, y + 1.1, line_x + .9, y - 1.1, TEAL, .28)
        c = self.canvas
        middle = (y1 + y2) / 2
        w = pdfmetrics.stringWidth(label, self.mono, 8.5) / mm
        c.saveState()
        c.translate(*self.pt(line_x, middle))
        c.rotate(90)
        c.setFillColor(PAPER)
        c.rect((-w/2 - 1.7)*mm, -2.1*mm, (w+3.4)*mm, 4.2*mm, fill=1, stroke=0)
        c.setFillColor(TEAL); c.setFont(self.mono, 8.5)
        c.drawCentredString(0, -1.0*mm, label)
        c.restoreState()

    def finish(self):
        self.canvas.save()
