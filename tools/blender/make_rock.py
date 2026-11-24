"""
Turns a detailed photoscanned Poly Haven model into game-ready levels of detail (D-045).

Run by Blender, without a window:
  blender -b -P tools/blender/make_rock.py -- <source.gltf> <out_dir> <id> <tris_hi,tris_mid,tris_lo> <bake_px>

What it does (the method used for game assets):
  1. Imports the original model (100k+ triangles, 2k textures).
  2. Makes three lower-detail copies (Decimate modifier, keeps the UV layout).
  3. BAKES the surface detail of the original into a normal map for the closest copy, so a
     3000 triangle rock still shows the shape detail of a 180000 triangle scan.
  4. Exports <id>.glb (with textures), <id>_mid.glb and <id>_lo.glb (geometry only).
  5. Renders a preview picture: original (left) against the game-ready rock (right).
"""
import math
import os
import sys

import bpy
from mathutils import Vector

argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
if len(argv) < 5:
    raise SystemExit("usage: -- <source.gltf> <out_dir> <id> <tris_hi,tris_mid,tris_lo> <bake_px>")
SRC, OUT_DIR, ROCK_ID = argv[0], argv[1], argv[2]
TRIS = [int(x) for x in argv[3].split(",")]
BAKE_PX = int(argv[4])
PREVIEW = argv[5] if len(argv) > 5 else None


def log(msg):
    print(f"[make_rock] {msg}", flush=True)


def tri_count(obj):
    return sum(len(p.vertices) - 2 for p in obj.data.polygons)


# --- 1. Import -------------------------------------------------------------------------------
bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
bpy.ops.import_scene.gltf(filepath=SRC)
meshes = [o for o in scene.objects if o.type == "MESH"]
if not meshes:
    raise SystemExit("no mesh found in the source file")
bpy.ops.object.select_all(action="DESELECT")
for o in meshes:
    o.select_set(True)
bpy.context.view_layer.objects.active = meshes[0]
if len(meshes) > 1:
    bpy.ops.object.join()
high = bpy.context.view_layer.objects.active
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
high.name = f"{ROCK_ID}_high"
high_tris = tri_count(high)
log(f"original: {high_tris} triangles, {len(high.data.uv_layers)} UV layer(s)")
if not high.data.uv_layers:
    raise SystemExit("the source model has no UV map")

# Center the model on the origin (feet at z = 0 is not needed: the game normalizes the box).
corners = [high.matrix_world @ Vector(c) for c in high.bound_box]
center = sum(corners, Vector()) / 8
for v in high.data.vertices:
    v.co -= center
size = Vector(
    (
        max(c.x for c in corners) - min(c.x for c in corners),
        max(c.y for c in corners) - min(c.y for c in corners),
        max(c.z for c in corners) - min(c.z for c in corners),
    )
)
log(f"size: {size.x:.2f} x {size.y:.2f} x {size.z:.2f} (Blender axes, meters)")


# --- 2. Lower-detail copies ------------------------------------------------------------------
def make_lod(name, target):
    obj = high.copy()
    obj.data = high.data.copy()
    obj.name = name
    scene.collection.objects.link(obj)
    mod = obj.modifiers.new("decimate", "DECIMATE")
    mod.decimate_type = "COLLAPSE"
    mod.ratio = min(1.0, target / max(1, high_tris))
    mod.use_collapse_triangulate = True
    depsgraph = bpy.context.evaluated_depsgraph_get()
    evaluated = obj.evaluated_get(depsgraph)
    mesh = bpy.data.meshes.new_from_object(evaluated)
    obj.modifiers.remove(mod)
    obj.data = mesh
    mesh.calc_loop_triangles()
    log(f"{name}: {tri_count(obj)} triangles")
    return obj


lods = [make_lod(f"{ROCK_ID}_lod{i}", t) for i, t in enumerate(TRIS)]
lod0 = lods[0]

# --- 3. Bake the detail of the original into a normal map for lod0 ---------------------------
src_mat = high.active_material
if src_mat is None or not src_mat.use_nodes:
    raise SystemExit("the source model has no node material")

normal_img_node = None
for node in src_mat.node_tree.nodes:
    if node.type == "NORMAL_MAP" and node.inputs["Color"].links:
        linked = node.inputs["Color"].links[0].from_node
        if linked.type == "TEX_IMAGE":
            normal_img_node = linked
log(f"original normal map found: {normal_img_node is not None}")

baked = bpy.data.images.new(f"{ROCK_ID}_normal_baked", BAKE_PX, BAKE_PX, alpha=False)
baked.colorspace_settings.name = "Non-Color"

bake_mat = bpy.data.materials.new("bake_target")
bake_mat.use_nodes = True
bake_node = bake_mat.node_tree.nodes.new("ShaderNodeTexImage")
bake_node.image = baked
bake_mat.node_tree.nodes.active = bake_node
lod0.data.materials.clear()
lod0.data.materials.append(bake_mat)

scene.render.engine = "CYCLES"
scene.cycles.device = "CPU"
scene.cycles.samples = 4
bake = scene.render.bake
bake.use_selected_to_active = True
bake.normal_space = "TANGENT"
bake.margin = 16
bake.cage_extrusion = max(size) * 0.02
bake.max_ray_distance = max(size) * 0.08

bpy.ops.object.select_all(action="DESELECT")
high.select_set(True)
lod0.select_set(True)
bpy.context.view_layer.objects.active = lod0
log(f"baking normal map ({BAKE_PX} px), this takes a minute...")
bpy.ops.object.bake(type="NORMAL")
log("bake finished")

# --- final material for lod0: original look, baked normal map --------------------------------
final_mat = src_mat.copy()
final_mat.name = f"{ROCK_ID}_game"
for node in final_mat.node_tree.nodes:
    if node.type == "NORMAL_MAP" and node.inputs["Color"].links:
        img_node = node.inputs["Color"].links[0].from_node
        if img_node.type == "TEX_IMAGE":
            img_node.image = baked
lod0.data.materials.clear()
lod0.data.materials.append(final_mat)

plain = bpy.data.materials.new(f"{ROCK_ID}_plain")
plain.use_nodes = True
for lod in lods[1:]:
    lod.data.materials.clear()
    lod.data.materials.append(plain)

# --- 4. Export ---------------------------------------------------------------------------------
os.makedirs(OUT_DIR, exist_ok=True)
names = [f"{ROCK_ID}.glb", f"{ROCK_ID}_mid.glb", f"{ROCK_ID}_lo.glb"]
for lod, fname in zip(lods, names):
    bpy.ops.object.select_all(action="DESELECT")
    lod.select_set(True)
    bpy.context.view_layer.objects.active = lod
    path = os.path.join(OUT_DIR, fname)
    bpy.ops.export_scene.gltf(
        filepath=path,
        export_format="GLB",
        use_selection=True,
        export_image_format="JPEG",
        export_jpeg_quality=88,
        export_apply=False,
    )
    log(f"wrote {path} ({os.path.getsize(path) // 1024} KB)")

# --- 5. Preview picture ------------------------------------------------------------------------
if PREVIEW:
    gap = max(size) * 0.75
    high.location = Vector((-gap, 0, 0))
    lod0.location = Vector((gap, 0, 0))
    for lod in lods[1:]:
        scene.collection.objects.unlink(lod)

    ground_mat = bpy.data.materials.new("ground")
    ground_mat.diffuse_color = (0.55, 0.38, 0.24, 1)
    ground_mat.use_nodes = True
    ground_mat.node_tree.nodes["Principled BSDF"].inputs["Base Color"].default_value = (
        0.55,
        0.38,
        0.24,
        1,
    )
    bpy.ops.mesh.primitive_plane_add(size=max(size) * 12, location=(0, 0, -size.z / 2))
    plane = bpy.context.active_object
    plane.data.materials.append(ground_mat)

    sun_data = bpy.data.lights.new("sun", "SUN")
    sun_data.energy = 4.0
    sun = bpy.data.objects.new("sun", sun_data)
    sun.rotation_euler = (math.radians(50), math.radians(10), math.radians(35))
    scene.collection.objects.link(sun)

    world = bpy.data.worlds.new("sky")
    world.use_nodes = True
    world.node_tree.nodes["Background"].inputs["Color"].default_value = (0.55, 0.68, 0.9, 1)
    world.node_tree.nodes["Background"].inputs["Strength"].default_value = 1.0
    scene.world = world

    cam_data = bpy.data.cameras.new("cam")
    cam_data.lens = 50
    cam = bpy.data.objects.new("cam", cam_data)
    scene.collection.objects.link(cam)
    dist = max(size) * 5.0
    cam.location = Vector((0, -dist, size.z * 0.6))
    direction = Vector((0, 0, 0)) - cam.location
    cam.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()
    scene.camera = cam

    scene.cycles.samples = 48
    scene.render.resolution_x = 1600
    scene.render.resolution_y = 700
    scene.render.filepath = PREVIEW
    scene.render.image_settings.file_format = "PNG"
    log("rendering the preview (left: original, right: game-ready)...")
    bpy.ops.render.render(write_still=True)
    log(f"preview: {PREVIEW}")

log("done")
