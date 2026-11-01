// The fox companion: trots after the traveler around camp, and stands idle
// (looking up at them now and then) when they stop.
//
// Model: "7-Rigged LOW POLY STYLE FOX CHARACTER" by ArtifySpace (Fab). It is
// NOT in this repo: Fab's license lets us use it in the game, but not hand out
// the file itself, and this repo is public. The game downloads it from the
// project's own storage (see FOX_URL and CREDITS.md). If it can't be fetched,
// camp simply has no fox.
//
// It comes with its own idle, walk and run animations (two-legged, Mixamo
// rig), so nothing had to be borrowed. Converted from FBX to GLB, with its
// unrigged duplicate and the punch/death clips taken out, by
// tools/prepare-fox.mjs.

import * as THREE from "three";
import type { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import type { Blocker } from "./camp";

/**
 * Where the fox model is downloaded from. A local copy (dev and the preview
 * link) can be pointed at with VITE_FOX_URL; the live game uses the project's
 * Supabase storage.
 */
export const FOX_URL: string =
  import.meta.env.VITE_FOX_URL ??
  "https://oearcgsdolpgkhtjapuf.supabase.co/storage/v1/object/public/game-art/fox.glb";

/** How tall the fox stands, in meters (the traveler is about 1.55). */
const FOX_HEIGHT = 0.82;
/** How wide the fox is, for bumping into things. */
const BODY = 0.22;
/** It starts to follow when the traveler is farther than this... */
const START_FOLLOW = 1.7;
/** ...and settles down once it's this close to its spot beside them. */
const SETTLE = 0.25;
/**
 * Speeds in m/s. Its legs are short, so it walks slowly and breaks into a
 * scamper to keep up with you; past WALK it blends into the run.
 */
const WALK = 0.9;
const RUN = 3.4;

/**
 * The walk and run clips move the hips forward as they play ("root motion"),
 * and their very first key is a stray pose with the hips sunk into the
 * ground. Take out that key and the forward slide, so the clip walks on the
 * spot and our code does the moving. Returns how fast the clip's feet travel,
 * in the model's units per second, so we can match it to the ground.
 */
function walkInPlace(clip: THREE.AnimationClip): number {
  let speed = 1;
  for (const t of clip.tracks) {
    const times = t.times, values = t.values, n = values.length / times.length;
    if (times.length > 2 && times[0] === 0 && times[1] - times[0] > 0) {
      // drop the stray first key on every track
      t.times = times.slice(1).map((x) => x - times[1]) as unknown as Float32Array;
      t.values = values.slice(n);
    }
    if (/Hips\.position$/.test(t.name)) {
      const v = t.values, k = t.times.length;
      const dur = t.times[k - 1] - t.times[0];
      const dist = Math.hypot(v[(k - 1) * 3] - v[0], v[(k - 1) * 3 + 2] - v[2]);
      if (dur > 0) speed = dist / dur;
      for (let i = 0; i < k; i++) {
        v[i * 3] = v[0];
        v[i * 3 + 2] = v[2];
      }
    }
  }
  clip.resetDuration();
  return speed;
}

export interface Fox {
  /** Put the fox somewhere right away (no walking). */
  placeAt(x: number, z: number, facing: number): void;
  /** Follow the traveler at (x, z), who faces `facing` (radians). */
  update(dt: number, x: number, z: number, facing: number, seated: boolean): void;
}

interface FoxWorld {
  scene: THREE.Scene;
  blockers: Blocker[];
  radius: number;
}

export async function loadFox(loader: GLTFLoader, world: FoxWorld, url = FOX_URL): Promise<Fox> {
  const gltf = await loader.loadAsync(url);
  const model = gltf.scene;
  model.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh) {
      m.castShadow = true;
      m.frustumCulled = false; // skinned meshes can be culled by their bind-pose box
    }
  });

  // Size it from the standing pose and stand its feet on the ground.
  const mixer = new THREE.AnimationMixer(model);
  const clip = (name: string) => gltf.animations.find((a) => a.name === name);
  const idleClip = clip("idle");
  if (idleClip) {
    mixer.clipAction(idleClip).play();
    mixer.update(0);
  }
  model.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(model, true);
  const holder = new THREE.Group();
  const scale = FOX_HEIGHT / Math.max(0.01, box.max.y - box.min.y);
  model.position.y = -box.min.y;
  holder.add(model);
  holder.scale.setScalar(scale);
  const root = new THREE.Group();
  root.add(holder);
  world.scene.add(root);

  const walkClip = clip("walk"), runClip = clip("run");
  // how fast (m/s, at our size) the walk and run cycles move the feet
  const walkCycle = walkClip ? walkInPlace(walkClip) * scale : WALK;
  const runCycle = runClip ? walkInPlace(runClip) * scale : RUN;
  const actions = {
    idle: idleClip ? mixer.clipAction(idleClip) : null,
    walk: walkClip ? mixer.clipAction(walkClip) : null,
    run: runClip ? mixer.clipAction(runClip) : null,
  };
  for (const a of Object.values(actions)) a?.play();
  // weights eased toward what the fox is doing
  const weight = { idle: 1, walk: 0, run: 0 };

  const pos = root.position;
  let speed = 0;
  let following = false;
  let facing = 0;
  /** Now and then the fox looks up at you, or glances around. */
  let glanceTimer = 2;
  let glanceTo: number | null = null;
  /** Which side of the traveler it likes to walk on: 1 is their left. */
  let side = 1;

  function step(dx: number, dz: number) {
    pos.x += dx;
    pos.z += dz;
    for (let pass = 0; pass < 2; pass++) {
      for (const b of world.blockers) {
        const ox = pos.x - b.x, oz = pos.z - b.z;
        const d = Math.hypot(ox, oz);
        const min = b.r + BODY;
        if (d < min && d > 1e-4) {
          pos.x = b.x + (ox / d) * min;
          pos.z = b.z + (oz / d) * min;
        }
      }
      const r = Math.hypot(pos.x, pos.z);
      const max = world.radius - BODY;
      if (r > max) {
        pos.x *= max / r;
        pos.z *= max / r;
      }
    }
  }

  /** The spot it wants: a little behind the traveler, off to one side. */
  function spotNear(x: number, z: number, f: number) {
    const back = 0.75, out = 0.65;
    const fx = Math.sin(f), fz = Math.cos(f); // traveler's forward
    const lx = fz, lz = -fx; // traveler's left
    return { x: x - fx * back + lx * out * side, z: z - fz * back + lz * out * side };
  }

  return {
    placeAt(x, z, f) {
      pos.set(x, 0, z);
      facing = root.rotation.y = f;
    },
    update(dt, tx, tz, tf, seated) {
      // Pick the side of the traveler the fox is already on, so it doesn't cross in front.
      const fx = Math.sin(tf), fz = Math.cos(tf);
      const onLeft = (pos.x - tx) * fz - (pos.z - tz) * fx > 0;
      if (!following) side = onLeft ? 1 : -1;

      const goal = spotNear(tx, tz, tf);
      const toGoal = Math.hypot(goal.x - pos.x, goal.z - pos.z);
      const toTraveler = Math.hypot(tx - pos.x, tz - pos.z);
      if (!following && (toTraveler > START_FOLLOW || (seated && toGoal > 0.8))) following = true;
      if (following && toGoal < SETTLE) following = false;

      let want = 0;
      if (following) {
        // scamper to catch up, slow to a walk as it arrives
        want = Math.min(RUN, toGoal * 1.8 + 0.3);
        const dx = (goal.x - pos.x) / toGoal, dz = (goal.z - pos.z) / toGoal;
        facing = Math.atan2(dx, dz);
        glanceTo = null;
        glanceTimer = 1.5 + Math.random() * 2;
      } else {
        // standing by: every few seconds, look up at the traveler or glance around
        glanceTimer -= dt;
        if (glanceTimer <= 0) {
          const atYou = Math.atan2(tx - pos.x, tz - pos.z);
          glanceTo = Math.random() < 0.65 ? atYou : atYou + (Math.random() - 0.5) * 2.4;
          glanceTimer = 2.5 + Math.random() * 3.5;
        }
        if (glanceTo !== null) facing = glanceTo;
      }
      speed += (want - speed) * Math.min(1, dt * 6);
      if (speed < 0.03 && want === 0) speed = 0;
      if (speed > 0) step(Math.sin(facing) * speed * dt, Math.cos(facing) * speed * dt);

      const cur = root.rotation.y;
      const diff = Math.atan2(Math.sin(facing - cur), Math.cos(facing - cur));
      root.rotation.y = cur + diff * Math.min(1, dt * (following ? 10 : 4));

      // blend idle -> walk -> run by speed, and match the feet to the ground speed
      const runShare = THREE.MathUtils.clamp((speed - WALK) / WALK, 0, 1);
      const moving = THREE.MathUtils.clamp(speed / 0.4, 0, 1);
      const target = { idle: 1 - moving, walk: moving * (1 - runShare), run: moving * runShare };
      const ease = Math.min(1, dt * 8);
      for (const k of ["idle", "walk", "run"] as const) {
        weight[k] += (target[k] - weight[k]) * ease;
        actions[k]?.setEffectiveWeight(weight[k]);
      }
      actions.walk?.setEffectiveTimeScale(Math.max(0.6, speed / walkCycle));
      actions.run?.setEffectiveTimeScale(Math.max(0.6, speed / runCycle));
      mixer.update(dt);
    },
  };
}
