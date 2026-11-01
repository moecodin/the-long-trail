// The 3D world for the intro: Della's cottage in Lowmeadow on a stormy night,
// the dark valley outside, and the Summit far away with its lantern.
//
// Everything is built from simple shapes for now. Real low-poly art (KayKit)
// replaces these pieces in Milestone 1.

import * as THREE from "three";
import { makePerson, type Person } from "./people";

export interface World {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  traveler: Person;
  della: Person;
  blanket: THREE.Mesh;
  tableItems: THREE.Group;
  door: THREE.Object3D;
  /** Where things are, so the intro can move the camera between them. */
  spots: Record<string, THREE.Vector3>;
  setStorm(amount: number): void;
  setLantern(amount: number): void;
  flash(strength?: number): void;
  setItemsGlow(amount: number): void;
  render(dt: number, time: number): void;
  resize(): void;
}

// Room size (meters). The back wall, with the window, faces the Summit.
const ROOM_W = 8;
const ROOM_D = 6;
const ROOM_H = 3;
const WALL = 0.25;
export const SUMMIT = new THREE.Vector3(12, 36, -300);

const flat = (color: string, extra: Partial<THREE.MeshStandardMaterialParameters> = {}) =>
  new THREE.MeshStandardMaterial({ color, flatShading: true, roughness: 0.95, ...extra });

function box(w: number, h: number, d: number, m: THREE.Material, x: number, y: number, z: number) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function glowTexture(): THREE.Texture {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const g = c.getContext("2d")!;
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, "rgba(255,240,200,1)");
  grad.addColorStop(0.2, "rgba(255,200,110,0.8)");
  grad.addColorStop(0.5, "rgba(255,150,60,0.25)");
  grad.addColorStop(1, "rgba(255,120,40,0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Cheap repeatable noise so the hills look the same every time. */
function hash(x: number, z: number) {
  const s = Math.sin(x * 127.1 + z * 311.7) * 43758.5453;
  return s - Math.floor(s);
}
function smoothNoise(x: number, z: number) {
  const xi = Math.floor(x), zi = Math.floor(z);
  const xf = x - xi, zf = z - zi;
  const u = xf * xf * (3 - 2 * xf), v = zf * zf * (3 - 2 * zf);
  const a = hash(xi, zi), b = hash(xi + 1, zi), c = hash(xi, zi + 1), d = hash(xi + 1, zi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
export function groundHeight(x: number, z: number) {
  const dist = Math.hypot(x, z);
  const flatNearCottage = THREE.MathUtils.smoothstep(dist, 10, 30);
  return (smoothNoise(x * 0.03, z * 0.03) * 6 + smoothNoise(x * 0.1, z * 0.1) * 1.5 - 3) * flatNearCottage - 0.02;
}

export function createWorld(canvas: HTMLCanvasElement): World {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;

  const scene = new THREE.Scene();
  const nightSky = new THREE.Color("#0b1020");
  const stormSky = new THREE.Color("#070a12");
  scene.background = nightSky.clone();
  scene.fog = new THREE.FogExp2("#141c30", 0.0035);

  const camera = new THREE.PerspectiveCamera(50, 1, 0.05, 1200);

  // ---------- lights ----------
  const hemi = new THREE.HemisphereLight("#6a80b8", "#2a2418", 0.9);
  scene.add(hemi);
  const moon = new THREE.DirectionalLight("#9fb6e8", 1.1);
  moon.position.set(-40, 60, -30);
  scene.add(moon);
  const lightning = new THREE.DirectionalLight("#dfe8ff", 0);
  lightning.position.set(20, 80, -60);
  scene.add(lightning);

  // ---------- sky: stars ----------
  const starGeo = new THREE.BufferGeometry();
  const starPos: number[] = [];
  for (let i = 0; i < 1400; i++) {
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.random() * Math.PI * 0.45;
    const r = 900;
    starPos.push(Math.cos(theta) * Math.sin(phi) * r, Math.cos(phi) * r * 0.9 + 20, Math.sin(theta) * Math.sin(phi) * r);
  }
  starGeo.setAttribute("position", new THREE.Float32BufferAttribute(starPos, 3));
  const starMat = new THREE.PointsMaterial({ color: "#fdf6e3", size: 1.6, sizeAttenuation: false, fog: false, transparent: true });
  scene.add(new THREE.Points(starGeo, starMat));

  // storm clouds: big dark puffs that hide the stars
  const clouds = new THREE.Group();
  const cloudMat = new THREE.MeshBasicMaterial({ color: "#1a2030", transparent: true, opacity: 0, fog: false, depthWrite: false });
  for (let i = 0; i < 40; i++) {
    const puff = new THREE.Mesh(new THREE.IcosahedronGeometry(40 + Math.random() * 50, 1), cloudMat);
    const a = Math.random() * Math.PI * 2;
    const r = 150 + Math.random() * 350;
    puff.position.set(Math.cos(a) * r, 110 + Math.random() * 60, Math.sin(a) * r - 120);
    puff.scale.y = 0.35;
    clouds.add(puff);
  }
  scene.add(clouds);

  // ---------- the valley ----------
  const groundGeo = new THREE.PlaneGeometry(900, 900, 120, 120);
  groundGeo.rotateX(-Math.PI / 2);
  const gp = groundGeo.attributes.position as THREE.BufferAttribute;
  const colors: number[] = [];
  const field = [new THREE.Color("#2f4a2c"), new THREE.Color("#3e5a2f"), new THREE.Color("#4a5a2a"), new THREE.Color("#2a4030")];
  for (let i = 0; i < gp.count; i++) {
    const x = gp.getX(i), z = gp.getZ(i);
    gp.setY(i, groundHeight(x, z));
    // patchwork farm fields
    const c = field[Math.floor(hash(Math.floor(x / 22), Math.floor(z / 22)) * field.length)];
    colors.push(c.r, c.g, c.b);
  }
  groundGeo.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  groundGeo.computeVertexNormals();
  const ground = new THREE.Mesh(groundGeo, new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 1 }));
  ground.receiveShadow = true;
  scene.add(ground);

  // a river winding toward the mountains
  const riverPts: THREE.Vector3[] = [];
  for (let i = 0; i <= 40; i++) {
    const z = 40 - i * 7;
    riverPts.push(new THREE.Vector3(30 + Math.sin(i * 0.35) * 22 - i * 0.6, 0, z));
  }
  const river = new THREE.Mesh(
    new THREE.TubeGeometry(new THREE.CatmullRomCurve3(riverPts), 120, 2.4, 3, false),
    new THREE.MeshStandardMaterial({ color: "#2b4a6e", emissive: "#0d1a2c", roughness: 0.3, metalness: 0.2, flatShading: true }),
  );
  river.scale.y = 0.08;
  river.position.y = -1.2;
  scene.add(river);

  // trees: a few near the cottage, and a dark forest band further out
  const treeTrunk = flat("#3b2a1c");
  const treeLeaf = flat("#1f3a26");
  const treeLeaf2 = flat("#2a4a2c");
  const treeGeo = new THREE.ConeGeometry(1.6, 4.5, 6);
  const trunkGeo = new THREE.CylinderGeometry(0.2, 0.25, 1.2, 5);
  const addTree = (x: number, z: number, s: number) => {
    const y = groundHeight(x, z);
    const trunk = new THREE.Mesh(trunkGeo, treeTrunk);
    trunk.position.set(x, y + 0.6 * s, z);
    trunk.scale.setScalar(s);
    const top = new THREE.Mesh(treeGeo, hash(x, z) > 0.5 ? treeLeaf : treeLeaf2);
    top.position.set(x, y + 3.2 * s, z);
    top.scale.setScalar(s);
    top.castShadow = true;
    scene.add(trunk, top);
  };
  for (const [x, z, s] of [[-9, -6, 1.2], [-11, 2, 1], [9, -8, 1.1], [12, 4, 0.9], [-7, 9, 1], [7, 10, 1.2]]) addTree(x, z, s);
  for (let i = 0; i < 260; i++) {
    const x = (hash(i, 7) - 0.5) * 420;
    const z = -90 - hash(i, 13) * 120;
    addTree(x, z, 1.5 + hash(i, 3) * 2);
  }

  // mountains, with the tallest one carrying the Summit lantern
  const rock = flat("#3a4256");
  const snow = flat("#c9d3e6");
  const addPeak = (x: number, z: number, r: number, h: number) => {
    const m = new THREE.Mesh(new THREE.ConeGeometry(r, h, 7), rock);
    m.position.set(x, h / 2 - 4, z);
    m.rotation.y = hash(x, z) * 3;
    const cap = new THREE.Mesh(new THREE.ConeGeometry(r * 0.32, h * 0.32, 7), snow);
    cap.position.set(x, h - 4 - h * 0.16 + 0.1, z);
    cap.rotation.y = m.rotation.y;
    scene.add(m, cap);
  };
  addPeak(SUMMIT.x, SUMMIT.z, 70, SUMMIT.y + 4);
  for (const [x, z, r, h] of [[-110, -280, 60, 26], [70, -290, 65, 30], [140, -320, 70, 24], [-190, -330, 80, 28], [20, -340, 50, 22]]) addPeak(x, z, r, h);

  // ---------- the Summit lantern ----------
  const glowTex = glowTexture();
  const lanternGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: "#ffd38a", blending: THREE.AdditiveBlending, depthWrite: false, fog: false, transparent: true }));
  lanternGlow.position.copy(SUMMIT).add(new THREE.Vector3(0, 1.5, 0));
  scene.add(lanternGlow);
  const lanternCore = new THREE.Mesh(new THREE.SphereGeometry(0.9, 8, 6), new THREE.MeshBasicMaterial({ color: "#2a2620", fog: false }));
  lanternCore.position.copy(lanternGlow.position);
  scene.add(lanternCore);

  // ---------- Della's cottage ----------
  const cottage = new THREE.Group();
  scene.add(cottage);
  const plaster = flat("#d8c7a6");
  const timber = flat("#5a3d28");
  const floorMat = flat("#7a5638");
  const stone = flat("#7d7a74");
  const roofMat = flat("#5e3a2a");

  cottage.add(box(ROOM_W, 0.1, ROOM_D, floorMat, 0, -0.05, 0));
  // back wall with a window (the window looks toward the Summit)
  const winW = 1.6, winBottom = 1.0, winTop = 2.3;
  // One wall shape with a window-sized hole, so there are no seams for light to leak through.
  const wallShape = new THREE.Shape();
  wallShape.moveTo(-ROOM_W / 2, 0);
  wallShape.lineTo(ROOM_W / 2, 0);
  wallShape.lineTo(ROOM_W / 2, ROOM_H);
  wallShape.lineTo(-ROOM_W / 2, ROOM_H);
  wallShape.closePath();
  const hole = new THREE.Path();
  hole.moveTo(-winW / 2, winBottom);
  hole.lineTo(-winW / 2, winTop);
  hole.lineTo(winW / 2, winTop);
  hole.lineTo(winW / 2, winBottom);
  hole.closePath();
  wallShape.holes.push(hole);
  const backWall = new THREE.Mesh(new THREE.ExtrudeGeometry(wallShape, { depth: WALL, bevelEnabled: false }), plaster);
  backWall.position.z = -ROOM_D / 2 - WALL / 2;
  backWall.castShadow = backWall.receiveShadow = true;
  cottage.add(backWall);
  // window frame and cross bars
  for (const [w, h, x, y] of [[winW + 0.2, 0.1, 0, winBottom], [winW + 0.2, 0.1, 0, winTop], [0.1, winTop - winBottom, -winW / 2, (winTop + winBottom) / 2], [0.1, winTop - winBottom, winW / 2, (winTop + winBottom) / 2], [0.06, winTop - winBottom, 0, (winTop + winBottom) / 2], [winW, 0.06, 0, (winTop + winBottom) / 2]] as const) {
    cottage.add(box(w, h, WALL + 0.06, timber, x, y, -ROOM_D / 2));
  }
  const glass = new THREE.Mesh(new THREE.PlaneGeometry(winW, winTop - winBottom), new THREE.MeshStandardMaterial({ color: "#9fb6d8", transparent: true, opacity: 0.12, roughness: 0.1 }));
  glass.position.set(0, (winTop + winBottom) / 2, -ROOM_D / 2 + 0.02);
  cottage.add(glass);

  // left wall (fireplace side), front wall
  cottage.add(box(WALL, ROOM_H, ROOM_D, plaster, -ROOM_W / 2, ROOM_H / 2, 0));
  cottage.add(box(ROOM_W, ROOM_H, WALL, plaster, 0, ROOM_H / 2, ROOM_D / 2));
  // right wall with a door gap near the front
  const doorW = 1.1, doorZ = 1.6, doorH = 2.2;
  const backPart = ROOM_D / 2 + doorZ - doorW / 2;
  cottage.add(box(WALL, ROOM_H, backPart, plaster, ROOM_W / 2, ROOM_H / 2, -ROOM_D / 2 + backPart / 2));
  const frontPart = ROOM_D / 2 - doorZ - doorW / 2;
  cottage.add(box(WALL, ROOM_H, frontPart, plaster, ROOM_W / 2, ROOM_H / 2, ROOM_D / 2 - frontPart / 2));
  cottage.add(box(WALL, ROOM_H - doorH, doorW, plaster, ROOM_W / 2, (ROOM_H + doorH) / 2, doorZ));
  // an open door, swung outward
  const door = box(0.08, doorH, doorW, timber, 0, doorH / 2, doorW / 2);
  const doorPivot = new THREE.Group();
  doorPivot.position.set(ROOM_W / 2 + 0.05, 0, doorZ - doorW / 2);
  doorPivot.add(door);
  doorPivot.rotation.y = 0;
  cottage.add(doorPivot);

  // beams across the ceiling
  for (const x of [-2.6, 0, 2.6]) cottage.add(box(0.2, 0.22, ROOM_D, timber, x, ROOM_H - 0.12, 0));
  // roof
  const roof = new THREE.Mesh(new THREE.ConeGeometry(ROOM_W * 0.78, 2.6, 4), roofMat);
  roof.rotation.y = Math.PI / 4;
  roof.scale.z = ROOM_D / ROOM_W;
  roof.position.y = ROOM_H + 1.3;
  roof.castShadow = true;
  cottage.add(roof);
  cottage.add(box(ROOM_W, 0.08, ROOM_D, timber, 0, ROOM_H + 0.02, 0)); // ceiling
  // chimney
  cottage.add(box(0.9, 2.2, 0.9, stone, -ROOM_W / 2 + 0.6, ROOM_H + 1.4, -0.4));

  // fireplace on the left wall
  const fireX = -ROOM_W / 2 + 0.45;
  cottage.add(box(0.7, 1.4, 2.0, stone, fireX, 0.7, -0.4));
  cottage.add(box(0.5, 1.6, 2.2, stone, fireX - 0.05, 2.2, -0.4));
  const hearth = box(0.72, 0.7, 1.1, flat("#1a1310"), fireX + 0.02, 0.4, -0.4);
  cottage.add(hearth);
  const flames = new THREE.Group();
  const flameMat = new THREE.MeshBasicMaterial({ color: "#ffb347" });
  const flameMat2 = new THREE.MeshBasicMaterial({ color: "#ff7a2a" });
  for (let i = 0; i < 5; i++) {
    const f = new THREE.Mesh(new THREE.ConeGeometry(0.09 + (i % 2) * 0.04, 0.35 + (i % 3) * 0.12, 5), i % 2 ? flameMat : flameMat2);
    f.position.set(fireX + 0.3, 0.28, -0.75 + i * 0.17);
    flames.add(f);
  }
  cottage.add(flames);
  const fireLight = new THREE.PointLight("#ff9a4a", 6, 9, 1.6);
  fireLight.position.set(fireX + 0.8, 0.8, -0.4);
  fireLight.castShadow = true;
  fireLight.shadow.mapSize.set(512, 512);
  cottage.add(fireLight);

  // rug, armchair by the fire
  const rug = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.4, 0.02, 10), flat("#8a3b34"));
  rug.position.set(-1.8, 0.01, -0.4);
  rug.receiveShadow = true;
  cottage.add(rug);
  const chair = new THREE.Group();
  const chairMat = flat("#6b4a7a");
  chair.add(box(0.9, 0.42, 0.8, chairMat, 0, 0.21, 0));
  chair.add(box(0.9, 0.9, 0.18, chairMat, 0, 0.7, -0.4));
  chair.add(box(0.16, 0.6, 0.8, chairMat, -0.45, 0.5, 0));
  chair.add(box(0.16, 0.6, 0.8, chairMat, 0.45, 0.5, 0));
  chair.position.set(-1.9, 0, -0.2);
  chair.rotation.y = -Math.PI / 2 + 0.3; // facing the fire
  cottage.add(chair);

  // table with the lantern, the journal and the walking stick
  const table = new THREE.Group();
  table.add(box(1.4, 0.08, 0.8, timber, 0, 0.78, 0));
  for (const [x, z] of [[-0.6, -0.32], [0.6, -0.32], [-0.6, 0.32], [0.6, 0.32]]) table.add(box(0.08, 0.78, 0.08, timber, x, 0.39, z));
  table.position.set(1.6, 0, -1.6);
  cottage.add(table);
  const tableItems = new THREE.Group();
  tableItems.position.copy(table.position);
  cottage.add(tableItems);
  const brass = flat("#b8863b", { metalness: 0.5, roughness: 0.5 });
  const lantern = new THREE.Group();
  lantern.add(box(0.2, 0.04, 0.2, brass, 0, 0, 0));
  lantern.add(box(0.2, 0.04, 0.2, brass, 0, 0.3, 0));
  const lanternGlass = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.26, 6), new THREE.MeshStandardMaterial({ color: "#ffe6a8", emissive: "#ffb347", emissiveIntensity: 0, transparent: true, opacity: 0.7 }));
  lanternGlass.position.y = 0.15;
  lantern.add(lanternGlass);
  const handle = new THREE.Mesh(new THREE.TorusGeometry(0.07, 0.012, 4, 10, Math.PI), brass);
  handle.position.y = 0.32;
  lantern.add(handle);
  lantern.position.set(-0.4, 0.84, 0);
  tableItems.add(lantern);
  const journal = box(0.3, 0.06, 0.38, flat("#6e3b2a"), 0.15, 0.85, 0.05);
  journal.rotation.y = 0.3;
  tableItems.add(journal);
  tableItems.add(box(0.26, 0.012, 0.34, flat("#efe2c4"), 0.15, 0.885, 0.05).rotateY(0.3));
  const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.04, 1.5, 6), flat("#8a6440"));
  stick.position.set(0.78, 0.73, 0.15);
  stick.rotation.z = 0.25;
  tableItems.add(stick);
  const itemsLight = new THREE.PointLight("#ffd38a", 0, 3, 2);
  itemsLight.position.set(0, 1.4, 0);
  tableItems.add(itemsLight);

  // the old mirror by the door (on the right wall)
  const mirror = new THREE.Group();
  mirror.add(box(0.08, 1.5, 0.8, timber, 0, 0, 0));
  const mirrorGlass = new THREE.Mesh(new THREE.PlaneGeometry(0.64, 1.3), new THREE.MeshStandardMaterial({ color: "#b8c4cc", metalness: 0.9, roughness: 0.35, emissive: "#28303a" }));
  mirrorGlass.rotation.y = -Math.PI / 2;
  mirrorGlass.position.x = -0.05;
  mirror.add(mirrorGlass);
  mirror.position.set(ROOM_W / 2 - 0.16, 1.5, 0.1);
  cottage.add(mirror);

  // a warm lamp on the outside wall so the cottage reads from the title shot
  const windowGlow = new THREE.PointLight("#ffb066", 0, 14, 1.5);
  windowGlow.position.set(0, 1.6, -ROOM_D / 2 - 1);
  cottage.add(windowGlow);

  // ---------- people ----------
  const traveler = makePerson({ skin: "#d2a07a", hair: "#3a2a20", cloak: "#4f5a4a", scarf: "#8a7a5a", hairStyle: "short" });
  traveler.root.position.set(-1.9, 0.05, -0.2);
  traveler.root.rotation.y = -Math.PI / 2 + 0.3;
  traveler.setSit(1);
  traveler.head.rotation.z = 0.45; // dozing
  traveler.head.rotation.x = 0.25;
  cottage.add(traveler.root);
  const blanket = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.36, 0.62), flat("#a8743c"));
  blanket.position.set(0, 0.5, 0.12);
  blanket.rotation.x = -0.15;
  blanket.castShadow = true;
  traveler.root.add(blanket);

  const della = makePerson({ skin: "#e3b896", hair: "#c9c4bc", cloak: "#6e5a7e", scarf: "#c4a8d0", hairStyle: "bun" }, 0.92);
  della.root.position.set(ROOM_W / 2 + 1.6, 0, doorZ);
  della.root.rotation.y = -Math.PI / 2;
  della.root.visible = false;
  cottage.add(della.root);

  // ---------- rain ----------
  const DROPS = 2200;
  const rainGeo = new THREE.BufferGeometry();
  const rainPos = new Float32Array(DROPS * 6);
  const speeds = new Float32Array(DROPS);
  const resetDrop = (i: number, anyHeight: boolean) => {
    let x = 0, z = 0;
    do {
      x = (Math.random() - 0.5) * 50;
      z = -ROOM_D / 2 - 0.4 - Math.random() * 40 + 10;
    } while (Math.abs(x) < ROOM_W / 2 + 0.3 && Math.abs(z) < ROOM_D / 2 + 0.3); // never inside the cottage
    const y = anyHeight ? Math.random() * 22 : 22;
    rainPos.set([x, y, z, x - 0.04, y - 0.5, z], i * 6);
    speeds[i] = 14 + Math.random() * 6;
  };
  for (let i = 0; i < DROPS; i++) resetDrop(i, true);
  rainGeo.setAttribute("position", new THREE.BufferAttribute(rainPos, 3));
  const rainMat = new THREE.LineBasicMaterial({ color: "#9fb2d4", transparent: true, opacity: 0 });
  const rain = new THREE.LineSegments(rainGeo, rainMat);
  rain.frustumCulled = false;
  scene.add(rain);

  // ---------- state ----------
  let storm = 0;
  let lanternAmount = 0;
  let flashLevel = 0;
  let itemsGlow = 0;

  const spots = {
    title: new THREE.Vector3(30, 26, 38),
    titleLook: new THREE.Vector3(SUMMIT.x, 20, SUMMIT.z),
    fireCam: new THREE.Vector3(-3.4, 1.9, 2.6),
    fireLook: new THREE.Vector3(-1.9, 0.7, -0.3),
    windowCam: new THREE.Vector3(-0.6, 1.25, 2.4),
    windowLook: new THREE.Vector3(-0.1, 1.85, -3),
    window: new THREE.Vector3(0, 0.05, -2.2),
    mirror: new THREE.Vector3(ROOM_W / 2 - 1.0, 0.05, 0.1),
    mirrorCam: new THREE.Vector3(ROOM_W / 2 - 2.6, 1.55, 0.35),
    mirrorLook: new THREE.Vector3(ROOM_W / 2 - 0.2, 1.4, 0.1),
    doorCam: new THREE.Vector3(-0.6, 1.7, 2.3),
    doorLook: new THREE.Vector3(ROOM_W / 2 - 0.4, 1.1, 0.9),
    dellaIn: new THREE.Vector3(ROOM_W / 2 - 0.6, 0, doorZ),
    tableCam: new THREE.Vector3(0.6, 1.7, 0.2),
    tableLook: new THREE.Vector3(1.6, 0.85, -1.6),
  };

  const world: World = {
    renderer,
    scene,
    camera,
    traveler,
    della,
    blanket,
    tableItems,
    door: doorPivot,
    spots,
    setStorm(a) {
      storm = a;
    },
    setLantern(a) {
      lanternAmount = a;
    },
    flash(strength = 1) {
      flashLevel = Math.max(flashLevel, strength);
    },
    setItemsGlow(a) {
      itemsGlow = a;
    },
    render(dt, time) {
      // storm: clouds over, stars hidden, rain on
      cloudMat.opacity = storm * 0.95;
      starMat.opacity = 1 - storm * 0.92;
      (scene.background as THREE.Color).copy(nightSky).lerp(stormSky, storm);
      rainMat.opacity = storm * 0.55;
      rain.visible = storm > 0.01;
      if (rain.visible) {
        for (let i = 0; i < DROPS; i++) {
          const o = i * 6;
          const fall = speeds[i] * dt;
          rainPos[o + 1] -= fall;
          rainPos[o + 4] -= fall;
          if (rainPos[o + 4] < 0) resetDrop(i, false);
        }
        rainGeo.attributes.position.needsUpdate = true;
      }

      // lightning fades out fast
      lightning.intensity = flashLevel * 6;
      hemi.intensity = 0.9 - storm * 0.3 + flashLevel * 1.5;
      moon.intensity = 1.1 * (1 - storm * 0.7);
      flashLevel = Math.max(0, flashLevel - dt * 3.5);

      // fire flicker
      const flicker = Math.sin(time * 11) * 0.4 + Math.sin(time * 17.3) * 0.3 + Math.sin(time * 5.1) * 0.3;
      fireLight.intensity = 5.5 + flicker * 1.2;
      flames.children.forEach((f, i) => {
        f.scale.y = 1 + Math.sin(time * (9 + i * 2) + i) * 0.25;
      });
      windowGlow.intensity = 3 + flicker * 0.5;

      // Summit lantern: dark, then a flicker, then steady and warm
      const flickerOn = lanternAmount < 1 ? (Math.sin(time * 23) > 0.2 - lanternAmount ? 1 : 0.35) : 1;
      const glow = lanternAmount * flickerOn;
      const pulse = 1 + Math.sin(time * 2) * 0.06;
      lanternGlow.scale.setScalar((4 + glow * 48) * pulse);
      lanternGlow.material.opacity = 0.05 + glow * 0.95;
      (lanternCore.material as THREE.MeshBasicMaterial).color.set(glow > 0.1 ? "#ffe9b0" : "#2a2620");

      // table items glow when Della points at them
      itemsLight.intensity = itemsGlow * 3;
      (lanternGlass.material as THREE.MeshStandardMaterial).emissiveIntensity = itemsGlow * 1.5;

      renderer.render(scene, camera);
    },
    resize() {
      const w = window.innerWidth, h = window.innerHeight;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      // On a tall phone screen, widen the view so the room still fits.
      camera.fov = camera.aspect < 0.8 ? 68 : 50;
      camera.updateProjectionMatrix();
    },
  };
  world.resize();
  return world;
}
