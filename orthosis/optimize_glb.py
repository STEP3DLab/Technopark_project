"""Collapse CAD face patches to one GLB mesh per original assembly component.
The STEP and STL models are not changed. Validation compares triangle count, bounds and names.
"""
from collections import defaultdict
from pathlib import Path
import numpy as np
import trimesh

ROOT=Path(__file__).resolve().parent
SOURCE=ROOT/'Orthosis_V01_assembly.glb'

def main():
    scene=trimesh.load(SOURCE,force='scene')
    parents=scene.graph.transforms.parents
    groups=defaultdict(list)
    bounds_before=scene.bounds.copy()
    triangles_before=sum(len(g.faces) for g in scene.geometry.values())
    for node in scene.graph.nodes_geometry:
        part=node
        while parents.get(part) not in ('Orthosis_V01_LAYOUT_0deg',None):
            part=parents[part]
        matrix,geometry_name=scene.graph.get(node)
        mesh=scene.geometry[geometry_name].copy()
        mesh.apply_transform(matrix)
        groups[part].append(mesh)
    assert len(groups)==31,(len(groups),sorted(groups))
    new=trimesh.Scene()
    for name,patches in groups.items():
        mesh=trimesh.util.concatenate(patches)
        material=getattr(patches[0].visual,'material',None)
        color=np.asarray(getattr(material,'baseColorFactor',[185,213,209,255]),dtype=float)
        if color.max()<=1:color*=255
        rgba=np.asarray(np.clip(color,0,255),dtype=np.uint8)
        mesh.visual=trimesh.visual.ColorVisuals(mesh=mesh,vertex_colors=np.tile(rgba,(len(mesh.vertices),1)))
        new.add_geometry(mesh,node_name=name,geom_name=name)
    temp=SOURCE.with_suffix('.tmp.glb')
    temp.write_bytes(new.export(file_type='glb'))
    verified=trimesh.load(temp,force='scene')
    assert set(verified.graph.nodes_geometry)==set(groups)
    assert len(verified.geometry)==31
    assert sum(len(g.faces) for g in verified.geometry.values())==triangles_before
    assert np.allclose(verified.bounds,bounds_before,atol=.001)
    temp.replace(SOURCE)
    print('Optimized CAD scene:',len(scene.geometry),'->',len(verified.geometry),'meshes;',triangles_before,'triangles preserved; size',SOURCE.stat().st_size)

if __name__=='__main__': main()
