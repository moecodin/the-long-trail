// For the phone preview link only: packs dist-preview/models/** into scripts
// (assets/kit-assets-1.js, -2.js, ...) as data URLs, and loads them from
// index.html. Each script stays under the preview host's 16 MB limit. The preview
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
const LIMIT = 12e6;
const chunks = [{}];
let size = 0;
for (const [k, v] of Object.entries(assets)) {
  if (size + v.length > LIMIT && Object.keys(chunks.at(-1)).length) {
    chunks.push({});
    size = 0;
  }
  chunks.at(-1)[k] = v;
  size += v.length;
}
const names = chunks.map((c, i) => {
  const name = `kit-assets-${i + 1}.js`;
  fs.writeFileSync(path.join(dist, "assets", name), `window.__KIT_ASSETS=Object.assign(window.__KIT_ASSETS||{},${JSON.stringify(c)});\n`);
  return name;
});
fs.rmSync(modelsDir, { recursive: true });
// the preview build already has the music inside its script
fs.rmSync(path.join(dist, "audio"), { recursive: true, force: true });
const indexPath = path.join(dist, "index.html");
const html = fs.readFileSync(indexPath, "utf8");
if (!html.includes("kit-assets")) {
  const tags = names.map((n) => `\n    <script src="./assets/${n}"></script>`).join("");
  fs.writeFileSync(indexPath, html.replace("<head>", `<head>${tags}`));
}
console.log(`packed ${Object.keys(assets).length} model files into ${names.length} scripts`);
