"""Orthosis bench spool B04 for Pololu hub #1997. All dimensions in millimetres.
Run: python build_b04.py (CadQuery 2.7). Outputs are next to the script.
Drawing: https://www.pololu.com/file/0J663/1997-4mm-m3-hub-dimensions.pdf
Body axis +Z. Hub on Z=0 face. Both models use print coordinates.
"""
from math import cos, radians, sin
from pathlib import Path

import cadquery as cq

OUT = Path(__file__).resolve().parent
WIDTH = 14.0
CORE_R, FLANGE_R = 11.0, 17.0
FLANGES = [(0.0, 2.4), (6.0, 2.0), (11.6, 2.4)]
HUB_PCD, HUB_POCKET_D, HUB_POCKET_DEPTH = 12.7, 19.4, 1.0
SHAFT_CLEARANCE_D, SCREW_CLEARANCE_D = 4.6, 3.4
EYELET_R, EYELET_D, MOUTH_R = 13.65, 2.7, 1.85
MOUTH_DEPTH = 0.5


def cylinder(radius, height, z, x=0.0, y=0.0):
    return cq.Solid.makeCylinder(radius, height, cq.Vector(x, y, z))


def make_spool():
    part = cylinder(CORE_R, WIDTH, 0.0)
    for z, h in FLANGES:
        part = part.fuse(cylinder(FLANGE_R, h, z))
    part = part.clean()
    rims = [e for e in part.Edges() if e.geomType() == 'CIRCLE']
    part = part.fillet(0.45, rims)

    part = part.cut(cylinder(HUB_POCKET_D / 2, HUB_POCKET_DEPTH + 1, -1))
    part = part.cut(cylinder(SHAFT_CLEARANCE_D / 2, WIDTH + 2, -1))
    for angle in (0, 90, 180, 270):
        a = radians(angle)
        x, y = 0.5 * HUB_PCD * cos(a), 0.5 * HUB_PCD * sin(a)
        part = part.cut(cylinder(SCREW_CLEARANCE_D / 2, WIDTH + 2, -1, x, y))

    # Each pair passes through one outer cheek, into its own cable groove.
    # Tails and test terminations stay on the outside axial face.
    for z, thickness, azimuth in [(0.0, 2.4, 45), (11.6, 2.4, 225)]:
        for angle in (azimuth - 15, azimuth + 15):
            a = radians(angle)
            x, y = EYELET_R * cos(a), EYELET_R * sin(a)
            through = cylinder(EYELET_D / 2, thickness + 0.02, z - 0.01, x, y)
            bell1 = cq.Solid.makeCone(MOUTH_R, EYELET_D / 2, MOUTH_DEPTH,
                                      cq.Vector(x, y, z))
            bell2 = cq.Solid.makeCone(EYELET_D / 2, MOUTH_R, MOUTH_DEPTH,
                                      cq.Vector(x, y, z + thickness - MOUTH_DEPTH))
            part = part.cut(through.fuse(bell1, bell2))
    return part.clean()


if __name__ == '__main__':
    spool = make_spool()
    assert spool.isValid() and len(spool.Solids()) == 1
    cq.exporters.export(spool, str(OUT / 'B04.step'))
    cq.exporters.export(spool, str(OUT / 'B04.stl'), tolerance=0.04, angularTolerance=0.20)
