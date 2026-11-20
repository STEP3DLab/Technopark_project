"""Люмен LM-04, ревизия A — параметрический пассивный макет пульта.

Сборка исходников: python -m pip install cadquery==2.7.0
                   python lm04-model.py --output ./export
В каталоге export/kit будут STEP, GLB, посадки и ориентированные для печати STL.
В export/model будет независимая сетка каждого компонента для веб-просмотра.

Верхняя плоскость наклонена к оператору. X направлена вправо, Y — назад,
Z — вверх. Все исходные размеры в мм. Изделие полностью механическое.
"""
from __future__ import annotations

import argparse
import json
import struct
from dataclasses import dataclass
from itertools import combinations
from pathlib import Path

import cadquery as cq
import numpy as np
from OCP.Bnd import Bnd_Box
from OCP.BRepBndLib import BRepBndLib


SLOPE = 20.0
FACE_Z = 55.0
BASE_H = 8.0
BASE_W, BASE_D = 180.0, 134.0
SHELL_W, SHELL_D = 176.0, 130.0
PANEL_W, PANEL_D, PANEL_H = 162.0, 110.0, 2.8
SCREEN_W, SCREEN_D, SCREEN_H = 94.0, 54.0, 1.6
MARKER_D, MARKER_H = 12.2, 2.15
CLEARANCE = 0.25  # зазор с каждой стороны гнезда
TAPE = 0.20
PANEL_SEAT, SCREEN_SEAT, MARKER_SEAT = 1.8, 1.6, 1.4
PANEL_BOTTOM = -PANEL_SEAT + TAPE
PANEL_TOP = PANEL_BOTTOM + PANEL_H
SCREEN_BOTTOM = PANEL_TOP - SCREEN_SEAT + TAPE
MARKER_BOTTOM = PANEL_TOP - MARKER_SEAT + TAPE
SCREEN_UV = (-24, 6)
MARKER_UV = [(40, 16), (62, 16), (40, -10), (62, -10)]
SCREW_XY = [(-65, -45), (65, -45), (-65, 45), (65, 45)]
GROUP_COLORS = {
    "base": "#323d43", "housing": "#e0e4df", "panel": "#28373d",
    "screen": "#17383e", "markers": "#56c5ba", "fasteners": "#899490",
}


def rounded_block(width, depth, height, radius):
    """Rounded rectangle prism with its bottom at z=0."""
    return (cq.Workplane("XY").sketch().rect(width, depth).vertices()
            .fillet(radius).finalize().extrude(height))


def cylinder(diameter, height, x=0, y=0, z=0):
    return cq.Solid.makeCylinder(diameter / 2, height, (x, y, z))


def on_face(shape, u=0, v=0, t=0):
    local = shape.translate((u, v, t))
    return local.rotate((0, 0, 0), (1, 0, 0), SLOPE).translate((0, 0, FACE_Z))


def base():
    part = rounded_block(BASE_W, BASE_D, BASE_H, 11)
    part = part.faces("<Z").edges().chamfer(1.1).faces(">Z").edges().chamfer(0.8)
    for x, y in SCREW_XY:
        part = part.cut(cylinder(3.4, BASE_H + 1, x, y, -0.2))
        # 90° countersink, at z=0 nominal Ø6.6.
        sink = cq.Solid.makeCone(3.32, 1.68, 1.64, (x, y, -0.02))
        part = part.cut(sink)
    return part.val()


def housing():
    blank = rounded_block(SHELL_W, SHELL_D, 90, 10).translate((0, 0, BASE_H))
    trim = on_face(cq.Workplane("XY").rect(300, 300).extrude(160).val())
    part = blank.cut(trim)
    part = part.faces(">Z").edges().fillet(2.0)
    part = part.faces("<Z").edges().chamfer(0.75)
    seat = rounded_block(PANEL_W + 2 * CLEARANCE, PANEL_D + 2 * CLEARANCE,
                         9, 8 + CLEARANCE).val()
    part = part.cut(on_face(seat, t=-PANEL_SEAT))
    for x, y in SCREW_XY:
        part = part.cut(cylinder(2.4, 10.2, x, y, BASE_H - 0.2))
    # Shallow, closed side grips. Only 0.8 mm is removed from each side.
    for x0 in (87.2, -88.8):
        for y0 in (-2.0, 3.6, 9.2, 14.8, 20.4, 26.0, 31.6, 37.2):
            groove = (cq.Workplane("YZ", origin=(x0, y0, 33))
                      .slot2D(15.5, 2.4, 68).extrude(1.6))
            part = part.cut(groove)
    return part.val()


def panel():
    part = rounded_block(PANEL_W, PANEL_D, PANEL_H, 8)
    part = part.faces(">Z").edges().chamfer(0.55)
    screen_pocket = rounded_block(SCREEN_W + 2 * CLEARANCE, SCREEN_D + 2 * CLEARANCE,
                                  4, 4.8 + CLEARANCE).translate(
                                      (*SCREEN_UV, PANEL_H - SCREEN_SEAT))
    part = part.cut(screen_pocket)
    for u, v in MARKER_UV:
        part = part.cut(cylinder(MARKER_D + 2 * CLEARANCE, 3, u, v,
                                 PANEL_H - MARKER_SEAT))
    return part.val()


def screen():
    part = rounded_block(SCREEN_W, SCREEN_D, SCREEN_H, 4.8)
    return part.faces(">Z").edges().chamfer(0.30).val()


def marker():
    part = cq.Workplane("XY").circle(MARKER_D / 2).extrude(MARKER_H)
    part = part.faces(">Z").edges().fillet(0.52)
    detail = (cq.Workplane("XY").circle(4.55).circle(3.75).extrude(1.0)
              .translate((0, 0, MARKER_H - 0.40)))
    return part.cut(detail).val()


def fastener():
    """Simplified reference ST2.9×16. Only the thread core is shown."""
    head = cq.Solid.makeCone(2.80, 1.16, 1.64, (0, 0, 0.50))
    shaft = cq.Solid.makeCylinder(1.16, 12.90, (0, 0, 2.12))
    tip = cq.Solid.makeCone(1.16, 0.15, 1.50, (0, 0, 15.00))
    part = cq.Workplane("XY").add(head.fuse(shaft, tip))
    for angle in (0, 90):
        slot = (cq.Workplane("XY").rect(3.60, 0.70).extrude(0.75)
                .rotate((0, 0, 0), (0, 0, 1), angle).translate((0, 0, 0.35)))
        part = part.cut(slot)
    return part.val()


@dataclass
class Instance:
    name: str
    group: str
    shape: cq.Shape


def model():
    bottom = base()
    case = housing()
    face = panel()
    glass = screen()
    button = marker()
    bolt = fastener()
    printable = {"01-base": bottom, "02-housing": case.translate((0, 0, -BASE_H)),
                 "03-panel": face, "04-screen": glass, "05-marker": button}
    instances = [Instance("base", "base", bottom), Instance("housing", "housing", case),
                 Instance("panel", "panel", on_face(face, t=PANEL_BOTTOM)),
                 Instance("screen", "screen", on_face(glass, *SCREEN_UV, SCREEN_BOTTOM))]
    instances.extend(Instance(f"marker-{i}", "markers", on_face(button, *point, MARKER_BOTTOM))
                     for i, point in enumerate(MARKER_UV, start=1))
    instances.extend(Instance(f"screw-{i}", "fasteners", bolt.translate((*point, 0)))
                     for i, point in enumerate(SCREW_XY, start=1))
    return printable, instances


def triangulation(shape):
    # Retain separate CAD surfaces and their normals at original hard corners.
    # The visual meshes are deliberately lighter than the manufacturing meshes.
    vertices, triangles = shape.copy(mesh=False).tessellate(0.20, 0.30)
    vertices = np.array([v.toTuple() for v in vertices], dtype=np.float64)
    triangles = np.array(triangles, dtype=np.int32)
    sides = vertices[triangles[:, 1:]] - vertices[triangles[:, :1]]
    crosses = np.cross(sides[:, 0], sides[:, 1])
    keep = np.linalg.norm(crosses, axis=1) > 1.e-8
    triangles, crosses = triangles[keep], crosses[keep]
    normals = np.zeros(vertices.shape, dtype=np.float64)
    for column in range(3):
        np.add.at(normals, triangles[:, column], crosses)
    lengths = np.linalg.norm(normals, axis=1)
    normals[lengths > 0] /= lengths[lengths > 0, None]
    return vertices, triangles, normals


def clean_coordinates(points):
    result = np.round(points, decimals=3)
    result[np.abs(result) < 0.0005] = 0
    return result.ravel().tolist()


def aligned(buffer):
    buffer.extend(b'\x00' * ((-len(buffer)) % 4))


def glb_file(meshes, path):
    """Self-contained glTF 2.0. Geometry in metres, Y-up as specified by glTF."""
    buffer = bytearray()
    model_json = {
        "asset": {"version": "2.0", "generator": "LM-04 / CadQuery"},
        "scene": 0, "scenes": [{"nodes": list(range(len(meshes)))}],
        "nodes": [], "meshes": [], "materials": [], "accessors": [],
        "bufferViews": [], "buffers": [],
    }
    groups = list(GROUP_COLORS)
    for key in groups:
        rgb = [int(GROUP_COLORS[key][i:i+2], 16) / 255 for i in (1, 3, 5)]
        linear = [x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4 for x in rgb]
        model_json["materials"].append({"name": key, "pbrMetallicRoughness": {
            "baseColorFactor": linear + [1], "metallicFactor": 0.45 if key == "fasteners" else 0.05,
            "roughnessFactor": 0.32 if key == "screen" else 0.65}})
    def accessor(array, ctype, dtype, format_name, target, include_limits=False):
        aligned(buffer)
        start = len(buffer)
        raw = np.ascontiguousarray(array, dtype=dtype)
        buffer.extend(raw.tobytes())
        index = len(model_json["bufferViews"])
        model_json["bufferViews"].append({"buffer": 0, "byteOffset": start,
                                         "byteLength": len(buffer) - start, "target": target})
        desc = {"bufferView": index, "componentType": ctype, "count": len(array),
                "type": format_name}
        if include_limits:
            desc["min"] = raw.min(axis=0).tolist()
            desc["max"] = raw.max(axis=0).tolist()
        model_json["accessors"].append(desc)
        return len(model_json["accessors"]) - 1
    for instance, vertices, faces, normals in meshes:
        position = np.column_stack([vertices[:, 0], vertices[:, 2], -vertices[:, 1]]) / 1000
        normal = np.column_stack([normals[:, 0], normals[:, 2], -normals[:, 1]])
        prim = {"attributes": {
            "POSITION": accessor(position, 5126, '<f4', 'VEC3', 34962, True),
            "NORMAL": accessor(normal, 5126, '<f4', 'VEC3', 34962)},
            "indices": accessor(faces.ravel(), 5123, '<u2', 'SCALAR', 34963),
            "material": groups.index(instance.group)}
        model_json["nodes"].append({"name": instance.name, "mesh": len(model_json["meshes"])})
        model_json["meshes"].append({"name": instance.name, "primitives": [prim]})
    aligned(buffer)
    model_json["buffers"].append({"byteLength": len(buffer)})
    descriptor = json.dumps(model_json, ensure_ascii=False, separators=(',', ':')).encode('utf8')
    descriptor += b' ' * ((-len(descriptor)) % 4)
    size = 12 + 8 + len(descriptor) + 8 + len(buffer)
    with path.open('wb') as fh:
        fh.write(struct.pack('<4sII', b'glTF', 2, size))
        fh.write(struct.pack('<I4s', len(descriptor), b'JSON') + descriptor)
        fh.write(struct.pack('<I4s', len(buffer), b'BIN\x00') + buffer)


def exact_bounds(shape):
    box = Bnd_Box()
    BRepBndLib.AddOptimal_s(shape.wrapped, box, False, False)
    return np.array(box.Get()).reshape((2, 3))


def check_print_mesh(path):
    """Check the delivered STL, including the pairing and orientation of edges."""
    raw = path.read_bytes()
    count = struct.unpack_from('<I', raw, 80)[0]
    if len(raw) != 84 + count * 50:
        raise ValueError(f"Truncated STL: {path}")
    record = np.dtype([("n", "<f4", 3), ("v", "<f4", (3, 3)), ("end", "<u2")])
    triangles = np.frombuffer(raw, dtype=record, offset=84)["v"].astype('float64')
    _, unique = np.unique(np.round(triangles.reshape(-1, 3), 4), axis=0,
                          return_inverse=True)
    faces = unique.reshape(-1, 3)
    directed = np.concatenate([faces[:, [0, 1]], faces[:, [1, 2]], faces[:, [2, 0]]])
    _, group, uses = np.unique(np.sort(directed, axis=1), axis=0,
                               return_inverse=True, return_counts=True)
    direction = np.where(directed[:, 0] < directed[:, 1], 1, -1)
    if (uses != 2).any() or (np.bincount(group.reshape(-1), weights=direction) != 0).any():
        raise ValueError(f"Open or inconsistent mesh: {path}")
    cross = np.cross(triangles[:, 1] - triangles[:, 0], triangles[:, 2] - triangles[:, 0])
    volume = np.einsum('ij,ij->', triangles[:, 0], cross) / 6
    if np.any(np.linalg.norm(cross, axis=1) < 1.e-9) or volume <= 0:
        raise ValueError(f"Degenerate or reversed mesh: {path}")
    return {"triangles": int(count), "closed_oriented_mesh": True,
            "mesh_volume_mm3": round(float(volume), 2)}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, default=Path.cwd() / "export")
    args = parser.parse_args()
    kit = args.output / "kit"
    web = args.output / "model"
    print_dir = kit / "print"
    for dest in (kit, web, print_dir):
        dest.mkdir(parents=True, exist_ok=True)
    printables, parts = model()
    verified = {}
    for name, solid in printables.items():
        if not solid.isValid() or len(solid.Solids()) != 1 or solid.Volume() <= 0:
            raise ValueError(f"Invalid solid {name}")
        path = print_dir / (name + ".stl")
        cq.exporters.export(solid, str(path), tolerance=0.060, angularTolerance=0.16)
        bounds = exact_bounds(solid)
        verified[name] = {"size_mm": np.round(bounds[1] - bounds[0], 3).tolist(),
                          "cad_valid_single_solid": True, **check_print_mesh(path)}
    assembly = cq.Assembly(name="Lumen_LM04_A")
    for p in parts:
        color = GROUP_COLORS[p.group][1:]
        rgb = [int(color[k:k+2], 16) / 255 for k in (0, 2, 4)]
        assembly.add(p.shape, name=p.name, color=cq.Color(*rgb))
    assembly.export(str(kit / 'lm04-assembly.step'))
    meshes = [(p, *triangulation(p.shape)) for p in parts]
    records = [{"id": p.name, "group": p.group, "color": GROUP_COLORS[p.group],
                "vertices": clean_coordinates(v), "indices": f.ravel().tolist()}
               for p, v, f, n in meshes]
    out = {"model": "LM-04", "revision": "A", "units": "mm", "axisUp": "Z",
           "parts": records}
    (web / "assembly.json").write_text(json.dumps(out, separators=(',', ':')), encoding='utf8')
    glb_file(meshes, kit / 'lm04-assembly.glb')
    bounds = exact_bounds(assembly.toCompound())
    size = np.round(bounds[1] - bounds[0], 3).tolist()
    checked_pairs = 0
    for first, second in combinations(parts, 2):
        if first.shape.intersect(second.shape).Volume() > 1.e-5:
            raise ValueError(f"Interference: {first.name}, {second.name}")
        checked_pairs += 1
    report = {"model": "LM-04", "revision": "A", "units": "mm", "envelope_mm": size,
              "slope_degrees": SLOPE, "clearance_per_side_mm": CLEARANCE,
              "tape_thickness_mm": TAPE, "printed_parts": verified, "instances": len(parts),
              "interference_free_pairs": checked_pairs, "physical_fit_verified": False}
    (kit / "lm04-geometry.json").write_text(
        json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding='utf8')
    print('Envelope (mm):', *size)
    print('Verified printable meshes:', len(verified), '| Interference-free pairs:', checked_pairs)


if __name__ == "__main__":
    main()
