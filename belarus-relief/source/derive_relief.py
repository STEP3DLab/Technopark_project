"""Extract the terrain sampling surface used to build the print model.

Run: python derive_relief.py /path/to/cpu.bin /path/to/terrain_base.npz
See RELIEF-SOURCES.md for the exact archived input file.
Dependencies: NumPy, SciPy, Matplotlib (polygons).
"""
import argparse
import gzip
import hashlib
import json
import struct
from pathlib import Path

import numpy as np
from matplotlib.path import Path as PolygonPath
from scipy.ndimage import gaussian_filter
from scipy.spatial import cKDTree


REGIONS = ("brest", "vitebsk", "gomel", "grodno", "minsk", "mogilev")
BLOB_SHA1 = "19fd7b1fb2581a745a5585800bbd349b9af5e6e8"


def read_mesh_groups(filename):
    compressed = filename.read_bytes()
    header = f"blob {len(compressed)}\0".encode()
    if hashlib.sha1(header + compressed).hexdigest() != BLOB_SHA1:
        raise ValueError("Input does not match the recorded Git blob.")
    data = gzip.decompress(compressed)
    if data[:4] != b"HNY1":
        raise ValueError("Unsupported geometry format.")
    offset = 4
    groups = {}
    for region in REGIONS:
        vertices, faces = struct.unpack_from("<II", data, offset)
        offset += 8
        xyz = np.frombuffer(data, "<i2", vertices * 3, offset).reshape(vertices, 3)
        groups[region] = xyz.astype(float) / 4096
        offset += 6 * vertices + 12 * faces + 3 * faces
    return groups


def convert(source, output):
    path = Path(__file__).parent / "region_outlines.json"
    outlines = {r["id"]: np.array(r["outline"]) for r in json.loads(path.read_text())}
    groups = read_mesh_groups(source)
    old_bounds, new_bounds = [], []
    for region, xyz in groups.items():
        for bound in (np.min, np.max):
            old_bounds.append(bound(xyz[:, :2], axis=0))
            new_bounds.append(bound(outlines[region], axis=0))
    old_bounds, new_bounds = np.array(old_bounds), np.array(new_bounds)
    transform = [np.polyfit(old_bounds[:, i], new_bounds[:, i], 1) for i in range(2)]
    slope, intercept = np.array(transform).T

    mesh = np.concatenate(list(groups.values()))
    xy, index = np.unique(mesh[:, :2], axis=0, return_inverse=True)
    z = np.full(len(xy), -np.inf)
    np.maximum.at(z, index, mesh[:, 2])
    valid = z > 0.12
    xy, z = xy[valid] * slope + intercept, z[valid]
    x, y = np.arange(361, dtype="f4"), np.arange(311, dtype="f4")
    gx, gy = np.meshgrid(x, y)
    samples = np.column_stack((gx.ravel(), gy.ravel()))
    distance, neighbours = cKDTree(xy).query(samples, k=30)
    radius = np.maximum(distance[:, :1] + 1.5, 2.5)
    surface = np.max(np.where(distance <= radius, z[neighbours], -np.inf), axis=1)
    surface = gaussian_filter(surface.reshape(gx.shape), 2.8)
    inside = np.logical_or.reduce([
        PolygonPath(ring).contains_points(samples).reshape(gx.shape)
        for ring in outlines.values()
    ])
    lower, upper = surface[inside].min(), surface[inside].max()
    height = 4 + 12 * np.clip((surface - lower) / (upper - lower), 0, 1)
    np.savez_compressed(output, x=x, y=y, z=np.round(height, 3).astype("f4"))


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", type=Path)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    convert(args.source, args.output)
