"""Angular screen for two Bowden branches of B04 on the V04 manual rig.

Look down from +Z. Both free lengths leave along +X. A is at +Y and B at -Y.
Angles are spool angles in degrees from the indexed midposition.
"""
import csv
import json
from math import asin, cos, degrees, hypot, isclose, pi, radians, sin
from pathlib import Path
from hashlib import sha256
import struct

HERE = Path(__file__).resolve().parent
CORD_RADIUS = 1.
PITCH_RADIUS = 12.
EYE_RADIUS = 13.65
MOUTH_RADIUS = 1.85
EYELET_SPAN = 30.
INDEX = 225.
HALF_EXCLUSION = EYELET_SPAN/2 + degrees(asin((MOUTH_RADIUS+CORD_RADIUS)/EYE_RADIUS))
ALPHA_MAX = 180 - HALF_EXCLUSION
GUIDE_X = 42.
OUTLET_BOUNDARY = 75 + degrees(asin((PITCH_RADIUS-MOUTH_RADIUS-CORD_RADIUS)/EYE_RADIUS))


def outlet_margin(angle):
    # Envelope: circular arc of eyelet centres (inclusive of their bridge),
    # dilated in XY by Rmouth + Rcord. Distance to finite free cord centreline.
    def margin(mid, y_guide):
        start, end = mid - 15, mid + 15
        y_match = degrees(asin(y_guide/EYE_RADIUS))
        azimuths = [start, end]
        # x never reaches GUIDE_X. x=0 partitions endpoint and line projections.
        # y=y_guide gives a zero distance on the line; y extrema and nearest
        # endpoint angle cover all within-span minima.
        for critical in (0, 90, 180, 270, y_match, 180-y_match):
            for j in range(-2, 4):
                a = critical + 360*j
                if start <= a <= end:
                    azimuths.append(a)
        dist = []
        for a in azimuths:
            x = EYE_RADIUS*cos(radians(a))
            y = EYE_RADIUS*sin(radians(a))
            dx = x-min(GUIDE_X,max(0,x))
            dist.append(hypot(dx, y-y_guide))
        return min(dist)-MOUTH_RADIUS-CORD_RADIUS
    return min(margin(45+INDEX+angle,PITCH_RADIUS), margin(225+INDEX+angle,-PITCH_RADIUS))


def position(angle):
    # arc budgets refer to the midpoint azimuth of the two holes; changes only
    # are independent of which hole is chosen for feeding a real cord.
    wind = PITCH_RADIUS * radians(angle)
    return {
        'spool_deg': angle,
        'A_wound_mm': wind,
        'B_wound_mm': -wind,
        'A_free_change_mm': -wind,
        'B_free_change_mm': wind,
        'A_arc_to_sector_mid_deg': 180+angle,
        'B_arc_to_sector_mid_deg': 180-angle,
        'remaining_angular_margin_deg': ALPHA_MAX - abs(angle),
        'equivalent_joint_change_deg': angle*PITCH_RADIUS/31.5,
        'straight_outlets_xy_margin_mm':outlet_margin(angle),
    }


def verify_spool():
    # Independently compute the distance from each circle's tangent radius
    # line to the nearest mouth centre across a fine sampling of spool poses.
    for k in range(-1575,1576):
        angle = k/10
        near_each = []
        for a,b,t in ((30,60,90),(210,240,270)):
            delta = lambda x: abs((x+INDEX+angle-t+180)%360-180)
            c = min(delta(a),delta(b))
            # Domain covered here never enters *between* both hole centres.
            clear = EYE_RADIUS if c>90 else EYE_RADIUS*sin(radians(c))
            near_each.append(clear-MOUTH_RADIUS-CORD_RADIUS)
        margin = position(angle)['remaining_angular_margin_deg']
        assert all((g>0)==(margin>0) for g in near_each)
    for x in (-120,-90,0,90,120):
        s = position(x)
        assert isclose(s['A_wound_mm'] + s['B_wound_mm'], 0, abs_tol=1e-12)
        assert isclose(s['A_arc_to_sector_mid_deg'] + s['B_arc_to_sector_mid_deg'], 360)
    assert isclose(315*PITCH_RADIUS/31.5,120)
    assert isclose(2*pi*PITCH_RADIUS,75.398223686,rel_tol=1e-9)
    assert position(157.5)['remaining_angular_margin_deg'] < 0
    assert position(120)['remaining_angular_margin_deg'] > 0
    assert abs(outlet_margin(OUTLET_BOUNDARY)) < 1e-9
    for angle in (-157.5,-120,-90,0,90,120,157.5):
        # Brute-force sample of the continuous arc, projecting onto the finite segment.
        sampled = []
        for mid,y0 in ((270+angle,12), (450+angle,-12)):
            for i in range(3001):
                a = radians(mid-15+i/100)
                x,y = EYE_RADIUS*cos(a), EYE_RADIUS*sin(a)
                sampled.append(hypot(x-max(0,min(GUIDE_X,x)),y-y0)-MOUTH_RADIUS-CORD_RADIUS)
        assert abs(min(sampled)-outlet_margin(angle)) < .002
        assert isclose(outlet_margin(angle),outlet_margin(-angle),abs_tol=1e-8)
    assert isclose(outlet_margin(90),5.61712003435,abs_tol=1e-8)
    assert isclose(outlet_margin(120),-.50200756320,abs_tol=1e-8)


def verify_coupon():
    import cadquery as cq
    import numpy as np
    p = HERE/'E01_eyelet.stl'
    data = p.read_bytes()
    n, = struct.unpack_from('<I',data,80)
    assert 84 + 50*n == len(data)
    dtype = np.dtype([('n','<f4',(3,)),('v','<f4',(3,3)),('attr','<u2')])
    tri = np.frombuffer(data, offset=84, dtype=dtype)['v'].astype(float)
    vert, ix = np.unique(np.round(tri.reshape(-1,3),6), axis=0, return_inverse=True)
    face = ix.reshape(-1,3)
    edges = np.concatenate([face[:,[0,1]],face[:,[1,2]],face[:,[2,0]]])
    _, ids, counts = np.unique(np.sort(edges,axis=1),axis=0,return_counts=True,return_inverse=True)
    oriented = np.bincount(ids, weights=np.where(edges[:,0]<edges[:,1],1.,-1.))
    assert np.all(counts==2) and np.all(oriented==0)
    assert np.min(np.linalg.norm(np.cross(tri[:,1]-tri[:,0],tri[:,2]-tri[:,0]),axis=1))>1e-9
    mesh_volume = np.einsum('ij,ij->i',tri[:,0],np.cross(tri[:,1],tri[:,2])).sum()/6
    shape = cq.importers.importStep(str(HERE/'E01_eyelet.step')).val()
    assert shape.isValid() and len(shape.Solids())==1 and mesh_volume>0
    assert abs(mesh_volume-shape.Volume())/shape.Volume()<.002
    return {'triangles':n,'step_solids':1,'watertight':True,'consistent_winding':True,
            'volume_mm3':round(shape.Volume(),3),'stl_bounds_mm':np.ptp(vert,axis=0).round(3).tolist()}


if __name__ == '__main__':
    verify_spool()
    coupon = verify_coupon()
    with (HERE/'angle_table.csv').open('w',encoding='utf-8-sig',newline='') as f:
        labels = ['Угол барабана от центра, град','Намотка A, мм','Намотка B, мм','Свободный ход A, мм','Свободный ход B, мм','Дуга A до центра пары, град','Дуга B до центра пары, град','Угловой запас, град','Эквивалентный поворот шарнира от центра, град','Запас прямого выхода в плоскости XY, мм']
        writer=csv.writer(f,delimiter=';');writer.writerow(labels)
        for angle in (-157.5,-150,-135,-120,-90,-60,-30,0,30,60,90,120,135,150,157.5):
            writer.writerow([f'{value:.3f}'.replace('.',',') for value in position(angle).values()])
    with (HERE/'manual_run.csv').open('w',encoding='utf-8-sig',newline='') as f:
        writer=csv.writer(f,delimiter=';')
        writer.writerow(['Прогон','Угол барабана от центра, град','Ожидаемый свободный ход A, мм','Ожидаемый свободный ход B, мм','Измерение A, мм','Измерение B, мм','Сдвиг метки хвоста A, мм','Сдвиг метки хвоста B, мм','Расцепление / контакт / остановка'])
        for i,angle in enumerate([0,30,60,90,60,30,0,-30,-60,-90,-60,-30,0],1):
            s=position(angle)
            writer.writerow([i,angle,*[f'{s[k]:.2f}'.replace('.',',') for k in ['A_free_change_mm','B_free_change_mm']],'','','','',''])
    props = {'basis':'V03 B04 with a single Ø2 mm layer, nominal fixed straight tangents; sector is a conservative XY screen only.',
             'source_step_sha256':sha256((HERE/'../rig/B04.step').read_bytes()).hexdigest(),
             'eyelet_center_radius_mm':EYE_RADIUS,'eyelet_center_chord_mm':2*EYE_RADIUS*sin(radians(15)),
             'mouth_only_sector_deg':30+2*degrees(asin(MOUTH_RADIUS/EYE_RADIUS)),
             'inflated_sector_deg':HALF_EXCLUSION*2,'hard_projection_boundary_per_side_deg':ALPHA_MAX,
             'geometry_screen_interval_deg':[ -157.5,157.5 ], 'sampling_step_deg':.1,
             'outlet_check':'Minimum plane distance of the R13.65 eyelet-centre arc to the X=[0,42] straight cord centreline, minus (1.85+1.00) mm, min of A and B.',
             'straight_outlet_limit_deg':OUTLET_BOUNDARY, 'straight_outlet_margins_mm':{str(a):outlet_margin(a) for a in (0,90,120,157.5)},
             'ideal_turn_mm':2*pi*PITCH_RADIUS,'coupon': coupon}
    (HERE/'cable_checks.json').write_text(json.dumps(props,ensure_ascii=False,indent=2)+'\n')
