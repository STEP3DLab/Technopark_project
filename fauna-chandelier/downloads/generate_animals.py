#!/usr/bin/env python3
"""FAUNA v2 decorative animals. Millimetres; XY floor, Z up, front is -Y.

Requires cadquery>=2.7, numpy and trimesh. Run: python generate_animals.py
The repository copy writes site/downloads/ and site/models.js. A standalone
download writes a new fauna-generated/ folder beside the script.
These are prototype decorative
solids; metal supports, retention and electrical assembly require engineering
verification. The two holes are pilot holes, not validated structural joints.
"""
from pathlib import Path
import json
import math
import shutil
import time
import cadquery as cq
import numpy as np
import trimesh

SOURCE = Path(__file__).resolve()
ROOT = SOURCE.parents[1] if SOURCE.parent.name == "scripts" else SOURCE.parent
SITE = ROOT / "site" if SOURCE.parent.name == "scripts" else ROOT / "fauna-generated"
OUT = SITE / "downloads"
OUT.mkdir(parents=True, exist_ok=True)


def ell(x, y, z, a, b, c, ry=0, rx=0, rz=0):
    s = cq.Solid.makeSphere(1, angleDegrees1=-90, angleDegrees2=90)
    s = s.transformGeometry(cq.Matrix([[a, 0, 0, 0], [0, b, 0, 0], [0, 0, c, 0], [0, 0, 0, 1]]))
    if rx:
        s = s.rotate((0, 0, 0), (1, 0, 0), rx)
    if ry:
        s = s.rotate((0, 0, 0), (0, 1, 0), ry)
    if rz:
        s = s.rotate((0, 0, 0), (0, 0, 1), rz)
    return s.translate((x, y, z))


def tapered_ear(x, y, z, radius=13, height=31, lean=0):
    s = cq.Solid.makeCone(radius, 2.8, height)
    s = s.transformGeometry(cq.Matrix([[1, 0, 0, 0], [0, .70, 0, 0], [0, 0, 1, 0], [0, 0, 0, 1]]))
    s = s.rotate((0, 0, 0), (0, 1, 0), lean)
    return s.translate((x, y, z))


def base(a=43, b=33):
    return cq.Workplane("XY").ellipse(a, b).extrude(8).edges(">Z").fillet(1.6).val()


def eye_disc(x):
    # Analytic cylinder/torus faces survive STEP round-tripping more reliably
    # than boolean intersections between several independently scaled splines.
    s = cq.Solid.makeCylinder(18.5, 13, cq.Vector(x, -23, 113), cq.Vector(0, -1, 0))
    return s.fillet(1.0, s.Edges())


def owl_pupil(x):
    s = cq.Solid.makeCylinder(4.2, 7, cq.Vector(x, -28, 113), cq.Vector(0, -1, 0))
    return s.fillet(.8, s.Edges())


def assemble(parts, cuts=()):
    s = parts[0].fuse(*parts[1:]).clean()
    for cut in cuts:
        s = s.cut(cut)
    for x in (-22, 22):
        # Actual 3.2 mm diameter, 5 mm effective depth from flat underside.
        s = s.cut(cq.Solid.makeCylinder(1.6, 5.1, cq.Vector(x, 0, -.1), cq.Vector(0, 0, 1)))
    # Trim below Z=0 to retain a planar printing surface even after unions.
    s = s.cut(cq.Solid.makeBox(500, 500, 100, cq.Vector(-250, -250, -100))).clean()
    if not s.isValid() or len(s.Solids()) != 1:
        raise ValueError("Animal must be a valid single solid")
    return s


def fox():
    parts = [
        base(45, 34),
        ell(0, 5, 48, 30, 26, 44),
        ell(0, -5, 72, 25, 24, 37),
        ell(-18, -17, 13, 17, 24, 10),
        ell(18, -17, 13, 17, 24, 10),
        ell(-13, -20, 41, 10, 12, 32, ry=-5),
        ell(13, -20, 41, 10, 12, 32, ry=5),
        ell(0, -9, 109, 34, 26, 28),
        # Distinctive pointed fox muzzle, and a connected small nose.
        ell(0, -31, 98, 19, 24, 13),
        ell(0, -52, 100, 6.5, 6, 5.2),
        tapered_ear(-22, -4, 126, lean=-13),
        tapered_ear(22, -4, 126, lean=13),
        # Broad, curled tail resting around the right side and front paws.
        ell(35, 9, 37, 20, 20, 36, ry=-22),
        ell(38, -13, 23, 26, 20, 17, rz=-18),
        ell(19, -31, 25, 26, 13, 11, rz=13),
    ]
    cuts = [
        ell(-14, -32.5, 112, 3.5, 3.2, 3.0),
        ell(14, -32.5, 112, 3.5, 3.2, 3.0),
        ell(-26, -11.5, 143, 5.2, 4.8, 10, ry=-13),
        ell(26, -11.5, 143, 5.2, 4.8, 10, ry=13),
    ]
    return assemble(parts, cuts)


def hare():
    parts = [
        base(42, 33),
        ell(0, 6, 48, 30, 25, 44),
        ell(-20, -15, 14, 19, 25, 11),
        ell(20, -15, 14, 19, 25, 11),
        ell(0, -5, 75, 23, 22, 32),
        ell(-12, -19, 43, 9, 11, 30, ry=-5),
        ell(12, -19, 43, 9, 11, 30, ry=5),
        ell(0, -9, 107, 29, 25, 27),
        ell(-17, 0, 139, 11, 10, 37, ry=-10),
        ell(17, 0, 139, 11, 10, 37, ry=10),
        ell(-8, -30, 98, 11, 11, 9),
        ell(8, -30, 98, 11, 11, 9),
        ell(0, -37, 105, 4.3, 4.3, 3.4),
        ell(0, 29, 29, 13, 13, 14),
    ]
    cuts = [
        ell(-13, -30.5, 113, 3.6, 3.6, 4),
        ell(13, -30.5, 113, 3.6, 3.6, 4),
        ell(-18, -8, 143, 5.7, 5.4, 26, ry=-10),
        ell(18, -8, 143, 5.7, 5.4, 26, ry=10),
    ]
    return assemble(parts, cuts)


def owl():
    parts = [
        base(44, 34),
        ell(0, 2, 60, 37, 29, 53),
        ell(0, -6, 68, 30, 25, 41),
        ell(0, -2, 111, 41, 29, 27),
        ell(-34, 4, 66, 13, 24, 39, ry=-9),
        ell(34, 4, 66, 13, 24, 39, ry=9),
        eye_disc(-18),
        eye_disc(18),
        tapered_ear(-28, 0, 125, radius=10, height=18, lean=-17),
        tapered_ear(28, 0, 125, radius=10, height=18, lean=17),
        ell(-15, -18, 12, 16, 20, 8),
        ell(15, -18, 12, 16, 20, 8),
        cq.Solid.makeCone(8.0, 2.8, 16, cq.Vector(0, -27, 103), cq.Vector(0, -1, -.55)),
    ]
    # Eye recesses remain integral to the solid. Dark painting is optional.
    cuts = [cq.Solid.makeCylinder(10.5, 15, cq.Vector(x, -45, 113), cq.Vector(0, 1, 0)) for x in (-18, 18)]
    s = assemble(parts, cuts)
    pupils = [owl_pupil(-18), owl_pupil(18)]
    s = s.fuse(*pupils).clean()
    if len(s.Solids()) != 1 or not s.isValid():
        raise ValueError("Owl eye detail disconnected")
    return s


def mesh_of(s, tolerance, angle):
    verts, faces = s.tessellate(tolerance, angle)
    mesh = trimesh.Trimesh(vertices=np.asarray([v.toTuple() for v in verts]), faces=np.asarray(faces), process=True)
    mesh.merge_vertices(digits_vertex=5)
    mesh.update_faces(mesh.nondegenerate_faces())
    mesh.update_faces(mesh.unique_faces())
    mesh.remove_unreferenced_vertices()
    trimesh.repair.fix_normals(mesh)
    return mesh


def main():
    models = {}
    report = {
        "project": "FAUNA", "version": "2.0", "units": "mm", "coordinates": "Z up, front -Y, base at Z=0",
        "stage": "Prototype decorative parts; no physical print, thermal or suspension test performed.",
        "mounting": {"pilot_hole_diameter_mm": 3.2, "pilot_hole_depth_mm": 5.0, "centres_mm": [[-22, 0, 0], [22, 0, 0]]},
        "animals": {}
    }
    names = {"fox": "Лиса", "hare": "Заяц", "owl": "Сова"}
    for key, factory in [("fox", fox), ("hare", hare), ("owl", owl)]:
        t = time.time()
        print("Building", key, flush=True)
        solid = factory()
        # Export the review mesh before finer triangulation fills OCC's cache.
        preview = mesh_of(solid, .65, .50)
        models[key] = {
            "name": names[key],
            "vertices": np.round(preview.vertices, 3).ravel().tolist(),
            "faces": preview.faces.ravel().tolist(),
            "bounds": np.round(preview.bounds, 3).tolist(),
            "size": np.round(preview.extents, 2).tolist(),
            "stl": f"downloads/{key}.stl", "step": f"downloads/{key}.step",
        }
        cq.exporters.export(solid, str(OUT / f"{key}.step"))
        hi = mesh_of(solid, .10, .20)
        hi.export(OUT / f"{key}.stl")
        # Reload the actual written download; these are file checks, not claims
        # about print settings or the installed electrical assembly.
        actual = trimesh.load_mesh(OUT / f"{key}.stl")
        actual.merge_vertices(digits_vertex=4)
        actual.update_faces(actual.nondegenerate_faces())
        actual.update_faces(actual.unique_faces())
        actual.remove_unreferenced_vertices()
        info = {
            "cad_valid": solid.isValid(), "cad_solids": len(solid.Solids()),
            "stl_watertight": bool(actual.is_watertight), "stl_winding_consistent": bool(actual.is_winding_consistent),
            "stl_components": len(actual.split(only_watertight=False)),
            "stl_triangles": len(actual.faces), "preview_triangles": len(preview.faces),
            "size_mm": np.round(actual.extents, 2).tolist(),
            "bounds_mm": np.round(actual.bounds, 3).tolist(),
            "solid_volume_cm3": round(solid.Volume() / 1000, 3),
            "stl_bytes": (OUT / f"{key}.stl").stat().st_size,
            "step_bytes": (OUT / f"{key}.step").stat().st_size,
        }
        step_reloaded = cq.importers.importStep(str(OUT / f"{key}.step")).val()
        info["step_valid"] = step_reloaded.isValid()
        info["step_solids"] = len(step_reloaded.Solids())
        info["step_volume_difference_percent"] = round(100 * abs(step_reloaded.Volume() - solid.Volume()) / solid.Volume(), 5)
        info["pilot_holes_checked"] = all(not step_reloaded.isInside((x, 0, 2)) and step_reloaded.isInside((x, 0, 6)) for x in (-22, 22))
        # UI dimensions refer to the full-resolution downloadable STL, not the
        # deliberately coarser browser mesh.
        models[key]["size"] = info["size_mm"]
        models[key]["bounds"] = info["bounds_mm"]
        models[key]["base"] = {"fox": [90, 68, 8], "hare": [84, 66, 8], "owl": [88, 68, 8]}[key]
        report["animals"][key] = info
        print(key, json.dumps(info), "seconds", round(time.time() - t, 1), flush=True)
        if not info["stl_watertight"] or info["stl_components"] != 1:
            raise ValueError(f"{key}: exported STL invalid")
        if not info["step_valid"] or info["step_solids"] != 1 or info["step_volume_difference_percent"] > .1:
            raise ValueError(f"{key}: STEP round-trip invalid")
    (SITE / "models.js").write_text("/* FAUNA v2: millimetres; tessellated from the downloadable CAD solids. */\nwindow.FAUNA_MODELS=" + json.dumps(models, separators=(",", ":"), ensure_ascii=False) + ";\n", encoding="utf8")
    (OUT / "mesh-validation.json").write_text(json.dumps(report, indent=2, ensure_ascii=False) + "\n", encoding="utf8")
    shutil.copy2(__file__, OUT / "generate_animals.py")


if __name__ == "__main__":
    main()
