"""Render the actual V01 CAD meshes. Run with Blender 4.3 --background --python.

Input mesh JSON is produced by prepare_visuals.py. No illustrative geometry is
substituted for the printable parts. Bevels only affect the rendered surface.
"""
import bpy, json, math, sys
from pathlib import Path
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[1]
DATA = json.loads((ROOT / 'source/meshes.json').read_text())
OUT = ROOT / 'assets'
OUT.mkdir(exist_ok=True)
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
scene = bpy.context.scene
scene.render.engine = 'BLENDER_EEVEE_NEXT' if '--eevee' in sys.argv else 'CYCLES'
if '--eevee' in sys.argv:
    scene.eevee.taa_render_samples = 64
    scene.eevee.use_raytracing = True
scene.cycles.samples = 64
scene.cycles.use_denoising = False
scene.render.threads_mode = 'FIXED'
scene.render.threads = 8
scene.view_settings.view_transform = 'AgX'
scene.view_settings.look = 'AgX - Medium High Contrast'
scene.world.color = (.7, .7, .7)
scene.world.use_nodes = True
scene.world.node_tree.nodes['Background'].inputs[0].default_value = (.78, .84, .95, 1)
scene.world.node_tree.nodes['Background'].inputs[1].default_value = .45

def linear(v):
    v = v / 255
    return v / 12.92 if v <= .04045 else ((v + .055) / 1.055) ** 2.4

def material(name, rgb, metal=0, rough=.32):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    p = m.node_tree.nodes.get('Principled BSDF')
    p.inputs['Base Color'].default_value = (*[linear(c) for c in rgb], 1)
    p.inputs['Metallic'].default_value = metal
    p.inputs['Roughness'].default_value = rough
    return m

mats = {
    'shell': material('Porcelain white polymer', (233, 238, 247), 0, .31),
    'lower': material('Soft blue polymer', (198, 212, 234), 0, .35),
    'frame': material('RGSU blue polymer', (8, 37, 103), .07, .29),
    'gear': material('Technical blue polymer', (50, 103, 194), .12, .27),
    'spool': material('Light blue polymer', (154, 185, 226), .12, .28),
    'metal': material('Shaft steel', (170, 184, 205), .75, .22),
    'servo': material('Graphite housing', (32, 41, 60), .12, .3),
    'cable': material('Blue cable', (14, 65, 150), .2, .25),
}

def key(n):
    if n == 'upper': return 'shell'
    if n == 'lower': return 'lower'
    if n in ['plate', 'motorwall', 'supportwall']: return 'frame'
    if n in ['pinion', 'driven']: return 'gear'
    if n == 'spool': return 'spool'
    if n.startswith('servo'): return 'servo'
    if n.startswith('cable'): return 'cable'
    return 'metal'

objects = {}
for name, d in DATA.items():
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata([[v * .01 for v in p] for p in d['vertices']], [], d['faces'])
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    obj.data.materials.append(mats[key(name)])
    # Keep flat end faces and smooth the circumferential tessellation.
    for poly in mesh.polygons:
        poly.use_smooth = True
    bevel = obj.modifiers.new('Edge highlights, render only', 'BEVEL')
    bevel.width = .0012 if name not in ['driven', 'pinion'] else .00035
    bevel.segments = 3
    bevel.limit_method = 'ANGLE'
    weighted = obj.modifiers.new('Weighted normals', 'WEIGHTED_NORMAL')
    weighted.keep_sharp = True
    objects[name] = obj

bpy.ops.mesh.primitive_plane_add(size=200, location=(0, 0, -.335))
floor = bpy.context.object
floor.name = 'Studio floor'
floor.data.materials.append(material('Studio blue grey', (229, 236, 247), 0, .7))

def area(name, pos, energy, size, target=(0, .7, .2)):
    d = bpy.data.lights.new(name, 'AREA')
    d.energy = energy
    d.shape = 'DISK'
    d.size = size
    o = bpy.data.objects.new(name, d)
    bpy.context.collection.objects.link(o)
    o.location = pos
    o.rotation_euler = (Vector(target) - o.location).to_track_quat('-Z', 'Y').to_euler()

area('Large softbox', (-2.4, -1.3, 4.5), 460, 4)
area('Rim softbox', (2.3, 2.8, 3), 620, 3)
area('Front fill', (3, -3, 1.8), 180, 3)
bpy.ops.object.camera_add()
camera = bpy.context.object
camera.data.type = 'ORTHO'
scene.camera = camera
base_positions = {n: o.location.copy() for n, o in objects.items()}

def reset():
    for n, o in objects.items():
        o.hide_render = False
        o.location = base_positions[n]
    floor.location.z = -.335

def visible(names):
    for n, o in objects.items():
        o.hide_render = n not in names

def render(name, direction=(-2.5, -3.3, 2.5), target=None, scale=None,
           width=1400, height=1100):
    bpy.context.view_layer.update()
    chosen = [o for o in objects.values() if not o.hide_render]
    points = [o.matrix_world @ Vector(p) for o in chosen for p in o.bound_box]
    lo = Vector([min(p[i] for p in points) for i in range(3)])
    hi = Vector([max(p[i] for p in points) for i in range(3)])
    center = Vector(target) if target else (lo + hi) / 2
    floor.location.z = lo.z - .006
    camera.location = center + Vector(direction)
    camera.rotation_euler = (center - camera.location).to_track_quat('-Z', 'Y').to_euler()
    scene.render.resolution_x, scene.render.resolution_y = width, height
    scene.render.resolution_percentage = 100
    if scale is None:
        rot = camera.rotation_euler.to_matrix().transposed()
        pp = [rot @ (p-center) for p in points]
        spanx = max(p.x for p in pp)-min(p.x for p in pp)
        spany = max(p.y for p in pp)-min(p.y for p in pp)
        shift = Vector(((max(p.x for p in pp)+min(p.x for p in pp))/2,
                        (max(p.y for p in pp)+min(p.y for p in pp))/2, 0))
        center += camera.rotation_euler.to_matrix() @ shift
        camera.location = center + Vector(direction)
        scale = max(spanx, spany*(width/height))*1.16
    camera.data.ortho_scale = scale
    scene.render.filepath = str(OUT / (name + '.png'))
    scene.render.image_settings.file_format = 'PNG'
    bpy.ops.render.render(write_still=True)
    print('RENDERED', name, flush=True)

reset()
if not (OUT / 'hero.png').exists() or '--hero-only' in sys.argv:
    render('hero', direction=(2.8, -3.4, 2.8), width=1800, height=1500)
if '--hero-only' in sys.argv:
    sys.exit(0)
scene.cycles.samples = 32
if '--eevee' in sys.argv:
    scene.eevee.taa_render_samples = 32
    scene.eevee.use_raytracing = False
reset()
render('side', direction=(-4, -.8, 1.4), width=1500, height=1100)
reset()
render('top', direction=(.001, -.001, 5), width=1400, height=1400)
reset()
for n, o in objects.items():
    if n == 'lower': o.location.z -= .45
    elif n in ['motorwall', 'servo_body', 'servo_flange']: o.location += Vector((-.43, 0, .28))
    elif n == 'supportwall': o.location += Vector((.43, 0, .28))
    elif n == 'plate': o.location.z += .15
    elif n not in ['upper', 'lower']:
        o.location.z += .5
render('exploded', direction=(-2.8, -3.6, 3.2), width=1600, height=1400)
groups = {
    'shells': ['upper', 'lower'],
    'cassette': ['plate', 'motorwall', 'supportwall'],
    'gears': ['pinion', 'driven'],
    'spool': ['shaft', 'spool', 'bush_left', 'bush_right', 'spacer_left', 'spacer_middle', 'spacer_right', 'collar_left', 'collar_right'],
    'servo': ['servo_body', 'servo_flange', 'pinion', 'motorwall'],
    'guide': ['upper', 'cable_0', 'cable_1', 'cable_2', 'cable_3'],
}
for n, ids in groups.items():
    reset(); visible(ids)
    if n == 'shells': objects['upper'].location.z += .42
    direction = (-4, -1.2, 1.4) if n in ['gears', 'servo'] else (2.5, -3.2, 2.6)
    render(n, direction=direction, width=1000, height=820)

stages = [
    ['upper', 'lower'],
    ['upper', 'plate'],
    ['plate', 'motorwall', 'supportwall'],
    groups['cassette'] + groups['spool'],
    groups['cassette'] + groups['spool'] + groups['gears'],
    list(objects),
]
for i, ids in enumerate(stages):
    reset(); visible(ids)
    if i == 0: objects['upper'].location.z += .4
    render('step-' + str(i+1), width=1200, height=900)
reset(); visible([n for n in objects if not n.startswith('cable') and n not in ['upper', 'lower']])
render('drive', direction=(-4, -.9, 2), width=1600, height=1100)
for n in ['upper', 'lower', 'plate', 'motorwall', 'supportwall', 'driven', 'pinion', 'spool', 'shaft', 'bush_left', 'spacer_left', 'spacer_right', 'collar_left']:
    reset(); visible([n])
    part_id = {'spacer_left':'spacer2', 'spacer_right':'spacer3'}.get(n, n.replace('_left', '').replace('_right', ''))
    render('part-' + part_id, width=560, height=440)
