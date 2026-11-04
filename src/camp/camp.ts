// Camp: your home base, a clearing at the edge of Lowmeadow where the trail
// begins. This is Milestone 1: walk your traveler around it, sit by the fire
// and look at things. Later milestones fill it with the things you earn.
//
// Like the intro, the camp first appears as simple shapes, then the
// Quaternius kit models are swapped in once they have loaded (see kits.ts).
//
// Directions: the camera looks north (toward -z). The fire is at the center
// (0, 0, 0) and the trail leaves the clearing to the north.

import * as THREE from "three";
import { makePerson, type PersonLook } from "../scene/people";
import { BASE, instanced, loader, model, place, seeded } from "../scene/kits";
import { applyGroundPaint, fillPatches, groundLit, paintGround, planPatches, type Hug } from "../scene/meadow";
import { carryTools, dressTraveler } from "./dressTraveler";
import type { Save } from "../save";
import { glowTexture, type Area, type Blocker, type Spot } from "./area";

export type { Blocker, Spot } from "./area";

export interface CampWorld extends Area {
  /** The bench seat: where you sit and which way you face. */
  seat: { x: number; z: number; y: number; facing: number };
}

/** What you notice when you look at things at camp. Each look shows the next line. */
const NOTES: Record<string, string[]> = {
  fire: [
    "Sparks drift up toward the first stars.",
    "Della's kindling, dry as a bone. She thinks of everything.",
  ],
  supplies: [
    "Apples, a coil of rope and a barrel of water. Della packed more than you'll need.",
    "There's a note tucked in the apple crate: \"Eat the bruised ones first. - D.\"",
  ],
  "keepsake:candle": [
    "Della's little candle lantern, burning low on the barrel. It smells faintly of beeswax.",
    "\"For the dark bits,\" she said. You keep it lit anyway.",
  ],
  "keepsake:flower": [
    "The pressed meadowflower, tucked in a frame on a little stand by your tent. Still a bit yellow.",
    "It came from the meadow behind Della's cottage. Lowmeadow, in one flower.",
  ],
  "keepsake:spoon": [
    "Della's wooden spoon, standing in the pot. Worn smooth from a hundred soups.",
    "There's a nick in the handle where she used to bang it on the pot to call you in.",
  ],
  cart: [
    "An old hand cart with a wobbly wheel. Someone left it here for whoever needs it.",
    "Maybe one day it'll carry things back from the trail.",
  ],
};

/**
 * What the traveler says to the fox about camp things, once he's with you.
 * They take turns with the notes above. {fox} is his name.
 */
const FOX_LINES: Record<string, string[]> = {
  "bench:sit": ["\"Don't sit so close, {fox}. You'll singe your whiskers.\"", "\"You and me and a fire. Not a bad start.\""],
  tent: ["\"It kept the storm out. It'll keep you out too, {fox}, if you snore.\"", "\"There's room for two. Barely.\""],
  supplies: ["\"No, {fox}, those are for people. ...Fine. One.\"", "\"Della packed for one traveler. She didn't plan on you.\""],
  "keepsake:candle": ["\"Della would like you, {fox}. She likes anyone who turns up muddy.\""],
  "keepsake:flower": ["\"That's Lowmeadow. Where I'm from. Where are you from, I wonder?\""],
  "keepsake:spoon": ["\"Della used to bang this on the pot to call me in. Want me to try it on you, {fox}?\""],
  cart: ["\"You'd fit in there, {fox}. Don't get any ideas.\""],
};

/** Camp's notes, with the traveler's lines to the fox woven in once you've met him. */
function campNotes(fox: string | null): Record<string, string[]> {
  const notes: Record<string, string[]> = { ...NOTES, "bench:sit": ["You sit by the fire for a while. It's warm."] };
  if (!fox) return notes;
  for (const [id, lines] of Object.entries(FOX_LINES)) {
    const base = notes[id] ?? [];
    const said = lines.map((l) => l.replaceAll("{fox}", fox));
    // look, talk, look, talk...
    const mixed: string[] = [];
    for (let i = 0; i < Math.max(base.length, said.length); i++) {
      if (base[i]) mixed.push(base[i]);
      if (said[i]) mixed.push(said[i]);
    }
    notes[id] = mixed;
  }
  return notes;
}

const flat = (color: string, extra: Partial<THREE.MeshStandardMaterialParameters> = {}) =>
  new THREE.MeshStandardMaterial({ color, flatShading: true, roughness: 0.95, ...extra });

/** The words carved into the trail sign. */
function signTexture(): THREE.Texture {
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = 64;
  const g = c.getContext("2d")!;
  g.fillStyle = "#8a5e36";
  g.fillRect(0, 0, 256, 64);
  // wood grain
  g.strokeStyle = "#6e4628";
  g.lineWidth = 2;
  for (let y = 8; y < 64; y += 9) {
    g.beginPath();
    g.moveTo(0, y);
    for (let x = 0; x <= 256; x += 32) g.lineTo(x, y + Math.sin(x * 0.05 + y) * 2);
    g.stroke();
  }
  g.fillStyle = "#2e1c10";
  g.font = "bold 30px Georgia, serif";
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillText("THE SUMMIT", 118, 34);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Where the tent stands at camp, and which way its opening faces (toward the fire and the camera). */
const TENT = { x: -3.7, z: -2.3 };
const TENT_FACING = 0.75;
/** How wide the tent model is drawn, and how it's turned so its door faces out. */
const TENT_WIDTH = 3.0;
const TENT_TURN = Math.PI;
/** How far the tent reaches from its middle toward the door (the model is about 3.4 m long). */
const TENT_HALF = 1.7;
/** Just outside the tent's flaps, facing out: where you come back out to camp. */
export const FROM_TENT = (() => {
  const d = TENT_HALF + 0.7;
  return { x: TENT.x + Math.sin(TENT_FACING) * d, z: TENT.z + Math.cos(TENT_FACING) * d, facing: TENT_FACING };
})();

/** What camp shows of your progress: your keepsake, and the tools you carry. */
export type CampSave = Pick<Save, "keepsake" | "tools" | "fox" | "loot">;

export function createCamp(renderer: THREE.WebGLRenderer, look: PersonLook, save?: CampSave): CampWorld {
  const scene = new THREE.Scene();
  const dusk = new THREE.Color("#7d6a86");
  scene.background = dusk;
  scene.fog = new THREE.Fog(dusk, 22, 48);
  const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 200);

  // ---------- light: a warm dusk, and the fire ----------
  scene.add(new THREE.HemisphereLight("#f3c6a0", "#3c4a34", 1.3));
  const sun = new THREE.DirectionalLight("#ffb27a", 2.2);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  const sc = sun.shadow.camera;
  sc.left = sc.bottom = -13;
  sc.right = sc.top = 13;
  sc.near = 1;
  sc.far = 60;
  sun.shadow.bias = -0.0008;
  sun.shadow.normalBias = 0.03;
  scene.add(sun, sun.target);
  /** The low sun sits off to the west, behind the trees. */
  const SUN_OFFSET = new THREE.Vector3(-18, 16, -8);

  const fireLight = new THREE.PointLight("#ff9a4a", 14, 11, 1.6);
  fireLight.position.set(0, 0.8, 0);
  scene.add(fireLight);

  // ---------- the ground: a flat clearing in a ring of low hills ----------
  const RADIUS = 9.3;
  const groundGeo = new THREE.PlaneGeometry(120, 120, 90, 90);
  groundGeo.rotateX(-Math.PI / 2);
  const gp = groundGeo.attributes.position as THREE.BufferAttribute;
  const colors: number[] = [];
  const grass = new THREE.Color("#76944a");
  const grassDark = new THREE.Color("#4f6b38");
  const dirt = new THREE.Color("#8a6a48");
  const c = new THREE.Color();
  for (let i = 0; i < gp.count; i++) {
    const x = gp.getX(i), z = gp.getZ(i);
    const r = Math.hypot(x, z);
    const bumps = Math.sin(x * 0.35) * Math.cos(z * 0.3) * 0.5 + Math.sin(x * 0.11 + z * 0.17) * 1.2;
    const rise = Math.max(0, r - 11);
    gp.setY(i, rise > 0 ? rise * 0.22 + bumps * Math.min(1, rise / 6) : 0);
    // grass, darker toward the woods, with a worn dirt circle at the fire and a path north
    c.copy(grass).lerp(grassDark, THREE.MathUtils.clamp((r - 6) / 10, 0, 1));
    const wear = Math.max(
      THREE.MathUtils.clamp(1 - (r - 1.6) / 1.2, 0, 1),
      z < 0 ? THREE.MathUtils.clamp(1 - (Math.abs(x) - 0.5) / 0.6, 0, 1) * THREE.MathUtils.clamp(1 + (z + 14) / 4, 0, 1) * 0.8 : 0,
    );
    c.lerp(dirt, wear);
    colors.push(c.r, c.g, c.b);
  }
  groundGeo.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  groundGeo.computeVertexNormals();
  const ground = new THREE.Mesh(groundGeo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 }));
  ground.receiveShadow = true;
  scene.add(ground);

  const blockers: Blocker[] = [];
  const spots: Spot[] = [];
  const block = (x: number, z: number, r: number) => blockers.push({ x, z, r });

  // ---------- the campfire ----------
  const fire = new THREE.Group();
  scene.add(fire);
  block(0, 0, 0.85);
  const stoneMat = flat("#8d8a84");
  const ring = new THREE.Group();
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    const s = new THREE.Mesh(new THREE.DodecahedronGeometry(0.17, 0), stoneMat);
    s.position.set(Math.cos(a) * 0.62, 0.08, Math.sin(a) * 0.62);
    s.scale.set(1.1, 0.7, 0.9);
    s.rotation.set(i, i * 2, 0);
    s.castShadow = s.receiveShadow = true;
    ring.add(s);
  }
  fire.add(ring);
  const logMat = flat("#5a3a22");
  const logs = new THREE.Group();
  for (let i = 0; i < 4; i++) {
    const log = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.07, 0.85, 6), logMat);
    const a = (i / 4) * Math.PI * 2 + 0.4;
    log.position.set(Math.cos(a) * 0.17, 0.26, Math.sin(a) * 0.17);
    log.rotation.set(Math.sin(a) * 0.55, 0, -Math.cos(a) * 0.55, "YXZ");
    log.lookAt(0, 0.62, 0);
    log.rotateX(Math.PI / 2);
    log.castShadow = true;
    logs.add(log);
  }
  fire.add(logs);
  const flameMat = (color: string, opacity: number) =>
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false });
  const flames = new THREE.Group();
  [
    [0, 0.62, 0.17, "#ff7a2a", 0.9],
    [0.07, 0.45, 0.12, "#ffb347", 0.9],
    [-0.08, 0.4, 0.11, "#ffd27a", 0.95],
    [0.01, 0.3, 0.08, "#fff1c0", 1],
  ].forEach(([x, h, r, color, o], i) => {
    const f = new THREE.Mesh(new THREE.ConeGeometry(r as number, h as number, 7), flameMat(color as string, o as number));
    f.geometry.translate(0, (h as number) / 2, 0);
    f.position.set(x as number, 0.12, i * 0.02 - 0.03);
    flames.add(f);
  });
  fire.add(flames);
  const glowTex = glowTexture();
  const fireGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: "#ffb070", transparent: true, opacity: 0.65, blending: THREE.AdditiveBlending, depthWrite: false }));
  fireGlow.position.set(0, 0.45, 0);
  fireGlow.scale.setScalar(2.6);
  fire.add(fireGlow);

  // sparks drifting up from the fire
  const SPARKS = 28;
  const sparkPos = new Float32Array(SPARKS * 3);
  const sparkLife = new Float32Array(SPARKS);
  const resetSpark = (i: number) => {
    sparkPos[i * 3] = (Math.random() - 0.5) * 0.3;
    sparkPos[i * 3 + 1] = 0.3 + Math.random() * 0.2;
    sparkPos[i * 3 + 2] = (Math.random() - 0.5) * 0.3;
    sparkLife[i] = Math.random();
  };
  for (let i = 0; i < SPARKS; i++) {
    resetSpark(i);
    sparkPos[i * 3 + 1] += Math.random() * 2;
  }
  const sparkGeo = new THREE.BufferGeometry();
  sparkGeo.setAttribute("position", new THREE.BufferAttribute(sparkPos, 3));
  const sparks = new THREE.Points(
    sparkGeo,
    new THREE.PointsMaterial({ color: "#ffc070", size: 0.06, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }),
  );
  fire.add(sparks);
  spots.push({ id: "fire", label: "Rest", x: 0, z: 0, range: 1.9, standX: 0, standZ: 1.5, tapTargets: [fire] });

  // ---------- simple stand-in shapes (the kit models replace these) ----------
  const stand = new THREE.Group();
  scene.add(stand);
  const box = (w: number, h: number, d: number, color: string, x: number, z: number, ry = 0) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), flat(color));
    m.position.set(x, h / 2, z);
    m.rotation.y = ry;
    m.castShadow = m.receiveShadow = true;
    stand.add(m);
    return m;
  };

  // ---------- the tent (hand-built: the kits don't have one) ----------
  const tentFacing = TENT_FACING;
  const tent = new THREE.Group();
  tent.position.set(TENT.x, 0, TENT.z);
  tent.rotation.y = tentFacing;
  scene.add(tent);
  // two round blockers along the tent's length, so you walk around its long sides
  for (const t of [-0.8, 0.8]) block(TENT.x + Math.sin(TENT_FACING) * t, TENT.z + Math.cos(TENT_FACING) * t, 1.2);
  const canvas = new THREE.MeshStandardMaterial({ color: "#e6d4ac", roughness: 0.95, side: THREE.DoubleSide });
  const pole = flat("#6b4a2c");
  const TW = 2.1, TH = 1.55, TD = 2.3;
  const slope = Math.hypot(TW / 2, TH);
  const tilt = Math.atan2(TW / 2, TH);
  for (const side of [-1, 1]) {
    const panel = new THREE.Mesh(new THREE.BoxGeometry(0.03, slope, TD), canvas);
    panel.position.set((side * TW) / 4, TH / 2, 0);
    panel.rotation.z = side * tilt;
    panel.castShadow = panel.receiveShadow = true;
    tent.add(panel);
  }
  const tri = new THREE.Shape([new THREE.Vector2(-TW / 2, 0), new THREE.Vector2(TW / 2, 0), new THREE.Vector2(0, TH)]);
  const back = new THREE.Mesh(new THREE.ShapeGeometry(tri), canvas);
  back.position.z = -TD / 2;
  back.castShadow = true;
  tent.add(back);
  // the front flaps are tied open
  // the door flaps are rolled up and tied along the front edges
  for (const side of [-1, 1]) {
    const roll = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, slope * 0.92, 8), canvas);
    roll.position.set((side * TW) / 4, TH / 2 - 0.03, TD / 2 + 0.04);
    roll.rotation.z = side * tilt;
    roll.castShadow = true;
    tent.add(roll);
  }
  for (const z of [-TD / 2 - 0.02, TD / 2 + 0.02]) {
    const p = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, TH + 0.15, 6), pole);
    p.position.set(0, (TH + 0.15) / 2, z);
    p.castShadow = true;
    tent.add(p);
  }
  const ridge = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, TD + 0.2, 6), pole);
  ridge.rotation.x = Math.PI / 2;
  ridge.position.y = TH + 0.02;
  tent.add(ridge);
  // guy ropes to little pegs
  const ropeMat = new THREE.LineBasicMaterial({ color: "#d8c8a0" });
  for (const z of [-TD / 2 - 0.02, TD / 2 + 0.02]) {
    const peg = new THREE.Vector3(0, 0, z + Math.sign(z) * 0.9);
    tent.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, TH + 0.1, z), peg]), ropeMat));
    const pg = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.01, 0.15, 4), pole);
    pg.position.copy(peg).setY(0.05);
    tent.add(pg);
  }
  // a bedroll inside, peeking out
  const bedroll = new THREE.Mesh(new THREE.BoxGeometry(0.75, 0.12, 1.8), flat("#9a4a3a"));
  bedroll.position.set(0, 0.06, -0.1);
  bedroll.receiveShadow = true;
  tent.add(bedroll);
  const pillow = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.12, 0.3), flat("#e8dcc0"));
  pillow.position.set(0, 0.12, -0.85);
  tent.add(pillow);
  const tentFront = new THREE.Vector3(0, 0, TENT_HALF + 0.7).applyAxisAngle(new THREE.Vector3(0, 1, 0), tentFacing);
  // the tent: walk in through the open flaps (see tent.ts)
  spots.push({ id: "exit:tent", label: "Go in", x: TENT.x, z: TENT.z, range: 2.9, standX: TENT.x + tentFront.x, standZ: TENT.z + tentFront.z, tapTargets: [tent] });

  // ---------- the bench by the fire ----------
  const BENCH = { x: 2.15, z: 0.25 };
  const bench = box(0.5, 0.42, 2.0, "#7a5532", BENCH.x, BENCH.z);
  block(BENCH.x, BENCH.z - 0.65, 0.42);
  block(BENCH.x, BENCH.z + 0.65, 0.42);
  const seat = { x: BENCH.x, z: BENCH.z, y: 0, facing: -Math.PI / 2 };
  spots.push({ id: "bench", label: "Sit", x: BENCH.x, z: BENCH.z, range: 1.3, standX: BENCH.x - 0.8, standZ: BENCH.z, tapTargets: [bench] });

  // ---------- supplies by the tent ----------
  const SUPPLY = { x: -5.4, z: -0.4 };
  const barrel = box(0.6, 0.85, 0.6, "#7a5532", SUPPLY.x, SUPPLY.z);
  const crate = box(0.7, 0.7, 0.7, "#9a7448", SUPPLY.x + 0.2, SUPPLY.z + 0.9, 0.3);
  block(SUPPLY.x, SUPPLY.z, 0.45);
  block(SUPPLY.x + 0.2, SUPPLY.z + 0.9, 0.5);
  spots.push({ id: "supplies", label: "Look", x: SUPPLY.x + 0.1, z: SUPPLY.z + 0.45, range: 1.8, standX: SUPPLY.x + 1.3, standZ: SUPPLY.z + 0.7, tapTargets: [barrel, crate] });

  // ---------- the trail sign and lantern posts at the north edge ----------
  const signWood = flat("#6b4a2c");
  const SIGN = { x: 1.5, z: -6.6 };
  const sign = new THREE.Group();
  sign.position.set(SIGN.x, 0, SIGN.z);
  const post = new THREE.Mesh(new THREE.BoxGeometry(0.14, 1.9, 0.14), signWood);
  post.position.y = 0.95;
  post.castShadow = true;
  sign.add(post);
  const boardMat = new THREE.MeshStandardMaterial({ map: signTexture(), roughness: 0.9 });
  const board = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.28, 0.05), [signWood, signWood, signWood, signWood, boardMat, boardMat]);
  board.position.set(-0.32, 1.55, 0.06);
  board.rotation.set(0, 0.25, 0.08);
  board.castShadow = true;
  sign.add(board);
  scene.add(sign);
  block(SIGN.x, SIGN.z, 0.3);
  // the trail starts here: the sign is how you set out on the next leg
  spots.push({ id: "exit:leg1", label: "Set out", x: SIGN.x, z: SIGN.z, range: 1.6, standX: SIGN.x - 0.3, standZ: SIGN.z + 1.0, tapTargets: [sign] });

  const lanternGlows: THREE.Sprite[] = [];
  const lanternPosts: THREE.Group[] = [];
  for (const side of [-1, 1]) {
    const lp = new THREE.Group();
    lp.position.set(side * 1.25, 0, -8.6);
    const p = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 2.2, 6), signWood);
    p.position.y = 1.1;
    p.castShadow = true;
    lp.add(p);
    const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.28, 0.2), new THREE.MeshStandardMaterial({ color: "#ffd890", emissive: "#ffb050", emissiveIntensity: 1.5 }));
    lamp.position.set(0, 2.3, 0);
    lamp.name = "standin-lamp";
    lp.add(lamp);
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: "#ffcf80", transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false }));
    glow.position.set(0, 2.3, 0);
    glow.scale.setScalar(1.4);
    lp.add(glow);
    lanternGlows.push(glow);
    lanternPosts.push(lp);
    scene.add(lp);
    block(side * 1.25, -8.6, 0.25);
  }

  // ---------- the old cart on the east side ----------
  const CART = { x: 5.6, z: -3.4, ry: -0.5 };
  const cartBox = box(1.8, 1.1, 3.4, "#7a5532", CART.x, CART.z, CART.ry);
  const along = new THREE.Vector2(Math.sin(CART.ry), Math.cos(CART.ry));
  for (const t of [-1.1, 0, 1.1]) block(CART.x + along.x * t, CART.z + along.y * t, 0.95);
  spots.push({ id: "cart", label: "Look", x: CART.x, z: CART.z, range: 2.6, standX: CART.x - 2.0, standZ: CART.z + 0.6, tapTargets: [cartBox] });

  // ---------- the traveler ----------
  const traveler = makePerson(look);
  traveler.root.position.set(0.4, 0, 2.6);
  traveler.root.rotation.y = Math.PI;
  scene.add(traveler.root);
  const frameHooks: ((dt: number) => void)[] = [];
  const tools = carryTools(traveler);
  tools.set(save?.tools ?? []);
  frameHooks.push((dt) => tools.update(dt));

  // ---------- your keepsake from Della's table ----------
  const keepsake = new THREE.Group();
  scene.add(keepsake);
  let keepsakeLight: THREE.PointLight | null = null;
  function placeKeepsake() {
    keepsake.clear();
    keepsakeLight = null;
    const i = spots.findIndex((s) => s.id.startsWith("keepsake:"));
    if (i >= 0) spots.splice(i, 1);
    const k = save?.keepsake;
    if (!k) return;
    let at = { x: 0, z: 0, y: 0 };
    if (k === "candle") {
      // a small glowing lantern on the supply barrel
      at = { x: SUPPLY.x, z: SUPPLY.z, y: 0.86 };
      const frame = flat("#3b3631");
      const glass = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.16, 0.12), new THREE.MeshStandardMaterial({ color: "#ffe2a0", emissive: "#ffb450", emissiveIntensity: 1.6 }));
      glass.position.y = 0.1;
      const cap = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.07, 4), frame);
      cap.position.y = 0.21;
      cap.rotation.y = Math.PI / 4;
      const base = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.03, 0.15), frame);
      base.position.y = 0.015;
      keepsakeLight = new THREE.PointLight("#ffb860", 2.2, 4, 1.8);
      keepsakeLight.position.y = 0.12;
      keepsake.add(glass, cap, base, keepsakeLight);
    } else if (k === "flower") {
      // a pressed flower in a little frame, on a stand by the tent
      at = { x: TENT.x + 1.9, z: TENT.z - 0.6, y: 0 };
      const wood = flat("#7a5532");
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.55, 0.05), wood);
      leg.position.y = 0.27;
      const board = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.42, 0.04), wood);
      board.position.y = 0.72;
      const paper = new THREE.Mesh(new THREE.PlaneGeometry(0.26, 0.34), flat("#efe4c8"));
      paper.position.set(0, 0.72, 0.025);
      const stem = new THREE.Mesh(new THREE.PlaneGeometry(0.012, 0.18), flat("#5c8a3a"));
      stem.position.set(0, 0.66, 0.03);
      const bloom = new THREE.Mesh(new THREE.CircleGeometry(0.05, 7), flat("#e8c03a"));
      bloom.position.set(0, 0.77, 0.03);
      const heart = new THREE.Mesh(new THREE.CircleGeometry(0.018, 6), flat("#a8642a"));
      heart.position.set(0, 0.77, 0.032);
      keepsake.add(leg, board, paper, stem, bloom, heart);
      keepsake.rotation.y = 0.6;
    } else {
      // a wooden spoon standing in the cooking pot
      at = { x: -0.95, z: 0.75, y: 0.2 };
      const wood = flat("#b0824e");
      const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.02, 0.5, 6), wood);
      handle.position.y = 0.25;
      const bowl = new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 6), wood);
      bowl.scale.set(1, 0.4, 1.3);
      bowl.position.y = 0.02;
      keepsake.add(handle, bowl);
      keepsake.rotation.z = 0.3;
    }
    keepsake.position.set(at.x, at.y, at.z);
    keepsake.traverse((o) => (o.castShadow = o instanceof THREE.Mesh));
    const off = k === "spoon" ? { x: -0.6, z: 1.0 } : k === "candle" ? { x: 1.2, z: 0.2 } : { x: 0.5, z: 1.0 };
    spots.push({ id: `keepsake:${k}`, label: "Look", x: at.x, z: at.z, range: 1.4, standX: at.x + off.x, standZ: at.z + off.z, tapTargets: [keepsake] });
  }
  placeKeepsake();

  // ---------- lanterns earned by logging (every 4 lantern sparks, see journal/loot.ts) ----------
  /** Where each new lantern goes, around the rim of the clearing: angle (0 is north, toward the trail). */
  const LANTERN_SPOTS = [2.2, -2.2, 1.55, -1.85, 2.7, -2.7, 0.62, -0.62, 3.14, -1.3, 1.95, -2.45];
  const LANTERN_R = 7.7;
  const earnedLanterns = new THREE.Group();
  scene.add(earnedLanterns);
  const earnedGlows: THREE.Sprite[] = [];
  const lanternBlockers: Blocker[] = [];
  let kitLantern: THREE.Object3D | null = null;
  function placeLanterns() {
    earnedLanterns.clear();
    earnedGlows.length = 0;
    for (const b of lanternBlockers) blockers.splice(blockers.indexOf(b), 1);
    lanternBlockers.length = 0;
    const count = Math.min(LANTERN_SPOTS.length, (save?.loot ?? []).filter((l) => l.startsWith("lantern:")).length);
    for (let i = 0; i < count; i++) {
      const a = LANTERN_SPOTS[i];
      const x = Math.sin(a) * LANTERN_R, z = -Math.cos(a) * LANTERN_R;
      const lp = new THREE.Group();
      lp.position.set(x, 0, z);
      // the lantern hangs off the post's inner side, toward the fire
      lp.rotation.y = Math.PI / 2 - a;
      const p = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 2.2, 6), signWood);
      p.position.y = 1.1;
      p.castShadow = true;
      lp.add(p);
      if (kitLantern) {
        lp.add(place(kitLantern.clone(), 0, 1.25, 0, -Math.PI / 2, 0.75));
      } else {
        const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.28, 0.2), new THREE.MeshStandardMaterial({ color: "#ffd890", emissive: "#ffb050", emissiveIntensity: 1.5 }));
        lamp.position.set(-0.85, 1.55, 0);
        lp.add(lamp);
      }
      const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: "#ffcf80", transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false }));
      glow.position.set(-0.85, 1.55, 0);
      glow.scale.setScalar(1.4);
      lp.add(glow);
      earnedGlows.push(glow);
      earnedLanterns.add(lp);
      const b = { x, z, r: 0.25 };
      blockers.push(b);
      lanternBlockers.push(b);
    }
  }
  placeLanterns();

  // a few trees as cones so the clearing has edges before the kits load
  const coneTrees = new THREE.Group();
  const leaf = flat("#3e5e34");
  for (let i = 0; i < 26; i++) {
    const a = (i / 26) * Math.PI * 2;
    if (Math.abs(Math.atan2(Math.sin(a), -Math.cos(a))) < 0.3) continue;
    const r = 12 + (i % 3) * 2.5;
    const t = new THREE.Mesh(new THREE.ConeGeometry(1.6, 5, 6), leaf);
    t.position.set(Math.sin(a) * r, 2.5, -Math.cos(a) * r);
    coneTrees.add(t);
  }
  scene.add(coneTrees);

  // ---------- dress with the kit models ----------
  async function dress() {
    const people = dressTraveler(traveler, frameHooks);

    const [kitBench, kitBarrel, kitCrate, apples, bag, bucket, pot, rope, lantern, wagon, fence] = await Promise.all([
      model("props", "Bench"),
      model("props", "Barrel"),
      model("props", "Crate_Wooden"),
      model("props", "FarmCrate_Apple"),
      model("props", "Bag"),
      model("props", "Bucket_Wooden_1"),
      model("props", "Pot_1"),
      model("props", "Rope_1"),
      model("props", "Lantern_Wall"),
      model("village", "Prop_Wagon"),
      model("village", "Prop_WoodenFence_Single"),
    ]);
    const kit = new THREE.Group();
    kitLantern = lantern;
    placeLanterns();

    // the campfire: "LowPoly bonfire" by LEX_GFX (CC BY 4.0, see CREDITS.md).
    // Our own light, glow and sparks stay on top of it.
    try {
      const bonfire = await model("camp", "Bonfire");
      const s = 0.21;
      kit.add(place(bonfire, 0, 0.755 * s, 0, 0.3, s));
      ring.visible = logs.visible = false;
      spots.find((sp) => sp.id === "fire")!.tapTargets.push(bonfire);
    } catch (err) {
      console.warn("Bonfire model did not load; keeping the hand-built fire.", err);
    }

    // the tent: "Stylized Low-Poly Medieval Camping Tent" by PedroDev (CC BY 4.0,
    // see CREDITS.md), thinned for phones by tools/prepare-tent.mjs. It's
    // centered on the hand-built tent's spot and scaled to the same footprint.
    try {
      const g = await loader.loadAsync(`${BASE}camp/Tent.glb`);
      const t = g.scene;
      t.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.isMesh) m.castShadow = m.receiveShadow = true;
      });
      const box = new THREE.Box3().setFromObject(t);
      const size = box.getSize(new THREE.Vector3());
      const mid = box.getCenter(new THREE.Vector3());
      const holder = new THREE.Group();
      // The loose box above keeps the size the tent was tuned at, but its floor
      // sits well below the real model, which left the tent floating. Stand it
      // on the bottom of the door flaps instead (measured on the vertices), so
      // the cloth meets the ground and the pole ends sink in a little like stakes.
      let floor = Infinity;
      t.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.isMesh && m.name.startsWith("Entrance")) floor = Math.min(floor, new THREE.Box3().setFromObject(m, true).min.y);
      });
      if (!isFinite(floor)) floor = new THREE.Box3().setFromObject(t, true).min.y;
      t.position.set(-mid.x, -floor, -mid.z);
      holder.add(t);
      const s = TENT_WIDTH / size.x;
      holder.scale.setScalar(s);
      holder.rotation.y = TENT_TURN;
      tent.add(holder);
      tent.children.filter((c) => c !== holder).forEach((c) => (c.visible = false));
      spots.find((sp) => sp.id === "exit:tent")!.tapTargets.push(t);
    } catch (err) {
      console.warn("Tent model did not load; keeping the hand-built tent.", err);
    }

    // the bench: the kit's is long, so it's shortened to fit two people
    kit.add(place(kitBench, BENCH.x, 0, BENCH.z, Math.PI / 2, [0.75, 0.85, 0.95]));
    // The seat top is 0.45 m up, but the KayKit sit pose sinks the body 0.42 m,
    // which left the traveler sunk into the plank. Lift the seated position so
    // the bottom of the body rests on the seat.
    seat.y = 0.6;
    bench.visible = false;
    spots.find((s) => s.id === "bench")!.tapTargets.push(kitBench);

    // supplies
    kit.add(place(kitBarrel, SUPPLY.x, 0, SUPPLY.z, 0.4, 0.95));
    kit.add(place(kitCrate, SUPPLY.x + 0.2, 0, SUPPLY.z + 0.9, 0.3, 0.6));
    kit.add(place(apples, SUPPLY.x + 0.2, 0.68, SUPPLY.z + 0.9, 0.5, 0.9));
    kit.add(place(rope, SUPPLY.x + 0.75, 0, SUPPLY.z - 0.3, 1.2));
    kit.add(place(bag, TENT.x + 2.15, 0, TENT.z + 0.7, 0.9, 0.8));
    barrel.visible = crate.visible = false;
    spots.find((s) => s.id === "supplies")!.tapTargets.push(kitBarrel, kitCrate, apples);
    // the cooking spot: a pot and a water bucket by the fire
    kit.add(place(pot, -0.95, 0, 0.75, 0.6));
    kit.add(place(bucket, -1.25, 0, 0.15, 0.2));
    block(-1.1, 0.45, 0.4);

    // the cart and a stretch of old fence behind it
    kit.add(place(wagon, CART.x, 0, CART.z, CART.ry, 0.9));
    cartBox.visible = false;
    spots.find((s) => s.id === "cart")!.tapTargets.push(wagon);
    for (let i = 0; i < 3; i++) {
      const a = 0.65 + i * 0.23;
      kit.add(place(fence.clone(), Math.sin(a) * 9.9, 0, -Math.cos(a) * 9.9, -a + Math.PI / 2 + Math.PI / 2));
    }

    // a kit lantern hangs from each post, its bracket pointing at the path
    for (const lp of lanternPosts) {
      const side = Math.sign(lp.position.x);
      lp.getObjectByName("standin-lamp")!.visible = false;
      const l = place(lantern.clone(), 0, 1.25, 0, side > 0 ? -Math.PI / 2 : Math.PI / 2, 0.75);
      lp.add(l);
      // the glow sits on the hanging lantern
      lp.children.filter((ch) => (ch as THREE.Sprite).isSprite).forEach((g) => g.position.set(-side * 0.85, 1.55, 0));
    }
    scene.add(kit);

    // ---------- nature: trees around the clearing, plants and flowers inside ----------
    const treeNames = ["CommonTree_1", "CommonTree_2", "CommonTree_3", "CommonTree_4", "CommonTree_5", "Pine_1", "Pine_2", "Pine_3", "Pine_4", "Pine_5"];
    const trees = await Promise.all(treeNames.map((n) => model("nature", n)));
    const plantNames = [
      "Bush_Common", "Bush_Common_Flowers", "Grass_Common_Short", "Grass_Common_Tall", "Grass_Wispy_Tall", "Flower_3_Group",
      "Flower_4_Group", "Flower_3_Single", "Fern_1", "Clover_1", "Mushroom_Common", "Plant_1_Big", "Pebble_Round_1",
      "Pebble_Round_3", "Rock_Medium_1", "Rock_Medium_2", "Rock_Medium_3", "RockPath_Round_Small_1", "RockPath_Round_Small_2",
      "RockPath_Round_Thin",
    ] as const;
    const plants = Object.fromEntries(
      await Promise.all(plantNames.map(async (n) => [n, await model("nature", n)] as const)),
    ) as Record<(typeof plantNames)[number], THREE.Object3D>;

    // grass and clover shade like the ground they grow from (see groundLit)
    for (const n of ["Grass_Common_Short", "Grass_Common_Tall", "Grass_Wispy_Tall", "Clover_1"] as const) plants[n] = groundLit(plants[n], 1.1);

    const rnd = seeded(7);
    const up = new THREE.Vector3(0, 1, 0);
    const groups = new Map<THREE.Object3D, THREE.Matrix4[]>();
    const add = (o: THREE.Object3D, x: number, z: number, s: number, ry = rnd() * Math.PI * 2) => {
      if (!groups.has(o)) groups.set(o, []);
      groups.get(o)!.push(
        new THREE.Matrix4().compose(new THREE.Vector3(x, heightAt(x, z), z), new THREE.Quaternion().setFromAxisAngle(up, ry), new THREE.Vector3(s, s, s)),
      );
    };
    /** Is a spot taken by camp things (or the path north)? */
    const busy = (x: number, z: number, pad: number) =>
      blockers.some((b) => Math.hypot(x - b.x, z - b.z) < b.r + pad) || (z < -0.5 && Math.abs(x) < 1.1 + pad) || Math.hypot(x, z) < 2.2 + pad;
    // the gap in the trees to the north, where the trail leaves
    const inGap = (x: number, z: number) => z < 0 && Math.abs(x) < 3.2 + (-z - 9) * 0.25;

    // trees: a few close ones, then a thick wood further out
    const shade: Hug[] = [];
    for (let i = 0; i < 120; i++) {
      const a = rnd() * Math.PI * 2;
      const r = 11 + Math.pow(rnd(), 0.7) * 20;
      const x = Math.sin(a) * r, z = -Math.cos(a) * r;
      if (inGap(x, z)) continue;
      add(trees[Math.floor(rnd() * trees.length)], x, z, 0.75 + rnd() * 0.45);
      if (r < 16) shade.push({ x, z, r: 2.4 });
    }
    // bushes at the edge of the clearing
    const hugs: Hug[] = [];
    for (let i = 0; i < 26; i++) {
      const a = rnd() * Math.PI * 2;
      const r = 9.6 + rnd() * 1.6;
      const x = Math.sin(a) * r, z = -Math.cos(a) * r;
      if (inGap(x, z) || busy(x, z, 0.6)) continue;
      add(rnd() < 0.6 ? plants.Bush_Common : plants.Bush_Common_Flowers, x, z, 0.6 + rnd() * 0.35);
      hugs.push({ x, z, r: 0.8 });
      shade.push({ x, z, r: 1.3 });
    }
    // a few big rocks out among the trees
    for (const [o, x, z, s] of [
      [plants.Rock_Medium_1, -8.6, 4.5, 0.5],
      [plants.Rock_Medium_2, 9.2, 2.8, 0.45],
      [plants.Rock_Medium_3, -10.5, -5.5, 0.55],
      [plants.Rock_Medium_2, 4.6, -10.8, 0.4],
    ] as const) {
      add(o, x, z, s);
      if (Math.hypot(x, z) < RADIUS + 1) block(x, z, s * 2.6);
      hugs.push({ x, z, r: s * 2.2 });
    }
    // grass and flowers grow in clumps: against the tent, the bench, the rocks
    // and the edge of the clearing, along the path, with open ground between
    for (const b of blockers) if (Math.hypot(b.x, b.z) > 2.5) hugs.push(b);
    for (let i = 0; i < 9; i++) for (const side of [-1, 1]) hugs.push({ x: side * 0.95, z: -1.8 - i * 1.15, r: 0.15 });
    const open = (x: number, z: number) => Math.hypot(x, z) < 11.5 && !busy(x, z, 0.15);
    const patches = planPatches({
      rnd,
      seed: 7,
      sample: () => {
        const a = rnd() * Math.PI * 2, r = 2.4 + Math.sqrt(rnd()) * 9.5;
        return { x: Math.sin(a) * r, z: -Math.cos(a) * r };
      },
      ok: open,
      // the rim of the clearing and the sides of the path are the lushest
      edge: (x, z) => {
        const r = Math.hypot(x, z);
        const rim = THREE.MathUtils.clamp((r - 6.5) / 2.5, 0, 1);
        const path = z < -1 ? THREE.MathUtils.clamp(1 - Math.abs(Math.abs(x) - 1.3) / 0.6, 0, 1) : 0;
        return Math.max(rim, path);
      },
      hugs,
      hugCount: 34,
      openCount: 28,
    });
    fillPatches(patches, {
      rnd,
      ok: (x, z) => !busy(x, z, 0.1),
      density: 7,
      plants: {
        grass: [[plants.Grass_Common_Short, 0.32, 5], [plants.Grass_Common_Tall, 0.28, 2.5], [plants.Grass_Wispy_Tall, 0.28, 2]],
        flowers: [[plants.Flower_3_Group, 0.28, 1], [plants.Flower_4_Group, 0.26, 0.6], [plants.Flower_3_Single, 0.3, 0.7]],
        clover: [[plants.Clover_1, 0.3, 3], [plants.Grass_Common_Short, 0.3, 1]],
        ferns: [[plants.Fern_1, 0.09, 2], [plants.Plant_1_Big, 0.22, 1], [plants.Mushroom_Common, 0.45, 0.7]],
        pebbles: [[plants.Pebble_Round_1, 0.6, 1], [plants.Pebble_Round_3, 0.6, 1], [plants.Grass_Common_Short, 0.3, 1]],
      },
      add: (o, x, z, s) => add(o, x, z, s),
    });
    // a few loners, so it doesn't look planted
    for (const [o, s, n] of [[plants.Grass_Common_Short, 0.28, 26], [plants.Clover_1, 0.26, 8], [plants.Grass_Wispy_Tall, 0.26, 5], [plants.Pebble_Round_1, 0.6, 6]] as const) {
      for (let i = 0, tries = 0; i < n && tries < 80; tries++) {
        const a = rnd() * Math.PI * 2, r = 2.4 + Math.sqrt(rnd()) * 9;
        const x = Math.sin(a) * r, z = -Math.cos(a) * r;
        if (busy(x, z, 0.25)) continue;
        add(o, x, z, s * (0.7 + rnd() * 0.4));
        i++;
      }
    }
    applyGroundPaint(
      ground,
      paintGround({ plane: { width: 120, depth: 120, cx: 0, cz: 0 }, width: 36, depth: 36, cx: 0, cz: 0, patches, shade, seed: 7 }),
    );
    // stepping stones from the fire up to the trail
    const stones = [plants.RockPath_Round_Small_1, plants.RockPath_Round_Small_2, plants.RockPath_Round_Thin];
    for (let i = 0; i < 9; i++) {
      const z = -1.6 - i * 1.15;
      add(stones[i % 3], Math.sin(i * 1.3) * 0.18, z, 0.55, rnd() * 0.6 - 0.3);
    }

    for (const [o, list] of groups) kit.add(instanced(o, list));
    coneTrees.visible = false;
    await people;
  }

  /** Ground height outside the flat clearing (for placing scenery). */
  function heightAt(x: number, z: number) {
    const r = Math.hypot(x, z);
    const rise = Math.max(0, r - 11);
    if (rise <= 0) return 0;
    const bumps = Math.sin(x * 0.35) * Math.cos(z * 0.3) * 0.5 + Math.sin(x * 0.11 + z * 0.17) * 1.2;
    return rise * 0.22 + bumps * Math.min(1, rise / 6) - 0.05;
  }

  const ready = dress().catch((err) => console.warn("Camp models did not load:", err));

  const camp: CampWorld = {
    scene,
    camera,
    traveler,
    blockers,
    spots,
    walk: [{ ax: 0, az: 0, bx: 0, bz: 0, r: RADIUS }],
    start: { x: 0.4, z: 2.6, facing: Math.PI },
    notes: campNotes(save?.fox?.name ?? null),
    fire: { x: 0, z: 0 },
    seat,
    ready,
    refresh() {
      tools.set(save?.tools ?? []);
      placeKeepsake();
      placeLanterns();
      camp.notes = campNotes(save?.fox?.name ?? null);
    },
    update(dt, time) {
      if (keepsakeLight) keepsakeLight.intensity = 2.2 + Math.sin(time * 9) * 0.25 + Math.sin(time * 13.7) * 0.2;
      // the fire flickers
      const flicker = Math.sin(time * 11) * 0.4 + Math.sin(time * 17.3) * 0.3 + Math.sin(time * 5.1) * 0.3;
      fireLight.intensity = 14 + flicker * 3;
      fireGlow.material.opacity = 0.55 + flicker * 0.08;
      flames.children.forEach((f, i) => {
        f.scale.set(1 + Math.sin(time * (7 + i) + i) * 0.08, 1 + Math.sin(time * (9 + i * 2) + i) * 0.25, 1);
        f.rotation.y = time * (0.5 + i * 0.3);
      });
      for (let i = 0; i < SPARKS; i++) {
        sparkLife[i] += dt * 0.6;
        sparkPos[i * 3 + 1] += dt * (0.8 + (i % 5) * 0.15);
        sparkPos[i * 3] += Math.sin(time * 2 + i) * dt * 0.15;
        if (sparkLife[i] > 1.6 || sparkPos[i * 3 + 1] > 3) resetSpark(i);
      }
      sparkGeo.attributes.position.needsUpdate = true;
      for (const g of lanternGlows) g.material.opacity = 0.7 + flicker * 0.05;
      earnedGlows.forEach((g, i) => (g.material.opacity = 0.7 + Math.sin(time * (5 + i) + i * 2) * 0.05));

      // the sun's shadows follow the traveler, so they stay sharp near the camera
      const p = traveler.root.position;
      sun.target.position.set(p.x, 0, p.z);
      sun.position.copy(sun.target.position).add(SUN_OFFSET);

      for (const f of frameHooks) f(dt);
    },
    resize() {
      const w = window.innerWidth, h = window.innerHeight;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    },
  };
  camp.resize();
  return camp;
}
