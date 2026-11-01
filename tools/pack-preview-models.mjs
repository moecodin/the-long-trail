// For the phone preview link only: packs dist-preview/models/** into one script,
// assets/kit-assets.js, as data URLs, and loads it from index.html. The preview
// host can't serve .gltf/.bin files, but it can serve JavaScript.
//
//   node tools/pack-preview-models.mjs dist-preview
import fs from "node:fs";
import path from "node:path";

const dist = process.argv[2] ?? "dist-preview";
const MIME = { ".gltf": "model/gltf+json", ".glb": "model/gltf-binary", ".bin": "application/octet-stream", ".png": "image/png" };
const assets = {};
const modelsDir = path.join(dist, "models");
for (const kit of fs.readdirSync(modelsDir)) {
  for (const f of fs.readdirSync(path.join(modelsDir, kit))) {
    const data = fs.readFileSync(path.join(modelsDir, kit, f)).toString("base64");
    assets[`${kit}/${f}`] = `data:${MIME[path.extname(f)]};base64,${data}`;
  }
}
fs.writeFileSync(path.join(dist, "assets", "kit-assets.js"), `window.__KIT_ASSETS=${JSON.stringify(assets)};\n`);
fs.rmSync(modelsDir, { recursive: true });
// the preview build already has the music inside its script
fs.rmSync(path.join(dist, "audio"), { recursive: true, force: true });
const indexPath = path.join(dist, "index.html");
const html = fs.readFileSync(indexPath, "utf8");
if (!html.includes("kit-assets.js")) {
  fs.writeFileSync(indexPath, html.replace("<head>", '<head>\n    <script src="./assets/kit-assets.js"></script>'));
}
console.log(`packed ${Object.keys(assets).length} model files`);
