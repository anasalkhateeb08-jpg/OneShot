import { writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import type { Plugin } from "vite";
import { parseLayout } from "../shared/src/mapLayout";
import type { MapLayout } from "../shared/src/mapLayout";

const LAYOUT_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "shared",
  "src",
  "layouts",
);

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
              const layout = parseLayout(JSON.parse(body));
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

export default defineConfig({
  plugins: [mapEditorSave()],
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
