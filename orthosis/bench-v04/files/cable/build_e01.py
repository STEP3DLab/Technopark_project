"""Build the E01 eyelet coupon from V03 B04 STEP. Units are millimetres."""
import argparse
from math import cos, radians, sin
from pathlib import Path

import cadquery as cq

HERE = Path(__file__).resolve().parent


def cylinder(r, h, x=0.0, y=0.0, z=0.0):
    return cq.Solid.makeCylinder(r, h, cq.Vector(x, y, z))


def make_coupon(source):
    # The B04 lower cheek pair, azimuth 30/60°, becomes symmetric around +X.
    reference = cq.importers.importStep(str(source)).val().rotate((0, 0, 0), (0, 0, 1), -45)
    a = radians(38)
    sector = (cq.Workplane('XY').polyline([(0, 0), (28*cos(a), -28*sin(a)),
                                         (28*cos(a), 28*sin(a))]).close().extrude(2.4).val())
    tip = reference.intersect(sector).cut(cylinder(8.0, 2.4))
    # The flat tail fits smooth vice jaws. Its two Ø4.5 holes can locate it to a board.
    handle = cq.Workplane('XY').center(-12.5, 0).rect(43, 11).extrude(2.4).edges('|Z').fillet(1.2).val()
    coupon = tip.fuse(handle)
    for x in (-27, -13):
        coupon = coupon.cut(cylinder(2.25, 4.4, x=x, z=-1))
    coupon = coupon.clean()
    # Check identical local geometry inside each inspection cylinder on both faces.
    for az in (-15, 15):
        x = 13.65*cos(radians(az))
        y = 13.65*sin(radians(az))
        probe = cylinder(2.0, 2.4, x, y)
        a, b = reference.intersect(probe), coupon.intersect(probe)
        assert a.Volume() > 1
        assert a.cut(b).Volume() + b.cut(a).Volume() < 1e-6
        assert coupon.intersect(cylinder(1.349, 2.4, x, y)).Volume() < 1e-6
        assert coupon.intersect(cylinder(1.36, .1, x, y, 1.15)).Volume() > 0
    assert coupon.isValid() and len(coupon.Solids()) == 1
    return coupon


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source', type=Path, default=HERE/'../rig/B04.step')
    args = parser.parse_args()
    solid = make_coupon(args.source)
    cq.exporters.export(solid, str(HERE/'E01_eyelet.step'))
    cq.exporters.export(solid, str(HERE/'E01_eyelet.stl'), tolerance=.035, angularTolerance=.11)
