"""Material estimate for the untextured, flat-bottomed terrain; produces no G-code.
Run from any directory: python source/estimate_fdm.py. Needs NumPy, SciPy, Shapely 2.
XY sampling and the ideal shell model do not model a printer's individual toolpaths.
"""
import json
from pathlib import Path

import numpy as np
from scipy.interpolate import RegularGridInterpolator
from scipy.ndimage import distance_transform_edt
from shapely import Polygon, contains_xy

SOURCE = Path(__file__).resolve().parent
PITCH = 0.30
LAYER = 0.20
LINE = 0.45
WALLS = 3
SOLID_LAYERS = 4
INFILL = 0.15
DENSITY_G_CM3 = 1.24

def estimate(region, interpolator):
    shape = Polygon(region["outline"])
    xmin, ymin, xmax, ymax = shape.bounds
    x = np.arange(xmin - PITCH, xmax + 2*PITCH, PITCH)
    y = np.arange(ymin - PITCH, ymax + 2*PITCH, PITCH)
    xx, yy = np.meshgrid(x, y)
    inside = contains_xy(shape, xx, yy)
    height = np.zeros_like(xx)
    height[inside] = interpolator(np.c_[yy[inside], xx[inside]])
    cell_volume = PITCH**2 * LAYER
    # Slice center rule. Middle infill only arises inside the walls and below the top skin.
    full = sparse = 0
    for z in np.arange(LAYER/2, height.max(), LAYER):
        cross = height >= z
        if z < LAYER*SOLID_LAYERS:
            full += np.count_nonzero(cross)
            continue
        depth = distance_transform_edt(cross) * PITCH - 0.5*PITCH
        inner = cross & (depth > WALLS*LINE) & (height >= z + SOLID_LAYERS*LAYER)
        inner_count = np.count_nonzero(inner)
        full += np.count_nonzero(cross) - inner_count
        sparse += inner_count
    volume = (full + sparse*INFILL) * cell_volume / 1000
    return {"id":region["id"], "grams":round(volume * DENSITY_G_CM3, 1),
            "depositedCm3":round(volume, 1), "solidGeometryCm3":round(height.sum()*PITCH**2 / 1000, 1)}

def main():
    field = np.load(SOURCE / "terrain_grid.npz")
    interp = RegularGridInterpolator((field["y"],field["x"]),field["z"],bounds_error=True)
    regions = json.loads((SOURCE / "region_outlines.json").read_text())
    rows = [estimate(region,interp) for region in regions]
    print(json.dumps({"note":"Engineering estimate, not a sliced print. Includes mounting flats in the supplied height field. Brims, purge and failed prints excluded.",
                      "regions":rows,"grams":round(sum(r["grams"] for r in rows),1)},ensure_ascii=False,indent=2))
if __name__ == "__main__":
    main()
