// Inside your tent at camp: a little canvas room lit by a hanging lantern.
// Milestone 4 part 1: the bedroll (rest here, like at the fire), the mirror
// (your portrait will appear in it as you go), a keepsake shelf (it fills up
// in later parts) and a cozy corner the fox has already picked for its bed.
//
// The room is drawn like a dollhouse: every wall and the roof only shows its
// inside face, so whichever wall is between you and the camera simply isn't
// drawn, and the camera can hang back outside the tent as it does at camp.
//
// Directions: like camp, the camera starts looking north (toward -z). The door
// is on the south wall (+z), the mirror stands against the north wall.

import * as THREE from "three";
import { makePerson, type PersonLook } from "../scene/people";
import { model, place } from "../scene/kits";
import { carryTools, dressTraveler } from "./dressTraveler";
import { glowTexture, type Area, type Blocker, type Capsule, type Spot } from "./area";
import type { Save } from "../save";
import { JOURNAL_KEEPSAKES } from "../journal/loot";
import { buildFoxBasket } from "./build";
import { cardFace, cardTexture } from "./cardTexture";

/** What the tent shows of your progress. */
export type TentSave = Pick<Save, "tools" | "firstLine" | "portraitStage" | "loot" | "built" | "shelf">;

/** Half the tent's width (x) and depth (z), the side walls' height and the ridge's, in meters. */
const HW = 2.6;
const HD = 2.9;
const WALL = 1.05;
const RIDGE = 3.3;
/** Just inside the door, facing in: where you arrive. */
export const TENT_START = { x: 0, z: 1.45, facing: Math.PI };

const NOTES: Record<string, string[]> = {
  shelf: [
    "A little shelf, empty for now. There's room for the things you'll find along the trail.",
    "Della always said a home is just a shelf of things that remind you of people.",
  ],
  foxbed: [
    "The fox keeps curling up in this corner. It could use a proper bed.",
    "Maybe something soft from the trail would do. Moss, or wool, or both.",
  ],
  lantern: [
    "The lantern sways a little on its hook when the wind tugs the canvas.",
    "Inside, the storm feels very far away.",
  ],
  crate: [
    "An upturned crate makes a fine bedside table. The candle on it has burned down a little.",
  ],
};

const flat = (color: string, extra: Partial<THREE.MeshStandardMaterialParameters> = {}) =>
  new THREE.MeshStandardMaterial({ color, flatShading: true, roughness: 0.95, ...extra });

/** Old canvas: a warm cream with faint seams and a couple of patches. */
function canvasTexture(): THREE.Texture {
  const c = document.createElement("canvas");
  c.width = c.height = 256;
  const g = c.getContext("2d")!;
  g.fillStyle = "#e7d7b2";
  g.fillRect(0, 0, 256, 256);
  // a soft weave
  for (let i = 0; i < 1400; i++) {
    g.fillStyle = `rgba(120,90,50,${Math.random() * 0.05})`;
    g.fillRect(Math.random() * 256, Math.random() * 256, 1 + Math.random() * 3, 1);
  }
  // seams
  g.strokeStyle = "rgba(110,80,45,0.35)";
  g.lineWidth = 2;
  for (const x of [64, 192]) {
    g.beginPath();
    g.moveTo(x, 0);
    g.lineTo(x, 256);
    g.stroke();
  }
  // a patch, with little stitches
  g.fillStyle = "#d6c29a";
  g.fillRect(150, 140, 46, 38);
  g.strokeStyle = "rgba(90,60,35,0.55)";
  g.lineWidth = 1.5;
  g.setLineDash([4, 3]);
  g.strokeRect(152, 142, 42, 34);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

/** A woven rug: rings of red, ochre and cream. */
function rugTexture(): THREE.Texture {
  const c = document.createElement("canvas");
  c.width = c.height = 256;
  const g = c.getContext("2d")!;
  const rings = ["#8e3b2e", "#c99a4a", "#8e3b2e", "#e8d6ae", "#6c7a4a", "#e8d6ae", "#8e3b2e"];
  rings.forEach((col, i) => {
    g.fillStyle = col;
    g.beginPath();
    g.arc(128, 128, 128 - i * 17, 0, Math.PI * 2);
    g.fill();
  });
  for (let i = 0; i < 900; i++) {
    g.fillStyle = `rgba(40,20,10,${Math.random() * 0.08})`;
    g.fillRect(Math.random() * 256, Math.random() * 256, 2, 1);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/**
 * One flat piece of wall or roof between four corners, showing only the face
 * that looks into the room (toward `inside`). UVs run in meters, so the canvas
 * texture keeps the same size everywhere.
 */
function panel(a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, d: THREE.Vector3, inside: THREE.Vector3, mat: THREE.Material) {
  const n = new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(d, a));
  const center = new THREE.Vector3().add(a).add(b).add(c).add(d).multiplyScalar(0.25);
  const faces = n.dot(new THREE.Vector3().subVectors(inside, center)) > 0;
  const pts = faces ? [a, b, c, d] : [a, d, c, b];
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pts.flatMap((p) => [p.x, p.y, p.z]), 3));
  const w = a.distanceTo(b) / 2.5, h = a.distanceTo(d) / 2.5;
  const uv = faces ? [0, 0, w, 0, w, h, 0, h] : [0, 0, 0, h, w, h, w, 0];
  geo.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex([0, 1, 2, 0, 2, 3]);
  geo.computeVertexNormals();
  const m = new THREE.Mesh(geo, mat);
  m.receiveShadow = true;
  return m;
}

/** A gable end (the front or back wall): a box below and a triangle up to the ridge. */
function gable(z: number, inside: THREE.Vector3, mat: THREE.Material, doorHalf = 0) {
  const g = new THREE.Group();
  const v = (x: number, y: number) => new THREE.Vector3(x, y, z);
  if (doorHalf > 0) {
    // two walls either side of an open doorway, and the bit above it
    g.add(panel(v(-HW, 0), v(-doorHalf, 0), v(-doorHalf, WALL), v(-HW, WALL), inside, mat));
    g.add(panel(v(doorHalf, 0), v(HW, 0), v(HW, WALL), v(doorHalf, WALL), inside, mat));
  } else {
    g.add(panel(v(-HW, 0), v(HW, 0), v(HW, WALL), v(-HW, WALL), inside, mat));
  }
  // the triangle (made from a squashed quad so the same helper does it)
  const top = doorHalf > 0 ? 2.15 : WALL;
  if (doorHalf > 0) {
    // slanted wall pieces beside the doorway, from the wall top up to the door's head
    const slope = (x: number) => WALL + (RIDGE - WALL) * (1 - Math.abs(x) / HW);
    g.add(panel(v(-HW, WALL), v(-doorHalf, WALL), v(-doorHalf, slope(doorHalf)), v(-HW, WALL + 0.001), inside, mat));
    g.add(panel(v(doorHalf, WALL), v(HW, WALL), v(HW, WALL + 0.001), v(doorHalf, slope(doorHalf)), inside, mat));
    g.add(panel(v(-doorHalf, top), v(doorHalf, top), v(doorHalf, slope(doorHalf)), v(-doorHalf, slope(doorHalf)), inside, mat));
    g.add(panel(v(-doorHalf, slope(doorHalf)), v(doorHalf, slope(doorHalf)), v(0, RIDGE), v(0, RIDGE), inside, mat));
  } else {
    g.add(panel(v(-HW, WALL), v(HW, WALL), v(0, RIDGE), v(0, RIDGE), inside, mat));
  }
  return g;
}

/**
 * The mirror's picture: your traveler's portrait as a soft pencil sketch (Act 1).
 * Drawn small, turned to graphite on warm paper, then scaled up so it stays soft.
 */
function sketchTexture(portraitSvg: string): Promise<THREE.Texture> {
  return new Promise((ok, fail) => {
    const img = new Image();
    img.onload = () => {
      const small = document.createElement("canvas");
      small.width = 80;
      small.height = 96;
      const s = small.getContext("2d")!;
      s.drawImage(img, 0, 0, 80, 96);
      const px = s.getImageData(0, 0, 80, 96);
      const d = px.data;
      for (let i = 0; i < d.length; i += 4) {
        const a = d[i + 3] / 255;
        // graphite: dark lines stay, light areas fade to the paper
        const lum = (0.3 * d[i] + 0.59 * d[i + 1] + 0.11 * d[i + 2]) / 255;
        const ink = Math.pow(1 - lum, 0.8) * a * 0.95;
        d[i] = 236 - ink * 170;
        d[i + 1] = 228 - ink * 172;
        d[i + 2] = 210 - ink * 170;
        d[i + 3] = 255;
      }
      s.putImageData(px, 0, 0);
      const big = document.createElement("canvas");
      big.width = 200;
      big.height = 240;
      const b = big.getContext("2d")!;
      b.imageSmoothingQuality = "high";
      b.drawImage(small, 0, 0, 200, 240);
      const tex = new THREE.CanvasTexture(big);
      tex.colorSpace = THREE.SRGBColorSpace;
      ok(tex);
    };
    img.onerror = fail;
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(portraitSvg)}`;
  });
}

export function createTentInside(renderer: THREE.WebGLRenderer, look: PersonLook, save?: TentSave, portraitSvg?: string): Area {
  const scene = new THREE.Scene();
  const night = new THREE.Color("#1c1820");
  scene.background = night;
  const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);

  // ---------- light: the hanging lantern does most of the work ----------
  scene.add(new THREE.HemisphereLight("#f1cf9f", "#3a2c24", 0.9));
  const lampLight = new THREE.PointLight("#ffb866", 11, 9, 1.4);
  lampLight.position.set(0, 2.35, -0.2);
  scene.add(lampLight);
  const candleLight = new THREE.PointLight("#ffa860", 2.5, 3.5, 1.8);
  scene.add(candleLight);

  const blockers: Blocker[] = [];
  const spots: Spot[] = [];
  const block = (x: number, z: number, r: number) => blockers.push({ x, z, r });
  const inside = new THREE.Vector3(0, 1.3, 0);

  // ---------- the canvas room ----------
  const canvasMat = new THREE.MeshStandardMaterial({ map: canvasTexture(), roughness: 1, side: THREE.FrontSide });
  const room = new THREE.Group();
  scene.add(room);
  // floor: a ground cloth over packed earth
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(HW * 2, HD * 2), flat("#7d6448"));
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  room.add(floor);
  const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
  for (const s of [-1, 1]) {
    // a low side wall, then the roof sloping up to the ridge
    room.add(panel(V(s * HW, 0, -HD), V(s * HW, 0, HD), V(s * HW, WALL, HD), V(s * HW, WALL, -HD), inside, canvasMat));
    room.add(panel(V(s * HW, WALL, -HD), V(s * HW, WALL, HD), V(0, RIDGE, HD), V(0, RIDGE, -HD), inside, canvasMat));
  }
  room.add(gable(-HD, inside, canvasMat));
  room.add(gable(HD, inside, canvasMat, 0.7));
  // the wooden frame: just the back pole. The front pole and the ridge pole are
  // left out: seen from the camera they'd draw a dark stripe right through the room.
  const wood = flat("#6b4a2c");
  for (const z of [-HD + 0.08]) {
    const p = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, RIDGE, 7), wood);
    p.position.set(0, RIDGE / 2, z);
    room.add(p);
    block(0, z, 0.15);
  }
  // a dusky glimpse of outside through the doorway
  const outside = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 2.15), new THREE.MeshBasicMaterial({ color: "#3c3f5c" }));
  outside.position.set(0, 1.075, HD + 0.05);
  outside.rotation.y = Math.PI;
  room.add(outside);
  // the round rug in the middle
  const rug = new THREE.Mesh(new THREE.CircleGeometry(1.25, 28), new THREE.MeshStandardMaterial({ map: rugTexture(), roughness: 1 }));
  rug.rotation.x = -Math.PI / 2;
  rug.position.set(0, 0.012, 0.15);
  rug.receiveShadow = true;
  room.add(rug);
  // the door: walking back out to camp
  spots.push({ id: "exit:outside", label: "Go out", x: 0, z: HD - 0.2, range: 1.0, standX: 0, standZ: HD - 0.6, tapTargets: [outside] });

  // ---------- the hanging lantern ----------
  const glowTex = glowTexture();
  const lantern = new THREE.Group();
  lantern.position.set(0, RIDGE - 0.1, -0.2);
  room.add(lantern);
  const chain = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.55, 4), flat("#3b3631"));
  chain.position.y = -0.27;
  lantern.add(chain);
  const lampGlass = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.26, 0.2), new THREE.MeshStandardMaterial({ color: "#ffe2a0", emissive: "#ffb050", emissiveIntensity: 1.8 }));
  lampGlass.position.y = -0.7;
  lampGlass.name = "standin-lamp";
  lantern.add(lampGlass);
  const lampGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: "#ffc070", transparent: true, opacity: 0.75, blending: THREE.AdditiveBlending, depthWrite: false }));
  lampGlow.position.y = -0.7;
  lampGlow.scale.setScalar(1.3);
  lantern.add(lampGlow);
  spots.push({ id: "lantern", label: "Look", x: 0, z: -0.2, range: 0.9, standX: 0, standZ: 0.6, tapTargets: [lampGlass] });

  // ---------- the bedroll, along the west wall: rest here ----------
  const BED = { x: -1.85, z: -0.4 };
  const bed = new THREE.Group();
  bed.position.set(BED.x, 0, BED.z);
  room.add(bed);
  const mat = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.08, 2.0), flat("#5d4a36"));
  mat.position.y = 0.04;
  const blanket = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.1, 1.35), flat("#9a4a3a"));
  blanket.position.set(0, 0.11, 0.3);
  const fold = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.8, 8), flat("#b05a46"));
  fold.rotation.z = Math.PI / 2;
  fold.position.set(0, 0.15, -0.36);
  const pillow = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.13, 0.32), flat("#ece0c4"));
  pillow.position.set(0, 0.14, -0.78);
  pillow.rotation.y = 0.08;
  for (const m of [mat, blanket, fold, pillow]) {
    m.castShadow = m.receiveShadow = true;
    bed.add(m);
  }
  block(BED.x, BED.z - 0.5, 0.45);
  block(BED.x, BED.z + 0.5, 0.45);
  spots.push({ id: "bedroll", label: "Rest", x: BED.x, z: BED.z, range: 1.4, standX: BED.x + 0.95, standZ: BED.z + 0.2, tapTargets: [bed] });

  // a crate by the pillow, with a candle on it
  const CRATE = { x: -2.0, z: -1.95 };
  const crate = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.45, 0.5), flat("#9a7448"));
  crate.position.set(CRATE.x, 0.225, CRATE.z);
  crate.rotation.y = 0.2;
  crate.castShadow = crate.receiveShadow = true;
  room.add(crate);
  const candle = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.12, 8), flat("#f2e8cc"));
  candle.position.set(CRATE.x + 0.08, 0.51, CRATE.z);
  const flame = new THREE.Mesh(new THREE.ConeGeometry(0.02, 0.06, 6), new THREE.MeshBasicMaterial({ color: "#ffd27a" }));
  flame.position.set(CRATE.x + 0.08, 0.6, CRATE.z);
  const candleGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: "#ffb870", transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false }));
  candleGlow.position.copy(flame.position);
  candleGlow.scale.setScalar(0.45);
  room.add(candle, flame, candleGlow);
  candleLight.position.set(CRATE.x + 0.1, 0.75, CRATE.z + 0.1);
  block(CRATE.x, CRATE.z, 0.4);
  spots.push({ id: "crate", label: "Look", x: CRATE.x, z: CRATE.z, range: 1.2, standX: CRATE.x + 0.95, standZ: CRATE.z + 0.4, tapTargets: [crate] });

  // ---------- the mirror, against the north wall ----------
  const MIRROR = { x: 0.95, z: -HD + 0.35 };
  const mirror = new THREE.Group();
  mirror.position.set(MIRROR.x, 0, MIRROR.z);
  room.add(mirror);
  const frameMat = flat("#7a5532");
  for (const s of [-1, 1]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.07, 1.75, 0.07), frameMat);
    leg.position.set(s * 0.36, 0.875, 0);
    mirror.add(leg);
  }
  const frame = new THREE.Mesh(new THREE.BoxGeometry(0.66, 1.05, 0.05), frameMat);
  frame.position.set(0, 1.12, 0.01);
  mirror.add(frame);
  // the glass: dim and silvery, with a soft blur where your face will be
  const glass = new THREE.Mesh(
    new THREE.PlaneGeometry(0.54, 0.93),
    new THREE.MeshStandardMaterial({ color: "#a9b8bf", metalness: 0.6, roughness: 0.25, emissive: "#2e3438", emissiveIntensity: 0.4 }),
  );
  glass.position.set(0, 1.12, 0.04);
  mirror.add(glass);
  const smudge = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: "#e9e1d0", transparent: true, opacity: 0.22, depthWrite: false }));
  smudge.position.set(0, 1.22, 0.05);
  smudge.scale.set(0.42, 0.55, 1);
  mirror.add(smudge);
  // your portrait, still only a pencil sketch (it comes clearer each act)
  if (portraitSvg) {
    sketchTexture(portraitSvg)
      .then((tex) => {
        const sketch = new THREE.Mesh(new THREE.PlaneGeometry(0.44, 0.53), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.9, transparent: true, opacity: 0.92 }));
        sketch.position.set(0, 1.16, 0.045);
        mirror.add(sketch);
        smudge.visible = false;
      })
      .catch((err) => console.warn("Mirror sketch did not draw.", err));
  }
  // your note to your future self, tucked in the corner of the frame
  const note = new THREE.Mesh(new THREE.PlaneGeometry(0.14, 0.1), flat("#f4ecd6"));
  note.position.set(0.22, 0.75, 0.05);
  note.rotation.z = -0.18;
  note.visible = !!save?.firstLine;
  mirror.add(note);
  mirror.traverse((o) => (o.castShadow = o instanceof THREE.Mesh));
  block(MIRROR.x, MIRROR.z, 0.42);
  spots.push({ id: "mirror", label: "Look", x: MIRROR.x, z: MIRROR.z, range: 1.4, standX: MIRROR.x, standZ: MIRROR.z + 1.15, tapTargets: [mirror] });
  let mirrorLooks = 0;

  // ---------- the keepsake shelf, against the east wall ----------
  const SHELF = { x: HW - 0.3, z: -1.35 };
  const shelf = new THREE.Group();
  shelf.position.set(SHELF.x, 0, SHELF.z);
  shelf.rotation.y = -Math.PI / 2;
  room.add(shelf);
  const shelfBoards: THREE.Mesh[] = [];
  for (const s of [-1, 1]) {
    const side = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.95, 0.3), frameMat);
    side.position.set(s * 0.5, 0.475, 0);
    shelf.add(side);
  }
  for (const y of [0.08, 0.5, 0.92]) {
    const board = new THREE.Mesh(new THREE.BoxGeometry(1.05, 0.04, 0.32), frameMat);
    board.position.y = y;
    shelf.add(board);
    shelfBoards.push(board);
  }
  shelf.traverse((o) => {
    if (o instanceof THREE.Mesh) o.castShadow = o.receiveShadow = true;
  });
  block(SHELF.x, SHELF.z - 0.3, 0.32);
  block(SHELF.x, SHELF.z + 0.3, 0.32);
  spots.push({ id: "shelf", label: "Look", x: SHELF.x, z: SHELF.z, range: 1.3, standX: SHELF.x - 1.0, standZ: SHELF.z, tapTargets: [shelf] });

  // the journal keepsakes you've earned by logging stand on the two upper shelves
  const keeps = new THREE.Group();
  shelf.add(keeps);
  const KEEP_AT: Record<string, [number, number]> = {
    "keep:feather": [-0.3, 1],
    "keep:compass": [0, 1],
    "keep:bell": [0.3, 1],
    "keep:jar": [-0.2, 2],
    "keep:badge": [0.22, 2],
  };
  const gold = flat("#c99a3e", { metalness: 0.5, roughness: 0.45 });
  const jarGlows: THREE.Sprite[] = [];
  function keepsakeShape(id: string): THREE.Object3D {
    const g = new THREE.Group();
    if (id === "keep:feather") {
      const f = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.3, 5), flat("#4a78c0"));
      f.scale.z = 0.3;
      f.position.y = 0.15;
      f.rotation.z = 0.35;
      g.add(f);
    } else if (id === "keep:compass") {
      const c = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.025, 14), gold);
      c.rotation.x = Math.PI / 2 - 0.3;
      c.position.y = 0.08;
      const face = new THREE.Mesh(new THREE.CircleGeometry(0.06, 14), flat("#efe4c8"));
      face.position.set(0, 0.085, 0.017);
      face.rotation.x = -0.3;
      g.add(c, face);
    } else if (id === "keep:bell") {
      const b = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.07, 0.11, 10, 1, true), gold);
      b.material.side = THREE.DoubleSide;
      b.position.y = 0.055;
      const top = new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 6), gold);
      top.position.y = 0.11;
      g.add(b, top);
    } else if (id === "keep:jar") {
      const jar = new THREE.Mesh(
        new THREE.CylinderGeometry(0.06, 0.06, 0.15, 10),
        new THREE.MeshStandardMaterial({ color: "#dff0c8", emissive: "#c8e27a", emissiveIntensity: 0.9, transparent: true, opacity: 0.85 }),
      );
      jar.position.y = 0.075;
      const lid = new THREE.Mesh(new THREE.CylinderGeometry(0.064, 0.064, 0.025, 10), flat("#8a6a48"));
      lid.position.y = 0.16;
      const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: "#e8f59a", transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false }));
      glow.position.y = 0.08;
      glow.scale.setScalar(0.45);
      jarGlows.push(glow);
      g.add(jar, lid, glow);
    } else {
      const badge = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.015, 12), flat("#b0703a", { metalness: 0.4, roughness: 0.5 }));
      badge.rotation.x = Math.PI / 2 - 0.25;
      badge.position.y = 0.12;
      const ribbon = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.1, 0.01), flat("#7a3b3b"));
      ribbon.position.set(0, 0.05, -0.01);
      g.add(ribbon, badge);
    }
    g.traverse((o) => (o.castShadow = o instanceof THREE.Mesh));
    return g;
  }
  function placeKeeps() {
    keeps.clear();
    jarGlows.length = 0;
    for (const k of JOURNAL_KEEPSAKES) {
      if (!save?.loot?.includes(k.id)) continue;
      const [x, board] = KEEP_AT[k.id] ?? [0, 1];
      const o = keepsakeShape(k.id);
      o.position.set(x, shelfBoards[board].position.y + 0.02, 0);
      keeps.add(o);
    }
  }
  placeKeeps();

  // up to three favorite trail cards, picked in the satchel's album, lean at the back of the top shelf
  const shelfCards = new THREE.Group();
  shelf.add(shelfCards);
  let cardsShown = "";
  function placeCards() {
    const ids = (save?.shelf ?? []).slice(0, 3);
    const key = ids.join(",");
    if (key === cardsShown) return;
    cardsShown = key;
    shelfCards.clear();
    const top = shelfBoards[2].position.y + 0.02;
    ids.forEach((id, i) => {
      void cardTexture(id).then((tex) => {
        if (!tex || cardsShown !== key) return;
        const card = new THREE.Mesh(new THREE.PlaneGeometry(0.16, 0.224), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.85 }));
        card.position.set((i - (ids.length - 1) / 2) * 0.3, top + 0.11, -0.09);
        card.rotation.x = -0.12;
        card.rotation.y = (i - 1) * 0.08;
        shelfCards.add(card);
      });
    });
  }
  placeCards();

  // ---------- the fox's corner, by the door on the east side ----------
  const FOXBED = { x: 1.75, z: 1.75 };
  const corner = new THREE.Group();
  corner.position.set(FOXBED.x, 0, FOXBED.z);
  room.add(corner);
  // a folded old blanket the fox has already claimed
  const cloth = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.46, 0.07, 9), flat("#8b8f6a"));
  cloth.position.y = 0.035;
  cloth.scale.set(1, 1, 0.8);
  const lump = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.07, 6, 12), flat("#9da27a"));
  lump.rotation.x = Math.PI / 2;
  lump.position.y = 0.08;
  lump.scale.set(1, 0.8, 1);
  corner.add(cloth, lump);
  // the roll-up basket you make at camp (see build.ts) takes the blanket's place
  const basket = buildFoxBasket();
  basket.visible = false;
  corner.add(basket);
  const placeBasket = () => {
    const has = !!save?.built?.includes("basket");
    basket.visible = has;
    cloth.visible = lump.visible = !has;
  };
  placeBasket();
  corner.traverse((o) => (o.receiveShadow = o instanceof THREE.Mesh));
  spots.push({ id: "foxbed", label: "Look", x: FOXBED.x, z: FOXBED.z, range: 1.2, standX: FOXBED.x - 0.9, standZ: FOXBED.z - 0.3, tapTargets: [corner] });

  // ---------- where you can walk: the middle of the room, where you can stand up ----------
  const walk: Capsule[] = [-1.9, -0.7, 0.5, 1.7].map((z) => ({ ax: -0.75, az: z, bx: 0.75, bz: z, r: 0.95 }));
  // and a little way into the doorway
  walk.push({ ax: 0, az: 1.7, bx: 0, bz: HD - 0.25, r: 0.5 });

  // ---------- the traveler ----------
  const traveler = makePerson(look);
  traveler.root.position.set(TENT_START.x, 0, TENT_START.z);
  traveler.root.rotation.y = TENT_START.facing;
  scene.add(traveler.root);
  const frameHooks: ((dt: number) => void)[] = [];
  const tools = carryTools(traveler);
  tools.set(save?.tools ?? []);
  frameHooks.push((dt) => tools.update(dt));

  // ---------- dress with kit models ----------
  async function dress() {
    const people = dressTraveler(traveler, frameHooks);
    try {
      const [lamp, books, mug, bottles] = await Promise.all([
        model("props", "Lantern_Wall"),
        model("props", "Book_Stack_1"),
        model("props", "Mug"),
        model("props", "SmallBottles_1"),
      ]);
      // a few everyday things on the lowest shelf, leaving the others free for keepsakes
      const low = shelfBoards[0].position.y + 0.02;
      shelf.add(place(books, -0.3, low, 0, 0.4, 0.55));
      shelf.add(place(bottles, 0.3, low, 0, -0.3, 0.6));
      room.add(place(mug, CRATE.x - 0.12, 0.45, CRATE.z + 0.1, 1.1, 0.7));
      // the wall lantern, hung from the ridge instead (its bracket hidden up in the shadows)
      lampGlass.visible = false;
      const box = new THREE.Box3().setFromObject(lamp);
      const h = box.max.y - box.min.y || 1;
      const s = 0.42 / h;
      lantern.add(place(lamp, 0, -0.55 - box.max.y * s + 0.21, 0, Math.PI / 2, s));
      spots.find((sp) => sp.id === "lantern")!.tapTargets.push(lamp);
    } catch (err) {
      console.warn("Tent props did not load; keeping the plain shapes.", err);
    }
    await people;
  }
  const ready = dress().catch((err) => console.warn("Tent models did not load:", err));

  const tent: Area = {
    scene,
    camera,
    traveler,
    blockers,
    spots,
    walk,
    start: TENT_START,
    notes: NOTES,
    ready,
    use(spot) {
      if (spot.id === "shelf") {
        const have = JOURNAL_KEEPSAKES.filter((k) => save?.loot?.includes(k.id)).map((k) => k.name.toLowerCase());
        const cards = (save?.shelf ?? []).map((id) => cardFace(id)?.name).filter((n): n is string => !!n);
        const and = (l: string[]) => (l.length === 1 ? l[0] : `${l.slice(0, -1).join(", ")} and ${l[l.length - 1]}`);
        if (!have.length && !cards.length) return "A little shelf, empty for now. You can stand your favorite trail cards here from the satchel's card album.";
        const parts = [have.length ? `the ${and(have)}` : "", cards.length ? `your ${cards.length === 1 ? "card" : "cards"} ${and(cards)}` : ""].filter(Boolean);
        return `Your shelf: ${parts.join(", and ")}.`;
      }
      if (spot.id === "foxbed" && save?.built?.includes("basket")) return "The roll-up basket, lined with chamomile. It smells like Della's tea. The fox sleeps here every night now.";
      if (spot.id !== "mirror") return null;
      const n = mirrorLooks++;
      const line = save?.firstLine?.trim();
      if (n % 2 === 1 && line) return `Tucked in the corner of the frame, your note to yourself: "${line}"`;
      return "Your reflection is only a soft blur in the lamplight, like a sketch nobody has started yet. It'll come clearer as you go.";
    },
    // the fox can't stop looking at its corner
    interest(x, z) {
      return Math.hypot(x - FOXBED.x, z - FOXBED.z) < 4 ? { x: FOXBED.x, z: FOXBED.z } : null;
    },
    refresh() {
      tools.set(save?.tools ?? []);
      note.visible = !!save?.firstLine;
      placeKeeps();
      placeBasket();
      placeCards();
    },
    update(dt, time) {
      const flicker = Math.sin(time * 7) * 0.4 + Math.sin(time * 12.3) * 0.3 + Math.sin(time * 3.1) * 0.3;
      lampLight.intensity = 11 + flicker * 0.9;
      lampGlow.material.opacity = 0.7 + flicker * 0.05;
      candleLight.intensity = 2.5 + Math.sin(time * 11) * 0.3 + Math.sin(time * 17.7) * 0.2;
      flame.scale.y = 1 + Math.sin(time * 13) * 0.15;
      jarGlows.forEach((g) => (g.material.opacity = 0.45 + Math.sin(time * 2.3) * 0.15 + Math.sin(time * 5.7) * 0.08));
      // the lantern sways a touch
      lantern.rotation.z = Math.sin(time * 0.9) * 0.03;
      lantern.rotation.x = Math.sin(time * 0.7 + 1) * 0.02;
      for (const f of frameHooks) f(dt);
    },
    resize() {
      const w = window.innerWidth, h = window.innerHeight;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    },
  };
  tent.resize();
  return tent;
}
