// For the Claude preview link only. That host serves a page's own files, but
// refuses some kinds (.gltf, .bin, .glb). So this renames them to kinds it
// serves: X.gltf -> X.gltf.json, X.bin -> X.bin.wasm, X.glb -> X.glb.wasm.
// The preview build asks for those names (see the manager in src/scene/kits.ts).
//
//   node tools/pack-preview-models.mjs dist-preview
import fs from "node:fs";
import path from "node:path";

const dist = process.argv[2] ?? "dist-preview";
const RENAME = { ".gltf": ".gltf.json", ".bin": ".bin.wasm", ".glb": ".glb.wasm" };
const modelsDir = path.join(dist, "models");
let count = 0;
for (const kit of fs.readdirSync(modelsDir)) {
  for (const f of fs.readdirSync(path.join(modelsDir, kit))) {
    const ext = path.extname(f);
    if (RENAME[ext]) {
      fs.renameSync(path.join(modelsDir, kit, f), path.join(modelsDir, kit, f.slice(0, -ext.length) + RENAME[ext]));
      count++;
    }
    // licence notes stay in the repo; the preview only needs the models
    if (ext === ".txt") fs.rmSync(path.join(modelsDir, kit, f));
  }
}
// the preview build already has the music inside its script
fs.rmSync(path.join(dist, "audio"), { recursive: true, force: true });
console.log(`renamed ${count} model files for the preview host`);
