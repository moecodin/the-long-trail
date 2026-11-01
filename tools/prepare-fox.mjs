// Turns the fox's FBX download into a small GLB for the game.
//
//   node tools/prepare-fox.mjs ~/Downloads/fox.fbx
//
// The result goes to public/models/private/fox.glb, which git ignores: the fox
// is under Fab's license, so it must never be committed to this public repo.
// Upload that file to Supabase storage (bucket "game-art") for the live game.
//
// What it does: converts FBX -> GLB, drops the unrigged copy of the fox that
// sits off to the side in the FBX, drops the punch and death clips (no combat
// here), merges duplicate data and packs the numbers smaller. ~1.8 MB -> ~0.6 MB.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { dedup, prune, quantize, resample, weld } from "@gltf-transform/functions";

const input = process.argv[2];
if (!input) throw new Error("usage: node tools/prepare-fox.mjs path/to/fox.fbx");
const outDir = "public/models/private";
fs.mkdirSync(outDir, { recursive: true });

const require = createRequire(import.meta.url);
const bin = path.join(path.dirname(require.resolve("fbx2gltf/package.json")), "bin", os.type(), os.type() === "Windows_NT" ? "FBX2glTF.exe" : "FBX2glTF");
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "fox-"));
execFileSync(bin, ["--binary", "--input", input, "--output", path.join(tmp, "fox")], { stdio: "inherit" });

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const doc = await io.read(path.join(tmp, "fox.glb"));
const root = doc.getRoot();
for (const n of root.listNodes()) if (n.getMesh() && !n.getSkin()) n.dispose();
for (const a of root.listAnimations()) if (/punch|death/i.test(a.getName())) a.dispose();
for (const m of root.listMaterials()) {
  m.setMetallicFactor(0);
  m.setRoughnessFactor(0.85);
}
await doc.transform(dedup(), weld(), resample(), prune(), quantize({ quantizeWeight: 8 }));
await io.write(path.join(outDir, "fox.glb"), doc);
fs.rmSync(tmp, { recursive: true, force: true });
console.log(`wrote ${outDir}/fox.glb (${(fs.statSync(path.join(outDir, "fox.glb")).size / 1024).toFixed(0)} KB)`);
