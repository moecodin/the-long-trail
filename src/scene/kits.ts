// Swaps the simple placeholder shapes for real models from the Quaternius kits
// (Medieval Village, Fantasy Props and Stylized Nature, all CC0).
//
// The models live in public/models/<kit>/ and are prepared by
// tools/prepare-kits.mjs, which also shrinks their textures for phones.
//
// Kit wall pieces are 2 m wide and 3.1 m tall. Their plain plaster side is the
// inside (local -z) and the timber-framed side faces out (local +z).

import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { ROOM, WIN_X } from "./world";
import type { Person } from "./people";
import { loadKayKit, wearKayKit } from "./kaykitPeople";

export interface Placeholders {
  walls: THREE.Object3D[];
  floor: THREE.Object3D[];
  roof: THREE.Object3D[];
  window: THREE.Object3D[];
  nearTrees: THREE.Object3D[];
  forest: THREE.Object3D[];
  table: THREE.Object3D;
  door?: THREE.Object3D;
  /** The fireplace's plain stone material, which gets the kit's brick texture. */
  stone?: THREE.MeshStandardMaterial;
  armchair?: THREE.Object3D;
  rug?: THREE.Mesh;
  lantern?: THREE.Group;
  stick?: THREE.Mesh;
  blanket?: THREE.Mesh;
}

interface DressContext {
  scene: THREE.Scene;
  cottage: THREE.Group;
  ph: Placeholders;
  doorPivot: THREE.Object3D;
  tableItems: THREE.Group;
  journal: THREE.Object3D;
  groundHeight(x: number, z: number): number;
  fireX: number;
  doorZ: number;
  traveler: Person;
  della: Person;
  /** Run something every frame (used to animate the people). */
  onFrame(f: (dt: number) => void): void;
}

const BASE = `${import.meta.env.BASE_URL}models/`;

// The phone preview link can only hold a few kinds of files, so its build packs
// every model into one script (tools/pack-preview-models.mjs) that fills
// window.__KIT_ASSETS. When that is there, model requests are answered from it.
const packed = (window as unknown as { __KIT_ASSETS?: Record<string, string> }).__KIT_ASSETS;
const manager = new THREE.LoadingManager();
if (packed) {
  manager.setURLModifier((url) => {
    const m = url.match(/(village|props|nature)\/[^/?#]+$/);
    return (m && packed[m[0]]) || url;
  });
}
const loader = new GLTFLoader(manager);
const cache = new Map<string, Promise<THREE.Object3D>>();

/** Load a kit model once; each call returns a fresh copy that shares geometry and textures. */
async function model(kit: "village" | "props" | "nature", name: string): Promise<THREE.Object3D> {
  const key = `${kit}/${name}`;
  if (!cache.has(key)) {
    cache.set(
      key,
      loader.loadAsync(`${BASE}${key}.gltf`).then((g) => {
        g.scene.traverse((o) => {
          const m = o as THREE.Mesh;
          if (m.isMesh) {
            m.castShadow = true;
            m.receiveShadow = true;
          }
        });
        return g.scene;
      }),
    );
  }
  return (await cache.get(key)!).clone();
}

function place(o: THREE.Object3D, x: number, y: number, z: number, ry = 0, s: number | THREE.Vector3Tuple = 1) {
  o.position.set(x, y, z);
  o.rotation.y = ry;
  if (typeof s === "number") o.scale.setScalar(s);
  else o.scale.set(...s);
  return o;
}

/**
 * Many copies of one model drawn in a single go (one draw per mesh part), for
 * the forest far away. Much cheaper for a phone than hundreds of separate trees.
 */
function instanced(src: THREE.Object3D, transforms: THREE.Matrix4[]): THREE.Group {
  const group = new THREE.Group();
  src.updateMatrixWorld(true);
  src.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    const inst = new THREE.InstancedMesh(m.geometry, m.material, transforms.length);
    const local = m.matrixWorld;
    transforms.forEach((t, i) => inst.setMatrixAt(i, new THREE.Matrix4().multiplyMatrices(t, local)));
    inst.castShadow = false;
    inst.receiveShadow = true;
    group.add(inst);
  });
  return group;
}

/** Cheap repeatable random numbers, so the scenery is the same every time. */
function seeded(seed: number) {
  return () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
}

/**
 * A piece of a kit's texture sheet as its own material. Quaternius props share
 * "trim sheets" (many surfaces painted on one image); our hand-built pieces
 * only want one patch of it. u/v/w/h are in 0-1 image coordinates from the top left.
 */
function sheetPatch(src: THREE.Texture, u: number, v: number, w: number, h: number, color = "#ffffff") {
  const map = src.clone();
  map.flipY = false; // glTF textures are stored top-down
  map.wrapS = map.wrapT = THREE.RepeatWrapping;
  map.repeat.set(w, h);
  map.offset.set(u, v);
  map.needsUpdate = true;
  return new THREE.MeshStandardMaterial({ map, color, roughness: 0.9 });
}

/** A cozy wing-backed armchair, built from rounded boxes and dressed in kit textures. */
function buildArmchair(wood: THREE.Material, cloth: THREE.Material) {
  const chair = new THREE.Group();
  const part = (w: number, h: number, d: number, m: THREE.Material, x: number, y: number, z: number, r = 0.05) => {
    const mesh = new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 3, r), m);
    mesh.position.set(x, y, z);
    mesh.castShadow = mesh.receiveShadow = true;
    chair.add(mesh);
    return mesh;
  };
  // short turned legs
  for (const [x, z] of [[-0.38, -0.33], [0.38, -0.33], [-0.38, 0.33], [0.38, 0.33]]) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.025, 0.12, 8), wood);
    leg.position.set(x, 0.06, z);
    chair.add(leg);
  }
  part(0.92, 0.24, 0.82, cloth, 0, 0.24, 0, 0.06); // base
  part(0.7, 0.12, 0.68, cloth, 0, 0.41, 0.05, 0.05); // seat cushion
  const back = part(0.86, 0.78, 0.18, cloth, 0, 0.74, -0.33, 0.07);
  back.rotation.x = -0.12;
  for (const side of [-1, 1]) {
    part(0.14, 0.3, 0.8, cloth, side * 0.4, 0.5, 0, 0.06); // arm
    part(0.16, 0.04, 0.82, wood, side * 0.4, 0.67, 0.01, 0.015); // wooden arm cap
    const wing = part(0.12, 0.42, 0.22, cloth, side * 0.4, 0.92, -0.26, 0.05);
    wing.rotation.x = -0.12;
  }
  return chair;
}

export async function dressWorld(ctx: DressContext): Promise<void> {
  const { scene, cottage, ph } = ctx;
  // The people load alongside everything else.
  const peopleReady = dressPeople(ctx).catch((err) => console.warn("Character models did not load:", err));
  const W = ROOM.W, D = ROOM.D;
  const OUT = 0.31; // kit walls sit this far outside their inner face

  // Start every download at once; the browser fetches them in parallel.
  const [wall, winWall, doorWall, windowInsert, kitDoor, floor, corner, roof, chimney, shutters] = await Promise.all([
    model("village", "Wall_Plaster_Straight"),
    model("village", "Wall_Plaster_Window_Wide_Round"),
    model("village", "Wall_Plaster_Door_Round"),
    model("village", "Window_Wide_Round1"),
    model("village", "Door_1_Round"),
    model("village", "Floor_WoodDark"),
    model("village", "Corner_Exterior_Wood"),
    model("village", "Roof_RoundTiles_8x8"),
    model("village", "Prop_Chimney"),
    model("village", "WindowShutters_Wide_Round_Open"),
  ]);
  const copy = (o: THREE.Object3D) => o.clone();

  // ---------- the cottage shell ----------
  const shell = new THREE.Group();
  // back wall (window wall) faces the Summit: inside faces +z
  for (const x of [-3, -1, 1, 3]) {
    shell.add(place(x === WIN_X ? winWall : copy(wall), x, 0, -D / 2 - OUT, Math.PI));
  }
  shell.add(place(windowInsert, WIN_X, 0, -D / 2 - OUT, Math.PI));
  shell.add(place(shutters, WIN_X, 0, -D / 2 - OUT, Math.PI));
  // front wall: inside faces -z
  for (const x of [-3, -1, 1, 3]) shell.add(place(copy(wall), x, 0, D / 2 + OUT, 0));
  // left wall (fireplace): inside faces +x
  for (const z of [-2, 0, 2]) shell.add(place(copy(wall), -W / 2 - OUT, 0, z, -Math.PI / 2));
  // right wall, with the front door in the section nearest the front
  for (const z of [-2, 0, 2]) {
    shell.add(place(z === ctx.doorZ ? doorWall : copy(wall), W / 2 + OUT, 0, z, Math.PI / 2));
  }
  // timber posts hide the seams at the outside corners
  for (const [x, z, ry] of [[-1, -1, Math.PI], [1, -1, Math.PI / 2], [1, 1, 0], [-1, 1, -Math.PI / 2]] as const) {
    shell.add(place(copy(corner), x * (W / 2 + OUT), 0, z * (D / 2 + OUT), ry));
  }
  // wooden floor, 2 m boards
  for (const x of [-3, -1, 1, 3]) for (const z of [-2, 0, 2]) shell.add(place(copy(floor), x, 0.01, z));
  // tiled roof, squeezed to the cottage's depth
  shell.add(place(roof, 0, ROOM.H, 0, 0, [(W + 1.2) / 9.95, 0.9, (D + 1.2) / 10.33]));
  shell.add(place(chimney, -W / 2 + 0.6, ROOM.H - 0.2, -0.4));
  cottage.add(shell);

  // the fireplace keeps its shape but borrows the chimney's brick texture
  chimney.traverse((o) => {
    const mat = (o as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined;
    if (!ph.stone || !mat?.map || !/brick/i.test(mat.name)) return;
    const map = mat.map.clone();
    map.wrapS = map.wrapT = THREE.RepeatWrapping;
    map.repeat.set(1.5, 1.5);
    ph.stone.map = map;
    ph.stone.color.set("#ffffff");
    ph.stone.flatShading = false;
    ph.stone.needsUpdate = true;
  });

  // the front door swings on the same hinge as before
  if (ph.door) ph.door.visible = false;
  ctx.doorPivot.position.set(W / 2 + OUT, 0, ctx.doorZ - 0.55);
  ctx.doorPivot.add(place(kitDoor, 0, 0, 0, -Math.PI / 2));

  for (const o of [...ph.walls, ...ph.floor, ...ph.roof, ...ph.window]) o.visible = false;

  // ---------- furniture ----------
  const [table, chair, bookcase, barrel, shelf, bag, candle, mug, book, books, stool, crate, pot, bottles, bucket] =
    await Promise.all([
      model("props", "Table_Large"),
      model("props", "Chair_1"),
      model("props", "Bookcase_2"),
      model("props", "Barrel"),
      model("props", "Shelf_Simple"),
      model("props", "Bag"),
      model("props", "CandleStick_Triple"),
      model("props", "Mug"),
      model("props", "Book_5"),
      model("props", "Book_Stack_1"),
      model("props", "Stool"),
      model("props", "FarmCrate_Apple"),
      model("props", "Pot_1"),
      model("props", "SmallBottles_1"),
      model("props", "Bucket_Wooden_1"),
    ]);
  const room = new THREE.Group();
  // ---------- hand-built pieces dressed in kit textures ----------
  const furnitureMap = ((table.getObjectByProperty("type", "Mesh") as THREE.Mesh).material as THREE.MeshStandardMaterial).map!;
  const clothMap = await new THREE.TextureLoader(manager).loadAsync(`${BASE}props/T_Trim_Cloth_BaseColor.png`);
  clothMap.colorSpace = THREE.SRGBColorSpace;
  // a long plank from the furniture sheet, and the soft mottled cloth patch
  const wood = sheetPatch(furnitureMap, 0, 0, 1, 0.12);
  const cloth = sheetPatch(clothMap, 0.62, 0.05, 0.28, 0.3, "#6f8f6a");
  if (ph.armchair) {
    const armchair = buildArmchair(wood, cloth);
    armchair.position.copy(ph.armchair.position);
    armchair.rotation.copy(ph.armchair.rotation);
    ph.armchair.visible = false;
    cottage.add(armchair);
  }
  // the rug sat exactly on the floor boards and flickered; lift it and give it cloth
  if (ph.rug) {
    ph.rug.position.y = 0.035;
    ph.rug.material = sheetPatch(clothMap, 0.62, 0.05, 0.28, 0.3, "#b0574c");
  }
  // the sleeper's blanket: soft rounded wool instead of a plain box
  if (ph.blanket) {
    ph.blanket.geometry = new RoundedBoxGeometry(0.56, 0.34, 0.6, 3, 0.1);
    ph.blanket.material = sheetPatch(clothMap, 0.62, 0.05, 0.28, 0.3, "#c08a4a");
  }
  // walking stick: real wood grain, a little knob on top
  if (ph.stick) {
    ph.stick.material = wood;
    const knob = new THREE.Mesh(new THREE.SphereGeometry(0.05, 10, 8), wood);
    knob.position.y = 0.76;
    ph.stick.add(knob);
  }
  // Della's lantern: dark iron frame with corner posts and a peaked cap
  if (ph.lantern) {
    const iron = new THREE.MeshStandardMaterial({ color: "#3b3631", metalness: 0.6, roughness: 0.5 });
    for (const c of ph.lantern.children) {
      const m = c as THREE.Mesh;
      if (m.isMesh && !(m.material as THREE.MeshStandardMaterial).transparent) m.material = iron;
    }
    for (const [x, z] of [[-0.085, -0.085], [0.085, -0.085], [-0.085, 0.085], [0.085, 0.085]]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.3, 0.018), iron);
      post.position.set(x, 0.15, z);
      ph.lantern.add(post);
    }
    const cap = new THREE.Mesh(new THREE.ConeGeometry(0.15, 0.1, 4), iron);
    cap.rotation.y = Math.PI / 4;
    cap.position.y = 0.37;
    ph.lantern.add(cap);
  }

  // the table keeps its old spot; the kit table is long, so it is shortened a bit
  const t = ph.table.position;
  room.add(place(table, t.x, 0, t.z, 0, [0.55, 1, 0.8]));
  ph.table.visible = false;
  room.add(place(chair, t.x - 0.3, 0, t.z + 0.6, Math.PI));
  room.add(place(stool, t.x + 0.55, 0, t.z + 0.65));
  room.add(place(mug, t.x + 0.5, 0.81, t.z - 0.15));
  room.add(place(candle, t.x - 0.6, 0.81, t.z - 0.2));
  // the journal on the table becomes a kit book
  ctx.journal.visible = false;
  ctx.journal.parent?.children.forEach((c) => {
    // the old journal's page sheet sits right on top of it
    if (c !== ctx.journal && Math.abs(c.position.y - 0.885) < 0.001) c.visible = false;
  });
  ctx.tableItems.add(place(book, 0.15, 0.84, 0.05, 0.3, 1.3));
  // along the back wall, right of the window
  room.add(place(bookcase, 3.1, 0, -D / 2 + 0.25));
  room.add(place(shelf, 1.6, 1.75, -D / 2 + 0.02));
  room.add(place(bottles, 1.3, 1.78, -D / 2 + 0.18));
  room.add(place(books, 1.9, 1.78, -D / 2 + 0.18, 0.4));
  // by the fire
  room.add(place(pot, ctx.fireX + 0.55, 0, -1.55));
  room.add(place(bucket, ctx.fireX + 0.45, 0, 0.95, 0.5));
  // by the door
  room.add(place(barrel, W / 2 - 0.45, 0, -0.95));
  room.add(place(crate, W / 2 - 0.5, 0.9, -0.95, 0.3));
  room.add(place(bag, W / 2 - 0.25, 0, ctx.doorZ - 1.3, 0.6));
  cottage.add(room);

  // ---------- the valley ----------
  const names = ["CommonTree_1", "CommonTree_2", "CommonTree_3", "CommonTree_4", "Pine_1", "Pine_2", "Pine_3"];
  const trees = await Promise.all(names.map((n) => model("nature", n)));
  const [bush, bushFlowers, grass, wispy, flowers3, flowers4, rock1, rock2, rock3, path] = await Promise.all(
    ["Bush_Common", "Bush_Common_Flowers", "Grass_Common_Tall", "Grass_Wispy_Tall", "Flower_3_Group", "Flower_4_Group", "Rock_Medium_1", "Rock_Medium_2", "Rock_Medium_3", "RockPath_Round_Wide"].map(
      (n) => model("nature", n),
    ),
  );
  const rnd = seeded(11);
  const outside = new THREE.Group();
  const onGround = (o: THREE.Object3D, x: number, z: number, s: number, ry = rnd() * Math.PI * 2) =>
    outside.add(place(o, x, ctx.groundHeight(x, z), z, ry, s));

  // the trees close to the cottage take the old trees' spots
  for (let i = 0; i < ph.nearTrees.length; i += 2) {
    const p = ph.nearTrees[i].position;
    onGround(copy(trees[(i / 2) % trees.length]), p.x, p.z, 0.8 + rnd() * 0.3);
  }
  for (const o of ph.nearTrees) o.visible = false;

  // garden around the cottage: bushes, grass, flowers, rocks and a stone path to the door
  const small: [THREE.Object3D, number][] = [[grass, 0.3], [wispy, 0.3], [flowers3, 0.3], [flowers4, 0.3]];
  for (let i = 0; i < 140; i++) {
    const a = rnd() * Math.PI * 2;
    const r = 6 + rnd() * 16;
    const [o, s] = small[Math.floor(rnd() * small.length)];
    onGround(copy(o), Math.cos(a) * r, Math.sin(a) * r, s * (0.8 + rnd() * 0.5));
  }
  for (let i = 0; i < 12; i++) {
    const a = rnd() * Math.PI * 2;
    const r = 6.5 + rnd() * 9;
    onGround(copy(rnd() < 0.5 ? bush : bushFlowers), Math.cos(a) * r, Math.sin(a) * r, 0.6 + rnd() * 0.3);
  }
  [rock1, rock2, rock3].forEach((o, i) => onGround(o, [-8, 10, -5][i], [5, -3, -10][i], 0.45));
  for (let i = 0; i < 6; i++) onGround(copy(path), W / 2 + 1.3 + i * 1.1, ctx.doorZ + Math.sin(i) * 0.3, 0.45);

  // the far forest: a few hundred trees drawn as instances
  const byKind = new Map<number, THREE.Matrix4[]>();
  ph.forest.forEach((o, i) => {
    if (i % 2 === 1) return; // forest placeholders come in trunk + top pairs
    const kind = 4 + (i / 2) % 3; // pines out there
    const s = o.scale.x * 0.9;
    const m = new THREE.Matrix4().compose(
      new THREE.Vector3(o.position.x, ctx.groundHeight(o.position.x, o.position.z), o.position.z),
      new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rnd() * Math.PI * 2),
      new THREE.Vector3(s, s, s),
    );
    if (!byKind.has(kind)) byKind.set(kind, []);
    byKind.get(kind)!.push(m);
  });
  for (const [kind, list] of byKind) outside.add(instanced(trees[kind], list));
  for (const o of ph.forest) o.visible = false;

  scene.add(outside);
  await peopleReady;
}

async function dressPeople(ctx: DressContext) {
  const loaded = await loadKayKit(loader, BASE);
  const castFor = (look: { cast?: "unknown" | "ren" | "mara" | "sol" | "della" }) => look.cast ?? "unknown";
  ctx.onFrame(wearKayKit(ctx.traveler, loaded, castFor, ctx.traveler.look));
  ctx.onFrame(wearKayKit(ctx.della, loaded, castFor, ctx.della.look, 0.92));
}
