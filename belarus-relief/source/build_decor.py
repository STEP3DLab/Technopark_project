#!/usr/bin/env python3
"""Build functional mm-scale city lettering and faceted stars for the Belarus panel.

Run from any directory after the region outlines and the common relief grid exist.
Use --seats-only before rebuilding terrain. With no option, also write binary STL,
machine-readable assembly coordinates and a vector placement sheet.
Dependencies: Python 3, NumPy, Shapely 2.1+ / GEOS 3.10+, Matplotlib, scipy,
trimesh, reportlab and the freely available DejaVu Serif Condensed Bold font.
"""
import argparse
import json
import math
import struct
from pathlib import Path
from xml.etree import ElementTree as ET

import matplotlib.font_manager as fm
import numpy as np
from matplotlib.textpath import TextPath
from shapely import constrained_delaunay_triangles
from shapely.affinity import scale, translate
from shapely.geometry import MultiPolygon, Point, Polygon, box
from shapely.ops import unary_union

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "source"
OUTPUT = ROOT / "models" / "decor"
NAMES = [
    ("brest", "Брест", 23.685, 52.097, 12, "right", 4.5),
    ("grodno", "Гродно", 23.826, 53.678, 12, "right", 0),
    ("vitebsk", "Витебск", 30.204, 55.191, 12, "left", 0),
    ("minsk", "Минск", 27.56, 53.90, 17, "right", 0),
    ("mogilev", "Могилёв", 30.331, 53.895, 12, "right", 0),
    ("gomel", "Гомель", 30.98, 52.428, 14, "left", 0),
]
FONT = SRC / "fonts" / "DejaVuSerifCondensed-Bold.ttf"
BODY_Z = 0.65
TOTAL_Z = 1.70
PAD = 0.5


def dump(path, obj):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(obj, indent=2, ensure_ascii=False) + "\n")


def fonts():
    return fm.FontProperties(fname=FONT)


def glyph_solid(word, prop):
    # Scale up before flattening Bézier outlines so the printed letters are smooth.
    path = TextPath((0, 0), word, size=96.0, prop=prop)
    contours = sorted((Polygon(p / 10.0).buffer(0) for p in path.to_polygons()),
                      key=lambda p: p.area, reverse=True)
    letters = Polygon()
    for ring in contours:
        letters = letters.symmetric_difference(ring)
    letters = letters.buffer(0.08, quad_segs=6).simplify(0.016, preserve_topology=True)
    # Work with zero-based ink bounds. The cap height is ~7 mm.
    x, y, _, _ = letters.bounds
    letters = scale(translate(letters, -x, -y), xfact=0.95, yfact=1, origin=(0,0))
    # A low-profile coloured carrier links letters and the two dots on ё.
    # Opening in sculpted counters remains visible above the supporting carrier.
    carrier = letters.buffer(1.8, quad_segs=7).buffer(-1.39, quad_segs=7)
    if carrier.geom_type != "Polygon":
        raise ValueError(f"{word}: disconnected carrier")
    # Keep the carrier solid under the word, removing pinholes in its silhouette.
    carrier = Polygon(carrier.exterior).simplify(0.025, preserve_topology=True)
    if not carrier.covers(letters):
        carrier = carrier.union(letters.buffer(0.10, quad_segs=5))
    carrier = Polygon(carrier.exterior)
    ox, oy, _, _ = carrier.bounds
    return translate(letters, -ox, -oy), translate(carrier, -ox, -oy)


def prepare_layout():
    outlines = {r['id']: Polygon(r['outline']).buffer(0)
                for r in json.loads((SRC / 'region_outlines.json').read_text())}
    prop = fonts()
    city_records, seats = [], []
    for key, word, lon, lat, span, side, offset in NAMES:
        geo_x = (lon - 23.178) / (32.776 - 23.178) * 358.8
        y = round((lat - 51.262) / (56.173 - 51.262) * 309.5, 2)
        x = round(geo_x + offset, 2)
        radius = span / (2 * math.cos(math.radians(18)))
        letters, carrier = glyph_solid(word, prop)
        _, _, width, height = carrier.bounds
        # Align the full word's optical center with the star, incl. descenders.
        label_x = x + span / 2 + 2.6 if side == "right" else x - span / 2 - 2.6 - width
        label_y = y - height / 2
        label_x, label_y = round(label_x, 3), round(label_y, 3)
        rect = [round(v, 3) for v in (label_x-PAD,label_y-PAD,
                                        label_x+width+PAD, label_y+height+PAD)]
        if not outlines[key].contains(box(*rect)):
            raise ValueError(f"Outside {word}: nameplate")
        outline = star_xy(span)
        if not outlines[key].contains(translate(Polygon(outline), x, y)):
            raise ValueError(f"Outside {word}: star")
        seats.extend([
            {"id": key + "-star", "region": key, "shape": "circle", "x": x, "y": y,
             "radius": round(radius+0.3, 3)},
            {"id": key + "-label", "region": key, "shape": "rect",
             "xmin": rect[0], "ymin": rect[1], "xmax": rect[2], "ymax": rect[3],
             "x": round((rect[0]+rect[2])/2,3), "y": round((rect[1]+rect[3])/2,3)},
        ])
        city_records.append((key, word, round(geo_x, 2), x, y, span, label_x, label_y,
                             letters, carrier))
    return city_records, seats


def star_xy(span):
    radius = span / (2 * math.cos(math.radians(18)))
    return [(radius * (1 if k % 2 == 0 else .436) * math.cos(math.radians(90+36*k)),
             radius * (1 if k % 2 == 0 else .436) * math.sin(math.radians(90+36*k)))
            for k in range(10)]


def polygons(shape):
    return [shape] if shape.geom_type == 'Polygon' else list(shape.geoms)


def face(points, positive=True):
    p = np.asarray(points)
    orientation = np.cross(p[1]-p[0], p[2]-p[0])[2]
    return points if (orientation > 0) == positive else points[::-1]


def flat_faces(shape, z, up):
    result = []
    for poly in polygons(shape):
        for triangle in constrained_delaunay_triangles(poly).geoms:
            points = [tuple(p)+(z,) for p in list(triangle.exterior.coords)[:3]]
            result.append(face(points, up))
    return result


def side_faces(shape, z0, z1):
    from shapely.geometry.polygon import orient
    result = []
    for poly in polygons(shape):
        poly = orient(poly, sign=1.0)
        for ring in (poly.exterior, *poly.interiors):
            pts = list(ring.coords)
            for p, q in zip(pts,pts[1:]):
                pl, ql = tuple(p)+(z0,), tuple(q)+(z0,)
                ph, qh = tuple(p)+(z1,), tuple(q)+(z1,)
                result.extend([(pl,ql,qh),(pl,qh,ph)])
    return result


def letter_mesh(letters, carrier):
    tris = flat_faces(carrier, 0, False)
    tris += side_faces(carrier, 0, BODY_Z)
    tris += flat_faces(carrier.difference(letters), BODY_Z, True)
    break_index = len(tris)
    tris += side_faces(letters,BODY_Z,TOTAL_Z)
    tris += flat_faces(letters,TOTAL_Z,True)
    return tris, {'carrier': [0,break_index], 'bronze':[break_index,len(tris)]}


def star_mesh(span):
    outline = star_xy(span)
    z_wall = 0.86
    z_peak = round(0.17*span,2)
    rim = [(x,y,z_wall) for x,y in outline]
    low = [(x,y,0) for x,y in outline]
    # Narrow platform around a deeply faceted inset. All sidewall/ledge faces
    # remain accessible to a brush after a single-piece supportless print.
    inset = [(.83*x,.83*y,z_wall) for x,y in outline]
    tip = (0,0,z_peak)
    tris = []
    for i in range(10):
        j=(i+1)%10
        tris.extend([(low[i],low[j],rim[j]),(low[i],rim[j],rim[i]),
                     (rim[i],rim[j],inset[j]),(rim[i],inset[j],inset[i]),
                     (low[j],low[i],(0,0,0))])
    # Inset each enamel facet perpendicular to its projected edges. The narrow
    # raised ribs between facets can be dry-brushed without painting a freehand line.
    enamel = []
    for i in range(10):
        outer = np.asarray([inset[i], inset[(i+1)%10], tip])
        xy = outer[:,:2]
        sides = np.array([np.linalg.norm(xy[(k+1)%3]-xy[(k+2)%3]) for k in range(3)])
        incenter = np.average(outer, axis=0, weights=sides)
        d1, d2 = xy[1]-xy[0], xy[2]-xy[0]
        inradius = abs(d1[0]*d2[1]-d1[1]*d2[0]) / sum(sides)
        top = incenter + (outer-incenter)*(1 - 0.16/inradius)
        field = top - np.array([0,0,.15])
        for k in range(3):
            j=(k+1)%3
            tris.extend([(outer[k],outer[j],top[j]),(outer[k],top[j],top[k]),
                         (top[k],top[j],field[j]),(top[k],field[j],field[k])])
        enamel.append(field)
    first=len(tris)
    tris.extend(enamel)
    return tris,{'gilt':[0,first], 'ruby':[first,len(tris)]}


def write_mesh(path, triangles):
    import trimesh
    a=np.asarray(triangles,dtype=np.float32)
    m=trimesh.Trimesh(vertices=a.reshape(-1,3),faces=np.arange(len(a)*3).reshape(-1,3),
                      process=True, validate=False)
    if not m.is_watertight or not m.is_winding_consistent or m.volume <= 0 or m.body_count != 1:
        raise ValueError(f"{path.name}: watertight={m.is_watertight}, winding={m.is_winding_consistent}, bodies={m.body_count}, volume={m.volume}")
    normals = np.cross(a[:,1]-a[:,0],a[:,2]-a[:,0])
    area2=np.linalg.norm(normals,axis=1)
    if np.any(area2 <= 1e-9):
        raise ValueError(f"{path.name}: zero-area triangles")
    normals /= area2[:,None]
    records=np.zeros(len(a),dtype=[('normal','<3f4'),('p','<f4',(3,3)),('attribute','<u2')])
    records['normal']=normals; records['p']=a
    path.parent.mkdir(exist_ok=True, parents=True)
    with path.open('wb') as f:
        f.write(b'Belarus panel / millimetres, Z up'.ljust(80,b' '));f.write(struct.pack('<I',len(a)));f.write(records.tobytes())
    return {'faces':len(a), 'volume_cm3':round(float(m.volume)/1000,4),
            'bbox_local_mm':np.round(m.bounds.ravel(),4).tolist(),
            'verified':{'watertight':True, 'consistent_winding':True,'connected_solids':1}}


def build_parts(records,seats,elevations):
    parts=[]
    for key,word,geo_x,x,y,width,lx,ly,letters,carrier in records:
        for kind in ('star','label'):
            pid=key+'-'+kind
            if kind=='star':
                shape, materials=star_mesh(width)
                pos=(x,y); filename=f'star-{width}mm.stl'
            else:
                shape, materials=letter_mesh(letters,carrier)
                pos=(lx,ly); filename='name-'+key+'.stl'
            path=OUTPUT/filename
            check=write_mesh(path,shape)
            item={'id':pid,'kind':kind,'file':str(path.relative_to(ROOT)), 'name':word,'target_region':key,
                  'translation_mm':[round(pos[0],3),round(pos[1],3),round(float(elevations[pid]),4)],
                  'materials_face_ranges':materials,**check}
            if kind=='star':
                item.update({'tip_span_mm':width,'geographic_reference_xy_mm':[geo_x,y]})
            else:
                item.update({'carrier_height_mm':BODY_Z,'total_height_mm':TOTAL_Z})
            parts.append(item)
    meta={'units':'mm', 'coordinate_system':'X east, Y north, Z outward. Range end is exclusive. STL coordinates are local.',
          'font':'DejaVu Serif Condensed Bold, raised lettering on a single contour-shaped carrier.',
          'sources':{'font':'https://dejavu-fonts.github.io/','licence':'https://dejavu-fonts.github.io/License.html'},
          'brest_adjustment_mm':[4.5,0],'parts':parts}
    dump(ROOT/'data/decor.json',meta)


def rings(shape):
    for poly in polygons(shape):
        for r in (poly.exterior, *poly.interiors):
            yield list(r.coords)


def svg_contours(shape):
    return ' '.join('M'+' '.join(f'{x:.3f},{y:.3f}' for x,y in ring[:-1])+'Z'
                    for ring in rings(shape))


def template_shapes(records):
    shapes=[]
    for region in json.loads((SRC/'region_outlines.json').read_text()):
        shapes.append(('region', Polygon(region['outline'])))
    for key,word,gx,x,y,width,lx,ly,letters,carrier in records:
        shapes.append(('star', translate(Polygon(star_xy(width)),x,y)))
        shapes.append(('carrier',translate(carrier,lx,ly)))
        shapes.append(('letter',translate(letters,lx,ly)))
    return shapes


def write_templates(records):
    from reportlab.pdfgen.canvas import Canvas
    from reportlab.lib.colors import HexColor
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.units import mm
    from reportlab.pdfbase import pdfmetrics
    from reportlab.pdfbase.ttfonts import TTFont
    folder=ROOT/'print'
    folder.mkdir(exist_ok=True)
    shapes=template_shapes(records)
    styles={'region':('#69796a','none',.24), 'star':('#8a3939','#f0dada',.3),
            'carrier':('#6b706e','none',.2), 'letter':('#4d4035','#a99579',.09)}
    # One vector master in true millimetres, independent from browser text and font embedding.
    svg=ET.Element('svg',{'xmlns':'http://www.w3.org/2000/svg','width':'380mm','height':'340mm',
                            'viewBox':'0 0 380 340'})
    ET.SubElement(svg,'title').text='Шаблон установки городов. Масштаб 1:1; север вверху'
    group=ET.SubElement(svg,'g',{'transform':'translate(10,322) scale(1,-1)'})
    for tag,shape in shapes:
        stroke,fill,width=styles[tag]
        ET.SubElement(group,'path',{'d':svg_contours(shape),'fill':fill,'stroke':stroke,
                                     'stroke-width':str(width),'fill-rule':'evenodd'})
    ET.SubElement(svg,'path',{'d':'M12 326v4 M12 328h50 M62 326v4','stroke':'#222','fill':'none','stroke-width':'.3'})
    ET.SubElement(svg,'text',{'x':'67','y':'329','font-family':'sans-serif','font-size':'3.2'}).text='50 мм · масштаб 100 %'
    ET.ElementTree(svg).write(folder/'decor-placement.svg',encoding='utf-8',xml_declaration=True)
    # Fixed scale on four ordinary A4 portrait sheets. Shared mm registration geometry
    # allows trimming two adjoining edges and overlaying the 10 mm strips.
    c=Canvas(str(folder/'decor-placement.pdf'),pagesize=A4,pageCompression=1)
    c.setTitle('Панно «Беларусь» — шаблон размещения звёзд и названий, 1:1')
    regular=fm.findfont(fm.FontProperties(family='DejaVu Sans'))
    bold=fm.findfont(fm.FontProperties(family='DejaVu Sans',weight='bold'))
    pdfmetrics.registerFont(TTFont('DecorSans',regular))
    pdfmetrics.registerFont(TTFont('DecorBold',bold))
    pages=[('А1 — верхний левый',-8,152),('А2 — верхний правый',178,152),
           ('Б1 — нижний левый',-8,-8),('Б2 — нижний правый',178,-8)]
    reg=[(183,y) for y in (15,100,157,217,298)]+[(x,157) for x in (8,96,272,345)]
    for label,x0,y0 in pages:
        c.saveState();c.scale(mm,mm)
        def txt(x,y,t,sz=3.4,strong=False,col='#18281f'):
            c.setFillColor(HexColor(col));c.setFont('DecorBold' if strong else 'DecorSans',sz);c.drawString(x,y,t)
        txt(10,280,'Звёзды и названия городов',6,True)
        txt(10,271,label+'  /  Масштаб 1:1',3.6)
        # Global coordinates within a 196 × 170 mm window.
        vx,vy=7,80
        c.saveState()
        clip=c.beginPath();clip.rect(vx,vy,196,170);c.clipPath(clip,stroke=0,fill=0)
        c.translate(vx-x0,vy-y0)
        for tag,shape in shapes:
            stroke,fill,weight=styles[tag];p=c.beginPath()
            for ring in rings(shape):
                p.moveTo(*ring[0])
                for q in ring[1:-1]:p.lineTo(*q)
                p.close()
            c.setLineWidth(weight);c.setStrokeColor(HexColor(stroke))
            if fill!='none':c.setFillColor(HexColor(fill))
            c.drawPath(p,stroke=1,fill=int(fill!='none'),fillMode=0)
        c.setStrokeColor(HexColor('#334950'));c.setLineWidth(.22)
        for xx,yy in reg:
            c.circle(xx,yy,1.55,stroke=1);c.line(xx-2.6,yy,xx+2.6,yy);c.line(xx,yy-2.6,xx,yy+2.6)
        c.restoreState()
        c.setStrokeColor(HexColor('#b6c1bb'));c.setLineWidth(.12);c.rect(vx,vy,196,170)
        txt(10,66,'Печать и совмещение',4.0,True)
        txt(10,58,'Печатайте на A4 при 100 %. Контрольный отрезок должен быть 50 мм.')
        txt(10,51,'Соберите верхний ряд А1–А2 и нижний Б1–Б2. Нахлёст на стыках 10 мм.')
        txt(10,44,'Подрежьте один край каждой пары по светлой рамке и совместите кресты.')
        txt(10,37,'Проверьте края областей по сухой сборке. Через вырезанные окна шаблона')
        txt(10,31,'перенесите положение деталей на уже окрашенный рельеф.')
        c.setLineWidth(.35);c.setStrokeColor(HexColor('#17271f'));c.line(10,20,60,20)
        for xx in [10,20,30,40,50,60]:c.line(xx,18.5,xx,21.5)
        txt(64,19,'50 мм',3.4,True)
        c.restoreState();c.showPage()
    c.save()


if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--seats-only',action='store_true')
    args=parser.parse_args()
    records,seats=prepare_layout()
    dump(SRC/'decor_seats.json',seats)
    if not args.seats_only:
        heights=json.loads((ROOT/'data/seat_heights.json').read_text())
        build_parts(records,seats,heights)
        write_templates(records)
