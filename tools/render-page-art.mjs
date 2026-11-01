// Paints the three storybook pages of the intro from the game's own 3D models
// (sandbox/page-art) and saves them as small images in public/pages/.
//
//   node tools/render-page-art.mjs
//
// Needs Playwright with Chromium (preinstalled in Claude's cloud sandbox;
// elsewhere run `npm i -D playwright && npx playwright install chromium`).
import { createServer } from "vite";
import { createRequire } from "node:module";
import { execSync } from "node:child_process";
import { mkdirSync } from "node:fs";

const require = createRequire(import.meta.url);
let playwright;
try { playwright = require("playwright"); }
catch { playwright = createRequire(execSync("npm root -g").toString().trim() + "/")("playwright"); }

const server = await createServer({ server: { port: 5199, strictPort: true }, logLevel: "error" });
await server.listen();
mkdirSync("public/pages", { recursive: true });
// Software WebGL so this works on machines without a GPU.
const browser = await playwright.chromium.launch({ args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
const page = await browser.newPage({ viewport: { width: 1200, height: 750 } });
page.on("console", (m) => m.type() === "error" && console.error(m.text()));
for (const n of [1, 2, 3]) {
  await page.goto(`http://localhost:5199/sandbox/page-art/index.html?page=${n}`);
  await page.waitForFunction(() => document.title !== "Page art test", null, { timeout: 180000 });
  if ((await page.title()) !== "done") throw new Error(`page ${n}: ${await page.title()}`);
  await page.screenshot({ path: `public/pages/page-${n}.jpg`, type: "jpeg", quality: 84 });
  console.log(`public/pages/page-${n}.jpg`);
}
await browser.close();
await server.close();
