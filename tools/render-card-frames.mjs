// Renders the trail card frame and card back from Quaternius' 3D Card Kit -
// Fantasy (CC0) into flat images for the journal's card album:
//   public/cards/frame.png  the card border (see-through in the middle), recolored brown
//   public/cards/back.png   the back of a card still out on the trail
//
//   node tools/render-card-frames.mjs "<3D Card Kit - Fantasy [Standard]>/glTF"
//
// Needs Playwright with Chromium, and Python with Pillow for the recolor and resize.
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";

// Playwright isn't a project dependency (elsewhere: `npm i -D playwright && npx playwright install chromium`)
const { chromium } = createRequire(import.meta.url)("playwright");

const kitDir = process.argv[2];
if (!kitDir) {
  console.error('usage: node tools/render-card-frames.mjs "<card kit>/glTF"');
  process.exit(1);
}
// the kit's back card asks for "0_Card_back.bin" (lower-case b)
const backBin = path.join(kitDir, "0_Card_back.bin");
if (!fs.existsSync(backBin)) fs.copyFileSync(path.join(kitDir, "0_Card_Back.bin"), backBin);

const threeDir = path.resolve("node_modules/three");
const PAGE = `<!doctype html><body style="margin:0">
<script type="importmap">{"imports":{"three":"/three/build/three.module.js","three/addons/":"/three/examples/jsm/"}}</script>
<script type="module">
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
const name = new URLSearchParams(location.search).get("m");
const r = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
r.setSize(750, 1050); r.setClearColor(0, 0); r.outputColorSpace = THREE.SRGBColorSpace;
document.body.appendChild(r.domElement);
const scene = new THREE.Scene();
scene.add(new THREE.AmbientLight(0xffffff, 1.6));
const sun = new THREE.DirectionalLight(0xffffff, 1.6); sun.position.set(0, 0, 5); scene.add(sun);
const cam = new THREE.OrthographicCamera(-1.1475378, 1.1475378, 1.6064445, -1.6064445, 0.01, 100); cam.position.set(0, 0, 10);
new GLTFLoader().load("/kit/" + name + ".gltf", (g) => {
  if (name === "0_Card_Back") g.scene.rotation.y = Math.PI;
  scene.add(g.scene); r.render(scene, cam); window.done = true;
});
</script></body>`;

const server = http.createServer((req, res) => {
  const url = decodeURIComponent(req.url.split("?")[0]);
  if (url === "/") return res.end(PAGE);
  const file = url.startsWith("/three/") ? path.join(threeDir, url.slice(7)) : url.startsWith("/kit/") ? path.join(kitDir, url.slice(5)) : null;
  if (!file || !fs.existsSync(file)) return res.writeHead(404).end();
  const type = { ".js": "text/javascript", ".png": "image/png" }[path.extname(file)] ?? "application/octet-stream";
  res.writeHead(200, { "content-type": type }).end(fs.readFileSync(file));
});
await new Promise((ok) => server.listen(0, ok));
const port = server.address().port;

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "cards-"));
const browser = await chromium.launch({ args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
const page = await browser.newPage({ viewport: { width: 750, height: 1050 } });
for (const m of ["0_Card_Front", "0_Card_Back"]) {
  await page.goto(`http://localhost:${port}/?m=${m}`);
  await page.waitForFunction(() => window.done, null, { timeout: 30000 });
  await page.locator("canvas").screenshot({ path: path.join(tmp, `${m}.png`), omitBackground: true });
}
await browser.close();
server.close();

fs.mkdirSync("public/cards", { recursive: true });
execFileSync("python3", ["-I", "-c", `
import sys
from PIL import Image
tmp = sys.argv[1]
a = Image.open(tmp + "/0_Card_Front.png").convert("RGBA")
px = a.load()
dark, light = (74, 52, 36), (255, 243, 214)  # the journal's brown ink, and cream for the corner marks
for y in range(a.height):
    for x in range(a.width):
        r, g, b, al = px[x, y]
        if al:
            k = max(0, min(1, ((r + g + b) / 765 - 0.2) / 0.8))
            px[x, y] = tuple(int(dark[i] + (light[i] - dark[i]) * k) for i in range(3)) + (al,)
a.resize((375, 525), Image.LANCZOS).save("public/cards/frame.png", optimize=True)
Image.open(tmp + "/0_Card_Back.png").convert("RGBA").resize((375, 525), Image.LANCZOS).save("public/cards/back.png", optimize=True)
`, tmp]);
console.log("wrote public/cards/frame.png and public/cards/back.png");
