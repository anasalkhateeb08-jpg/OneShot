// Downloads the game's real-world assets from Poly Haven (all CC0 public domain), prepares them
// for the web, and writes them to client/public/assets with a manifest and a license table.
//
//   npm run assets
//
// - Ground texture: color, normal, and roughness maps at 1k.
// - Rocks: photoscanned boulders, simplified to about ROCK_TARGET_TRIS triangles each
//   (the normal map keeps the surface detail), saved as single .glb files.
// Safe to run again: it rebuilds everything from scratch.

import { statSync } from "node:fs";
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { dedup, prune, simplify, weld } from "@gltf-transform/functions";
import { MeshoptSimplifier } from "meshoptimizer";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const OUT = path.join(ROOT, "client", "public", "assets");
const TMP = path.join(ROOT, ".assets-tmp");
const API = "https://api.polyhaven.com";
const HEADERS = { "User-Agent": "OneShot-game-asset-fetch/1.0" };
const RES = "1k";

const GROUND = "sandy_gravel_02";
const ROCKS = ["namaqualand_boulder_02", "namaqualand_boulder_03", "namaqualand_boulder_05"];
const ROCK_TARGET_TRIS = 300;

async function getJson(url) {
  const res = await fetch(url, { headers: HEADERS });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.json();
}

async function download(url, file) {
  const res = await fetch(url, { headers: HEADERS });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  const buf = Buffer.from(await res.arrayBuffer());
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, buf);
  return buf.length;
}

function triangleCount(doc) {
  let tris = 0;
  for (const mesh of doc.getRoot().listMeshes()) {
    for (const prim of mesh.listPrimitives()) {
      const idx = prim.getIndices();
      const count = idx ? idx.getCount() : (prim.getAttribute("POSITION")?.getCount() ?? 0);
      tris += Math.floor(count / 3);
    }
  }
  return tris;
}

const kb = (n) => `${Math.round(n / 1024)} KB`;

async function main() {
  await rm(OUT, { recursive: true, force: true });
  await rm(TMP, { recursive: true, force: true });
  await mkdir(OUT, { recursive: true });
  const licenses = [];
  let total = 0;

  // Ground texture
  console.log(`Ground texture: ${GROUND}`);
  const g = await getJson(`${API}/files/${GROUND}`);
  const groundFiles = {
    diff: g.Diffuse[RES].jpg.url,
    nor: g.nor_gl[RES].jpg.url,
    rough: g.Rough[RES].jpg.url,
  };
  const ground = {};
  for (const [key, url] of Object.entries(groundFiles)) {
    const rel = `textures/${GROUND}_${key}.jpg`;
    const size = await download(url, path.join(OUT, rel));
    total += size;
    ground[key] = `/assets/${rel}`;
    console.log(`  ${rel}  ${kb(size)}`);
  }
  licenses.push({ asset: GROUND, kind: "texture", url: `https://polyhaven.com/a/${GROUND}` });

  // Rocks
  await MeshoptSimplifier.ready;
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
  const rocks = [];
  for (const id of ROCKS) {
    console.log(`Rock: ${id}`);
    const files = await getJson(`${API}/files/${id}`);
    const entry = files.gltf[RES].gltf;
    const dir = path.join(TMP, id);
    const gltfFile = path.join(dir, path.basename(new URL(entry.url).pathname));
    await download(entry.url, gltfFile);
    // Each include entry is either a URL string or an object with a "url" field.
    for (const [rel, item] of Object.entries(entry.include ?? {})) {
      const url = typeof item === "string" ? item : item.url;
      await download(url, path.join(dir, rel));
    }
    const doc = await io.read(gltfFile);
    const before = triangleCount(doc);
    const ratio = Math.min(1, ROCK_TARGET_TRIS / Math.max(1, before));
    await doc.transform(
      weld(),
      simplify({ simplifier: MeshoptSimplifier, ratio, error: 0.05 }),
      dedup(),
      prune(),
    );
    const after = triangleCount(doc);
    const rel = `rocks/${id}.glb`;
    const out = path.join(OUT, rel);
    await mkdir(path.dirname(out), { recursive: true });
    await io.write(out, doc);
    const size = statSync(out).size;
    total += size;
    rocks.push(`/assets/${rel}`);
    licenses.push({ asset: id, kind: "model", url: `https://polyhaven.com/a/${id}` });
    console.log(`  ${rel}  ${before} -> ${after} triangles  ${kb(size)}`);
  }

  await writeFile(
    path.join(OUT, "manifest.json"),
    JSON.stringify({ source: "Poly Haven (CC0)", ground, rocks }, null, 2) + "\n",
  );

  const date = new Date().toISOString().slice(0, 10);
  const rows = licenses
    .map((l) => `| ${l.asset} | client/public/assets (${l.kind}) | ${l.url} | Poly Haven | CC0 1.0 | ${date} |`)
    .join("\n");
  const md = `# ASSET LICENSES

Every model, animation, texture, sound, and font used by the game is listed here with its license.
Only free sources with a clear license (master section 9). Nothing from other games.
This table is regenerated by \`npm run assets\`. Sounds are made in code (no files).

| Asset | File in repo | Source URL | Author | License | Date added |
|---|---|---|---|---|---|
${rows}
`;
  await writeFile(path.join(ROOT, "docs", "ASSET_LICENSES.md"), md);
  await rm(TMP, { recursive: true, force: true });
  console.log(`\nDone. Total asset size: ${(total / 1024 / 1024).toFixed(1)} MB`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
