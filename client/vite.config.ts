import { copyFile, mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import type { IncomingMessage, ServerResponse } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import type { Plugin, ViteDevServer } from "vite";
import type { MapLayout } from "../shared/src/mapLayout";
// Types only: erased at build, so the config still does not depend on the kit files (D-062).
import type * as MapLayoutModule from "../shared/src/mapLayout";
import { NO_COLLISION, glbJson, measure, triangles } from "../tools/assets/glb-measure.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LAYOUT_DIR = path.join(ROOT, "shared", "src", "layouts");
/** The owner's model library (D-062): one folder per group, .glb files with .png pictures. */
const LIBRARY_DIR = path.join(ROOT, "library");
const LIBRARY_KIT = path.join(ROOT, "shared", "src", "kits", "library.json");
const ASSETS_DIR = path.join(ROOT, "client", "public", "assets");
const SAFE_NAME = /^[A-Za-z0-9 _.-]+$/;
/**
 * Most triangles a library model may have. A raw AI model (hundreds of thousands) froze the
 * game: every shot and mouse move tests a solid model's triangles. Clean ones are far below.
 */
const MAX_LIBRARY_TRIS = 30000;

/**
 * Reads a layout with the game's own checker, loaded through the dev server and not imported
 * here: an import would make this config depend on the kit files (mapLayout -> models -> kits),
 * and Vite restarts the whole server when the library adds a model to a kit (D-062 fix).
 */
async function parseLayoutLive(server: ViteDevServer, data: unknown): Promise<MapLayout> {
  const mod = (await server.ssrLoadModule(
    path.join(ROOT, "shared", "src", "mapLayout.ts"),
  )) as typeof MapLayoutModule;
  return mod.parseLayout(data);
}

/** Model type id of a library file; the editor computes the same one. */
function libraryId(folder: string, name: string): string {
  return `lib_${folder}_${name}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk: Buffer) => {
      body += chunk.toString("utf8");
    });
    req.on("end", () => resolve(body));
    req.on("error", reject);
  });
}

function send(res: ServerResponse, status: number, body: string, type = "text/plain"): void {
  res.statusCode = status;
  res.setHeader("Content-Type", type);
  res.end(body);
}

async function exists(file: string): Promise<boolean> {
  try {
    await stat(file);
    return true;
  } catch {
    return false;
  }
}

/** Every model in the library, grouped by folder. */
async function listLibrary(): Promise<
  Array<{ folder: string; name: string; id: string; thumb: boolean }>
> {
  if (!(await exists(LIBRARY_DIR))) return [];
  const out: Array<{ folder: string; name: string; id: string; thumb: boolean }> = [];
  for (const folder of (await readdir(LIBRARY_DIR, { withFileTypes: true })).sort((a, b) =>
    a.name.localeCompare(b.name),
  )) {
    if (!folder.isDirectory() || !SAFE_NAME.test(folder.name)) continue;
    const files = await readdir(path.join(LIBRARY_DIR, folder.name));
    for (const file of files.sort()) {
      if (!file.toLowerCase().endsWith(".glb")) continue;
      const name = file.slice(0, -4);
      if (!SAFE_NAME.test(name)) continue;
      out.push({
        folder: folder.name,
        name,
        id: libraryId(folder.name, name),
        thumb: files.includes(`${name}.png`),
      });
    }
  }
  return out;
}

/**
 * Makes a library model a model type of the game: copies it into the game's assets, lists it
 * in the manifest and in shared/src/kits/library.json with its measured size and collision.
 */
async function registerLibraryModel(folder: string, name: string): Promise<string> {
  if (!SAFE_NAME.test(folder) || !SAFE_NAME.test(name)) throw new Error("bad library name");
  const src = path.join(LIBRARY_DIR, folder, `${name}.glb`);
  if (!(await exists(src))) throw new Error(`not in the library: ${folder}/${name}.glb`);
  const id = libraryId(folder, name);
  const json = glbJson(await readFile(src));
  const tris = triangles(json);
  if (tris > MAX_LIBRARY_TRIS) {
    throw new Error(
      `${name} has ${tris} triangles; the game takes at most ${MAX_LIBRARY_TRIS}. ` +
        "Clean it first with tools\\make-ai-kit.ps1 (raw AI models are far too heavy).",
    );
  }
  const size = measure(json);
  const outDir = path.join(ASSETS_DIR, "models", id);
  await mkdir(outDir, { recursive: true });
  await copyFile(src, path.join(outDir, `${id}.glb`));

  const manifestPath = path.join(ASSETS_DIR, "manifest.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as {
    models?: Record<string, { near: string }>;
  };
  manifest.models = { ...manifest.models, [id]: { near: `/assets/models/${id}/${id}.glb` } };
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + "\n");

  const kit = (await exists(LIBRARY_KIT))
    ? (JSON.parse(await readFile(LIBRARY_KIT, "utf8")) as Array<{ id: string }>)
    : [];
  const type = {
    id,
    label: `${folder}: ${name.replace(/_/g, " ")}`,
    size,
    collision: NO_COLLISION.test(name) ? "none" : "solid",
  };
  const others = kit.filter((t) => t.id !== id);
  const list = [...others, type].sort((a, b) => a.id.localeCompare(b.id));
  await writeFile(
    LIBRARY_KIT,
    "[\n" + list.map((t) => "  " + JSON.stringify(t)).join(",\n") + "\n]\n",
  );
  return id;
}

/** One prop per line: short, readable diffs in Git. */
function formatLayout(layout: MapLayout): string {
  const block = (name: string, items: readonly unknown[], last: boolean): string =>
    `  "${name}": [\n${items.map((i) => `    ${JSON.stringify(i)}`).join(",\n")}\n  ]${last ? "" : ","}`;
  return (
    `{\n  "version": 1,\n  "map": ${JSON.stringify(layout.map)},\n` +
    `${block("rocks", layout.rocks, false)}\n${block("crates", layout.crates, false)}\n` +
    `${block("shrubs", layout.shrubs, false)}\n${block("models", layout.models, true)}\n}\n`
  );
}

/**
 * Map editor saving (D-049), dev server only: the editor posts the layout and this writes
 * shared/src/layouts/<map>.json. Vite then reloads the game with the new layout.
 */
function mapEditorSave(): Plugin {
  return {
    name: "oneshot-map-editor-save",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use("/__editor/layout", (req, res) => {
        if (req.method !== "POST") {
          res.statusCode = 405;
          res.end("POST only");
          return;
        }
        let body = "";
        req.on("data", (chunk: Buffer) => {
          body += chunk.toString("utf8");
        });
        req.on("end", () => {
          void (async () => {
            try {
              const layout = await parseLayoutLive(server, JSON.parse(body));
              if (!/^[a-z0-9-]+$/.test(layout.map)) throw new Error("bad map id");
              await writeFile(path.join(LAYOUT_DIR, `${layout.map}.json`), formatLayout(layout));
              res.statusCode = 200;
              res.end("saved");
            } catch (err) {
              res.statusCode = 400;
              res.end(err instanceof Error ? err.message : String(err));
            }
          })();
        });
      });
    },
  };
}

/**
 * Model library for the editor (D-062), dev server only:
 *   GET  /__editor/library              list of models (folder, name, id, has picture)
 *   GET  /__editor/library/<folder>/<f>  a model's .png picture
 *   POST /__editor/library/place        { folder, name, layout }: makes the model a game model
 *        type, then saves the layout that already holds the new piece. Vite then reloads.
 */
function modelLibrary(): Plugin {
  return {
    name: "oneshot-model-library",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use("/__editor/library", (req, res) => {
        void (async () => {
          try {
            const url = decodeURIComponent((req.url ?? "/").split("?")[0] ?? "/");
            if (req.method === "GET" && (url === "/" || url === "")) {
              send(res, 200, JSON.stringify(await listLibrary()), "application/json");
              return;
            }
            if (req.method === "POST" && url === "/place") {
              const body = JSON.parse(await readBody(req)) as {
                folder: string;
                name: string;
                layout: unknown;
              };
              const id = await registerLibraryModel(body.folder, body.name);
              const layout = await parseLayoutLive(server, body.layout);
              if (!/^[a-z0-9-]+$/.test(layout.map)) throw new Error("bad map id");
              await writeFile(path.join(LAYOUT_DIR, `${layout.map}.json`), formatLayout(layout));
              send(res, 200, JSON.stringify({ id }), "application/json");
              return;
            }
            const parts = url.split("/").filter(Boolean);
            if (req.method === "GET" && parts.length === 2) {
              const [folder, file] = parts as [string, string];
              if (!SAFE_NAME.test(folder) || !SAFE_NAME.test(file) || !file.endsWith(".png")) {
                send(res, 400, "bad name");
                return;
              }
              const data = await readFile(path.join(LIBRARY_DIR, folder, file));
              res.statusCode = 200;
              res.setHeader("Content-Type", "image/png");
              res.end(data);
              return;
            }
            send(res, 404, "not found");
          } catch (err) {
            send(res, 400, err instanceof Error ? err.message : String(err));
          }
        })();
      });
    },
  };
}

export default defineConfig({
  plugins: [mapEditorSave(), modelLibrary()],
  server: {
    port: 5173,
    strictPort: true,
    open: true,
  },
  build: {
    target: "es2022",
    sourcemap: true,
  },
});
