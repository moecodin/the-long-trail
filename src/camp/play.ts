// Playing at camp: moving the traveler, the follow camera, the action button
// and the little notes you get when you look at things.

import * as THREE from "three";
import type { PersonLook } from "../scene/people";
import { createCamp, type Spot } from "./camp";
import { Controls } from "./controls";
import { el } from "../ui/dom";

/** Top speed with the stick pushed all the way (m/s). A gentle jog. */
const MAX_SPEED = 3.2;
/** Walking speed for tap-to-walk (m/s). */
const TAP_SPEED = 1.9;
/** How wide the traveler is, for bumping into things. */
const BODY = 0.3;
/** The camera hangs back and up from the traveler: a three-quarter view, like a diorama. */
const CAM_OFFSET = new THREE.Vector3(0, 4.6, 7.4);
const CAM_LOOK = new THREE.Vector3(0, 1.1, 0);

/** What you notice when you look at things. Each look shows the next line. */
const NOTES: Record<string, string[]> = {
  fire: [
    "The fire crackles and pops. Soon you'll come back here to rest at the end of each day.",
    "Sparks drift up toward the first stars.",
    "Della's kindling, dry as a bone. She thinks of everything.",
  ],
  tent: [
    "Your tent. Old canvas, a little patched, but it kept the storm out.",
    "Your bedroll is unrolled and waiting.",
  ],
  supplies: [
    "Apples, a coil of rope and a barrel of water. Della packed more than you'll need.",
    "There's a note tucked in the apple crate: \"Eat the bruised ones first. - D.\"",
  ],
  sign: [
    "THE SUMMIT, says the sign, pointing up the trail. The first leg opens here soon.",
    "Far off through the trees, the lantern on the Summit is still burning.",
  ],
  cart: [
    "An old hand cart with a wobbly wheel. Someone left it here for whoever needs it.",
    "Maybe one day it'll carry things back from the trail.",
  ],
};

export interface CampOptions {
  renderer: THREE.WebGLRenderer;
  canvas: HTMLCanvasElement;
  look: PersonLook;
  /** Called the first time the traveler moves, to hide the how-to hint. */
  onFirstMove?(): void;
  /** A soft click for the action button. */
  tick?(): void;
}

export interface CampSession {
  ready: Promise<void>;
  /** Freeze the traveler (journal open, phone upright). */
  setPaused(paused: boolean): void;
  update(dt: number, time: number): void;
  render(): void;
  resize(): void;
  /** How far the traveler is from the campfire, in meters (for the fire's sound). */
  distanceToFire(): number;
}

export function startCamp(opts: CampOptions): CampSession {
  const camp = createCamp(opts.renderer, opts.look);
  const { traveler, camera } = camp;
  const pos = traveler.root.position;

  let paused = false;
  let moved = false;
  /** Where tap-to-walk is heading, and what to use on arrival. */
  let target: { x: number; z: number; spot: Spot | null } | null = null;
  /** Turning points on the way there, to walk around things in the way. */
  let waypoints: { x: number; z: number }[] = [];
  let stuckTime = 0;
  let sitting = 0; // 0 standing, 1 seated; eased between
  let seated = false;
  let facing = traveler.root.rotation.y;
  let speed = 0;
  const noteCount: Record<string, number> = {};

  // ---------- the tap marker: a little ring on the ground ----------
  const marker = new THREE.Mesh(
    new THREE.RingGeometry(0.22, 0.3, 24),
    new THREE.MeshBasicMaterial({ color: "#fff3d0", transparent: true, opacity: 0, depthWrite: false }),
  );
  marker.rotation.x = -Math.PI / 2;
  marker.position.y = 0.03;
  camp.scene.add(marker);

  // ---------- notes ----------
  const note = el("div", "camp-note");
  document.body.appendChild(note);
  let noteTimer = 0;
  const showNote = (text: string) => {
    note.textContent = text;
    note.classList.add("in");
    noteTimer = 3 + text.length * 0.045;
  };
  const hideNote = () => {
    note.classList.remove("in");
    noteTimer = 0;
  };

  // ---------- input ----------
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const hit = new THREE.Vector3();

  const controls = new Controls(opts.canvas, {
    onTap(x, y) {
      if (paused) return;
      ndc.set((x / window.innerWidth) * 2 - 1, -(y / window.innerHeight) * 2 + 1);
      raycaster.setFromCamera(ndc, camera);
      // Did the tap land on something you can use? Walk over and use it.
      const all = camp.spots.flatMap((s) => s.tapTargets.filter((t) => t.visible).map((t) => ({ t, s })));
      const hits = raycaster.intersectObjects(all.map((a) => a.t), true);
      if (hits.length) {
        let o: THREE.Object3D | null = hits[0].object;
        let spot: Spot | null = null;
        while (o && !spot) {
          const found = all.find((a) => a.t === o);
          if (found) spot = found.s;
          o = o.parent;
        }
        if (spot) return walkTo(spot.standX, spot.standZ, spot);
      }
      if (!raycaster.ray.intersectPlane(groundPlane, hit)) return;
      // a tap right next to something counts as tapping it
      const near = camp.spots.find((s) => Math.hypot(hit.x - s.x, hit.z - s.z) < 0.7);
      if (near) return walkTo(near.standX, near.standZ, near);
      walkTo(hit.x, hit.z, null);
    },
    onAction() {
      if (paused) return;
      opts.tick?.();
      use(nearest());
    },
  });

  function walkTo(x: number, z: number, spot: Spot | null) {
    standUp();
    // keep the goal inside the clearing
    const r = Math.hypot(x, z);
    if (r > camp.radius - BODY) {
      x *= (camp.radius - BODY) / r;
      z *= (camp.radius - BODY) / r;
    }
    target = { x, z, spot };
    waypoints = route(pos.x, pos.z, x, z);
    stuckTime = 0;
    marker.position.set(x, 0.03, z);
    (marker.material as THREE.MeshBasicMaterial).opacity = spot ? 0 : 0.85;
    marker.scale.setScalar(1.4);
  }

  /**
   * Plan a simple route: if something is in the way, add a turning point
   * beside it, on whichever side is shorter. Good enough for a small camp.
   */
  function route(fx: number, fz: number, tx: number, tz: number, depth = 0): { x: number; z: number }[] {
    if (depth > 3) return [];
    const dx = tx - fx, dz = tz - fz;
    const len = Math.hypot(dx, dz);
    if (len < 0.01) return [];
    const ux = dx / len, uz = dz / len;
    let first: { b: (typeof camp.blockers)[number]; t: number; side: number } | null = null;
    for (const b of camp.blockers) {
      const t = (b.x - fx) * ux + (b.z - fz) * uz; // how far along the line the blocker is
      if (t < 0 || t > len) continue;
      const side = (b.x - fx) * uz - (b.z - fz) * ux; // how far off the line, and which side
      const clear = b.r + BODY + 0.05;
      if (Math.abs(side) >= clear) continue;
      // don't route around the very thing we're walking up to
      if (Math.hypot(tx - b.x, tz - b.z) < clear + 0.1) continue;
      if (!first || t < first.t) first = { b, t, side };
    }
    if (!first) return [];
    const { b, side } = first;
    const away = side >= 0 ? -1 : 1; // step to the side the line already leans toward
    const off = b.r + BODY + 0.35;
    const wp = { x: b.x + uz * off * away, z: b.z - ux * off * away };
    return [...route(fx, fz, wp.x, wp.z, depth + 1), wp, ...route(wp.x, wp.z, tx, tz, depth + 1)];
  }

  /** The closest thing within reach, if any. */
  function nearest(): Spot | null {
    let best: Spot | null = null;
    let bestD = Infinity;
    for (const s of camp.spots) {
      const d = Math.hypot(pos.x - s.x, pos.z - s.z);
      if (d < s.range && d < bestD) {
        best = s;
        bestD = d;
      }
    }
    return best;
  }

  function use(spot: Spot | null) {
    if (!spot) return;
    if (spot.id === "bench") {
      if (seated) standUp();
      else sitDown();
      return;
    }
    // turn to face it, then say what you notice
    facing = Math.atan2(spot.x - pos.x, spot.z - pos.z);
    const lines = NOTES[spot.id] ?? [];
    const n = noteCount[spot.id] ?? 0;
    noteCount[spot.id] = n + 1;
    if (lines.length) showNote(lines[n % lines.length]);
  }

  function sitDown() {
    seated = true;
    target = null;
    pos.set(camp.seat.x + 0.05, 0, camp.seat.z);
    facing = camp.seat.facing;
    showNote("You sit by the fire for a while. It's warm.");
  }

  function standUp() {
    if (!seated) return;
    seated = false;
    pos.set(camp.seat.x - 0.75, 0, camp.seat.z);
  }

  /** Move by (dx, dz), sliding around things instead of stopping dead. */
  function step(dx: number, dz: number) {
    pos.x += dx;
    pos.z += dz;
    for (let pass = 0; pass < 2; pass++) {
      for (const b of camp.blockers) {
        const ox = pos.x - b.x, oz = pos.z - b.z;
        const d = Math.hypot(ox, oz);
        const min = b.r + BODY;
        if (d < min && d > 1e-4) {
          pos.x = b.x + (ox / d) * min;
          pos.z = b.z + (oz / d) * min;
        }
      }
      const r = Math.hypot(pos.x, pos.z);
      const max = camp.radius - BODY;
      if (r > max) {
        pos.x *= max / r;
        pos.z *= max / r;
      }
    }
  }

  // for testing in the browser console (dev server only)
  if (import.meta.env.DEV) (window as unknown as Record<string, unknown>).__camp = { camp, pos, CAM_OFFSET };

  const camPos = new THREE.Vector3();
  const camLook = new THREE.Vector3();
  const snapCamera = () => {
    camPos.copy(pos).add(CAM_OFFSET);
    camLook.copy(pos).add(CAM_LOOK);
    camera.position.copy(camPos);
    camera.lookAt(camLook);
  };
  snapCamera();

  return {
    ready: camp.ready,
    setPaused(p) {
      paused = p;
      controls.enabled = !p;
      if (p) {
        controls.release();
        controls.setAction(null);
      }
    },
    update(dt, time) {
      // ---------- moving ----------
      let want = 0;
      let dirX = 0, dirZ = 0;
      if (!paused && controls.steering) {
        // The camera always looks north, so screen right is +x and screen down is +z.
        const m = controls.move;
        const amount = Math.min(1, Math.hypot(m.x, m.y));
        if (amount > 0.12) {
          target = null;
          standUp();
          dirX = m.x / amount;
          dirZ = m.y / amount;
          want = MAX_SPEED * amount;
        }
      } else if (!paused && target) {
        const goal = waypoints[0] ?? target;
        const dx = goal.x - pos.x, dz = goal.z - pos.z;
        const d = Math.hypot(dx, dz);
        if (waypoints.length && d < 0.35) {
          waypoints.shift();
        } else if (d < 0.12) {
          const spot = target.spot;
          target = null;
          use(spot);
        } else {
          dirX = dx / d;
          dirZ = dz / d;
          // ease in to a stop
          want = waypoints.length ? TAP_SPEED : Math.min(TAP_SPEED, d * 2.5 + 0.4);
        }
      }
      // speed up and slow down smoothly
      speed += (want - speed) * Math.min(1, dt * 8);
      if (want > 0) {
        const before = pos.clone();
        step(dirX * speed * dt, dirZ * speed * dt);
        facing = Math.atan2(dirX, dirZ);
        // give up on a tap-to-walk that's stuck behind something
        if (target && before.distanceTo(pos) < speed * dt * 0.25) {
          stuckTime += dt;
          if (stuckTime > 0.6) target = null;
        } else stuckTime = 0;
        if (!moved) {
          moved = true;
          opts.onFirstMove?.();
        }
      } else if (speed < 0.02) speed = 0;
      traveler.setPace(want > 0 ? speed : 0, dt);

      // turn smoothly toward where you're heading
      const cur = traveler.root.rotation.y;
      const diff = Math.atan2(Math.sin(facing - cur), Math.cos(facing - cur));
      traveler.root.rotation.y = cur + diff * Math.min(1, dt * 12);

      // sitting down and getting up
      sitting += ((seated ? 1 : 0) - sitting) * Math.min(1, dt * 6);
      traveler.setSit(sitting);
      pos.y = sitting * camp.seat.y;

      // ---------- the action button ----------
      if (!paused) {
        const spot = target ? null : nearest();
        controls.setAction(spot ? (spot.id === "bench" && seated ? "Stand up" : spot.label) : null);
      }

      // ---------- the tap marker fades and shrinks ----------
      const mm = marker.material as THREE.MeshBasicMaterial;
      if (mm.opacity > 0) {
        mm.opacity = target ? Math.max(0.35, mm.opacity - dt) : Math.max(0, mm.opacity - dt * 2.5);
        marker.scale.setScalar(Math.max(1, marker.scale.x - dt * 2));
      }

      // ---------- notes fade on their own ----------
      if (noteTimer > 0) {
        noteTimer -= dt;
        if (noteTimer <= 0 || (want > 0 && noteTimer < 2.2)) hideNote();
      }

      // ---------- the camera follows gently ----------
      const k = 1 - Math.exp(-dt * 4);
      camPos.lerp(new THREE.Vector3().copy(pos).setY(0).add(CAM_OFFSET), k);
      camLook.lerp(new THREE.Vector3().copy(pos).setY(0).add(CAM_LOOK), k);
      camera.position.copy(camPos);
      camera.lookAt(camLook);

      camp.update(dt, time);
    },
    render() {
      opts.renderer.render(camp.scene, camera);
    },
    resize() {
      camp.resize();
    },
    distanceToFire() {
      return Math.hypot(pos.x, pos.z);
    },
  };
}
