// Gathering: herbs, flowers, mushrooms, fallen apples and eggs you can pick
// up on the trail and keep in your satchel. Everything you pick grows back
// (or gets laid again) the next real day, after the journal's day starts at 4 am.
//
// Which kit model plays which herb is a first pick from the Nature kit; the
// Trail Herb Picker lets MoeCodin swap any of them (change `model` below).

import * as THREE from "three";
import { glowTexture, type Spot } from "../camp/area";
import { model } from "../scene/kits";

export type ItemId = "thyme" | "chives" | "sage" | "chamomile" | "mushroom" | "apple" | "egg";

export interface Item {
  id: ItemId;
  name: string;
  /** A short line for the note when you pick one. */
  pickLines: string[];
  /** What the satchel's Items page says about it. */
  about: string;
  /** Where to find it in Leg 1. */
  where: string;
  /** The Nature kit model and its size, or a hand-built shape. */
  model: { kit: "nature"; name: string; scale: number } | { built: "apple" | "egg" };
}

export const ITEMS: Item[] = [
  {
    id: "thyme",
    name: "Thyme",
    pickLines: ["A sprig of thyme. Your fingers smell like Della's soup now.", "More thyme, tiny purple flowers and all."],
    about: "Tiny leaves, a big smell. Della puts it in nearly everything.",
    where: "Della's herb bed",
    model: { kit: "nature", name: "Plant_7", scale: 0.55 },
  },
  {
    id: "chives",
    name: "Chives",
    pickLines: ["A handful of chives. They snap like little green straws.", "Chives, a bit oniony. Good on eggs."],
    about: "Thin green stalks with a gentle onion bite. Snip, don't pull, and they grow right back.",
    where: "Della's herb bed",
    model: { kit: "nature", name: "Grass_Wispy_Short", scale: 0.42 },
  },
  {
    id: "sage",
    name: "Sage",
    pickLines: ["A few soft sage leaves, fuzzy as a mouse's ear.", "Sage. It smells warm, somehow."],
    about: "Soft grey-green leaves. Lovely in bread and with roast vegetables.",
    where: "Della's herb bed",
    model: { kit: "nature", name: "Plant_1", scale: 0.38 },
  },
  {
    id: "chamomile",
    name: "Chamomile",
    pickLines: ["Chamomile, for a sleepy cup of tea at camp.", "A little bunch of chamomile. It smells like apples."],
    about: "Little daisy-like flowers for tea. Della swears by a cup before bed.",
    where: "Along the lane out of Lowmeadow",
    model: { kit: "nature", name: "Flower_4_Single", scale: 0.2 },
  },
  {
    id: "mushroom",
    name: "Field mushrooms",
    pickLines: ["Field mushrooms, the kind Della taught you are safe.", "A few more mushrooms, still cool from the shade."],
    about: "Plain field mushrooms from the shady verges. (In real life, only eat mushrooms from a shop or someone who truly knows.)",
    where: "In the shade along the lane",
    model: { kit: "nature", name: "Mushroom_Common", scale: 0.5 },
  },
  {
    id: "apple",
    name: "Apples",
    pickLines: ["A windfall apple. Only a little bruised.", "Another apple. The fox looks hopeful."],
    about: "Windfalls from Della's old apple tree. Eat the bruised ones first.",
    where: "Under the apple tree in Della's yard",
    model: { built: "apple" },
  },
  {
    id: "egg",
    name: "Eggs",
    pickLines: ["A warm brown egg. Thank you, hens.", "Another egg, tucked in the straw."],
    about: "Della's hens lay a couple every day, if you know where they hide them.",
    where: "By the hen house",
    model: { built: "egg" },
  },
];

export const item = (id: string) => ITEMS.find((i) => i.id === id) ?? null;

/** What the game remembers about gathering (part of the save, synced like your traveler). */
export interface GatherSave {
  /** How many of each thing you've ever picked. */
  gathered: Partial<Record<ItemId, number>>;
  /** Each spot you've picked, and the day you picked it (it grows back the next day). */
  picked: Record<string, string>;
}

export const freshGather = (): GatherSave => ({ gathered: {}, picked: {} });

/** Has this spot grown back since it was last picked? */
export const grown = (g: GatherSave, spotId: string, today: string) => g.picked[spotId] !== today;

/** Write down a pick. Returns how many of that thing you now have. */
export function recordPick(g: GatherSave, spotId: string, id: ItemId, today: string): number {
  g.picked[spotId] = today;
  g.gathered[id] = (g.gathered[id] ?? 0) + 1;
  // old days can be forgotten, so the save stays small
  for (const k of Object.keys(g.picked)) if (g.picked[k] !== today) delete g.picked[k];
  return g.gathered[id]!;
}

/** The note to show for a pick (each thing has a couple of lines, taken in turn). */
export function pickNote(id: ItemId, count: number): string {
  const it = item(id)!;
  return `${it.pickLines[(count - 1) % it.pickLines.length]} (${it.name}: ${count} in your satchel)`;
}

// ---------- in the world ----------

const flat = (color: string) => new THREE.MeshStandardMaterial({ color, flatShading: true, roughness: 0.8 });

/** A little low-poly apple with a stem and a leaf. */
function buildApple(): THREE.Object3D {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.IcosahedronGeometry(0.07, 1), flat("#c0392b"));
  body.scale.set(1, 0.9, 1);
  body.position.y = 0.06;
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.04, 4), flat("#5a3a22"));
  stem.position.y = 0.14;
  const leaf = new THREE.Mesh(new THREE.ConeGeometry(0.018, 0.05, 4), flat("#5c8a3a"));
  leaf.position.set(0.02, 0.14, 0);
  leaf.rotation.z = -1.1;
  g.add(body, stem, leaf);
  return g;
}

/** A brown egg in a little nest of straw. */
function buildEgg(): THREE.Object3D {
  const g = new THREE.Group();
  const straw = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.035, 5, 10), flat("#d9b45a"));
  straw.rotation.x = -Math.PI / 2;
  straw.position.y = 0.03;
  const egg = new THREE.Mesh(new THREE.SphereGeometry(0.045, 10, 8), new THREE.MeshStandardMaterial({ color: "#d9a97a", roughness: 0.6 }));
  egg.scale.set(1, 1.3, 1);
  egg.position.y = 0.06;
  egg.name = "egg";
  g.add(straw, egg);
  return g;
}

let sparkleTex: THREE.Texture | null = null;

interface Pickable {
  spot: Spot;
  root: THREE.Group;
  thing: THREE.Object3D;
  ring: THREE.Mesh;
  sparkles: THREE.Sprite[];
  /** Set while it floats up into the satchel. */
  flying: { t: number; from: THREE.Vector3; to: THREE.Vector3 } | null;
  /** Set while it drops from a branch: how fast it's falling, and where the ground is. */
  falling: { v: number; ground: number } | null;
  phase: number;
}

/**
 * The things you can pick up in one area. Each gets the "you can pick this"
 * look from the Herb Picker: a soft gold ring on the ground and a few
 * twinkling sparkles, without tinting the plant itself.
 */
export class Pickables {
  private list: Pickable[] = [];
  readonly group = new THREE.Group();

  constructor(
    private spots: Spot[],
    private save: GatherSave,
    private today: string,
  ) {}

  /** Put something to pick at (x, z). Skipped if it was already picked today. */
  async add(spotId: string, id: ItemId, x: number, z: number, y = 0, ry = Math.random() * Math.PI * 2, fromY?: number) {
    if (!grown(this.save, spotId, this.today)) return;
    const it = item(id)!;
    const thing = "built" in it.model ? (it.model.built === "apple" ? buildApple() : buildEgg()) : await model("nature", it.model.name);
    if ("kit" in it.model) thing.scale.setScalar(it.model.scale);
    thing.rotation.y = ry;
    const root = new THREE.Group();
    root.position.set(x, y, z);
    root.add(thing);

    sparkleTex ??= glowTexture();
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.26, 0.34, 28),
      new THREE.MeshBasicMaterial({ color: "#ffd77a", transparent: true, opacity: 0.5, depthWrite: false }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.025;
    root.add(ring);
    const sparkles: THREE.Sprite[] = [];
    for (let i = 0; i < 3; i++) {
      const s = new THREE.Sprite(
        new THREE.SpriteMaterial({ map: sparkleTex, color: "#fff2b0", transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }),
      );
      s.scale.setScalar(0.12);
      root.add(s);
      sparkles.push(s);
    }
    this.group.add(root);

    const spot: Spot = { id: spotId, label: "Pick", x, z, range: 1.15, standX: x, standZ: z + 0.55, tapTargets: [thing, ring], gather: id };
    this.spots.push(spot);
    const falling = fromY !== undefined ? { v: 0, ground: y } : null;
    if (falling) {
      root.position.y = fromY!;
      ring.visible = false;
    }
    this.list.push({ spot, root, thing, ring, sparkles, flying: null, falling, phase: Math.random() * 10 });
  }

  /** It floats up toward the satchel, shrinking, then it's gone. */
  pick(spot: Spot, toward: THREE.Vector3) {
    const p = this.list.find((x) => x.spot === spot);
    if (!p) return;
    p.ring.visible = false;
    p.sparkles.forEach((s) => (s.visible = false));
    p.flying = { t: 0, from: p.root.position.clone(), to: toward.clone() };
  }

  update(dt: number, time: number) {
    for (let i = this.list.length - 1; i >= 0; i--) {
      const p = this.list[i];
      if (p.falling) {
        // tumble down, with one small bounce
        const f = p.falling;
        f.v -= 9.8 * dt;
        p.root.position.y += f.v * dt;
        p.thing.rotation.x += dt * 6;
        if (p.root.position.y <= f.ground) {
          p.root.position.y = f.ground;
          if (f.v < -2.5) f.v = -f.v * 0.3;
          else {
            p.falling = null;
            p.thing.rotation.x = 0;
            p.ring.visible = true;
          }
        }
        continue;
      }
      if (p.flying) {
        const f = p.flying;
        f.t += dt / 0.5;
        const t = Math.min(1, f.t);
        p.root.position.lerpVectors(f.from, f.to, t);
        p.root.position.y += Math.sin(t * Math.PI) * 0.5;
        p.thing.scale.multiplyScalar(Math.max(0, 1 - dt * 4));
        if (t >= 1) {
          this.group.remove(p.root);
          this.list.splice(i, 1);
        }
        continue;
      }
      // the ring breathes and the sparkles twinkle, each on its own beat
      const b = 0.5 + Math.sin(time * 2 + p.phase) * 0.5;
      (p.ring.material as THREE.MeshBasicMaterial).opacity = 0.25 + b * 0.35;
      p.ring.scale.setScalar(1 + b * 0.08);
      p.sparkles.forEach((s, k) => {
        const tt = time * 0.8 + p.phase + k * 2.1;
        const life = tt % 1;
        const a = Math.floor(tt) * 2.4 + k;
        s.position.set(Math.cos(a) * 0.22, 0.12 + life * 0.45, Math.sin(a) * 0.22);
        (s.material as THREE.SpriteMaterial).opacity = Math.sin(life * Math.PI) * 0.9;
      });
    }
  }
}
