// Library health check and repair (D-062).
//   node tools/assets/library-check.mjs
// 1. Prints every library model with its triangle count (HEAVY above the game's limit).
// 2. Takes back every heavy model that was already placed: removes its pieces from the map
//    layouts, its type from shared/src/kits/library.json, and its copy from the game's assets.
//    (A raw AI model placed from the library froze the game; this brings the game back.)

import { existsSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { glbJson, triangles } from "./glb-measure.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const LIBRARY = path.join(ROOT, "library");
const KIT = path.join(ROOT, "shared", "src", "kits", "library.json");
const LAYOUTS = path.join(ROOT, "shared", "src", "layouts");
const ASSETS = path.join(ROOT, "client", "public", "assets");
const MAX_TRIS = 30000; // same limit as client/vite.config.ts

const libraryId = (folder, name) =>
  `lib_${folder}_${name}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

const heavy = new Set();
if (existsSync(LIBRARY)) {
  for (const folder of readdirSync(LIBRARY, { withFileTypes: true })) {
    if (!folder.isDirectory()) continue;
    for (const file of readdirSync(path.join(LIBRARY, folder.name))) {
      if (!file.toLowerCase().endsWith(".glb")) continue;
      const name = file.slice(0, -4);
      let tris;
      try {
        tris = triangles(glbJson(readFileSync(path.join(LIBRARY, folder.name, file))));
      } catch (err) {
        console.log(`BROKEN ${folder.name}/${file}: ${err.message}`);
        continue;
      }
      const bad = tris > MAX_TRIS;
      if (bad) heavy.add(libraryId(folder.name, name));
      console.log(`${bad ? "HEAVY" : "ok   "} ${folder.name}/${file}: ${tris} triangles`);
    }
  }
}

let removed = 0;
for (const file of readdirSync(LAYOUTS).filter((f) => f.endsWith(".json"))) {
  const full = path.join(LAYOUTS, file);
  const layout = JSON.parse(readFileSync(full, "utf8"));
  const keep = (layout.models ?? []).filter((m) => !heavy.has(m.type));
  const gone = (layout.models ?? []).length - keep.length;
  if (gone === 0) continue;
  layout.models = keep;
  removed += gone;
  // Same one-piece-per-line format as the editor writes.
  const block = (name, items, last) =>
    `  "${name}": [\n${items.map((i) => `    ${JSON.stringify(i)}`).join(",\n")}\n  ]${last ? "" : ","}`;
  writeFileSync(
    full,
    `{\n  "version": 1,\n  "map": ${JSON.stringify(layout.map)},\n` +
      `${block("rocks", layout.rocks ?? [], false)}\n${block("crates", layout.crates ?? [], false)}\n` +
      `${block("shrubs", layout.shrubs ?? [], false)}\n${block("models", keep, true)}\n}\n`,
  );
  console.log(`${file}: took back ${gone} heavy piece(s)`);
}

if (existsSync(KIT)) {
  const kit = JSON.parse(readFileSync(KIT, "utf8"));
  const keep = kit.filter((t) => !heavy.has(t.id));
  if (keep.length !== kit.length) {
    writeFileSync(KIT, "[\n" + keep.map((t) => "  " + JSON.stringify(t)).join(",\n") + "\n]\n");
  }
}
const manifestPath = path.join(ASSETS, "manifest.json");
if (existsSync(manifestPath)) {
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  let changed = false;
  for (const id of heavy) {
    if (manifest.models?.[id]) {
      delete manifest.models[id];
      changed = true;
    }
    rmSync(path.join(ASSETS, "models", id), { recursive: true, force: true });
  }
  if (changed) writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
}
console.log(`Heavy models: ${heavy.size}, pieces taken back from the map: ${removed}`);
