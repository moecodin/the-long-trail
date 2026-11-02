// Leg 1: The Lantern in the Window.
//
// Della's cottage at dusk, her yard (herb bed, hen house, apple tree) and the
// lane out of Lowmeadow, past the neighbors' cottages, to the spot where you
// make your first camp on the trail.
//
// Directions: like camp, the camera starts looking north (toward -z). You
// arrive at the south edge of Della's yard; the garden gate is at the north
// end of the yard and the lane winds north from there.

import * as THREE from "three";
import { makePerson, type PersonLook } from "../scene/people";
import { loadKayKit, wearKayKit } from "../scene/kaykitPeople";
import { BASE, instanced, loader, model, place, seeded } from "../scene/kits";
import { glowTexture, outside, type Area, type Blocker, type Capsule, type Spot } from "../camp/area";
import { carryTools, dressTraveler } from "../camp/dressTraveler";
import { Pickables, type ItemId } from "./gather";
import type { Save } from "../save";

/** What Leg 1 reads and changes in the save, and how to tell the game it changed. */
export interface Leg1Context {
  save: Pick<Save, "gather" | "tools" | "secrets" | "shortcuts">;
  /** Today's date in the journal's sense (the day starts at 4 a.m.). */
  today: string;
  /** Something in the save changed: write it down. */
  changed(): void;
}

/** Leg 1's secrets, in the order you'll most likely find them. */
export const LEG1_SECRETS = ["leg1:stone", "leg1:log", "leg1:chalk"];

/** The middle of Della's yard, and how far it reaches (the fence sits just outside). */
const YARD = { x: 0, z: -1, r: 8.5 };
const FENCE_R = 8.75;
/** The lane's middle line, from the garden gate north to the end of the leg. */
const SPINE: [number, number][] = [
  [0, -11],
  [2.5, -19],
  [-1.5, -28],
  [1, -38],
  [0, -46],
];
const LANE_R = 2.4;
/** The clearing at the end of the leg, where you make camp. */
const END = { x: 0, z: -49, r: 4.6 };
/** Della's back gate: one fence section on the north-east of the yard (angle a around the yard), and which way is out. */
const FENCE_STEP = 2.04 / FENCE_R;
const BACK = (() => {
  const a = FENCE_STEP / 2 + 11 * FENCE_STEP;
  return { a, x: YARD.x + Math.sin(a) * FENCE_R, z: YARD.z + Math.cos(a) * FENCE_R, ox: Math.sin(a), oz: Math.cos(a) };
})();

/** A point along the lane: `s` meters from the gate, `off` meters to the right of the middle. */
function lanePoint(s: number, off = 0): { x: number; z: number } {
  for (let i = 0; i < SPINE.length - 1; i++) {
    const [ax, az] = SPINE[i], [bx, bz] = SPINE[i + 1];
    const len = Math.hypot(bx - ax, bz - az);
    if (s <= len || i === SPINE.length - 2) {
      const t = Math.min(1, s / len);
      const dx = (bx - ax) / len, dz = (bz - az) / len;
      // "right" when walking north (-z) is +x: (-dz, dx)
      return { x: ax + (bx - ax) * t - dz * off, z: az + (bz - az) * t + dx * off };
    }
    s -= len;
  }
  return { x: 0, z: 0 };
}

const NOTES: Record<string, string[]> = {
  della: [
    "\"There you are. Fill your satchel before you go. The herb bed's full and the hens have been busy.\"",
    "\"Pick what you like. It all grows back by morning, same as always.\"",
    "\"Follow the lane past the Tansys' and the Millers'. The trail starts where the houses stop.\"",
    "\"Go on, then. I'll keep the lantern lit.\"",
  ],
  window: [
    "Della's lantern glows in the window. She lights it every dusk, for whoever's out walking.",
    "From out here the cottage looks smaller than it did from inside.",
  ],
  herbbed: [
    "Della's herb bed: thyme, chives and sage, all a little wild. A sparkle means it's ready to pick.",
    "Someone has written THYME in chalk on the edge board, then crossed it out and written TIME.",
  ],
  henhouse: [
    "Three hens: Clover, Biscuit and Mrs. Peck. They pretend not to notice you.",
    "The hens lay wherever they like. Look around the hen house for eggs.",
  ],
  appletree: [
    "Della's old apple tree. Windfalls in the grass, more up high.",
    "The lowest branch has a rope swing nobody has used in years.",
  ],
  tansy: [
    "The Tansys' cottage. Someone inside is humming over the washing up.",
    "A pie tin cools on the sill. It smells of blackberries.",
  ],
  millers: [
    "The Millers' cottage. Flour on the doorstep, as always.",
    "A small boot print in the flour. And a smaller one beside it. Mice?",
  ],
  oakes: [
    "The last cottage in Lowmeadow. Old Mr. Oakes waves from his chair by the window.",
    "Beyond this house, the lane is just a path.",
  ],
  well: ["The village well. Your face looks back at you from the dark water, lit by the sky."],
  "gate:inside": [
    "A little back gate in Della's fence. It's latched from the other side.",
    "Still latched. The latch must be out on the far side, by the lane.",
  ],
};

const flat = (color: string, extra: Partial<THREE.MeshStandardMaterialParameters> = {}) =>
  new THREE.MeshStandardMaterial({ color, flatShading: true, roughness: 0.95, ...extra });

/** A plump little hen built from simple shapes. */
function buildHen(body: string, wing: string) {
  const hen = new THREE.Group();
  const bodyMat = flat(body);
  const torso = new THREE.Mesh(new THREE.IcosahedronGeometry(0.16, 1), bodyMat);
  torso.scale.set(0.9, 0.85, 1.15);
  torso.position.y = 0.22;
  torso.castShadow = true;
  const tail = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.16, 5), flat(wing));
  tail.position.set(0, 0.32, -0.17);
  tail.rotation.x = -0.9;
  for (const side of [-1, 1]) {
    const w = new THREE.Mesh(new THREE.IcosahedronGeometry(0.09, 0), flat(wing));
    w.scale.set(0.35, 0.7, 1.2);
    w.position.set(side * 0.13, 0.24, -0.01);
    hen.add(w);
  }
  const head = new THREE.Group();
  head.position.set(0, 0.36, 0.13);
  const skull = new THREE.Mesh(new THREE.IcosahedronGeometry(0.075, 1), bodyMat);
  const beak = new THREE.Mesh(new THREE.ConeGeometry(0.025, 0.06, 4), flat("#e8a830"));
  beak.rotation.x = Math.PI / 2;
  beak.position.set(0, -0.005, 0.08);
  const comb = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.05, 0.08), flat("#c8352a"));
  comb.position.set(0, 0.07, 0.01);
  const wattle = new THREE.Mesh(new THREE.SphereGeometry(0.02, 5, 4), flat("#c8352a"));
  wattle.position.set(0, -0.05, 0.06);
  const eyeMat = flat("#1a1410");
  for (const side of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.012, 5, 4), eyeMat);
    eye.position.set(side * 0.05, 0.015, 0.045);
    head.add(eye);
  }
  head.add(skull, beak, comb, wattle);
  const legMat = flat("#e8a830");
  for (const side of [-1, 1]) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.12, 4), legMat);
    leg.position.set(side * 0.05, 0.06, 0);
    hen.add(leg);
  }
  hen.add(torso, tail, head);
  return { root: hen, head };
}

type Side = "+x" | "-x" | "+z" | "-z";
type Piece = "wall" | "window" | "door";

/**
 * A small cottage from the Medieval Village kit: walls in 2 m pieces, a tiled
 * roof and a chimney. Windows glow warm from inside (there's no room behind
 * them, just a lit pane). Returns the group, placed at its center.
 */
async function buildCottage(opts: {
  w: number;
  d: number;
  brick: boolean;
  /** Which piece goes in each 2 m section of each side (missing = plain wall). */
  sides: Partial<Record<Side, Piece[]>>;
  glow: THREE.Material;
}) {
  const { w, d } = opts;
  const OUT = 0.31; // kit walls sit this far outside their inner face
  const kind = opts.brick ? "UnevenBrick" : "Plaster";
  const [wall, win, door, glass, kitDoor, shutters, corner, roof, chimney, vine] = await Promise.all([
    model("village", `Wall_${kind}_Straight`),
    model("village", `Wall_${kind}_Window_Wide_Round`),
    model("village", `Wall_${kind}_Door_Round`),
    model("village", "Window_Wide_Round1"),
    model("village", "Door_1_Round"),
    model("village", "WindowShutters_Wide_Round_Open"),
    model("village", "Corner_Exterior_Wood"),
    model("village", "Roof_RoundTiles_6x6"),
    model("village", "Prop_Chimney"),
    model("village", "Prop_Vine2"),
  ]);
  const house = new THREE.Group();
  const sideFrame: Record<Side, { n: number; at: (c: number) => [number, number, number] }> = {
    "+z": { n: w / 2, at: (c) => [c, d / 2 + OUT, 0] },
    "-z": { n: w / 2, at: (c) => [-c, -d / 2 - OUT, Math.PI] },
    "+x": { n: d / 2, at: (c) => [w / 2 + OUT, -c, Math.PI / 2] },
    "-x": { n: d / 2, at: (c) => [-w / 2 - OUT, c, -Math.PI / 2] },
  };
  for (const side of Object.keys(sideFrame) as Side[]) {
    const { n, at } = sideFrame[side];
    for (let i = 0; i < n; i++) {
      const c = -(n - 1) + i * 2; // section centers, 2 m apart
      const [x, z, ry] = at(c);
      const piece = opts.sides[side]?.[i] ?? "wall";
      const g = new THREE.Group();
      g.position.set(x, 0, z);
      g.rotation.y = ry;
      if (piece === "wall") g.add(wall.clone());
      if (piece === "window") {
        g.add(win.clone(), glass.clone(), shutters.clone());
        const pane = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 1.6), opts.glow);
        pane.position.set(0, 1.85, -0.3);
        g.add(pane);
      }
      if (piece === "door") {
        g.add(door.clone());
        g.add(place(kitDoor.clone(), -0.53, 0, -0.11));
      }
      house.add(g);
    }
  }
  for (const [sx, sz, ry] of [[-1, -1, Math.PI], [1, -1, Math.PI / 2], [1, 1, 0], [-1, 1, -Math.PI / 2]] as const) {
    house.add(place(corner.clone(), sx * (w / 2 + OUT), 0, sz * (d / 2 + OUT), ry));
  }
  house.add(place(roof, 0, 3.12, 0, 0, [(w + 1.3) / 8.24, 0.62, (d + 1.3) / 8.03]));
  house.add(place(chimney, -w / 2 + 0.7, 2.9, -d / 4));
  house.add(place(vine, w / 2 + OUT + 0.12, 2.9, d / 2 - 0.4, Math.PI / 2));
  return house;
}

export function createLeg1(renderer: THREE.WebGLRenderer, look: PersonLook, ctx: Leg1Context): Area {
  const { save, today } = ctx;
  const gather = save.gather;
  const has = (tool: "stick" | "lantern") => save.tools.includes(tool);
  const found = (id: string) => save.secrets.includes(id);
  const scene = new THREE.Scene();
  const dusk = new THREE.Color("#7d6a86");
  scene.background = dusk;
  scene.fog = new THREE.Fog(dusk, 24, 62);
  const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 220);

  // ---------- light: the same warm dusk as camp ----------
  scene.add(new THREE.HemisphereLight("#f3c6a0", "#3c4a34", 1.35));
  const sun = new THREE.DirectionalLight("#ffb27a", 2.1);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  const sc = sun.shadow.camera;
  sc.left = sc.bottom = -14;
  sc.right = sc.top = 14;
  sc.near = 1;
  sc.far = 70;
  sun.shadow.bias = -0.0008;
  sun.shadow.normalBias = 0.03;
  scene.add(sun, sun.target);
  const SUN_OFFSET = new THREE.Vector3(-18, 16, -8);

  // ---------- where you can walk ----------
  const walk: Capsule[] = [
    { ax: YARD.x, az: YARD.z, bx: YARD.x, bz: YARD.z, r: YARD.r },
    // through the garden gate
    { ax: 0, az: -8, bx: 0, bz: -11.5, r: 1.2 },
    ...SPINE.slice(0, -1).map(([ax, az], i) => ({ ax, az, bx: SPINE[i + 1][0], bz: SPINE[i + 1][1], r: LANE_R })),
    { ax: END.x, az: END.z, bx: END.x, bz: END.z, r: END.r },
    // the little back path from the lane to Della's back gate (the first shortcut)
    { ax: BACK.x + BACK.ox * 0.3, az: BACK.z + BACK.oz * 0.3, bx: 4.1, bz: -16.6, r: 1.0 },
  ];
  const blockers: Blocker[] = [];
  const spots: Spot[] = [];
  /** Houses the camera stays out of (a cottage's walls, roof and eaves). */
  const cameraBlocks: THREE.Box3[] = [];
  const houseBox = (x: number, z: number, w: number, d: number, ry = 0) => {
    const turned = Math.abs(Math.sin(ry)) > 0.5;
    const hw = (turned ? d : w) / 2 + 0.7, hd = (turned ? w : d) / 2 + 0.7;
    cameraBlocks.push(new THREE.Box3(new THREE.Vector3(x - hw, -1, z - hd), new THREE.Vector3(x + hw, 6.5, z + hd)));
  };
  const block = (x: number, z: number, r: number) => blockers.push({ x, z, r });

  // ---------- the ground: flat where you walk, rising into low hills away from it ----------
  const spineDist = (x: number, z: number) => {
    let best = Infinity;
    for (let i = 0; i < SPINE.length - 1; i++) {
      const [ax, az] = SPINE[i], [bx, bz] = SPINE[i + 1];
      const dx = bx - ax, dz = bz - az;
      const t = THREE.MathUtils.clamp(((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz), 0, 1);
      best = Math.min(best, Math.hypot(x - ax - dx * t, z - az - dz * t));
    }
    return best;
  };
  function heightAt(x: number, z: number) {
    const d = outside(walk, x, z) - 4.5;
    if (d <= 0) return 0;
    const bumps = Math.sin(x * 0.35) * Math.cos(z * 0.3) * 0.5 + Math.sin(x * 0.11 + z * 0.17) * 1.2;
    return d * 0.2 + bumps * Math.min(1, d / 6);
  }
  const groundGeo = new THREE.PlaneGeometry(150, 150, 110, 110);
  groundGeo.rotateX(-Math.PI / 2);
  groundGeo.translate(0, 0, -22);
  const gp = groundGeo.attributes.position as THREE.BufferAttribute;
  const colors: number[] = [];
  const grass = new THREE.Color("#76944a"), grassDark = new THREE.Color("#4f6b38"), dirt = new THREE.Color("#8a6a48");
  const c = new THREE.Color();
  for (let i = 0; i < gp.count; i++) {
    const x = gp.getX(i), z = gp.getZ(i);
    gp.setY(i, heightAt(x, z));
    c.copy(grass).lerp(grassDark, THREE.MathUtils.clamp((outside(walk, x, z) - 1) / 10, 0, 1));
    // the lane is worn to dirt down the middle; so is the path from the gate to Della's door
    const lane = THREE.MathUtils.clamp(1.6 - spineDist(x, z), 0, 1);
    const path = z < -1 && z > -10 && x > -5 ? THREE.MathUtils.clamp(1.2 - Math.abs(x - (z + 10) * -0.35), 0, 1) * 0.8 : 0;
    const door = THREE.MathUtils.clamp(1.6 - Math.hypot(x + 4.2, z + 1), 0, 1) * 0.7;
    c.lerp(dirt, Math.max(lane * 0.85, path, door));
    colors.push(c.r, c.g, c.b);
  }
  groundGeo.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  groundGeo.computeVertexNormals();
  const ground = new THREE.Mesh(groundGeo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 }));
  ground.receiveShadow = true;
  scene.add(ground);

  const glowTex = glowTexture();
  const glowSprite = (color: string, size: number, opacity = 0.8) => {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false }));
    s.scale.setScalar(size);
    return s;
  };
  const windowGlow = new THREE.MeshBasicMaterial({ color: "#ffc66e" });
  const glows: THREE.Sprite[] = [];

  // ---------- Della's cottage, on the west side of the yard ----------
  const COTTAGE = { x: -7.3, z: -1, w: 4, d: 6 };
  const cottage = new THREE.Group();
  cottage.position.set(COTTAGE.x, 0, COTTAGE.z);
  scene.add(cottage);
  houseBox(COTTAGE.x, COTTAGE.z, COTTAGE.w, COTTAGE.d);
  block(COTTAGE.x, COTTAGE.z - 1.6, 2.3);
  block(COTTAGE.x, COTTAGE.z + 1.6, 2.3);
  const doorX = COTTAGE.x + COTTAGE.w / 2 + 0.4;
  // the lantern in the window: Della lights it every dusk
  const lanternLight = new THREE.PointLight("#ffb050", 9, 9, 1.6);
  lanternLight.position.set(doorX + 0.2, 1.8, COTTAGE.z + 2);
  scene.add(lanternLight);
  const lanternGlow = glowSprite("#ffcf80", 1.6, 0.9);
  lanternGlow.position.set(doorX - 0.25, 1.85, COTTAGE.z + 2);
  scene.add(lanternGlow);
  glows.push(lanternGlow);
  const windowSpot = { id: "window", label: "Look", x: doorX - 0.3, z: COTTAGE.z + 2, range: 1.8, standX: doorX + 1.1, standZ: COTTAGE.z + 2.2, tapTargets: [] as THREE.Object3D[] };
  spots.push(windowSpot);

  // Della, waiting by her door
  const della = makePerson({ skin: "#e3b896", hair: "#c9c4bc", cloak: "#6e5a7e", scarf: "#c4a8d0", hairStyle: "bun", cast: "della" }, 0.92);
  della.root.position.set(doorX + 0.5, 0, COTTAGE.z - 0.3);
  della.root.rotation.y = Math.PI / 2 + 0.3;
  scene.add(della.root);
  block(della.root.position.x, della.root.position.z, 0.35);
  spots.push({ id: "della", label: "Talk", x: della.root.position.x, z: della.root.position.z, range: 1.7, standX: della.root.position.x + 1.1, standZ: della.root.position.z + 0.2, tapTargets: [della.root] });

  // ---------- the herb bed ----------
  const BED = { x: -2.6, z: -6, w: 3.2, d: 1.3 };
  const bed = new THREE.Group();
  bed.position.set(BED.x, 0, BED.z);
  const plank = flat("#7a5532");
  for (const [w, d, x, z] of [[BED.w, 0.1, 0, BED.d / 2], [BED.w, 0.1, 0, -BED.d / 2], [0.1, BED.d, BED.w / 2, 0], [0.1, BED.d, -BED.w / 2, 0]]) {
    const p = new THREE.Mesh(new THREE.BoxGeometry(w, 0.28, d), plank);
    p.position.set(x, 0.14, z);
    p.castShadow = p.receiveShadow = true;
    bed.add(p);
  }
  const soil = new THREE.Mesh(new THREE.BoxGeometry(BED.w - 0.1, 0.2, BED.d - 0.1), flat("#4a3424"));
  soil.position.y = 0.11;
  soil.receiveShadow = true;
  bed.add(soil);
  scene.add(bed);
  for (const dx of [-1.1, 0, 1.1]) block(BED.x + dx, BED.z, 0.62);
  spots.push({ id: "herbbed", label: "Look", x: BED.x, z: BED.z + 0.4, range: 1.3, standX: BED.x, standZ: BED.z + 1.2, tapTargets: [bed] });

  // ---------- the hen house and its hens ----------
  const COOP = { x: 5.7, z: -5.2 };
  const coop = new THREE.Group();
  coop.position.set(COOP.x, 0, COOP.z);
  coop.rotation.y = -0.9; // its little door faces the yard
  const coopWood = flat("#9a6a3c"), coopRoof = flat("#6b3f2a");
  const coopBox = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.9, 1.1), coopWood);
  coopBox.position.y = 0.8;
  coopBox.castShadow = coopBox.receiveShadow = true;
  coop.add(coopBox);
  for (const [x, z] of [[-0.6, -0.45], [0.6, -0.45], [-0.6, 0.45], [0.6, 0.45]]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.36, 0.08), coopRoof);
    leg.position.set(x, 0.18, z);
    coop.add(leg);
  }
  for (const side of [-1, 1]) {
    const r = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.06, 0.78), coopRoof);
    r.position.set(0, 1.45, side * 0.3);
    r.rotation.x = side * 0.62;
    r.castShadow = true;
    coop.add(r);
  }
  const hole = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.36), flat("#2a1a10"));
  hole.position.set(0.25, 0.75, 0.56);
  coop.add(hole);
  const ramp = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.04, 0.9), coopWood);
  ramp.position.set(0.25, 0.3, 0.95);
  ramp.rotation.x = 0.55;
  coop.add(ramp);
  scene.add(coop);
  block(COOP.x, COOP.z, 1.0);
  spots.push({ id: "henhouse", label: "Look", x: COOP.x, z: COOP.z, range: 2.0, standX: COOP.x - 1.3, standZ: COOP.z + 1.3, tapTargets: [coop] });

  const HEN_HOME = { x: 4.2, z: -3.4, r: 1.5 };
  const hens = [
    { ...buildHen("#f2ead8", "#d9cdb0"), target: new THREE.Vector2(), wait: 0, peck: 0 },
    { ...buildHen("#b5652e", "#7a3a1a"), target: new THREE.Vector2(), wait: 1, peck: 0 },
    { ...buildHen("#3a302a", "#5a4a3a"), target: new THREE.Vector2(), wait: 2, peck: 0 },
  ];
  const henRnd = seeded(5);
  hens.forEach((h, i) => {
    h.root.position.set(HEN_HOME.x + (i - 1) * 0.8, 0, HEN_HOME.z + (i % 2) * 0.6);
    h.root.rotation.y = i * 2;
    h.target.set(h.root.position.x, h.root.position.z);
    scene.add(h.root);
  });

  // ---------- the apple tree ----------
  const TREE = { x: 5.4, z: 3.4 };
  block(TREE.x, TREE.z, 0.45);
  const appleTreeSpot = { id: "appletree", label: "Look", x: TREE.x, z: TREE.z, range: 1.5, standX: TREE.x - 1.2, standZ: TREE.z + 0.6, tapTargets: [] as THREE.Object3D[] };
  spots.push(appleTreeSpot);

  // ---------- the well, at the bend in the lane ----------
  const WELL = lanePoint(15, -3.6);
  const well = new THREE.Group();
  well.position.set(WELL.x, 0, WELL.z);
  const stone = flat("#9a958c");
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2;
    const s = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.62, 0.22), stone);
    s.position.set(Math.cos(a) * 0.55, 0.31, Math.sin(a) * 0.55);
    s.rotation.y = -a + Math.PI / 2;
    s.castShadow = true;
    well.add(s);
  }
  const water = new THREE.Mesh(new THREE.CircleGeometry(0.45, 12), new THREE.MeshStandardMaterial({ color: "#26404a", roughness: 0.1, metalness: 0.3 }));
  water.rotation.x = -Math.PI / 2;
  water.position.y = 0.4;
  well.add(water);
  for (const side of [-1, 1]) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.1, 1.5, 0.1), plank);
    post.position.set(side * 0.62, 0.75, 0);
    well.add(post);
  }
  const wellRoof = new THREE.Mesh(new THREE.ConeGeometry(0.95, 0.55, 4), coopRoof);
  wellRoof.position.y = 1.75;
  wellRoof.rotation.y = Math.PI / 4;
  wellRoof.castShadow = true;
  well.add(wellRoof);
  scene.add(well);
  block(WELL.x, WELL.z, 0.75);
  spots.push({ id: "well", label: "Look", x: WELL.x, z: WELL.z, range: 1.7, standX: WELL.x + 1.2, standZ: WELL.z, tapTargets: [well] });

  // ---------- signposts: back to camp at the start, make camp at the end ----------
  const signWood = flat("#6b4a2c");
  const signpost = (x: number, z: number, ry: number, id: string, label: string, standX: number, standZ: number) => {
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    g.rotation.y = ry;
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1.5, 0.12), signWood);
    post.position.y = 0.75;
    post.castShadow = true;
    const board = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.24, 0.05), flat("#8a5e36"));
    board.position.set(0.22, 1.25, 0.06);
    board.castShadow = true;
    g.add(post, board);
    scene.add(g);
    block(x, z, 0.25);
    spots.push({ id, label, x, z, range: 1.6, standX, standZ, tapTargets: [g] });
  };
  signpost(2.1, 6.6, 0.3, "exit:back", "Back to camp", 1.3, 5.6);

  // the end of the leg: a cleared ring of stones, waiting for your fire
  const ring = new THREE.Group();
  ring.position.set(END.x, 0, END.z);
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2;
    const s = new THREE.Mesh(new THREE.DodecahedronGeometry(0.17, 0), flat("#8d8a84"));
    s.position.set(Math.cos(a) * 0.6, 0.08, Math.sin(a) * 0.6);
    s.scale.set(1.1, 0.7, 0.9);
    s.castShadow = true;
    ring.add(s);
  }
  scene.add(ring);
  block(END.x, END.z, 0.75);
  spots.push({ id: "exit:camp", label: "Make camp", x: END.x, z: END.z, range: 2.0, standX: END.x, standZ: END.z + 1.4, tapTargets: [ring] });
  const endGlow = glowSprite("#ffe0a0", 1.2, 0.5);
  endGlow.position.set(END.x, 0.5, END.z);
  scene.add(endGlow);

  // ---------- lantern posts along the lane ----------
  const lanePosts: { x: number; z: number }[] = [lanePoint(8, 2.7), lanePoint(20, -2.7), lanePoint(31, 2.7), lanePoint(36.4, 2.7)];
  const postGroups: THREE.Group[] = [];
  for (const p of lanePosts) {
    const lp = new THREE.Group();
    lp.position.set(p.x, 0, p.z);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 2.2, 6), signWood);
    pole.position.y = 1.1;
    pole.castShadow = true;
    lp.add(pole);
    const g = glowSprite("#ffcf80", 1.3);
    g.position.set(0, 2.15, 0);
    lp.add(g);
    glows.push(g);
    scene.add(lp);
    postGroups.push(lp);
    block(p.x, p.z, 0.22);
  }

  // ---------- secrets that look a bit off ----------
  // A paler stone with a crack around it, by the well. Tap it with the stick.
  const STONE = lanePoint(17, -1.9);
  const oddStone = new THREE.Group();
  oddStone.position.set(STONE.x, 0, STONE.z);
  const stoneBody = new THREE.Mesh(new THREE.DodecahedronGeometry(0.28, 0), flat("#b9b2a2"));
  stoneBody.scale.set(1.2, 0.7, 1);
  stoneBody.position.y = 0.16;
  stoneBody.castShadow = true;
  const crack = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.012, 3, 14), flat("#4a443c"));
  crack.rotation.x = Math.PI / 2;
  crack.position.y = 0.16;
  crack.scale.set(1.15, 1, 1);
  oddStone.add(stoneBody, crack);
  const hollow = new THREE.Mesh(new THREE.CircleGeometry(0.22, 10), flat("#2a2018"));
  hollow.rotation.x = -Math.PI / 2;
  hollow.position.set(STONE.x, 0.015, STONE.z);
  scene.add(hollow, oddStone);
  if (found("leg1:stone")) oddStone.position.x += 0.55;
  spots.push({ id: "secret:stone", label: "Look", x: STONE.x, z: STONE.z, range: 1.4, standX: STONE.x + 0.9, standZ: STONE.z + 0.5, tapTargets: [oddStone] });

  // A hollow log in the long grass by the lane.
  const LOG = lanePoint(30, 2.05);
  const log = new THREE.Group();
  log.position.set(LOG.x, 0, LOG.z);
  log.rotation.y = 0.4;
  const bark = flat("#6a4a2e");
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.25, 1.4, 8, 1, true), bark);
  trunk.rotation.z = Math.PI / 2;
  trunk.position.y = 0.23;
  trunk.castShadow = true;
  const inside = new THREE.Mesh(new THREE.CircleGeometry(0.2, 8), flat("#2a1c12"));
  inside.position.set(0.7, 0.23, 0);
  inside.rotation.y = Math.PI / 2;
  const ringEnd = new THREE.Mesh(new THREE.RingGeometry(0.2, 0.25, 8), flat("#b08a5a"));
  ringEnd.position.set(-0.7, 0.23, 0);
  ringEnd.rotation.y = -Math.PI / 2;
  log.add(trunk, inside, ringEnd);
  const coin = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.012, 12), new THREE.MeshStandardMaterial({ color: "#c07a3a", metalness: 0.7, roughness: 0.35 }));
  coin.position.set(0.95, 0.01, 0.1);
  coin.visible = false;
  log.add(coin);
  scene.add(log);
  block(LOG.x, LOG.z, 0.45);
  spots.push({ id: "secret:log", label: "Look", x: LOG.x, z: LOG.z, range: 1.5, standX: LOG.x - 1.0, standZ: LOG.z + 0.3, tapTargets: [log] });

  // Under the roots of a big tree near the top of the lane: too dark to see, until the lantern.
  const CHALK = lanePoint(33, -2.3);
  const ROOTS = lanePoint(33.4, -3.6);
  const chalkTex = (() => {
    const c = document.createElement("canvas");
    c.width = c.height = 128;
    const g = c.getContext("2d")!;
    g.strokeStyle = "rgba(245,242,230,0.92)";
    g.lineWidth = 5;
    g.lineCap = g.lineJoin = "round";
    // a little lantern...
    g.strokeRect(34, 40, 32, 42);
    g.beginPath();
    g.moveTo(30, 40); g.lineTo(50, 24); g.lineTo(70, 40);
    g.moveTo(50, 24); g.lineTo(50, 14);
    g.moveTo(44, 70); g.quadraticCurveTo(50, 50, 56, 70);
    // ...and an arrow pointing north, up the trail
    g.moveTo(96, 96); g.lineTo(96, 34);
    g.moveTo(84, 48); g.lineTo(96, 34); g.lineTo(108, 48);
    g.stroke();
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  })();
  const chalk = new THREE.Mesh(new THREE.PlaneGeometry(0.75, 0.75), new THREE.MeshBasicMaterial({ map: chalkTex, transparent: true, opacity: found("leg1:chalk") ? 0.9 : 0, depthWrite: false }));
  const roots = new THREE.Group();
  roots.position.set(ROOTS.x, 0, ROOTS.z);
  const face = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.1, 0.5), flat("#5a544c"));
  face.position.y = 0.55;
  face.castShadow = face.receiveShadow = true;
  roots.add(face);
  for (let i = 0; i < 5; i++) {
    const r = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.08, 1.4, 5), bark);
    r.position.set(-0.7 + i * 0.35, 1.05, 0.15);
    r.rotation.z = (i - 2) * 0.35;
    r.rotation.x = 0.5;
    roots.add(r);
  }
  // the face looks toward the lane
  const toLane = Math.atan2(CHALK.x - ROOTS.x, CHALK.z - ROOTS.z);
  roots.rotation.y = toLane;
  chalk.position.set(0, 0.6, 0.26);
  roots.add(chalk);
  scene.add(roots);
  block(ROOTS.x, ROOTS.z, 0.7);
  spots.push({ id: "secret:chalk", label: "Look", x: CHALK.x, z: CHALK.z, range: 1.5, standX: CHALK.x + (CHALK.x - ROOTS.x) * 0.6, standZ: CHALK.z + (CHALK.z - ROOTS.z) * 0.6, tapTargets: [roots] });

  // ---------- Della's back gate: latched from the lane side (the first shortcut) ----------
  const gateOpen = () => save.shortcuts.includes("leg1:gate");
  const backGate = new THREE.Group();
  // hinged at one end of the gap in the fence
  const tx = Math.cos(BACK.a), tz = -Math.sin(BACK.a); // along the fence
  backGate.position.set(BACK.x - tx * 0.95, 0, BACK.z - tz * 0.95);
  const leaf = new THREE.Mesh(new THREE.BoxGeometry(1.85, 0.75, 0.06), plank);
  leaf.geometry.translate(0.93, 0.45, 0);
  leaf.castShadow = true;
  const latch = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.06, 0.1), flat("#3b3631"));
  latch.position.set(1.75, 0.6, 0.06);
  backGate.add(leaf, latch);
  scene.add(backGate);
  for (const k of [-1, 1]) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1.0, 0.12), plank);
    post.position.set(BACK.x + tx * 0.98 * k, 0.5, BACK.z + tz * 0.98 * k);
    scene.add(post);
  }
  const closedRy = BACK.a, openRy = BACK.a - 1.7;
  backGate.rotation.y = gateOpen() ? openRy : closedRy;
  const gateBlock: Blocker = { x: BACK.x, z: BACK.z, r: 0.8 };
  const gateSpots: Spot[] = [
    { id: "gate:inside", label: "Look", x: BACK.x - BACK.ox * 0.6, z: BACK.z - BACK.oz * 0.6, range: 1.4, standX: BACK.x - BACK.ox * 1.3, standZ: BACK.z - BACK.oz * 1.3, tapTargets: [backGate] },
    { id: "gate:outside", label: "Unlatch", x: BACK.x + BACK.ox * 0.6, z: BACK.z + BACK.oz * 0.6, range: 1.4, standX: BACK.x + BACK.ox * 1.3, standZ: BACK.z + BACK.oz * 1.3, tapTargets: [] },
  ];
  if (!gateOpen()) {
    blockers.push(gateBlock);
    spots.push(...gateSpots);
  }
  let gateSwing = 0; // 0 → 1 while it swings open

  // ---------- the traveler ----------
  const traveler = makePerson(look);
  scene.add(traveler.root);
  const frameHooks: ((dt: number) => void)[] = [];
  const tools = carryTools(traveler);
  tools.set(save.tools);
  frameHooks.push((dt) => tools.update(dt));

  /** Secret found: write it down, and say how many of Leg 1's you have. */
  const findSecret = (id: string, text: string) => {
    if (!save.secrets.includes(id)) save.secrets.push(id);
    ctx.changed();
    const n = LEG1_SECRETS.filter(found).length;
    return `${text} (Secret found: ${n} of ${LEG1_SECRETS.length} in Leg 1)`;
  };
  let stoneRoll = 0; // 0 → 1 while the stone rolls aside
  let chalkShow = 0; // 0 → 1 while the chalk mark appears

  // ---------- things to pick ----------
  const pickables = new Pickables(spots, gather, today);
  scene.add(pickables.group);
  const pick = (spotId: string, id: ItemId, x: number, z: number, y = 0, stand?: { x: number; z: number; range: number }) =>
    pickables.add(spotId, id, x, z, y).then(() => {
      const s = spots.find((sp) => sp.id === spotId);
      if (s && stand) Object.assign(s, { standX: stand.x, standZ: stand.z, range: stand.range });
    });

  // ---------- dress with the kit models ----------
  async function dress() {
    const people = dressTraveler(traveler, frameHooks);
    const dellaReady = loadKayKit(loader, BASE).then((loaded) => {
      frameHooks.push(wearKayKit(della, loaded, (l) => l.cast ?? "della", della.look, 0.92));
    });

    // Della's cottage: door and two windows facing the yard; the lantern window is nearest the start
    const home = await buildCottage({
      w: COTTAGE.w,
      d: COTTAGE.d,
      brick: false,
      sides: { "+x": ["window", "door", "window"], "+z": ["window", "wall"] },
      glow: windowGlow,
    });
    cottage.add(home);
    windowSpot.tapTargets.push(home);

    // the neighbors along the lane
    const neighbors: { id: string; at: { x: number; z: number }; face: number; brick: boolean }[] = [
      { id: "tansy", at: lanePoint(7, 6.6), face: -Math.PI / 2, brick: true },
      { id: "millers", at: lanePoint(24, -6.4), face: Math.PI / 2, brick: false },
      { id: "oakes", at: lanePoint(36, 6.4), face: -Math.PI / 2, brick: true },
    ];
    for (const n of neighbors) {
      const h = await buildCottage({ w: 4, d: 4, brick: n.brick, sides: { "+z": ["door", "window"], "+x": ["window", "wall"] }, glow: windowGlow });
      // "+z" is the front; turn it to face the lane
      h.position.set(n.at.x, 0, n.at.z);
      h.rotation.y = n.face + Math.PI / 2;
      scene.add(h);
      houseBox(n.at.x, n.at.z, 4, 4);
      const front = new THREE.Vector3(0, 0, 3.3).applyAxisAngle(new THREE.Vector3(0, 1, 0), h.rotation.y);
      spots.push({ id: n.id, label: "Look", x: n.at.x + front.x * 0.75, z: n.at.z + front.z * 0.75, range: 2.6, standX: n.at.x + front.x, standZ: n.at.z + front.z, tapTargets: [h] });
    }

    const [fence, fence2, tree, apples, crate, lantern] = await Promise.all([
      model("village", "Prop_WoodenFence_Single"),
      model("village", "Prop_WoodenFence_Extension1"),
      model("nature", "CommonTree_2"),
      model("props", "Barrel_Apples"),
      model("props", "FarmCrate_Empty"),
      model("props", "Lantern_Wall"),
    ]);
    const kit = new THREE.Group();

    // the yard fence: a ring of pickets, open at the garden gate (north) and the way back (south)
    const step = FENCE_STEP;
    for (let a = step / 2; a < Math.PI * 2; a += step) {
      if (Math.abs(a - BACK.a) < 0.01) continue; // the back gate goes here
      const x = YARD.x + Math.sin(a) * FENCE_R, z = YARD.z + Math.cos(a) * FENCE_R;
      if (x < COTTAGE.x + COTTAGE.w / 2 + 0.3) continue; // the cottage is the fence on that side
      if (Math.abs(x) < 1.6) continue; // gaps north (gate) and south (the way back to camp)
      kit.add(place((Math.round(a / step) % 2 ? fence : fence2).clone(), x, 0, z, a));
      for (const k of [-0.7, 0, 0.7]) block(x + Math.cos(a) * k, z - Math.sin(a) * k, 0.2);
    }
    // the garden gate: two posts and the gate swung open
    for (const side of [-1, 1]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.14, 1.1, 0.14), signWood);
      post.position.set(side * 1.45, 0.55, YARD.z - FENCE_R + 0.05);
      post.castShadow = true;
      kit.add(post);
      block(post.position.x, post.position.z, 0.18);
    }
    const gate = new THREE.Mesh(new THREE.BoxGeometry(1.25, 0.75, 0.06), plank);
    gate.geometry.translate(0.62, 0.45, 0);
    gate.position.set(1.4, 0, YARD.z - FENCE_R + 0.05);
    gate.rotation.y = 1.9;
    gate.castShadow = true;
    kit.add(gate);

    // the apple tree, with apples up high (the stick will knock them down one day)
    kit.add(place(tree, TREE.x, 0, TREE.z, 0.8, 0.75));
    appleTreeSpot.tapTargets.push(tree);
    const appleMat = flat("#c0392b");
    const appleGeo = new THREE.IcosahedronGeometry(0.07, 1);
    const hanging = new THREE.InstancedMesh(appleGeo, appleMat, 14);
    const arnd = seeded(3);
    for (let i = 0; i < 14; i++) {
      const a = arnd() * Math.PI * 2, y = 2.6 + arnd() * 1.6, r = 1.2 + arnd() * 0.4;
      hanging.setMatrixAt(i, new THREE.Matrix4().makeTranslation(TREE.x + Math.cos(a) * r, y, TREE.z + Math.sin(a) * r));
    }
    kit.add(hanging);
    // a barrel of picked apples and an empty crate by Della's door
    kit.add(place(apples, doorX + 0.3, 0, COTTAGE.z - 2.2, 0.3, 0.9));
    kit.add(place(crate, doorX + 0.1, 0, COTTAGE.z + 0.9, 1.2, 0.9));
    block(doorX + 0.3, COTTAGE.z - 2.2, 0.4);
    // the lane lanterns hang from their posts
    for (const lp of postGroups) {
      const l = place(lantern.clone(), 0, 1.15, 0, 0, 0.7);
      lp.add(l);
      const g = lp.children.find((ch) => (ch as THREE.Sprite).isSprite)!;
      g.position.set(0, 1.85, 0.7);
    }
    scene.add(kit);

    // ---------- the things to pick (each grows back the next day) ----------
    const bedFront = { z: BED.z + 1.1, range: 1.6 };
    await Promise.all([
      pick("leg1:thyme:1", "thyme", BED.x - 1.2, BED.z - 0.2, 0.2, { x: BED.x - 1.2, z: bedFront.z, range: bedFront.range }),
      pick("leg1:chives:1", "chives", BED.x - 0.6, BED.z + 0.2, 0.2, { x: BED.x - 0.6, z: bedFront.z, range: bedFront.range }),
      pick("leg1:sage:1", "sage", BED.x, BED.z - 0.15, 0.2, { x: BED.x, z: bedFront.z, range: bedFront.range }),
      pick("leg1:chives:2", "chives", BED.x + 0.6, BED.z + 0.2, 0.2, { x: BED.x + 0.6, z: bedFront.z, range: bedFront.range }),
      pick("leg1:thyme:2", "thyme", BED.x + 1.2, BED.z - 0.2, 0.2, { x: BED.x + 1.2, z: bedFront.z, range: bedFront.range }),
      pick("leg1:egg:1", "egg", HEN_HOME.x + 0.3, HEN_HOME.z - 1.5),
      pick("leg1:egg:2", "egg", COOP.x + 0.9, COOP.z + 1.3),
      pick("leg1:apple:1", "apple", TREE.x - 1.0, TREE.z - 0.6),
      pick("leg1:apple:2", "apple", TREE.x + 0.8, TREE.z - 1.0),
      pick("leg1:apple:3", "apple", TREE.x - 0.4, TREE.z + 1.1),
      pick("leg1:chamomile:1", "chamomile", lanePoint(3, -1.9).x, lanePoint(3, -1.9).z),
      pick("leg1:chamomile:2", "chamomile", lanePoint(13, 1.9).x, lanePoint(13, 1.9).z),
      pick("leg1:chamomile:3", "chamomile", lanePoint(27, 1.9).x, lanePoint(27, 1.9).z),
      pick("leg1:chamomile:4", "chamomile", lanePoint(34.5, 1.9).x, lanePoint(34.5, 1.9).z),
      pick("leg1:mushroom:1", "mushroom", lanePoint(10, -2.0).x, lanePoint(10, -2.0).z),
      pick("leg1:mushroom:2", "mushroom", lanePoint(22, 2.0).x, lanePoint(22, 2.0).z),
      pick("leg1:mushroom:3", "mushroom", lanePoint(28.5, -2.0).x, lanePoint(28.5, -2.0).z),
    ]);

    // ---------- nature ----------
    const treeNames = ["CommonTree_1", "CommonTree_2", "CommonTree_3", "CommonTree_4", "CommonTree_5", "Pine_1", "Pine_2", "Pine_3", "Pine_4", "Pine_5"];
    const trees = await Promise.all(treeNames.map((n) => model("nature", n)));
    const plantNames = [
      "Bush_Common", "Bush_Common_Flowers", "Grass_Common_Short", "Grass_Common_Tall", "Grass_Wispy_Tall", "Flower_3_Group",
      "Flower_4_Group", "Flower_3_Single", "Fern_1", "Clover_1", "Clover_2", "Plant_7_Big", "Pebble_Round_1", "Pebble_Round_3",
      "Rock_Medium_1", "Rock_Medium_2",
    ] as const;
    const plants = Object.fromEntries(await Promise.all(plantNames.map(async (n) => [n, await model("nature", n)] as const))) as Record<
      (typeof plantNames)[number],
      THREE.Object3D
    >;

    const rnd = seeded(17);
    const up = new THREE.Vector3(0, 1, 0);
    const groups = new Map<THREE.Object3D, THREE.Matrix4[]>();
    const add = (o: THREE.Object3D, x: number, z: number, s: number, ry = rnd() * Math.PI * 2) => {
      if (!groups.has(o)) groups.set(o, []);
      groups.get(o)!.push(new THREE.Matrix4().compose(new THREE.Vector3(x, heightAt(x, z), z), new THREE.Quaternion().setFromAxisAngle(up, ry), new THREE.Vector3(s, s, s)));
    };
    /** Houses and the yard's things need a clear patch around them. */
    const houses = [{ x: COTTAGE.x, z: COTTAGE.z, r: 4.2 }, ...neighbors.map((n) => ({ x: n.at.x, z: n.at.z, r: 3.6 }))];
    const nearHouse = (x: number, z: number, pad: number) => houses.some((h) => Math.hypot(x - h.x, z - h.z) < h.r + pad);
    const taken = (x: number, z: number, pad: number) =>
      blockers.some((b) => Math.hypot(x - b.x, z - b.z) < b.r + pad) || spots.some((s) => Math.hypot(x - s.x, z - s.z) < 0.6 + pad);

    // woods all around, thick away from the lane, with a few trees right at its edge for shade
    for (let i = 0; i < 520; i++) {
      const x = -38 + rnd() * 76, z = 22 - rnd() * 100;
      const out = outside(walk, x, z);
      if (out < 2.2 || nearHouse(x, z, 1.5)) continue;
      // keep the meadow south of the yard open: the camera sits there when you arrive
      if (z > YARD.z + 4 && Math.abs(x) < 16) continue;
      if (out < 6 && rnd() < 0.6) continue; // thinner close in, so the lane feels open
      add(trees[Math.floor(rnd() * trees.length)], x, z, 0.7 + rnd() * 0.45);
    }
    // hedges and bushes at the edges of the walkable ground
    for (let i = 0; i < 160; i++) {
      const x = -20 + rnd() * 40, z = 12 - rnd() * 68;
      const out = outside(walk, x, z);
      if (out < 0.5 || out > 2.2 || nearHouse(x, z, 0.3)) continue;
      add(rnd() < 0.6 ? plants.Bush_Common : plants.Bush_Common_Flowers, x, z, 0.55 + rnd() * 0.35);
    }
    // grass, clover and flowers everywhere you walk, keeping clear of the pickables
    const smalls: [THREE.Object3D, number, number][] = [
      [plants.Grass_Common_Short, 0.32, 160],
      [plants.Grass_Common_Tall, 0.28, 70],
      [plants.Grass_Wispy_Tall, 0.28, 60],
      [plants.Clover_1, 0.3, 40],
      [plants.Clover_2, 0.3, 30],
      [plants.Flower_3_Group, 0.28, 30],
      [plants.Flower_4_Group, 0.26, 30],
      [plants.Flower_3_Single, 0.3, 20],
      [plants.Plant_7_Big, 0.35, 14],
      [plants.Fern_1, 0.09, 30],
      [plants.Pebble_Round_1, 0.6, 20],
      [plants.Pebble_Round_3, 0.6, 20],
    ];
    for (const [o, s, n] of smalls) {
      let placed = 0;
      for (let tries = 0; placed < n && tries < n * 10; tries++) {
        const x = -14 + rnd() * 28, z = 9 - rnd() * 64;
        const out = outside(walk, x, z);
        if (out > 3 || nearHouse(x, z, 0) || taken(x, z, 0.3) || spineDist(x, z) < 0.9) continue;
        add(o, x, z, s * (0.8 + rnd() * 0.5));
        placed++;
      }
    }
    for (const [o, at, s] of [
      [plants.Rock_Medium_1, lanePoint(17, 3.6), 0.4],
      [plants.Rock_Medium_2, lanePoint(29, -3.4), 0.45],
      [plants.Rock_Medium_1, { x: -3.5, z: 5.8 }, 0.35],
    ] as const) {
      add(o, at.x, at.z, s);
      block(at.x, at.z, s * 2.4);
    }
    for (const [o, list] of groups) kit.add(instanced(o, list));
    await Promise.all([people, dellaReady]);
  }

  const ready = dress().catch((err) => console.warn("Leg 1 models did not load:", err));

  const leg: Area = {
    scene,
    camera,
    traveler,
    blockers,
    spots,
    walk,
    cameraBlocks,
    start: { x: 0, z: 5.6, facing: Math.PI },
    notes: NOTES,
    ready,
    pick: (spot, toward) => pickables.pick(spot, toward),
    use(spot) {
      switch (spot.id) {
        case "appletree": {
          if (!has("stick") || gather.picked["leg1:knock"] === today) return null;
          gather.picked["leg1:knock"] = today;
          ctx.changed();
          [[-0.9, 0.7], [0.6, 1.0], [1.1, -0.5]].forEach(([dx, dz], i) =>
            void pickables.add(`leg1:apple:k${i + 1}`, "apple", TREE.x + dx, TREE.z + dz, 0, undefined, 3 + i * 0.4),
          );
          return "You reach up with the walking stick and tap the lowest branch. Thump, thump, thump: three apples drop into the grass.";
        }
        case "secret:stone":
          if (found("leg1:stone")) return "The pale stone sits where you rolled it. Just a stone now, and a dry little hollow.";
          if (!has("stick")) return "This stone looks a little off: paler than the rest, with a crack all the way around. Hollow, maybe? You'd need something to tap it with.";
          stoneRoll = 0.001;
          return findSecret("leg1:stone", "Tok, tok. Hollow! The stone rolls aside, and in the hollow underneath, pressed flat in a twist of paper, is a four-leaf clover.");
        case "secret:log":
          if (found("leg1:log")) return "The hollow log. You give it a friendly tap. Nothing rattles now.";
          if (!has("stick")) return "An old log, hollow at one end. Something about it makes you want to give it a knock.";
          coin.visible = true;
          return findSecret("leg1:log", "Tok, tok, rattle. An old copper coin rolls out of the log, stamped with a little fox.");
        case "secret:chalk":
          if (found("leg1:chalk")) return "Della's chalk mark: a little lantern, and an arrow pointing north up the trail.";
          if (!has("lantern")) return "It's too dark under these roots to see anything. There might be something there.";
          chalkShow = 0.001;
          return findSecret("leg1:chalk", "You hold the lantern close. There, in chalk: a little lantern and an arrow pointing north. Della's mark! She walked this way once.");
        case "gate:outside":
          if (!save.shortcuts.includes("leg1:gate")) save.shortcuts.push("leg1:gate");
          ctx.changed();
          blockers.splice(blockers.indexOf(gateBlock), 1);
          for (const g of gateSpots) if (spots.includes(g)) spots.splice(spots.indexOf(g), 1);
          gateSwing = 0.001;
          return "You lift the latch and Della's back gate swings open. A shortcut from the lane straight into her yard.";
      }
      return null;
    },
    interest(x, z) {
      // the fox only notices the odd stone and the hollow log (the chalk needs the lantern)
      for (const [id, at] of [["leg1:stone", STONE], ["leg1:log", LOG]] as const) {
        if (!found(id) && Math.hypot(at.x - x, at.z - z) < 6) return at;
      }
      return null;
    },
    refresh() {
      tools.set(save.tools);
    },
    update(dt, time) {
      // labels follow what you can do now
      const appleSpot = spots.find((s) => s.id === "appletree");
      if (appleSpot) appleSpot.label = has("stick") && gather.picked["leg1:knock"] !== today ? "Knock" : "Look";
      for (const s of spots) {
        if (s.id === "secret:stone" || s.id === "secret:log") s.label = has("stick") && !found(s.id.replace("secret:", "leg1:")) ? "Tap" : "Look";
        if (s.id === "secret:chalk") s.label = has("lantern") && !found("leg1:chalk") ? "Shine" : "Look";
      }
      if (stoneRoll > 0 && stoneRoll < 1) {
        stoneRoll = Math.min(1, stoneRoll + dt * 1.5);
        oddStone.position.x = STONE.x + stoneRoll * 0.55;
        stoneBody.rotation.z = -stoneRoll * Math.PI;
      }
      if (chalkShow > 0 && chalkShow < 1) {
        chalkShow = Math.min(1, chalkShow + dt * 0.7);
        (chalk.material as THREE.MeshBasicMaterial).opacity = chalkShow * 0.9;
      }
      if (gateSwing > 0 && gateSwing < 1) {
        gateSwing = Math.min(1, gateSwing + dt * 1.2);
        backGate.rotation.y = closedRy + (openRy - closedRy) * (1 - Math.pow(1 - gateSwing, 3));
      }
      const flicker = Math.sin(time * 9) * 0.4 + Math.sin(time * 15.3) * 0.3 + Math.sin(time * 4.1) * 0.3;
      lanternLight.intensity = 9 + flicker * 1.5;
      for (const g of glows) g.material.opacity = 0.75 + flicker * 0.06;
      endGlow.material.opacity = 0.35 + Math.sin(time * 2) * 0.15;

      // the hens potter about, stop to peck, and potter some more
      for (const h of hens) {
        const p = h.root.position;
        const dx = h.target.x - p.x, dz = h.target.y - p.z;
        const d = Math.hypot(dx, dz);
        if (h.wait > 0) {
          h.wait -= dt;
          h.peck += dt;
          h.head.position.y = 0.36 - Math.max(0, Math.sin(h.peck * 9)) * 0.1;
          h.head.position.z = 0.13 + Math.max(0, Math.sin(h.peck * 9)) * 0.05;
          if (h.wait <= 0) {
            const a = henRnd() * Math.PI * 2, r = henRnd() * HEN_HOME.r;
            h.target.set(HEN_HOME.x + Math.cos(a) * r, HEN_HOME.z + Math.sin(a) * r);
          }
        } else if (d < 0.05) {
          h.wait = 1 + henRnd() * 3;
        } else {
          const sp = Math.min(0.45, d * 2) * dt;
          p.x += (dx / d) * sp;
          p.z += (dz / d) * sp;
          h.root.rotation.y = Math.atan2(dx, dz);
          p.y = Math.abs(Math.sin(time * 14)) * 0.025; // a little bob as they walk
          h.head.position.set(0, 0.36, 0.13 + Math.sin(time * 14) * 0.02);
        }
      }

      pickables.update(dt, time);

      const tp = traveler.root.position;
      sun.target.position.set(tp.x, 0, tp.z);
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
  leg.resize();
  return leg;
}
