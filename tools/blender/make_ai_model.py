"""
Turns an AI-generated model (TRELLIS, Meshy, ...) into a clean game model (D-060).

AI models come with broken insides: loose triangles along texture seams, tiny floating bits,
overlapping shells. Instead of reducing that mesh (which tears it, D-059), this rebuilds it:

  1. Imports the .glb and welds what can be welded.
  2. Remeshes: a new closed skin over the shape (voxel remesh), whatever the inside was.
  3. Reduces the new skin to three detail levels (default 3000 / 800 / 200 triangles).
  4. Gives the near level fresh UVs and bakes the original's COLOR and surface DETAIL
     (normal map) onto it, so the texture is never stretched.
  5. Checks the result against the original in both directions (points of each surface to the
     other); a model that drifts too far is reported as FAILED and not exported.
  6. Exports <id>.glb to <out_dir> and <id>_mid.glb / <id>_lo.glb to <lod_dir>, and renders a
     preview (left original, right game model).

Run by tools/make-ai-kit.ps1:
  blender -b -P tools/blender/make_ai_model.py -- <source.glb> <out_dir> <lod_dir> <id>
      <tris_hi,tris_mid,tris_lo> <texture_px> <preview.png>
"""

import math
import os
import random
import sys

import bmesh
import bpy
from mathutils import Vector
from mathutils.bvhtree import BVHTree

argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
if len(argv) < 7:
    raise SystemExit("usage: -- <src.glb> <out_dir> <lod_dir> <id> <tris> <texture_px> <preview>")
SRC, OUT_DIR, LOD_DIR, MODEL_ID = argv[0], argv[1], argv[2], argv[3]
TRIS = [int(x) for x in argv[4].split(",")]
TEX_PX = int(argv[5])
PREVIEW = argv[6]

# Remesh detail: the voxel is this fraction of the model's largest side.
VOXEL_FRACTION = 1 / 140
# Check: 90% of sampled points must be closer than this fraction of the largest side.
MAX_DRIFT = 0.035


def log(msg):
    print(f"[make_ai_model] {msg}", flush=True)


def tri_count(obj):
    return sum(len(p.vertices) - 2 for p in obj.data.polygons)


def apply_modifier(obj, kind, setup):
    mod = obj.modifiers.new(kind.lower(), kind)
    setup(mod)
    depsgraph = bpy.context.evaluated_depsgraph_get()
    mesh = bpy.data.meshes.new_from_object(obj.evaluated_get(depsgraph))
    obj.modifiers.remove(mod)
    obj.data = mesh


def select_only(obj):
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj


# --- 1. Import and weld ------------------------------------------------------------------------
bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
bpy.ops.import_scene.gltf(filepath=SRC)
meshes = [o for o in scene.objects if o.type == "MESH"]
if not meshes:
    raise SystemExit("FAILED: no mesh in the file")
bpy.ops.object.select_all(action="DESELECT")
for o in meshes:
    o.select_set(True)
bpy.context.view_layer.objects.active = meshes[0]
if len(meshes) > 1:
    bpy.ops.object.join()
high = bpy.context.view_layer.objects.active
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
high.name = f"{MODEL_ID}_source"
log(f"original: {tri_count(high)} triangles")

corners = [Vector(c) for c in high.bound_box]
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
largest = max(size)
log(f"size: {size.x:.2f} x {size.y:.2f} x {size.z:.2f}")

bm = bmesh.new()
bm.from_mesh(high.data)
bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=largest * 1e-4)
bm.to_mesh(high.data)
bm.free()
high.data.update()

# The source's color must bake as plain color: no metal (metal bakes black), opaque.
src_mat = high.active_material
if src_mat is None or not src_mat.use_nodes:
    raise SystemExit("FAILED: the model has no material to take the color from")
for node in src_mat.node_tree.nodes:
    if node.type == "BSDF_PRINCIPLED":
        metallic = node.inputs["Metallic"]
        for link in list(metallic.links):
            src_mat.node_tree.links.remove(link)
        metallic.default_value = 0.0

# --- 2. New closed skin ------------------------------------------------------------------------
skin = high.copy()
skin.data = high.data.copy()
skin.name = f"{MODEL_ID}_skin"
scene.collection.objects.link(skin)


def remesh(mod):
    mod.mode = "VOXEL"
    mod.voxel_size = largest * VOXEL_FRACTION
    mod.adaptivity = 0.0


apply_modifier(skin, "REMESH", remesh)
log(f"remeshed: {tri_count(skin)} triangles")

# --- 3. Detail levels ------------------------------------------------------------------------
lod0 = skin
count = tri_count(lod0)
apply_modifier(
    lod0,
    "DECIMATE",
    lambda m: (
        setattr(m, "decimate_type", "COLLAPSE"),
        setattr(m, "ratio", min(1.0, TRIS[0] / max(1, count))),
        setattr(m, "use_collapse_triangulate", True),
    ),
)
lod0.name = f"{MODEL_ID}_lod0"
for p in lod0.data.polygons:
    p.use_smooth = True
lod0.data.validate(verbose=False)
log(f"{lod0.name}: {tri_count(lod0)} triangles")

# --- 4. Fresh UVs and bakes ----------------------------------------------------------------------
while lod0.data.uv_layers:  # Blender 5 has no uv_layers.clear()
    lod0.data.uv_layers.remove(lod0.data.uv_layers[0])
lod0.data.uv_layers.new(name="UVMap")
select_only(lod0)
bpy.ops.object.mode_set(mode="EDIT")
bpy.ops.mesh.select_all(action="SELECT")
bpy.ops.uv.smart_project(angle_limit=math.radians(66), island_margin=0.02)
bpy.ops.object.mode_set(mode="OBJECT")

color_img = bpy.data.images.new(f"{MODEL_ID}_color", TEX_PX, TEX_PX, alpha=False)
normal_img = bpy.data.images.new(f"{MODEL_ID}_normal", TEX_PX, TEX_PX, alpha=False)
normal_img.colorspace_settings.name = "Non-Color"

game_mat = bpy.data.materials.new(f"{MODEL_ID}_game")
game_mat.use_nodes = True
nt = game_mat.node_tree
bsdf = nt.nodes["Principled BSDF"]
bsdf.inputs["Metallic"].default_value = 0.0
bsdf.inputs["Roughness"].default_value = 0.85
color_node = nt.nodes.new("ShaderNodeTexImage")
color_node.image = color_img
normal_node = nt.nodes.new("ShaderNodeTexImage")
normal_node.image = normal_img
nmap = nt.nodes.new("ShaderNodeNormalMap")
lod0.data.materials.clear()
lod0.data.materials.append(game_mat)

scene.render.engine = "CYCLES"
scene.cycles.device = "CPU"
scene.cycles.samples = 4
select_only(lod0)
high.select_set(True)
bpy.context.view_layer.objects.active = lod0
bake_args = dict(
    use_selected_to_active=True,
    cage_extrusion=largest * 0.03,
    max_ray_distance=largest * 0.1,
    margin=8,
)

nt.nodes.active = color_node
log(f"baking color ({TEX_PX} px)...")
bpy.ops.object.bake(type="DIFFUSE", pass_filter={"COLOR"}, **bake_args)
nt.nodes.active = normal_node
log(f"baking surface detail ({TEX_PX} px)...")
bpy.ops.object.bake(type="NORMAL", normal_space="TANGENT", **bake_args)
color_img.pack()
normal_img.pack()

nt.links.new(color_node.outputs["Color"], bsdf.inputs["Base Color"])
nt.links.new(normal_node.outputs["Color"], nmap.inputs["Color"])
nt.links.new(nmap.outputs["Normal"], bsdf.inputs["Normal"])

lods = [lod0]
for i, target in enumerate(TRIS[1:], start=1):
    lod = lod0.copy()
    lod.data = lod0.data.copy()
    lod.name = f"{MODEL_ID}_lod{i}"
    scene.collection.objects.link(lod)
    n = tri_count(lod)
    apply_modifier(
        lod,
        "DECIMATE",
        lambda m, n=n, target=target: (
            setattr(m, "decimate_type", "COLLAPSE"),
            setattr(m, "ratio", min(1.0, target / max(1, n))),
            setattr(m, "use_collapse_triangulate", True),
        ),
    )
    lod.data.validate(verbose=False)
    log(f"{lod.name}: {tri_count(lod)} triangles")
    lods.append(lod)

# --- 5. Check: does the game model follow the original? ----------------------------------------
depsgraph = bpy.context.evaluated_depsgraph_get()


def surface_points(obj, n):
    mesh = obj.data
    mesh.calc_loop_triangles()
    tris = list(mesh.loop_triangles)
    weights = [t.area for t in tris]
    rng = random.Random(7)
    picks = rng.choices(tris, weights=weights, k=n)
    out = []
    for t in picks:
        a, b, c = (mesh.vertices[i].co for i in t.vertices)
        r1, r2 = rng.random(), rng.random()
        if r1 + r2 > 1:
            r1, r2 = 1 - r1, 1 - r2
        out.append(a + (b - a) * r1 + (c - a) * r2)
    return out


def drift(points, target, outside_only=False):
    tree = BVHTree.FromObject(target, depsgraph)
    dists = []
    for p in points:
        loc, normal, _index, dist = tree.find_nearest(p)
        # AI models often keep surfaces hidden INSIDE the shape; the new skin drops them on
        # purpose, so points that lie inside the game model are not counted as missing.
        if outside_only and (p - loc).dot(normal) < 0:
            continue
        dists.append(dist)
    if not dists:
        return 0.0
    dists.sort()
    return dists[int(len(dists) * 0.9)] / largest


forward = drift(surface_points(lod0, 3000), high)
backward = drift(surface_points(high, 3000), lod0, outside_only=True)
log(f"check: game model to original {forward:.3f}, original to game model {backward:.3f}")
failed = forward > MAX_DRIFT or backward > MAX_DRIFT

# --- 6. Export and preview -------------------------------------------------------------------------
if not failed:
    os.makedirs(OUT_DIR, exist_ok=True)
    os.makedirs(LOD_DIR, exist_ok=True)
    targets = [
        (lods[0], os.path.join(OUT_DIR, f"{MODEL_ID}.glb")),
        (lods[1], os.path.join(LOD_DIR, f"{MODEL_ID}_mid.glb")),
        (lods[2], os.path.join(LOD_DIR, f"{MODEL_ID}_lo.glb")),
    ]
    for lod, path in targets:
        select_only(lod)
        bpy.ops.export_scene.gltf(
            filepath=path,
            export_format="GLB",
            use_selection=True,
            export_image_format="JPEG",
            export_jpeg_quality=88,
            export_apply=False,
        )
        log(f"wrote {path} ({os.path.getsize(path) // 1024} KB)")

gap = largest * 0.75
high.location = Vector((-gap, 0, 0))
lod0.location = Vector((gap, 0, 0))
for lod in lods[1:]:
    scene.collection.objects.unlink(lod)
ground_mat = bpy.data.materials.new("ground")
ground_mat.use_nodes = True
ground_mat.node_tree.nodes["Principled BSDF"].inputs["Base Color"].default_value = (
    0.85,
    0.66,
    0.45,
    1,
)
bpy.ops.mesh.primitive_plane_add(size=largest * 12, location=(0, 0, -size.z / 2))
bpy.context.active_object.data.materials.append(ground_mat)
sun_data = bpy.data.lights.new("sun", "SUN")
sun_data.energy = 4.0
sun = bpy.data.objects.new("sun", sun_data)
sun.rotation_euler = (math.radians(50), math.radians(10), math.radians(35))
scene.collection.objects.link(sun)
world = bpy.data.worlds.new("sky")
world.use_nodes = True
world.node_tree.nodes["Background"].inputs["Color"].default_value = (0.45, 0.65, 0.95, 1)
scene.world = world
cam_data = bpy.data.cameras.new("cam")
cam_data.lens = 50
cam = bpy.data.objects.new("cam", cam_data)
scene.collection.objects.link(cam)
cam.location = Vector((0, -largest * 5.0, size.z * 0.6))
cam.rotation_euler = (Vector((0, 0, 0)) - cam.location).to_track_quat("-Z", "Y").to_euler()
scene.camera = cam
scene.cycles.samples = 32
scene.render.resolution_x = 1200
scene.render.resolution_y = 520
scene.render.filepath = PREVIEW
scene.render.image_settings.file_format = "PNG"
bpy.ops.render.render(write_still=True)
log(f"preview: {PREVIEW}")

if failed:
    raise SystemExit(f"FAILED: {MODEL_ID} drifts too far from the original (see the preview)")
log("OK")
