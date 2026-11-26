"""
Renders a small picture of every model in the model library (D-062), so the owner can see
what he picks in the editor (and in Windows Explorer): <name>.glb -> <name>.png next to it.
Only models without a picture, or changed since, are rendered.

  blender -b -P tools/blender/thumbs.py -- <library folder> [size_px]
"""

import math
import os
import sys

import bpy
from mathutils import Vector

argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
if not argv:
    raise SystemExit("usage: -- <library folder> [size_px]")
LIBRARY = argv[0]
SIZE = int(argv[1]) if len(argv) > 1 else 256


def log(msg):
    print(f"[thumbs] {msg}", flush=True)


todo = []
for folder, _dirs, files in os.walk(LIBRARY):
    for f in sorted(files):
        if not f.lower().endswith(".glb"):
            continue
        glb = os.path.join(folder, f)
        png = os.path.splitext(glb)[0] + ".png"
        if not os.path.exists(png) or os.path.getmtime(png) < os.path.getmtime(glb):
            todo.append((glb, png))
log(f"{len(todo)} picture(s) to render")

for glb, png in todo:
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    try:
        bpy.ops.import_scene.gltf(filepath=glb)
    except Exception as err:  # a broken file must not stop the others
        log(f"skipped {os.path.basename(glb)}: {err}")
        continue
    meshes = [o for o in scene.objects if o.type == "MESH"]
    if not meshes:
        log(f"skipped {os.path.basename(glb)}: no mesh")
        continue
    lo = Vector((math.inf, math.inf, math.inf))
    hi = Vector((-math.inf, -math.inf, -math.inf))
    for o in meshes:
        for c in o.bound_box:
            p = o.matrix_world @ Vector(c)
            lo = Vector((min(lo.x, p.x), min(lo.y, p.y), min(lo.z, p.z)))
            hi = Vector((max(hi.x, p.x), max(hi.y, p.y), max(hi.z, p.z)))
    center = (lo + hi) / 2
    radius = max((hi - lo).length / 2, 1e-3)

    cam_data = bpy.data.cameras.new("cam")
    cam_data.lens = 50
    cam = bpy.data.objects.new("cam", cam_data)
    scene.collection.objects.link(cam)
    fov = cam_data.angle
    direction = Vector((1.0, -1.3, 0.8)).normalized()
    cam.location = center + direction * (radius / math.sin(fov / 2) * 1.05)
    cam.rotation_euler = (center - cam.location).to_track_quat("-Z", "Y").to_euler()
    scene.camera = cam

    sun_data = bpy.data.lights.new("sun", "SUN")
    sun_data.energy = 3.5
    sun = bpy.data.objects.new("sun", sun_data)
    sun.rotation_euler = (math.radians(45), math.radians(15), math.radians(30))
    scene.collection.objects.link(sun)
    world = bpy.data.worlds.new("sky")
    world.use_nodes = True
    world.node_tree.nodes["Background"].inputs["Color"].default_value = (0.8, 0.85, 0.95, 1)
    world.node_tree.nodes["Background"].inputs["Strength"].default_value = 0.9
    scene.world = world

    scene.render.engine = "CYCLES"
    scene.cycles.device = "CPU"
    scene.cycles.samples = 16
    scene.render.film_transparent = True
    scene.render.resolution_x = SIZE
    scene.render.resolution_y = SIZE
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"
    scene.render.filepath = png
    bpy.ops.render.render(write_still=True)
    log(f"rendered {os.path.basename(png)}")

log("done")
