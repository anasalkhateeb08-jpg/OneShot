// Puts the Blender-made rocks (.assets-pro/<id>/, D-045 and D-046) into the game: copies their
// three detail levels to client/public/assets/rocks-pro/ and points the manifest at them.
// Usage: node tools/assets/use-pro-rocks.mjs [id ...]
//   no ids: every .assets-pro folder whose name starts with "desert_western" (one matching set).
// Run `npm run assets` first (ground textures and the manifest); running it again later resets
// the rocks to Poly Haven, so run this script again after it.
import { copyFile, mkdir, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const PRO = path.join(ROOT, ".assets-pro");
const ASSETS = path.join(ROOT, "client", "public", "assets");
const OUT = path.join(ASSETS, "rocks-pro");
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
  let ids = process.argv.slice(2);
  if (ids.length === 0) {
    const dirs = (await exists(PRO)) ? await readdir(PRO) : [];
    ids = dirs.filter((d) => d.startsWith("desert_western")).sort();
  }
  if (ids.length === 0) throw new Error("No rocks found in .assets-pro (run make-megascans first).");

  await rm(OUT, { recursive: true, force: true });
  await mkdir(OUT, { recursive: true });
  const rocks = { rocks: [], rocksMid: [], rocksLo: [] };
  for (const id of ids) {
    const files = [
      ["rocks", `${id}.glb`],
      ["rocksMid", `${id}_mid.glb`],
      ["rocksLo", `${id}_lo.glb`],
    ];
    for (const [key, name] of files) {
      const src = path.join(PRO, id, name);
      if (!(await exists(src))) throw new Error(`Missing ${src}`);
      await copyFile(src, path.join(OUT, name));
      rocks[key].push(`/assets/rocks-pro/${name}`);
    }
    const kb = Math.round((await stat(path.join(OUT, `${id}.glb`))).size / 1024);
    console.log(`rock ${id}: ${kb} KB (near), plus _mid and _lo`);
  }

  const manifest = JSON.parse(await readFile(MANIFEST, "utf8"));
  Object.assign(manifest, rocks);
  await writeFile(MANIFEST, JSON.stringify(manifest, null, 2) + "\n");
  console.log(`manifest: ${ids.length} rock(s) from .assets-pro`);
}

main().catch((err) => {
  console.error(`ERROR: ${err.message}`);
  process.exit(1);
});
