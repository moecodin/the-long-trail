// Turns the camping tent download into a lighter GLB for the game.
//
//   node tools/prepare-tent.mjs ~/Downloads/stylized_low-poly_medieval_camping_tent.glb
//
// The tent is "Stylized Low-Poly Medieval Camping Tent" by PedroDev
// (CC BY 4.0, credited in CREDITS.md), so it can live in this repo.
// What it does: merges duplicate data, thins out the mesh where it can without
// changing the shape (the original is ~60k triangles, a lot for a phone), and
// packs the numbers smaller. Writes public/models/camp/Tent.glb.
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { dedup, flatten, join, prune, quantize, simplify, weld, getBounds } from "@gltf-transform/functions";
import { MeshoptSimplifier } from "meshoptimizer";

const input = process.argv[2];
if (!input) throw new Error("usage: node tools/prepare-tent.mjs path/to/tent.glb");
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const doc = await io.read(input);
const root = doc.getRoot();
const tris = () => root.listMeshes().reduce((n, m) => n + m.listPrimitives().reduce((k, p) => k + (p.getIndices()?.getCount() ?? 0) / 3, 0), 0);
console.log("triangles before:", tris());
for (const m of root.listMaterials()) {
  m.setMetallicFactor(0);
  m.setRoughnessFactor(0.9);
}
await MeshoptSimplifier.ready;
await doc.transform(
  dedup(),
  flatten(),
  join(),
  weld(),
  simplify({ simplifier: MeshoptSimplifier, ratio: Number(process.argv[3] ?? 0.35), error: 0.002 }),
  prune(),
  quantize(),
);
console.log("triangles after:", tris());
const b = getBounds(root.listScenes()[0]);
console.log("bounds min", b.min.map((v) => v.toFixed(2)), "max", b.max.map((v) => v.toFixed(2)));
for (const m of root.listMaterials()) console.log("material", m.getName(), m.getBaseColorFactor().map((v) => v.toFixed(2)));
await io.write("public/models/camp/Tent.glb", doc);
