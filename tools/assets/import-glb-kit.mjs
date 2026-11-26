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
import { NO_COLLISION, glbJson, measure } from "./glb-measure.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const ASSETS = path.join(ROOT, "client", "public", "assets");
const MANIFEST = path.join(ASSETS, "manifest.json");
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
