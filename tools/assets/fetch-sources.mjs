// Downloads the ORIGINAL high-detail Poly Haven models (CC0) with 2k textures into
// .assets-src/<id>/ for the Blender pipeline. Usage: node tools/assets/fetch-sources.mjs <id> [<id>...]
// ASCII only on purpose.
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const SRC = path.join(ROOT, ".assets-src");
const API = "https://api.polyhaven.com";
const RES = "2k";
const HEADERS = { "User-Agent": "OneShot-game-asset-fetch/1.0" };

async function getJson(url) {
  const res = await fetch(url, { headers: HEADERS });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.json();
}

async function download(url, file) {
  const res = await fetch(url, { headers: HEADERS });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, Buffer.from(await res.arrayBuffer()));
}

const ids = process.argv.slice(2);
if (ids.length === 0) throw new Error("Give at least one Poly Haven model id.");

for (const id of ids) {
  const files = await getJson(`${API}/files/${id}`);
  const entry = files.gltf?.[RES]?.gltf;
  if (!entry) throw new Error(`No ${RES} glTF for ${id}`);
  const dir = path.join(SRC, id);
  const main = path.join(dir, path.basename(new URL(entry.url).pathname));
  await download(entry.url, main);
  let n = 1;
  for (const [rel, item] of Object.entries(entry.include ?? {})) {
    await download(typeof item === "string" ? item : item.url, path.join(dir, rel));
    n++;
  }
  console.log(`${id}: ${n} files -> ${path.relative(ROOT, main)}`);
  await writeFile(path.join(dir, "main.txt"), path.basename(main));
}
