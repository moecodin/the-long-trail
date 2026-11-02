// Walking around an area (camp, or a leg of the trail): moving the traveler,
// the follow camera, the action button, picking things up, and the little
// notes you get when you look at things.

import * as THREE from "three";
import type { PersonLook } from "../scene/people";
import { clampWalk, settle, type Area, type Spot } from "./area";
import { Controls } from "./controls";
import { loadFox, type Fox } from "./fox";
import { loader } from "../scene/kits";
import { el } from "../ui/dom";

/** Top speed with the stick pushed all the way (m/s). A gentle jog. */
const MAX_SPEED = 3.2;
/** Walking speed for tap-to-walk (m/s). */
const TAP_SPEED = 1.9;
/** How wide the traveler is, for bumping into things. */
const BODY = 0.3;
/**
 * The camera hangs back and up from the traveler: a three-quarter view, like a
 * diorama. Dragging on the right side of the screen swings it around the
 * traveler (yaw) and tips it up or down (pitch), within limits.
 */
const CAM_DIST = Math.hypot(4.6, 7.4);
/** How close and how far pinch / the mouse wheel can take the camera, in meters. */
const MIN_DIST = 4;
const MAX_DIST = 14;
const CAM_LOOK = new THREE.Vector3(0, 1.1, 0);
/** Where the camera starts: looking north, tipped down about 32 degrees. */
const START_PITCH = Math.atan2(4.6, 7.4);
/** How low and how high the camera can tip, in radians (about 12 and 62 degrees). */
const MIN_PITCH = 0.21;
const MAX_PITCH = 1.08;
/** Radians of turn per pixel dragged. About half a turn across a phone screen. */
const TURN_PER_PX = 0.0045;
const TILT_PER_PX = 0.003;

export interface CampOptions {
  renderer: THREE.WebGLRenderer;
  canvas: HTMLCanvasElement;
  look: PersonLook;
  /** Builds the place to walk around (camp, or a leg of the trail). */
  build(renderer: THREE.WebGLRenderer, look: PersonLook): Area;
  /** Arrive here instead of the area's usual starting spot. */
  startAt?: { x: number; z: number; facing: number };
  /** A spot whose id starts with "exit:" was used (setting out, making camp...). */
  onExit?(id: string): void;
  /** Something was picked up. Returns the note to show. */
  onGather?(spot: Spot): string;
  /** Talking to someone or using something special. Return a note to show, "" to say nothing, or null for the area's own handling. */
  onUse?(spot: Spot): string | null;
  /** Called the first time the traveler moves, to hide the how-to hint. */
  onFirstMove?(): void;
  /** A soft click for the action button. */
  tick?(): void;
  /** The traveler wants to rest at the campfire (opens the journal's Rest page). */
  onRest?(): void;
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
  /** Show a little note at the bottom of the screen. */
  note(text: string): void;
  /** Take everything off the screen (leaving for another area). */
  dispose(): void;
  /** Redraw what depends on the save (a new tool, a keepsake...). */
  refresh(): void;
}

export function startCamp(opts: CampOptions): CampSession {
  const camp = opts.build(opts.renderer, opts.look);
  const { traveler, camera } = camp;
  const pos = traveler.root.position;
  const start = opts.startAt ?? camp.start;
  pos.set(start.x, 0, start.z);
  traveler.root.rotation.y = start.facing;

  // The fox companion. It comes from outside the repo (see fox.ts), so camp
  // works fine without it if it can't be fetched.
  let fox: Fox | null = null;
  let gone = false;
  loadFox(loader, camp)
    .then((f) => {
      if (gone) return;
      f.placeAt(pos.x - 0.8, pos.z + 0.6, traveler.root.rotation.y);
      fox = f;
    })
    .catch((err) => console.warn("The fox did not load; camp goes on without it.", err));

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
  /** Seconds left of a pick-up (the traveler stays put while they bend down). */
  let busy = 0;
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
    if (busy > 0) return;
    standUp();
    // keep the goal on ground you can walk on
    ({ x, z } = clampWalk(camp.walk, x, z, BODY));
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
    if (!spot || busy > 0) return;
    if (spot.id.startsWith("exit:")) {
      facing = Math.atan2(spot.x - pos.x, spot.z - pos.z);
      hideNote();
      opts.onExit?.(spot.id);
      return;
    }
    if (spot.gather) return pickUp(spot);
    if (spot.id === "bench") {
      if (seated) standUp();
      else sitDown();
      return;
    }
    if (spot.id === "fire" && opts.onRest) {
      facing = Math.atan2(spot.x - pos.x, spot.z - pos.z);
      hideNote();
      opts.onRest();
      return;
    }
    // turn to face it, then say what you notice
    facing = Math.atan2(spot.x - pos.x, spot.z - pos.z);
    const special = opts.onUse?.(spot) ?? camp.use?.(spot) ?? null;
    if (special !== null) {
      traveler.gesture("Interact");
      if (special) showNote(special);
      else hideNote();
      return;
    }
    const lines = camp.notes[spot.id] ?? [];
    const n = noteCount[spot.id] ?? 0;
    noteCount[spot.id] = n + 1;
    if (lines.length) showNote(lines[n % lines.length]);
  }

  /** Bend down, pick it up, and pop it in the satchel. */
  function pickUp(spot: Spot) {
    facing = Math.atan2(spot.x - pos.x, spot.z - pos.z);
    target = null;
    busy = 1.05;
    traveler.gesture("PickUp");
    // the hand reaches the ground partway through the bend
    setTimeout(() => {
      if (gone) return;
      camp.spots.splice(camp.spots.indexOf(spot), 1);
      camp.pick?.(spot, new THREE.Vector3(pos.x, 0.9, pos.z));
      const text = opts.onGather?.(spot);
      if (text) showNote(text);
    }, 450);
  }

  function sitDown() {
    if (!camp.seat) return;
    seated = true;
    target = null;
    pos.set(camp.seat.x + 0.05, 0, camp.seat.z);
    facing = camp.seat.facing;
    showNote("You sit by the fire for a while. It's warm.");
  }

  function standUp() {
    if (!seated || !camp.seat) return;
    seated = false;
    pos.set(camp.seat.x - 0.75, 0, camp.seat.z);
  }

  /** Move by (dx, dz), sliding around things instead of stopping dead. */
  function step(dx: number, dz: number) {
    pos.x += dx;
    pos.z += dz;
    settle(pos, camp.blockers, camp.walk, BODY);
  }

  // for testing in the browser console (dev server only)
  if (import.meta.env.DEV) (window as unknown as Record<string, unknown>).__camp = { camp, pos, cam: () => ({ yaw, pitch, dist, wantDist }) };

  // ---------- the orbit camera ----------
  /** Which way the camera faces around the traveler: 0 looks north, and it grows turning left. */
  let yaw = 0;
  let pitch = START_PITCH;
  /** Where your drags are taking it; the camera eases toward these so it feels smooth. */
  let wantYaw = yaw;
  let wantPitch = pitch;
  let dist = CAM_DIST;
  let wantDist = dist;
  /** The spot the camera circles around: just above the traveler, following gently. */
  const focus = new THREE.Vector3().copy(pos).setY(0);
  const camLook = new THREE.Vector3();
  /**
   * How far the camera can really go before a house is in the way. It slides
   * in front of the wall or roof, then eases back out once the way is clear.
   */
  let reach = dist;
  const ray = new THREE.Ray();
  const hitAt = new THREE.Vector3();
  const placeCamera = (dt = 0) => {
    const flat = Math.cos(pitch);
    camLook.copy(focus).add(CAM_LOOK);
    ray.origin.copy(camLook);
    ray.direction.set(Math.sin(yaw) * flat, Math.sin(pitch), Math.cos(yaw) * flat);
    let room = dist;
    for (const box of camp.cameraBlocks ?? []) {
      // standing right under the eaves: nothing sensible to do, so leave the camera be
      if (box.containsPoint(camLook)) continue;
      if (ray.intersectBox(box, hitAt)) room = Math.min(room, Math.max(1.6, hitAt.distanceTo(camLook) - 0.35));
    }
    // snap in at once (never show the inside of a roof), ease back out
    reach = room < reach || dt === 0 ? room : reach + (room - reach) * (1 - Math.exp(-dt * 3));
    camera.position.copy(camLook).addScaledVector(ray.direction, reach).sub(CAM_LOOK);
    camera.lookAt(camLook);
  };
  placeCamera();

  return {
    ready: camp.ready,
    note: showNote,
    refresh() {
      camp.refresh?.();
    },
    dispose() {
      gone = true;
      controls.setAction(null);
      controls.dispose();
      note.remove();
    },
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
      if (busy > 0) busy -= paused ? 0 : dt;
      if (busy > 0) {
        // picking something up: stay put
      } else if (!paused && controls.steering) {
        // Push the stick up and you walk away from the camera, whichever way it faces.
        const m = controls.move;
        const amount = Math.min(1, Math.hypot(m.x, m.y));
        if (amount > 0.12) {
          target = null;
          standUp();
          const sx = m.x / amount, sy = m.y / amount;
          const c = Math.cos(yaw), s = Math.sin(yaw);
          dirX = sx * c + sy * s;
          dirZ = -sx * s + sy * c;
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
      pos.y = sitting * (camp.seat?.y ?? 0);

      // ---------- the action button ----------
      if (!paused) {
        const spot = target || busy > 0 ? null : nearest();
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

      // ---------- the camera follows gently, and turns when you drag ----------
      const drag = controls.takeLook(dt);
      if (!paused) {
        // drag right to look right; drag up to look up (the camera dips lower)
        wantYaw -= drag.x * TURN_PER_PX;
        wantPitch = Math.min(MAX_PITCH, Math.max(MIN_PITCH, wantPitch + drag.y * TILT_PER_PX));
      }
      const zoom = controls.takeZoom(dt);
      if (!paused) wantDist = Math.min(MAX_DIST, Math.max(MIN_DIST, wantDist * zoom));
      const turn = 1 - Math.exp(-dt * 14);
      dist += (wantDist - dist) * turn;
      yaw += (wantYaw - yaw) * turn;
      pitch += (wantPitch - pitch) * turn;
      focus.lerp(new THREE.Vector3().copy(pos).setY(0), 1 - Math.exp(-dt * 4));
      placeCamera(dt);

      fox?.update(paused ? 0 : dt, pos.x, pos.z, traveler.root.rotation.y, seated, camp.interest?.(pos.x, pos.z) ?? null);
      camp.update(dt, time);
    },
    render() {
      opts.renderer.render(camp.scene, camera);
    },
    resize() {
      camp.resize();
    },
    distanceToFire() {
      return camp.fire ? Math.hypot(pos.x - camp.fire.x, pos.z - camp.fire.z) : 99;
    },
  };
}
