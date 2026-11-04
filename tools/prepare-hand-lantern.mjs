// Makes the traveler's hand-held lantern out of the Fantasy Props MegaKit's
// wall lantern (Quaternius, CC0).
//
//   node tools/prepare-hand-lantern.mjs
//
// Lantern_Wall is a lantern hanging on a chain from an iron arm bolted to a
// wall plate, with a looping chain back to the wall. This keeps only the
// lantern itself and the last three chain links above it, drops the plate,
// the arm, the brace and the looping chain, and moves it so the top of the
// chain sits at (0, 0, 0): that's where the hand holds it. The game adds an
// iron carry ring there. It reads the already-prepared copy in
// public/models/props (run tools/prepare-kits.mjs first) and writes
// Lantern_Hand.gltf / .bin next to it, sharing the same shrunk textures.
import fs from "node:fs";
import path from "node:path";

const DIR = path.resolve("public/models/props");
const gltf = JSON.parse(fs.readFileSync(path.join(DIR, "Lantern_Wall.gltf"), "utf8"));
const bin = fs.readFileSync(path.join(DIR, gltf.buffers[0].uri));
const prim = gltf.meshes[0].primitives[0];
const read = (i) => {
  const a = gltf.accessors[i];
  const bv = gltf.bufferViews[a.bufferView];
  const size = { VEC3: 3, VEC2: 2, SCALAR: 1 }[a.type];
  const Type = a.componentType === 5126 ? Float32Array : a.componentType === 5125 ? Uint32Array : Uint16Array;
  return new Type(bin.buffer.slice(bin.byteOffset + bv.byteOffset + (a.byteOffset ?? 0)), 0, a.count * size);
};
const pos = read(prim.attributes.POSITION);
const nor = read(prim.attributes.NORMAL);
const uv = read(prim.attributes.TEXCOORD_0);
const idx = read(prim.indices);
const n = pos.length / 3;

// Split the mesh into its separate pieces (chain links, panes, posts...).
const parent = Array.from({ length: n }, (_, i) => i);
const find = (x) => {
  while (parent[x] !== x) x = parent[x] = parent[parent[x]];
  return x;
};
const join = (a, b) => (parent[find(a)] = find(b));
for (let i = 0; i < idx.length; i += 3) join(idx[i], idx[i + 1]), join(idx[i], idx[i + 2]);
const seen = new Map();
for (let i = 0; i < n; i++) {
  const k = `${Math.round(pos[i * 3] * 1e4)},${Math.round(pos[i * 3 + 1] * 1e4)},${Math.round(pos[i * 3 + 2] * 1e4)}`;
  if (seen.has(k)) join(i, seen.get(k));
  else seen.set(k, i);
}
const box = new Map();
for (let i = 0; i < n; i++) {
  const r = find(i);
  const b = box.get(r) ?? { min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] };
  for (let j = 0; j < 3; j++) (b.min[j] = Math.min(b.min[j], pos[i * 3 + j])), (b.max[j] = Math.max(b.max[j], pos[i * 3 + j]));
  box.set(r, b);
}

// The lantern hangs at about x 0, z 0.81. Its body runs from y 0.08 to 0.64;
// the straight chain above it is made of small links, all within z 0.77-0.84.
const LANTERN_TOP = 0.64;
const CHAIN_TOP = 0.83;
const keep = (b) => {
  const inBody = b.min[2] > 0.6 && b.max[2] < 1.0 && b.max[1] <= LANTERN_TOP;
  const inChain = b.min[2] > 0.77 && b.max[2] < 0.84 && b.min[1] > 0.56 && b.max[1] <= CHAIN_TOP;
  return inBody || inChain;
};

let top = -Infinity;
const remap = new Int32Array(n).fill(-1);
const kept = [];
for (let i = 0; i < n; i++) {
  if (!keep(box.get(find(i)))) continue;
  remap[i] = kept.length;
  kept.push(i);
  top = Math.max(top, pos[i * 3 + 1]);
}
const CX = 0, CZ = 0.8065;
const P = new Float32Array(kept.length * 3), N = new Float32Array(kept.length * 3), T = new Float32Array(kept.length * 2);
const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
kept.forEach((i, k) => {
  P[k * 3] = pos[i * 3] - CX;
  P[k * 3 + 1] = pos[i * 3 + 1] - top;
  P[k * 3 + 2] = pos[i * 3 + 2] - CZ;
  for (let j = 0; j < 3; j++) (N[k * 3 + j] = nor[i * 3 + j]), (min[j] = Math.min(min[j], P[k * 3 + j])), (max[j] = Math.max(max[j], P[k * 3 + j]));
  T[k * 2] = uv[i * 2];
  T[k * 2 + 1] = uv[i * 2 + 1];
});
const I = [];
for (let i = 0; i < idx.length; i += 3) {
  const a = remap[idx[i]], b = remap[idx[i + 1]], c = remap[idx[i + 2]];
  if (a >= 0 && b >= 0 && c >= 0) I.push(a, b, c);
}
const Ia = new Uint16Array(I);

const parts = [P, N, T, Ia].map((a) => Buffer.from(a.buffer, a.byteOffset, a.byteLength));
const pad = (b) => (b.length % 4 ? Buffer.concat([b, Buffer.alloc(4 - (b.length % 4))]) : b);
let offset = 0;
const views = parts.map((b, k) => {
  const v = { buffer: 0, byteOffset: offset, byteLength: b.length, target: k === 3 ? 34963 : 34962 };
  offset += pad(b).length;
  return v;
});
const out = {
  ...gltf,
  nodes: [{ mesh: 0, name: "Lantern_Hand" }],
  meshes: [{ name: "Lantern_Hand", primitives: [{ attributes: { POSITION: 0, NORMAL: 1, TEXCOORD_0: 2 }, indices: 3, material: 0 }] }],
  accessors: [
    { bufferView: 0, componentType: 5126, count: kept.length, type: "VEC3", min, max },
    { bufferView: 1, componentType: 5126, count: kept.length, type: "VEC3" },
    { bufferView: 2, componentType: 5126, count: kept.length, type: "VEC2" },
    { bufferView: 3, componentType: 5123, count: Ia.length, type: "SCALAR" },
  ],
  bufferViews: views,
  buffers: [{ byteLength: offset, uri: "Lantern_Hand.bin" }],
};
fs.writeFileSync(path.join(DIR, "Lantern_Hand.bin"), Buffer.concat(parts.map(pad)));
fs.writeFileSync(path.join(DIR, "Lantern_Hand.gltf"), JSON.stringify(out));
console.log(`Lantern_Hand: ${kept.length} of ${n} vertices, ${Ia.length / 3} triangles, ${(max[1] - min[1]).toFixed(2)} m tall (kit size)`);
