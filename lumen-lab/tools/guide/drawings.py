"""Orthographic drawing and illustration helpers for the LM-04 assembly guide."""

from dataclasses import dataclass
from io import BytesIO
import math

import cadquery as cq
import numpy as np
from OCP.BRepLib import BRepLib
from OCP.gp import gp_Ax2, gp_Dir, gp_Pnt
from OCP.HLRAlgo import HLRAlgo_Projector
from OCP.HLRBRep import HLRBRep_Algo, HLRBRep_HLRToShape
from PIL import Image
from reportlab.lib.utils import ImageReader


def basis(direction, right=None):
    direction = np.asarray(direction, float)
    direction = direction / np.linalg.norm(direction)
    if right is None:
        right = np.cross([0.0, 0.0, 1.0], direction)
    right = np.array(right, float)
    right = right / np.linalg.norm(right)
    up = np.cross(direction, right)
    return right, up, direction


@dataclass
class Projection:
    lines: list
    box: tuple


def visible_edges(shape, direction, right=None):
    """Run BRep hidden-line removal; projected paths stay in real millimetres."""
    right, _, direction = basis(direction, right)
    frame = gp_Ax2(gp_Pnt(), gp_Dir(*direction), gp_Dir(*right))
    algo = HLRBRep_Algo()
    algo.Add(shape.wrapped)
    algo.Projector(HLRAlgo_Projector(frame))
    algo.Update()
    algo.Hide()
    result = HLRBRep_HLRToShape(algo)
    paths = []
    for group in (result.VCompound(), result.Rg1LineVCompound(), result.OutLineVCompound()):
        if group.IsNull():
            continue
        BRepLib.BuildCurves3d_s(group, 1e-7)
        for edge in cq.Shape.cast(group).Edges():
            points, _ = edge.sample(0.08)
            if not points:
                continue
            xy = [(p.x, p.y) for p in points]
            if edge.IsClosed():
                xy.append(xy[0])
            if len(xy) > 1:
                paths.append(xy)
    if not paths:
        raise ValueError("No visible edges to draw")
    all_points = np.concatenate([np.asarray(path) for path in paths])
    low = all_points.min(axis=0)
    high = all_points.max(axis=0)
    return Projection(paths, (low[0], low[1], high[0], high[1]))


def projected_margins(box, area):
    """Map a projected real-mm box to a rectangle measured from the page top."""
    x, top, width, height = area
    left, bottom, right, high = box
    scale = min(width / (right - left), height / (high - bottom))
    x0 = x + (width - (right - left) * scale) / 2 - left * scale
    y0 = top + (height - (high - bottom) * scale) / 2 + high * scale
    return lambda u, v: (x0 + u * scale, y0 - v * scale), scale


def draw_projection(page, projection, area, weight=0.23, ink="#233943"):
    xy, scale = projected_margins(projection.box, area)
    path = page.canvas.beginPath()
    for line in projection.lines:
        path.moveTo(*page.pt(*xy(*line[0])))
        for u, v in line[1:]:
            path.lineTo(*page.pt(*xy(u, v)))
    page.canvas.setLineWidth(weight * page.mm)
    page.canvas.setLineJoin(1)
    page.canvas.setLineCap(1)
    page.canvas.setStrokeColor(ink)
    page.canvas.drawPath(path)
    return xy, scale


def _color(rgb):
    if isinstance(rgb, str):
        h = rgb.lstrip("#")
        return np.array([int(h[i:i+2], 16) for i in (0, 2, 4)], float)
    return np.asarray(rgb, float)


def render_mesh(meshes, direction=(0.77, -1.06, 0.77), width=1300, right=None):
    """Shaded CAD illustration with per-pixel depth testing and per-face lighting.

    'meshes' yields (vertices Nx3, triangle indices Mx3, sRGB RGB or hex).
    No camera or dimensions are baked into source geometry. Background is transparent.
    """
    u, v, w = basis(direction, right)
    rotation = np.stack([u, -v, w], axis=1)
    all_proj = [verts @ rotation for verts, _, _ in meshes]
    low = np.min(np.stack([points[:, :2].min(axis=0) for points in all_proj]), axis=0)
    high = np.max(np.stack([points[:, :2].max(axis=0) for points in all_proj]), axis=0)
    pad = 7
    ratio = (width - pad * 2) / (high[0] - low[0])
    height = math.ceil((high[1] - low[1]) * ratio) + 2 * pad
    screen = np.zeros((height, width, 4), dtype=np.uint8)
    depth = np.full((height, width), -np.inf)
    light = np.array([-0.42, -0.63, 0.94])
    light /= np.linalg.norm(light)

    for (verts, faces, rgb), coordinates in zip(meshes, all_proj):
        screen_pts = (coordinates[:, :2] - low) * ratio + pad
        base = _color(rgb)
        for ids in faces:
            a, b, c = screen_pts[ids]
            den = (b[1] - c[1]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[1] - c[1])
            if abs(den) < 1e-9:
                continue
            xmin, ymin = np.floor(np.minimum(np.minimum(a, b), c)).astype(int)
            xmax, ymax = np.ceil(np.maximum(np.maximum(a, b), c)).astype(int)
            xmin, ymin = max(0, xmin), max(0, ymin)
            xmax, ymax = min(width - 1, xmax), min(height - 1, ymax)
            if xmax < xmin or ymax < ymin:
                continue
            gx = np.arange(xmin, xmax + 1)[None, :] + 0.5
            gy = np.arange(ymin, ymax + 1)[:, None] + 0.5
            p = ((b[1] - c[1]) * (gx - c[0]) + (c[0] - b[0]) * (gy - c[1])) / den
            q = ((c[1] - a[1]) * (gx - c[0]) + (a[0] - c[0]) * (gy - c[1])) / den
            t = 1 - p - q
            z = coordinates[ids, 2]
            interp = p * z[0] + q * z[1] + t * z[2]
            region = depth[ymin:ymax+1, xmin:xmax+1]
            inside = (p >= -1e-7) & (q >= -1e-7) & (t >= -1e-7) & (interp >= region)
            if not np.any(inside):
                continue
            va, vb, vc = verts[ids]
            face = np.cross(vb - va, vc - va)
            mag = np.linalg.norm(face)
            if not mag:
                continue
            n = face / mag
            if np.dot(n, w) < 0:
                n *= -1
            lambert = max(0, np.dot(n, light))
            ao = 0.89 + 0.11 * max(0, n[2])
            tone = 0.64 + 0.39 * lambert
            color = (base * tone * ao + (1 - lambert) * np.array([4, 6, 7])).clip(0,255).astype(np.uint8)
            region[inside] = interp[inside]
            patch = screen[ymin:ymax+1, xmin:xmax+1]
            patch[inside, :3] = color
            patch[inside, 3] = 255
    im = Image.fromarray(screen, "RGBA")
    im = im.resize((width // 2, max(1, height // 2)), Image.Resampling.LANCZOS)
    return im


def shape_mesh(shape, rgb):
    vertices, faces = shape.tessellate(0.19, 0.18)
    return np.array([p.toTuple() for p in vertices]), np.asarray(faces, int), rgb


def place_image(page, image, area):
    x, top, w, h = area
    scale = min(w / image.width, h / image.height)
    dw, dh = image.width * scale, image.height * scale
    px = x + (w - dw) / 2
    py = top + (h - dh) / 2
    image_data = BytesIO()
    image.save(image_data, "PNG", optimize=True)
    image_data.seek(0)
    page.canvas.drawImage(ImageReader(image_data), px * page.mm, (page.height - py - dh) * page.mm,
                          width=dw * page.mm, height=dh * page.mm, mask="auto")
