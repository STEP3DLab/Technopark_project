"""Rebuild the six Belarus region meshes and full-size assembly drawings.

Python 3.10+; NumPy, SciPy, Shapely 2.1+ (GEOS 3.10+) Matplotlib and ReportLab.
Run this script from any working directory. Dimensions are millimetres.
"""
from argparse import ArgumentParser
from collections import Counter
from pathlib import Path
import json
import math
import struct

import numpy as np
import shapely
from scipy.interpolate import RegularGridInterpolator
from shapely.geometry import Polygon

SOURCE = Path(__file__).resolve().parent
ROOT = SOURCE.parent
GRID_PITCH = 2.0
BASE = 4.0
OFFSET = np.array([30.3, 65.0])


def read_json(path):
    return json.loads(path.read_text(encoding="utf-8"))


def save_json(path, data):
    path.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def read_inputs():
    outlines = read_json(SOURCE / "region_outlines.json")
    field = np.load(SOURCE / "terrain_base.npz")
    x, y = field["x"].astype(float), field["y"].astype(float)
    return outlines, x, y, field["z"].astype(float)


def bilinear(x, y, field):
    interp = RegularGridInterpolator((y, x), field, bounds_error=False, fill_value=None)

    def sample(xy):
        return interp(np.asarray(xy, dtype=float)[:, ::-1])

    return sample


def build_seats(x, y, field):
    """Flatten only the contact footprints; blend back to the global surface outside."""
    definitions = read_json(SOURCE / "decor_seats.json")
    gx, gy = np.meshgrid(x, y)
    grid = np.column_stack((gx.ravel(), gy.ravel()))
    gridpoints = shapely.points(grid)
    sample_base = bilinear(x, y, field)
    layer = field.copy().ravel()
    seating = []
    groups = []
    for region in dict.fromkeys(part["region"] for part in definitions):
        parts = [part for part in definitions if part["region"] == region]
        shapes = []
        for part in parts:
            if part["shape"] == "circle":
                shape = shapely.Point(part["x"], part["y"]).buffer(part["radius"], quad_segs=32)
            else:
                shape = shapely.box(part["xmin"], part["ymin"], part["xmax"], part["ymax"])
            shapes.append(shape)
        # The star and its neighbouring name share one plane. Their supports almost touch.
        center = np.mean([[part["x"], part["y"]] for part in parts], axis=0)
        groups.append((shapely.union_all(shapes), center, parts, 15.0 if region == "minsk" else 11.0))
    bison_xy = np.asarray(read_json(SOURCE / "bison_outline_mm.json")) + [77.5, 57.0]
    bison = Polygon(bison_xy).buffer(0)
    center = bison.centroid
    groups.append((bison, (center.x, center.y), [{"id": "bison", "x": 77.5, "y": 57.0}], 10.0))
    for footprint, center, parts, taper in groups:
        z = float(np.round(sample_base([center])[0], 3))
        # The guard band accounts for the diagonal of the 2 mm triangulation.
        margin = 3.0
        active = shapely.dwithin(footprint, gridpoints, margin + taper)
        distance = shapely.distance(footprint, gridpoints[active])
        t = np.clip((distance - margin) / taper, 0, 1)
        weight = 1 - t * t * (3 - 2 * t)
        layer[active] += (z - layer[active]) * weight
        for part in parts:
            seating.append({"id": part["id"], "xy_mm": [part["x"], part["y"]], "z_mm": z})
    save_json(ROOT / "data/seat_heights.json", {s["id"]: s["z_mm"] for s in seating})
    return np.round(layer.reshape(gy.shape), 3), seating


def mesh_region(footprint, sample):
    """Clip a shared 2 mm grid to the geographic boundary. Triangulate each cell."""
    minx, miny, maxx, maxy = footprint.bounds
    ix = np.arange(math.floor(minx / GRID_PITCH), math.ceil(maxx / GRID_PITCH))
    iy = np.arange(math.floor(miny / GRID_PITCH), math.ceil(maxy / GRID_PITCH))
    gx, gy = np.meshgrid(ix * GRID_PITCH, iy * GRID_PITCH)
    cells = shapely.box(gx.ravel(), gy.ravel(), gx.ravel() + GRID_PITCH, gy.ravel() + GRID_PITCH)
    cells = cells[shapely.intersects(footprint, cells)]
    clipped = shapely.intersection(cells, footprint, grid_size=.001)
    triangles = shapely.get_parts(shapely.constrained_delaunay_triangles(clipped))
    coords = shapely.get_coordinates(triangles).reshape(-1, 4, 2)[:, :3]
    coords = np.round(coords, 3)
    delta1, delta2 = coords[:, 1] - coords[:, 0], coords[:, 2] - coords[:, 0]
    signed_area2 = delta1[:, 0] * delta2[:, 1] - delta1[:, 1] * delta2[:, 0]
    coords[signed_area2 < 0] = coords[signed_area2 < 0][:, [0, 2, 1]]
    coords = coords[signed_area2 != 0]
    xy, faces = np.unique(coords.reshape(-1, 2), axis=0, return_inverse=True)
    faces = faces.reshape(-1, 3)
    z = sample(xy)
    top = np.column_stack([xy, z])
    bottom = np.column_stack([xy, np.zeros(len(xy))])
    vertices = np.vstack((top, bottom)).astype(np.float32)
    offset = len(xy)
    # Walls follow the actual mesh boundary, including cell/border intersection vertices.
    directed = np.vstack([faces[:, [0, 1]], faces[:, [1, 2]], faces[:, [2, 0]]])
    _, first, counts = np.unique(np.sort(directed, axis=1), axis=0, return_index=True, return_counts=True)
    a, b = directed[first[counts == 1]].T
    side1 = np.column_stack((b, a, a + offset))
    side2 = np.column_stack((b, a + offset, b + offset))
    faces3 = np.vstack((faces, faces[:, [0, 2, 1]] + offset, side1, side2))
    return vertices, faces3


def audit(vertices, faces):
    verts, ids = np.unique(vertices, axis=0, return_inverse=True)
    faces = ids[faces]
    edges = np.vstack([faces[:, [0, 1]], faces[:, [1, 2]], faces[:, [2, 0]]])
    nedge, counts = np.unique(np.sort(edges, axis=1), axis=0, return_counts=True)
    if not np.all(counts == 2):
        raise ValueError(f"Boundary edges: {Counter(counts)}")
    unique_directed = np.unique(edges, axis=0)
    if len(unique_directed) != len(edges):
        raise ValueError("Inconsistent winding")
    euler = len(verts) - len(nedge) + len(faces)
    if euler != 2:
        raise ValueError(f"Unexpected Euler characteristic: {euler}")
    tri = verts[faces].astype(np.float64)
    normals = np.cross(tri[:, 1] - tri[:, 0], tri[:, 2] - tri[:, 0])
    if (np.linalg.norm(normals, axis=1) <= 1e-10).any():
        raise ValueError("Degenerate face")
    volume = float(np.einsum("ij,ij->", tri[:, 0], normals) / 6)
    if volume <= 0:
        raise ValueError("Nonpositive signed volume")
    return volume / 1000


def write_stl(path, vertices, faces):
    tri = vertices[faces]
    normal = np.cross(tri[:, 1] - tri[:, 0], tri[:, 2] - tri[:, 0])
    normal /= np.linalg.norm(normal, axis=1)[:, None]
    records = np.zeros(len(tri), dtype=[("normal", "<3f4"), ("vertices", "<f4", (3, 3)), ("attribute", "<u2")])
    records["normal"], records["vertices"] = normal, tri
    with path.open("wb") as out:
        out.write(b"Belarus relief; mm; preserve shared origin for assembly".ljust(80, b" "))
        out.write(struct.pack("<I", len(tri)))
        records.tofile(out)


def main():
    parser = ArgumentParser(description=__doc__)
    parser.add_argument("--relief", type=float, default=12., help="height range above the 4 mm floor")
    args = parser.parse_args()
    if not 1 <= args.relief <= 25:
        parser.error("Choose a height between 1 and 25 mm.")
    outlines, x, y, original = read_inputs()
    z0 = BASE + (original - BASE) * args.relief / 12
    (ROOT / "data").mkdir(exist_ok=True, parents=True)
    z, seats = build_seats(x, y, z0)
    np.savez_compressed(SOURCE / "terrain_grid.npz", x=x.astype("<f4"), y=y.astype("<f4"), z=z.astype("<f4"))
    sample = bilinear(x, y, z)
    (ROOT / "models/regions").mkdir(exist_ok=True, parents=True)
    result = []
    for item in outlines:
        path = f"models/regions/{item['id']}.stl"
        footprint = Polygon(item["outline"])
        vertices, faces = mesh_region(footprint, sample)
        volume = audit(vertices, faces)
        write_stl(ROOT / path, vertices, faces)
        bounds = np.round(np.stack((vertices.min(0), vertices.max(0))).astype(float), 3)
        result.append({"id": item["id"], "name": item["name"], "path": path, "bbox": bounds.tolist(),
                       "dimensions_mm": np.round(bounds[1] - bounds[0], 3).tolist(),
                       "triangles": len(faces), "volume_cm3": round(volume, 3),
                       "footprint_mm2": round(footprint.area, 2), "perimeter_mm": round(footprint.length, 2),
                       "watertight": True, "orientation_consistent": True, "euler_characteristic": 2})
        print(item["id"], len(faces), round(volume, 2), "cm³")
    dataset = {"units": "mm", "axes": {"X": "east", "Y": "north", "Z": "up/out of backing"},
               "base_mm": BASE, "relief_range_mm": args.relief, "map_to_backing_xy_mm": OFFSET.tolist(),
               "source": "Geographic outlines from the original assembly based on geoBoundaries / CIESIN, BLR ADM1, CC BY 3.0. Relative terrain reconstructed from the earlier Mapzen Terrain Tiles-derived physical mesh; smoothed and vertically rescaled, with local level seats for decoration. Absolute elevation in metres is not recoverable from that mesh.",
               "regions": result, "seats": seats,
               "bounds_mm": [np.min([r["bbox"][0] for r in result], axis=0).tolist(),
                             np.max([r["bbox"][1] for r in result], axis=0).tolist()]}
    save_json(ROOT / "data/terrain.json", dataset)
    from build_terrain_templates import make_templates
    make_templates(outlines, seats)


if __name__ == "__main__":
    main()
