// Imports a stylized glTF kit (D-057): every .glb in a folder becomes a model type.
// Usage: node tools/assets/import-glb-kit.mjs <folder with .glb files> <kit id> <id prefix>
//   e.g. node tools/assets/import-glb-kit.mjs .assets-src/military_free military-free mil
// For each model it: measures its real size from the file (all meshes, all node transforms),
// copies it to client/public/assets/models/<id>/<id>.glb, lists it in the manifest, and writes
// shared/src/kits/<kit id>.json (id, label, size in meters, collision) for the game and the
// editor. Grass and similar small plants get no collision; everything else is solid.
import { copyFile, mkdir, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const ASSETS = path.join(ROOT, "client", "public", "assets");
const MANIFEST = path.join(ASSETS, "manifest.json");
const NO_COLLISION = /grass|bush|weed|flower/i;

/** Reads the JSON chunk of a .glb file. */
function glbJson(buf) {
  if (buf.readUInt32LE(0) !== 0x46546c67) throw new Error("not a .glb file");
  const len = buf.readUInt32LE(12);
  if (buf.readUInt32LE(16) !== 0x4e4f534a) throw new Error("first .glb chunk is not JSON");
  return JSON.parse(buf.subarray(20, 20 + len).toString("utf8"));
}

/** 4x4 column-major matrix helpers. */
const identity = () => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
function multiply(a, b) {
  const o = new Array(16).fill(0);
  for (let c = 0; c < 4; c++)
    for (let r = 0; r < 4; r++)
      for (let k = 0; k < 4; k++) o[c * 4 + r] += a[k * 4 + r] * b[c * 4 + k];
  return o;
}
function nodeMatrix(n) {
  if (n.matrix) return n.matrix.slice();
  const [tx, ty, tz] = n.translation ?? [0, 0, 0];
  const [x, y, z, w] = n.rotation ?? [0, 0, 0, 1];
  const [sx, sy, sz] = n.scale ?? [1, 1, 1];
  return [
    (1 - 2 * (y * y + z * z)) * sx, 2 * (x * y + z * w) * sx, 2 * (x * z - y * w) * sx, 0,
    2 * (x * y - z * w) * sy, (1 - 2 * (x * x + z * z)) * sy, 2 * (y * z + x * w) * sy, 0,
    2 * (x * z + y * w) * sz, 2 * (y * z - x * w) * sz, (1 - 2 * (x * x + y * y)) * sz, 0,
    tx, ty, tz, 1,
  ];
}
const apply = (m, p) => [
  m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12],
  m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13],
  m[2] * p[0] + m[6] * p[1] + m[10] * p[2] + m[14],
];

/** World-space size of everything drawn in the file (meters). */
function measure(json) {
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  const visit = (index, parent) => {
    const node = json.nodes[index];
    const world = multiply(parent, nodeMatrix(node));
    if (node.mesh !== undefined) {
      for (const prim of json.meshes[node.mesh].primitives) {
        const acc = json.accessors[prim.attributes.POSITION];
        if (!acc?.min || !acc?.max) continue;
        for (let i = 0; i < 8; i++) {
          const corner = [0, 1, 2].map((k) => ((i >> k) & 1 ? acc.max[k] : acc.min[k]));
          const p = apply(world, corner);
          for (let k = 0; k < 3; k++) {
            min[k] = Math.min(min[k], p[k]);
            max[k] = Math.max(max[k], p[k]);
          }
        }
      }
    }
    for (const child of node.children ?? []) visit(child, world);
  };
  const scene = json.scenes?.[json.scene ?? 0];
  for (const root of scene?.nodes ?? []) visit(root, identity());
  if (!Number.isFinite(min[0])) throw new Error("no mesh with known bounds");
  const r = (v) => Math.round(v * 1000) / 1000;
  return { x: r(max[0] - min[0]), y: r(max[1] - min[1]), z: r(max[2] - min[2]) };
}

async function main() {
  const [folderArg, kitId, prefix] = process.argv.slice(2);
  if (!folderArg || !kitId || !prefix) {
    throw new Error("usage: import-glb-kit.mjs <folder> <kit id> <id prefix>");
  }
  const folder = path.resolve(ROOT, folderArg);
  const files = (await readdir(folder)).filter((f) => f.toLowerCase().endsWith(".glb")).sort();
  if (files.length === 0) throw new Error(`no .glb files in ${folder}`);
  const manifest = JSON.parse(await readFile(MANIFEST, "utf8"));
  manifest.models = manifest.models ?? {};
  const types = [];
  for (const file of files) {
    const base = path.basename(file, path.extname(file));
    const id = `${prefix}_${base.toLowerCase().replace(/[^a-z0-9]+/g, "_")}`;
    const buf = await readFile(path.join(folder, file));
    const json = glbJson(buf);
    const ext = [...(json.extensionsRequired ?? [])];
    const size = measure(json);
    const outDir = path.join(ASSETS, "models", id);
    await rm(outDir, { recursive: true, force: true });
    await mkdir(outDir, { recursive: true });
    await copyFile(path.join(folder, file), path.join(outDir, `${id}.glb`));
    manifest.models[id] = { near: `/assets/models/${id}/${id}.glb` };
    const collision = NO_COLLISION.test(base) ? "none" : "solid";
    types.push({ id, label: base.replace(/_/g, " "), size, collision });
    const kb = Math.round((await stat(path.join(outDir, `${id}.glb`))).size / 1024);
    console.log(
      `${id}: ${size.x} x ${size.y} x ${size.z} m, ${collision}, ${kb} KB` +
        (ext.length ? `, needs ${ext.join(" ")}` : ""),
    );
  }
  await writeFile(MANIFEST, JSON.stringify(manifest, null, 2) + "\n");
  const out = path.join(ROOT, "shared", "src", "kits", `${kitId}.json`);
  await writeFile(out, "[\n" + types.map((t) => "  " + JSON.stringify(t)).join(",\n") + "\n]\n");
  console.log(`kit ${kitId}: ${types.length} model types written to shared/src/kits/${kitId}.json`);
}

main().catch((err) => {
  console.error(`ERROR: ${err.message}`);
  process.exit(1);
});
