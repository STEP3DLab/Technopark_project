"""Rebuild the printable European bison from its editable silhouette and local surface sample.

Python 3 with numpy, scipy, pillow, fonttools, shapely and trimesh. No network.
All STL coordinates in millimetres. Back on XY, face up, nose points right.
"""
from pathlib import Path
from xml.etree import ElementTree as ET
import json
import numpy as np
from fontTools.pens.basePen import BasePen
from fontTools.svgLib.path import parse_path
from PIL import Image
from scipy.interpolate import RegularGridInterpolator
from scipy.ndimage import gaussian_filter
from scipy.spatial import Delaunay
import shapely
from shapely.geometry import Polygon, LineString
import trimesh

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "source"
WIDTH = 57.5
ORIGIN = np.array([77.5, 57.0])


class SampleCurves(BasePen):
    def __init__(self):
        super().__init__(None)
        self.points = []

    def _moveTo(self, point):
        self.points.append(np.array(point, dtype=float))

    def _lineTo(self, point):
        self.points.append(np.array(point, dtype=float))

    def _curveToOne(self, p1, p2, p3):
        a, b, c, d = self.points[-1], np.array(p1), np.array(p2), np.array(p3)
        for t in np.linspace(0, 1, 14)[1:]:
            u = 1-t
            self.points.append(u**3*a + 3*u**2*t*b + 3*u*t**2*c + t**3*d)

    def _qCurveToOne(self, p1, p2):
        a, b, c = self.points[-1], np.array(p1), np.array(p2)
        for t in np.linspace(0, 1, 10)[1:]:
            u = 1-t
            self.points.append(u*u*a + 2*u*t*b + t*t*c)

    def _closePath(self):
        pass


def geometry():
    node = ET.parse(SOURCE / "bison-profile.svg").getroot().find('{*}path')
    pen = SampleCurves()
    parse_path(node.attrib['d'], pen)
    profile = np.array(pen.points)
    px0, py1 = profile[:, 0].min(), profile[:, 1].max()
    scale = WIDTH / np.ptp(profile[:, 0])
    polygon_px = Polygon(profile)
    if not polygon_px.is_valid:
        polygon_px = polygon_px.buffer(0)
    profile = np.array(polygon_px.exterior.coords)
    contour = (profile - [px0, py1]) * [scale, -scale]
    polygon = Polygon(contour).simplify(.012, preserve_topology=True)
    curve = polygon.exterior
    # Retain native corners and add points on longer curves, protecting the small horns.
    coords = np.array(curve.coords)
    rows = []
    for a, b in zip(coords[:-1], coords[1:]):
        n = int(np.ceil(np.linalg.norm(b-a)/.24))
        rows.extend(a + (b-a)*i/n for i in range(n))
    border = np.array(rows)
    shape = Polygon(border)
    outline = np.round(np.array(shape.simplify(.05).exterior.coords)[:-1], 3)
    (SOURCE / 'bison_outline_mm.json').write_text(json.dumps(outline.tolist(), separators=(',',':')))
    return shape, border, scale, px0, py1


def z_surface(xy, shape, to_px):
    scale, px0, py1 = to_px
    x, y = xy[:,0]/scale + px0, -xy[:,1]/scale + py1
    dist = shapely.distance(shapely.points(xy), shape.boundary)
    px_img = np.asarray(Image.open(SOURCE/'bison-surface.png'), float)/255.
    # The source is a reference for fine fur and eye detail only, not an inverse depth map.
    high = px_img - gaussian_filter(px_img, 2.45, mode='nearest')
    signal = RegularGridInterpolator((np.arange(px_img.shape[0]),np.arange(px_img.shape[1])),high,bounds_error=False,fill_value=0)
    chased = signal(np.c_[y/4-.375,x/4-.375])
    def oval(cx,cy,rx,ry,angle=0):
        u,v = x-cx,y-cy
        r=np.radians(angle)
        return np.exp(-1.07*(((u*np.cos(r)+v*np.sin(r))/rx)**2+((-u*np.sin(r)+v*np.cos(r))/ry)**2))
    def ridge(points, radius):
        d=shapely.distance(shapely.points(x,y),LineString(points))
        return np.exp(-np.square(d/radius))
    # Main planes: rump, rib cage, shoulder hump, head, cheek and projecting muzzle.
    body = (2.2*oval(234,212,138,90,-12) + 2.0*oval(348,203,153,105,-7)
          + 3.0*oval(473,185,108,121,-11) + .9*oval(548,208,77,89,18)
          + 2.1*oval(654,243,73,80,14) + 1.25*oval(681,316,30,22,12))
    near_legs=(ridge([(172,245),(151,289),(109,323),(95,369),(82,400),(91,427)],16)
              +ridge([(484,273),(505,317),(530,348),(545,386),(565,414),(587,427)],17))
    far_legs=(ridge([(251,278),(237,328),(232,343),(269,387),(284,414),(306,428)],12)
             +ridge([(420,295),(423,330),(411,357),(401,390),(399,413),(410,426)],13))
    horns = ridge([(603,215),(626,208),(642,183),(659,151)],8) + ridge([(711,198),(727,183),(727,166),(718,149)],6)
    detail = .58*oval(657,260,9,10) - .28*oval(651,259,19,13) + .53*oval(605,214,15,10,12)
    tail = ridge([(138,146),(116,164),(100,189),(95,221),(84,254),(64,282)],6.5)
    rounded = np.sqrt(np.clip(dist/1.25,0,1))
    # 1.05 mm vertical contact wall even at the feathers of the silhouette.
    bump = .48+body+.8*near_legs+.49*far_legs+1.04*horns+detail+.33*tail+1.85*chased
    return 1.05+rounded*np.maximum(bump,.18)


def build():
    shape,border,scale,px0,py1=geometry()
    import sys
    if '--outline-only' in sys.argv:
        print('Outline',shape.bounds)
        return
    pitch=.23
    x0,y0,x1,y1=shape.bounds
    gy,gx=np.mgrid[y0+pitch/2:y1:pitch*.8660254,x0+pitch/2:x1:pitch]
    gx[1::2]+=pitch/2
    candidates=np.c_[gx.ravel(),gy.ravel()]
    inner=shapely.contains_xy(shape.buffer(-pitch*.88),candidates[:,0],candidates[:,1])
    pts=np.vstack([border,candidates[inner]])
    conn=Delaunay(pts).simplices
    centres=pts[conn].mean(axis=1)
    conn=conn[shapely.contains_xy(shape,centres[:,0],centres[:,1])]
    tri=pts[conn]
    twice_area=np.abs((tri[:,1,0]-tri[:,0,0])*(tri[:,2,1]-tri[:,0,1])-(tri[:,1,1]-tri[:,0,1])*(tri[:,2,0]-tri[:,0,0]))
    conn=conn[twice_area>1e-9]
    top_edges=np.sort(np.vstack([conn[:,[0,1]],conn[:,[1,2]],conn[:,[2,0]]]),axis=1)
    edge,counts=np.unique(top_edges,axis=0,return_counts=True)
    perimeter=edge[counts==1]
    z=z_surface(pts,shape,(scale,px0,py1))
    verts=np.c_[pts,z]
    boundary_ids=np.unique(perimeter)
    bottom_lut=np.full(len(pts),-1)
    bottom_lut[boundary_ids]=np.arange(len(pts),len(pts)+len(boundary_ids))
    # Use a separate planar triangulation for the flat back, retaining perimeter indices.
    back_pts=pts[boundary_ids]
    b_conn=Delaunay(back_pts).simplices
    back_centres=back_pts[b_conn].mean(axis=1)
    b_conn=b_conn[shapely.contains_xy(shape,back_centres[:,0],back_centres[:,1])]
    verts=np.vstack([verts,np.c_[back_pts,np.zeros(len(back_pts))]])
    faces=[conn, np.arange(len(pts),len(pts)+len(boundary_ids))[b_conn[:,::-1]]]
    walls=[]
    for first,second in perimeter:
        lo,hi=bottom_lut[first],bottom_lut[second]
        walls.extend([[first,second,hi],[first,hi,lo]])
    faces.append(np.array(walls))
    mesh=trimesh.Trimesh(vertices=verts,faces=np.vstack(faces),process=True,validate=True)
    # A very narrow concavity can be numerically ambiguous for independent Delaunay
    # triangulations. Matching bottom faces are exact and remain planar.
    if not mesh.is_watertight:
        n=len(pts)
        vv=np.vstack([np.c_[pts,z],np.c_[pts,np.zeros(n)]])
        walls=[]
        for a,b in perimeter:
            walls.extend([[a,b,b+n],[a,b+n,a+n]])
        mesh=trimesh.Trimesh(vertices=vv,faces=np.vstack([conn,conn[:,::-1]+n,walls]),process=True,validate=True)
    mesh.fix_normals()
    assert mesh.is_watertight and mesh.is_winding_consistent and mesh.volume > 0
    assert mesh.body_count==1 and mesh.euler_number==2
    mesh.apply_translation(-mesh.bounds[0])
    path=ROOT/'models/bison/bison.stl'
    path.parent.mkdir(parents=True,exist_ok=True)
    mesh.export(path)
    print('extent',mesh.extents,'volume',mesh.volume,'triangles',len(mesh.faces))
    seats_path=ROOT/'data/seat_heights.json'
    seat=float(json.loads(seats_path.read_text())['bison']) if seats_path.exists() else None
    meta={'name':'Зубр','id':'bison','path':'models/bison/bison.stl','units':'mm','bounds':mesh.bounds.round(3).tolist(),'size':mesh.extents.round(3).tolist(),'origin_xy_mm':ORIGIN.tolist(),'mount_z_source':'data/seat_heights.json#bison','mount_z_mm':seat,'placement_xyz_mm':[*ORIGIN.tolist(),seat],'volume_cm3':round(abs(mesh.volume)/1000,3),'triangles':len(mesh.faces),'watertight':True,'euler_number':2,'source':'Авторский профиль по утверждённому эскизу, аналитический скульптурный рельеф и чеканка поверхности. Обратная сторона плоская.','sash':{'path':'print/sash-1to1.pdf','vector_master':'print/sash.svg','texture':'print/sash-texture.png','width_mm':340,'height_mm':38,'finished_size_includes_fringe':True,'fringe_per_end_mm':10,'designation':'Орнаментальная стилизация по мотивам слуцкого пояса'}}
    (ROOT/'data/bison.json').write_text(json.dumps(meta,ensure_ascii=False,indent=2)+'\n')
if __name__=='__main__':
    build()
