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
import { settle, type Blocker, type Capsule } from "./area";

/**
 * Where the fox model is downloaded from. A local copy (dev and the preview
 * link) can be pointed at with VITE_FOX_URL; the live game uses the project's
 * Supabase storage.
 */
export const FOX_URL: string =
  import.meta.env.VITE_FOX_URL ??
  "https://oearcgsdolpgkhtjapuf.supabase.co/storage/v1/object/public/game-art/fox.glb";

/**
 * How the fox looks as he grows up, one step per act (see the story outline).
 * It's the same model every time: smaller, with a bigger head, reads as
 * younger. Height in meters (the traveler is about 1.55); head is how much
 * bigger the head is drawn.
 */
export const FOX_STAGES = {
  kit: { height: 0.42, head: 1.45 },
  young: { height: 0.58, head: 1.25 },
  grown: { height: 0.82, head: 1 },
} as const;
export type FoxStage = keyof typeof FOX_STAGES;
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
  /** Show or hide him (before you've met him, he isn't there). */
  setVisible(visible: boolean): void;
  readonly visible: boolean;
  /** Where he is now. */
  readonly position: THREE.Vector3;
  /**
   * Walk to (x, z) and stay there, looking at the traveler, until let go.
   * Used by little scenes (like meeting him). null lets him follow again.
   */
  hold(at: { x: number; z: number } | null): void;
  readonly held: boolean;
  /** A quick little hop (a sneeze, or being pleased). */
  hop(): void;
  /** Follow the traveler at (x, z), who faces `facing` (radians). */
  update(dt: number, x: number, z: number, facing: number, seated: boolean, interest?: { x: number; z: number } | null): void;
}

interface FoxWorld {
  scene: THREE.Scene;
  blockers: Blocker[];
  walk: Capsule[];
}

export async function loadFox(loader: GLTFLoader, world: FoxWorld, stage: FoxStage = "grown", url = FOX_URL): Promise<Fox> {
  const look = FOX_STAGES[stage];
  const gltf = await loader.loadAsync(url);
  const model = gltf.scene;
  model.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh) {
      m.castShadow = true;
      m.frustumCulled = false; // skinned meshes can be culled by their bind-pose box
    }
  });

  // A bigger head makes him look younger. The animations only turn the head,
  // so the size we set stays put.
  let head: THREE.Object3D | null = null;
  model.traverse((o) => {
    if (!head && (o as THREE.Bone).isBone && /Head$/.test(o.name)) head = o;
  });
  (head as THREE.Object3D | null)?.scale.setScalar(look.head);

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
  const scale = look.height / Math.max(0.01, box.max.y - box.min.y);
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
  /** A spot a scene asked him to go to and stay at. */
  let holdAt: { x: number; z: number } | null = null;
  /** Time left on a hop. */
  let hopT = 0;

  function step(dx: number, dz: number) {
    pos.x += dx;
    pos.z += dz;
    settle(pos, world.blockers, world.walk, BODY);
  }

  /** The spot it wants: a little behind the traveler, off to one side. */
  function spotNear(x: number, z: number, f: number) {
    const back = 0.75, out = 0.65;
    const fx = Math.sin(f), fz = Math.cos(f); // traveler's forward
    const lx = fz, lz = -fx; // traveler's left
    return { x: x - fx * back + lx * out * side, z: z - fz * back + lz * out * side };
  }

  /** Ease to `want` m/s, step that way, turn, and blend the walk and run to match. */
  function move(dt: number, want: number, busy: boolean) {
    speed += (want - speed) * Math.min(1, dt * 6);
    if (speed < 0.03 && want === 0) speed = 0;
    if (speed > 0) step(Math.sin(facing) * speed * dt, Math.cos(facing) * speed * dt);

    const cur = root.rotation.y;
    const diff = Math.atan2(Math.sin(facing - cur), Math.cos(facing - cur));
    root.rotation.y = cur + diff * Math.min(1, dt * (busy ? 10 : 4));

    // blend idle -> walk -> run by speed, and match the feet to the ground speed
    const runShare = THREE.MathUtils.clamp((speed - WALK) / WALK, 0, 1);
    const moving = THREE.MathUtils.clamp(speed / 0.4, 0, 1);
    const target = { idle: 1 - moving, walk: moving * (1 - runShare), run: moving * runShare };
    const ease = Math.min(1, dt * 8);
    for (const k of ["idle", "walk", "run"] as const) {
      weight[k] += (target[k] - weight[k]) * ease;
      actions[k]?.setEffectiveWeight(weight[k]);
    }
    actions.walk?.setEffectiveTimeScale(THREE.MathUtils.clamp(speed / walkCycle, 0.6, 2.6));
    actions.run?.setEffectiveTimeScale(THREE.MathUtils.clamp(speed / runCycle, 0.6, 2.6));
    mixer.update(dt);
    // the hop: up and down in a quick little arc
    if (hopT > 0) hopT = Math.max(0, hopT - dt);
    pos.y = Math.sin((hopT / 0.35) * Math.PI) * 0.12 * look.height * 2;
  }

  return {
    placeAt(x, z, f) {
      pos.set(x, 0, z);
      facing = root.rotation.y = f;
    },
    setVisible(v) {
      root.visible = v;
    },
    get visible() {
      return root.visible;
    },
    position: pos,
    hold(at) {
      holdAt = at;
      following = !!at;
    },
    get held() {
      return !!holdAt;
    },
    hop() {
      hopT = 0.35;
    },
    update(dt, tx, tz, tf, seated, interest) {
      if (!root.visible) return;
      if (holdAt) {
        // a scene put him somewhere: trot over, then sit tight and watch the traveler
        const d = Math.hypot(holdAt.x - pos.x, holdAt.z - pos.z);
        let want = 0;
        if (d > 0.08) {
          want = Math.min(WALK * 1.1, d * 1.6 + 0.15);
          facing = Math.atan2(holdAt.x - pos.x, holdAt.z - pos.z);
        } else {
          facing = Math.atan2(tx - pos.x, tz - pos.z);
        }
        move(dt, want, d > 0.08);
        return;
      }
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
        // something odd nearby: the fox stares right at it, ears up, and won't look away
        if (interest && Math.hypot(interest.x - pos.x, interest.z - pos.z) < 4.5) facing = Math.atan2(interest.x - pos.x, interest.z - pos.z);
      }
      move(dt, want, following);
    },
  };
}
