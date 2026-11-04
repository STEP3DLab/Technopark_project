"""Build the B04 manual fixture in neutral position. CadQuery 2.7, mm."""
from functools import lru_cache
from itertools import combinations
from math import cos, radians, sin
from pathlib import Path
import json

import cadquery as cq


DIRECTORY = Path(__file__).resolve().parent
AXIS = (0, 0, 1)
ORIGIN = (0, 0, 0)
NEUTRAL_DEG = 225


def xy(z=0):
    return cq.Workplane("XY", origin=(0, 0, z))


def cylinder(radius, height, z=0, x=0, y=0):
    return xy(z).center(x, y).circle(radius).extrude(height)


def box(x, y, z, length, width, height):
    return xy(z).center(x, y).rect(length, width).extrude(height)


def ring(outer_radius, inner_radius, height, z):
    return xy(z).circle(outer_radius).circle(inner_radius).extrude(height)


def along_x(x, y, z):
    return cq.Workplane("YZ", origin=(x, y, z))


def flare(x, y, z, inlet, outlet):
    return cq.Workplane(obj=cq.Solid.makeCone(
        inlet, outlet, 1, cq.Vector(x, y, z), cq.Vector(1, 0, 0)
    ))


def neutral(part):
    return part.rotate(ORIGIN, AXIS, NEUTRAL_DEG)


@lru_cache(maxsize=1)
def geometry():
    """Return positioned solids and print-oriented parts. Leave imported B04 intact."""
    base = box(17, 0, 8, 94, 60, 6).edges("|Z").fillet(4)
    foot = ring(5, 2.25, 8, 0)
    feet = []
    for x in (-24, 58):
        for y in (-24, 24):
            base = base.cut(cylinder(2.25, 15, 0, x, y))
            feet.append(foot.translate((x, y, 0)))

    base = (base.union(cylinder(10, 14, 8))
            .cut(cylinder(4.7, 15, 8))
            .cut(cylinder(6.55, 5, 8))
            .cut(cylinder(6.55, 5, 17)))
    for y, center_z in ((12, 31.2), (-12, 36.8)):
        guide = box(48, y, 14, 12, 10, center_z + 5 - 14).edges("|Z").fillet(1.5)
        guide = (guide.cut(along_x(41, y, center_z).circle(1.5).extrude(14))
                 .cut(flare(42, y, center_z, 2.5, 1.5))
                 .cut(flare(53, y, center_z, 1.5, 2.5)))
        base = base.union(guide)

    wheel = cylinder(10.5, 9).cut(cylinder(2.3, 9))
    for i in range(12):
        angle = radians(15 + i * 30)
        wheel = wheel.cut(cylinder(1.3, 9, 0, 11 * cos(angle), 11 * sin(angle)))

    # Threaded bores and threaded fasteners use smooth nominal envelopes.
    hub = cylinder(9.5, 5, 23).cut(cylinder(2, 5, 23))
    screws = []
    for i in range(4):
        angle = radians(i * 90)
        x, y = 6.35 * cos(angle), 6.35 * sin(angle)
        wheel = wheel.cut(cylinder(1.7, 9, 0, x, y))
        hub = hub.cut(cylinder(1.5, 5, 23, x, y))
        screw = cylinder(1.5, 25, 25, x, y).union(cylinder(2.75, 3, 50, x, y))
        screws.append(neutral(screw))

    # Keep the bearing tracks round. Align the local flat with the hub set screw.
    shaft = cylinder(2, 40, 2).cut(box(0, 3.5, 23, 6, 4, 5))
    shaft = shaft.rotate(ORIGIN, AXIS, -45)
    screw_bore = along_x(0, 0, 25.5).circle(1.5).extrude(10).rotate(ORIGIN, AXIS, 45)
    hub = hub.cut(screw_bore)
    hub_screw = along_x(1.5, 0, 25.5).circle(1.5).extrude(7.5).rotate(ORIGIN, AXIS, 45)
    collar = ring(5, 2, 5, 2).cut(along_x(0, 0, 4.5).circle(1.25).extrude(6))
    lower_screw = along_x(2, 0, 4.5).circle(1.25).extrude(3)
    drum = cq.importers.importStep(str(DIRECTORY / "B04.step"))

    # Name, positioned workplane, rotating, sRGB. Gray purchased parts are
    # mating envelopes. In particular, the two bearings are represented as rings.
    items = [
        ("D01_base", base, False, "#8b9cac"),
        ("D02_wheel", neutral(wheel.translate((0, 0, 41))), True, "#fea524"),
        ("B04", neutral(drum.translate((0, 0, 27))), True, "#217990"),
        ("HUB_1997", neutral(hub), True, "#aaaaaa"),
        ("shaft", neutral(shaft), True, "#96969c"),
        ("hub_grub", neutral(hub_screw), True, "#555555"),
        ("collar", collar, True, "#777777"),
        ("collar_grub", lower_screw, True, "#555555"),
    ]
    for i, placed in enumerate(feet):
        items.append((f"D03_foot_{i}", placed, False, "#8b9cac"))
    for z in (8, 17):
        items.append((f"bearing_{z}", ring(6.5, 2, 5, z), False, "#bec1c7"))
    items.extend([
        ("bottom_shim", ring(3.5, 2.05, 0.8, 7), True, "#b4c4cf"),
        ("top_shim", ring(3.5, 2.05, 1, 22), True, "#b4c4cf"),
    ])
    for i, placed in enumerate(screws):
        items.append((f"M3_{i}", placed, True, "#797c80"))

    printable = [
        ("D01_base", base.translate((0, 0, -8))),
        ("D02_wheel", wheel),
        ("D03_foot", foot),
    ]
    return items, printable


def scene_parts():
    """Yield (name, cadquery.Shape in neutral world coordinates, rotates, sRGB hex)."""
    items, _ = geometry()
    for name, workplane, rotates, color in items:
        yield name, workplane.val(), rotates, color


def main():
    from motion_check import check_rotation

    _, printable = geometry()
    print_dir = DIRECTORY / "parts"
    print_dir.mkdir(exist_ok=True)
    for name, solid in printable:
        for extension in ("step", "stl"):
            output = print_dir / f"{name}.{extension}"
            cq.exporters.export(solid, str(output), tolerance=.035, angularTolerance=.10)

    parts = list(scene_parts())
    assembly = cq.Assembly(name="Manual_B04")
    checks = {}
    for name, solid, _, color in parts:
        assembly.add(solid, name=name, color=cq.Color(color))
        bounds = solid.BoundingBox()
        checks[name] = {
            "valid": solid.isValid(),
            "bounds": [[round(getattr(bounds, axis + limit), 3) for axis in "xyz"]
                       for limit in ("min", "max")],
        }
        if not checks[name]["valid"]:
            raise ValueError(f"Invalid CAD solid: {name}")
    for first, second in combinations(parts, 2):
        overlap = first[1].intersect(second[1]).Volume()
        if overlap > 1e-5:
            raise ValueError((first[0], second[0], overlap))
    assembly.save(str(DIRECTORY / "V04_assembly.step"))
    report = {"intersections_above_1e-5_mm3": [], "parts": checks}
    (DIRECTORY / "geometric_checks.json").write_text(json.dumps(report, indent=2))

    mesh_dir = DIRECTORY / "viz_parts"
    mesh_dir.mkdir(exist_ok=True)
    manifest = []
    for name, solid, rotates, color in parts:
        path = mesh_dir / f"{name}.stl"
        cq.exporters.export(solid, str(path), tolerance=.04, angularTolerance=.1)
        manifest.append({"name": name, "file": "viz_parts/" + path.name,
                         "rotating": rotates, "color": color})
    (DIRECTORY / "viz_manifest.json").write_text(json.dumps(manifest, indent=2))

    sweep = check_rotation(parts)
    (DIRECTORY / "motion_checks.json").write_text(json.dumps(sweep, indent=2))
    print("Neutral assembly and continuous rotation checks passed.")


if __name__ == "__main__":
    main()
