"""Copy exact CAD geometry to the studio renderer and add PBR materials to GLB."""
from pathlib import Path
import json
import trimesh as tm
from trimesh.visual.material import PBRMaterial
from trimesh.visual.texture import TextureVisuals

ROOT = Path(__file__).resolve().parents[1]
scene = tm.load(ROOT / 'files/assembly.glb', force='scene')
data = {}
for name, mesh in scene.geometry.items():
    data[name] = {'vertices': mesh.vertices.round(6).tolist(), 'faces': mesh.faces.tolist()}
    color, metal, rough = [170, 184, 205, 255], .65, .3
    if name == 'upper': color, metal = [233, 238, 247, 255], .03
    elif name == 'lower': color, metal = [198, 212, 234, 255], .03
    elif name in ['plate', 'motorwall', 'supportwall']: color, metal = [8, 37, 103, 255], .05
    elif name in ['pinion', 'driven']: color, metal = [50, 103, 194, 255], .1
    elif name == 'spool': color, metal = [154, 185, 226, 255], .1
    elif name.startswith('servo'): color, metal = [32, 41, 60, 255], .1
    elif name.startswith('cable'): color, metal = [14, 65, 150, 255], .1
    mesh.visual = TextureVisuals(material=PBRMaterial(name=name, baseColorFactor=color, metallicFactor=metal, roughnessFactor=rough, doubleSided=False))
(ROOT / 'source/meshes.json').write_text(json.dumps(data, separators=(',', ':')))
(ROOT / 'files/assembly-studio.glb').write_bytes(scene.export(file_type='glb'))
print('Prepared', len(data), 'unchanged CAD meshes')
