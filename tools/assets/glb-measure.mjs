// Reads a .glb file's JSON and measures its real size (D-057, D-062). Shared by the kit
// importer and the editor's model library (client/vite.config.ts).

/** Plants and similar small decoration get no collision; everything else is solid. */
export const NO_COLLISION = /grass|bush|weed|flower|tumbleweed|succulent/i;

/** Reads the JSON chunk of a .glb file. */
export function glbJson(buf) {
  if (buf.readUInt32LE(0) !== 0x46546c67) throw new Error("not a .glb file");
  const len = buf.readUInt32LE(12);
  if (buf.readUInt32LE(16) !== 0x4e4f534a) throw new Error("first .glb chunk is not JSON");
  return JSON.parse(buf.subarray(20, 20 + len).toString("utf8"));
}

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

/** World-space size of everything drawn in the file (meters, rounded to millimeters). */
export function measure(json) {
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

/** Triangles the file draws (each mesh counted once per node that uses it). */
export function triangles(json) {
  let total = 0;
  for (const node of json.nodes ?? []) {
    if (node.mesh === undefined) continue;
    for (const prim of json.meshes[node.mesh].primitives) {
      if ((prim.mode ?? 4) !== 4) continue;
      const acc = json.accessors[prim.indices ?? prim.attributes.POSITION];
      total += Math.floor((acc?.count ?? 0) / 3);
    }
  }
  return total;
}
