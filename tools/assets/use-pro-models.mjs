// Puts Blender-made models (.assets-pro/<id>/, D-054) into the game: copies their three detail
// levels to client/public/assets/models/<id>/ and lists them in the manifest.
// Usage: node tools/assets/use-pro-models.mjs <id> [id ...]
//   The id must also be a model type in shared/src/models.ts (MODEL_TYPES).
// Run `npm run assets` first (it writes the manifest); run this again after `npm run assets`.
import { copyFile, mkdir, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const PRO = path.join(ROOT, ".assets-pro");
const ASSETS = path.join(ROOT, "client", "public", "assets");
const MANIFEST = path.join(ASSETS, "manifest.json");

async function exists(file) {
  try {
    await stat(file);
    return true;
  } catch {
    return false;
  }
}

async function main() {
  if (!(await exists(MANIFEST))) {
    throw new Error("client/public/assets/manifest.json is missing: run `npm run assets` first.");
  }
  const ids = process.argv.slice(2);
  if (ids.length === 0) {
    const dirs = (await exists(PRO)) ? (await readdir(PRO)).sort() : [];
    throw new Error(`Name the model(s) to use. Made so far: ${dirs.join(", ") || "none"}`);
  }
  const manifest = JSON.parse(await readFile(MANIFEST, "utf8"));
  manifest.models = manifest.models ?? {};
  for (const id of ids) {
    const outDir = path.join(ASSETS, "models", id);
    await rm(outDir, { recursive: true, force: true });
    await mkdir(outDir, { recursive: true });
    const entry = {};
    for (const [key, name] of [
      ["near", `${id}.glb`],
      ["mid", `${id}_mid.glb`],
      ["lo", `${id}_lo.glb`],
    ]) {
      const src = path.join(PRO, id, name);
      if (!(await exists(src))) throw new Error(`Missing ${src} (run make-megascans first)`);
      await copyFile(src, path.join(outDir, name));
      entry[key] = `/assets/models/${id}/${name}`;
    }
    manifest.models[id] = entry;
    const kb = Math.round((await stat(path.join(outDir, `${id}.glb`))).size / 1024);
    console.log(`model ${id}: ${kb} KB (near), plus _mid and _lo`);
  }
  await writeFile(MANIFEST, JSON.stringify(manifest, null, 2) + "\n");
  console.log(`manifest: ${Object.keys(manifest.models).length} model type(s)`);
}

main().catch((err) => {
  console.error(`ERROR: ${err.message}`);
  process.exit(1);
});
