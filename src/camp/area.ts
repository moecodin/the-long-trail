// What every place you can walk around shares: camp, and each leg of the trail.
//
// An area is a 3D scene plus a few lists: things you bump into (blockers),
// things you can use with the action button (spots), and where you're allowed
// to walk (a set of "capsules": fat line segments, so a winding lane is just a
// few of them joined end to end, and a round clearing is one with no length).
// play.ts does the walking, the camera and the action button for any area.

import * as THREE from "three";
import type { makePerson } from "../scene/people";

/** Round things you can't walk through: x, z and radius in meters. */
export interface Blocker {
  x: number;
  z: number;
  r: number;
}

/** Something you can walk up to and use with the action button. */
export interface Spot {
  id: string;
  /** The action button's label, like "Look" or "Sit". */
  label: string;
  /** Where the thing is. */
  x: number;
  z: number;
  /** How close you need to be for the button to show. */
  range: number;
  /** Where to stand when you tap the thing from far away. */
  standX: number;
  standZ: number;
  /** Meshes you can tap on to walk over to this thing. */
  tapTargets: THREE.Object3D[];
  /** Set on things you can pick up and put in the satchel (see gather.ts). */
  gather?: string;
}

/** A fat line segment you can walk anywhere inside of. a and b can be the same point (a circle). */
export interface Capsule {
  ax: number;
  az: number;
  bx: number;
  bz: number;
  r: number;
}

export interface Area {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  traveler: ReturnType<typeof makePerson>;
  blockers: Blocker[];
  spots: Spot[];
  /** Where you can walk. */
  walk: Capsule[];
  /** Where the traveler stands when they arrive, and which way they face. */
  start: { x: number; z: number; facing: number };
  /** What you notice when you look at things here. Each look shows the next line. */
  notes: Record<string, string[]>;
  /** A campfire, if there is one (its crackle gets louder as you get close). */
  fire?: { x: number; z: number };
  /** Houses and other big things the camera mustn't go inside (it moves in front of them). */
  cameraBlocks?: THREE.Box3[];
  /** A bench to sit on, if there is one. */
  seat?: { x: number; z: number; y: number; facing: number };
  /** Resolves once the kit models are in place (or failed and the shapes stay). */
  ready: Promise<void>;
  /**
   * The area's own reaction to using a spot (tapping with the stick, opening a
   * gate...). Return a note to show, "" to say nothing, or null to fall back
   * to the area's notes.
   */
  use?(spot: Spot): string | null;
  /** Something nearby the fox finds very interesting (an unfound secret), if any. */
  interest?(x: number, z: number): { x: number; z: number } | null;
  /** Things changed outside the area (you were given a tool...): redraw what depends on them. */
  refresh?(): void;
  /** Take a picked-up thing out of the world (its little float-up is done by the area). */
  pick?(spot: Spot, toward: THREE.Vector3): void;
  update(dt: number, time: number): void;
  resize(): void;
}

/** The closest point on a capsule's middle line to (x, z), and how far away it is. */
function nearestOn(c: Capsule, x: number, z: number) {
  const dx = c.bx - c.ax, dz = c.bz - c.az;
  const len2 = dx * dx + dz * dz;
  const t = len2 > 0 ? THREE.MathUtils.clamp(((x - c.ax) * dx + (z - c.az) * dz) / len2, 0, 1) : 0;
  const px = c.ax + dx * t, pz = c.az + dz * t;
  return { px, pz, d: Math.hypot(x - px, z - pz) };
}

/** How far (x, z) is outside the walkable ground (0 or less means inside). */
export function outside(walk: Capsule[], x: number, z: number): number {
  let best = Infinity;
  for (const c of walk) best = Math.min(best, nearestOn(c, x, z).d - c.r);
  return best;
}

/** Pull a point back inside the walkable ground, keeping `body` meters from the edge. */
export function clampWalk(walk: Capsule[], x: number, z: number, body: number): { x: number; z: number } {
  let best: { x: number; z: number } | null = null;
  let bestOut = Infinity;
  for (const c of walk) {
    const n = nearestOn(c, x, z);
    const room = c.r - body;
    if (n.d <= room) return { x, z };
    const over = n.d - room;
    if (over < bestOut) {
      bestOut = over;
      const k = n.d > 1e-6 ? room / n.d : 0;
      best = { x: n.px + (x - n.px) * k, z: n.pz + (z - n.pz) * k };
    }
  }
  return best ?? { x, z };
}

/** Push (x, z) out of any blockers, then back inside the walkable ground. Changes p in place. */
export function settle(p: { x: number; z: number }, blockers: Blocker[], walk: Capsule[], body: number) {
  for (let pass = 0; pass < 2; pass++) {
    for (const b of blockers) {
      const ox = p.x - b.x, oz = p.z - b.z;
      const d = Math.hypot(ox, oz);
      const min = b.r + body;
      if (d < min && d > 1e-4) {
        p.x = b.x + (ox / d) * min;
        p.z = b.z + (oz / d) * min;
      }
    }
    const c = clampWalk(walk, p.x, p.z, body);
    p.x = c.x;
    p.z = c.z;
  }
}

/** A soft round glow, for fires, lanterns and lit windows. */
export function glowTexture(): THREE.Texture {
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
