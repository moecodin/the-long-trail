// Puts KayKit Adventurers characters (CC0) on the simple placeholder people.
//
// The intro keeps talking to the same Person object (setSit, setWalk, head and
// right-arm rotations). Once the models have loaded, the blocky body is hidden
// and those calls drive the KayKit model instead: idle and walk come from the
// KayKit animations, and sitting, the dozing head and Della's pointing arm are
// added on top by turning bones.
//
// These are stand-ins until Quaternius characters arrive; swapping them only
// means changing CAST below.

import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { clone as cloneSkinned } from "three/examples/jsm/utils/SkeletonUtils.js";
import type { Person, PersonLook } from "./people";

/** Which KayKit model plays each part, and small touches to fit our story. */
export const CAST = {
  /** Before the mirror, the sleeper by the fire is hooded: nobody knows who they are yet. */
  unknown: { file: "Rogue_Hooded", hide: ["Mask"], tint: null, earthy: true },
  ren: { file: "Ranger", hide: ["Quiver"], tint: null, earthy: false },
  mara: { file: "Rogue", hide: [], tint: null, earthy: false },
  sol: { file: "Mage", hide: ["Hat"], tint: "#e0c8b8", earthy: false },
  della: { file: "Mage", hide: [], tint: "#e8d6f0", earthy: false },
} as const;
export type CastKey = keyof typeof CAST;

/** KayKit people are about 2.3 m tall; ours are about 1.55 m. */
const MODEL_HEIGHT = 2.27;
const PERSON_HEIGHT = 1.55;
/** How fast (m/s, at our size) the KayKit walk and jog cycles move the feet. */
const WALK_SPEED = 1.4;
const RUN_SPEED = 3.4;

interface Loaded {
  scenes: Record<string, THREE.Object3D>;
  clips: THREE.AnimationClip[];
}

let loading: Promise<Loaded> | null = null;
export function loadKayKit(loader: GLTFLoader, base: string): Promise<Loaded> {
  loading ??= (async () => {
    const files = [...new Set(Object.values(CAST).map((c) => c.file))];
    const [general, moves, ...chars] = await Promise.all([
      loader.loadAsync(`${base}kaykit/Rig_Medium_General.glb`),
      loader.loadAsync(`${base}kaykit/Rig_Medium_MovementBasic.glb`),
      ...files.map((f) => loader.loadAsync(`${base}kaykit/${f}.glb`)),
    ]);
    const scenes: Record<string, THREE.Object3D> = {};
    files.forEach((f, i) => (scenes[f] = chars[i].scene));
    return { scenes, clips: [...general.animations, ...moves.animations] };
  })();
  return loading;
}

const bonesOf = (root: THREE.Object3D) => {
  const find = (n: string) => root.getObjectByName(n) as THREE.Bone;
  return {
    hips: find("hips"),
    head: find("head"),
    upperLegL: find("upperlegl"),
    upperLegR: find("upperlegr"),
    lowerLegL: find("lowerlegl"),
    lowerLegR: find("lowerlegr"),
    upperArmR: find("upperarmr"),
    lowerArmR: find("lowerarmr"),
  };
};

/**
 * The hooded cloak is bright green out of the box; turn its greens into a
 * travel-worn brown so the sleeper reads as nobody in particular.
 */
const earthyCache = new Map<THREE.Texture, THREE.Texture>();
function earthy(tex: THREE.Texture): THREE.Texture {
  if (earthyCache.has(tex)) return earthyCache.get(tex)!;
  const img = tex.image as CanvasImageSource & { width: number; height: number };
  const c = document.createElement("canvas");
  c.width = img.width;
  c.height = img.height;
  const g = c.getContext("2d")!;
  g.drawImage(img, 0, 0);
  const data = g.getImageData(0, 0, c.width, c.height);
  const p = data.data;
  for (let i = 0; i < p.length; i += 4) {
    const [r, gr, b] = [p[i], p[i + 1], p[i + 2]];
    if (gr > r + 12 && gr > b + 12) {
      // green → brown: keep the brightness, move it to the red/orange side
      const v = gr;
      p[i] = v * 0.78;
      p[i + 1] = v * 0.6;
      p[i + 2] = v * 0.42;
    }
  }
  g.putImageData(data, 0, 0);
  const out = new THREE.CanvasTexture(c);
  out.colorSpace = tex.colorSpace;
  out.flipY = tex.flipY;
  out.magFilter = tex.magFilter;
  out.minFilter = tex.minFilter;
  earthyCache.set(tex, out);
  return out;
}

const tmpQ = new THREE.Quaternion();
const parentQ = new THREE.Quaternion();
const modelQ = new THREE.Quaternion();
const axis = new THREE.Vector3();
const X = new THREE.Vector3(1, 0, 0);
const Z = new THREE.Vector3(0, 0, 1);

/**
 * Turn a bone around one of the model's own axes (X = side to side, so a
 * negative angle swings a limb forward; Z = front to back, for tilting the
 * head). Working in the model's frame avoids caring how each bone is oriented.
 */
function turnBone(bone: THREE.Bone, modelAxis: THREE.Vector3, angle: number, model: THREE.Object3D) {
  if (!angle) return;
  model.getWorldQuaternion(modelQ);
  bone.parent!.updateWorldMatrix(true, false);
  bone.parent!.getWorldQuaternion(parentQ);
  axis.copy(modelAxis).applyQuaternion(modelQ);
  tmpQ.setFromAxisAngle(axis, angle);
  // local = parent⁻¹ · turn · parent · local
  const inv = parentQ.clone().invert();
  bone.quaternion.premultiply(inv.multiply(tmpQ).multiply(parentQ));
}

/**
 * Give a placeholder Person a KayKit body. Returns an update function to call
 * every frame. `castFor` picks the model from the look the intro asks for.
 * `gear` is called with each new model, to hang things on it (the satchel).
 */
export function wearKayKit(
  person: Person,
  loaded: Loaded,
  castFor: (look: PersonLook) => CastKey,
  firstLook: PersonLook,
  heightScale = 1,
  gear?: (model: THREE.Object3D) => void,
) {
  const body = person.root.children[0];
  body.visible = false;
  const holder = new THREE.Group();
  holder.scale.setScalar((PERSON_HEIGHT / MODEL_HEIGHT) * heightScale);
  person.root.add(holder);

  let model: THREE.Object3D | null = null;
  let mixer: THREE.AnimationMixer | null = null;
  let idle: THREE.AnimationAction | null = null;
  let walk: THREE.AnimationAction | null = null;
  let run: THREE.AnimationAction | null = null;
  /** Free-walking speed in m/s, or -1 while a scripted scene drives setWalk. */
  let pace = -1;
  let bones: ReturnType<typeof bonesOf> | null = null;
  let sit = 0;
  let walkAmount = 0;

  const dress = (key: CastKey) => {
    const cast = CAST[key];
    if (model) holder.remove(model);
    model = cloneSkinned(loaded.scenes[cast.file]);
    model.traverse((o) => {
      const m = o as THREE.SkinnedMesh;
      if (!m.isMesh) return;
      m.castShadow = true;
      m.frustumCulled = false; // skinned meshes can move outside their resting bounds
      if ((cast.hide as readonly string[]).some((h) => m.name.endsWith(`_${h}`))) m.visible = false;
      if (cast.tint || cast.earthy) {
        const mat = (m.material as THREE.MeshStandardMaterial).clone();
        if (cast.tint) mat.color.set(cast.tint);
        if (cast.earthy && mat.map) mat.map = earthy(mat.map);
        m.material = mat;
      }
    });
    holder.add(model);
    gear?.(model);
    mixer = new THREE.AnimationMixer(model);
    const clip = (n: string) => loaded.clips.find((c) => c.name === n)!;
    idle = mixer.clipAction(clip("Idle_A"));
    walk = mixer.clipAction(clip("Walking_A"));
    run = mixer.clipAction(clip("Running_A"));
    run.weight = 0;
    idle.play();
    walk.play();
    run.play();
    bones = bonesOf(model);
  };
  dress(castFor(firstLook));

  // Wrap the placeholder's own controls so we hear about every change.
  const setLook = person.setLook.bind(person);
  person.setLook = (look) => {
    setLook(look);
    dress(castFor(look));
  };
  const setSit = person.setSit.bind(person);
  person.setSit = (amount) => {
    setSit(amount);
    sit = amount;
  };
  const setWalk = person.setWalk.bind(person);
  person.setWalk = (phase, amount) => {
    setWalk(phase, amount);
    walkAmount = amount;
    pace = -1;
  };
  const setPace = person.setPace.bind(person);
  person.setPace = (speed, dt) => {
    setPace(speed, dt);
    pace = speed;
  };

  return (dt: number) => {
    if (!mixer || !bones || !idle || !walk || !run || !person.root.visible) return;
    if (pace < 0) {
      walk.weight = walkAmount;
      idle.weight = 1 - walkAmount;
      run.weight = 0;
      walk.timeScale = 1;
    } else {
      // Blend idle → walk → jog with speed, and speed the steps up to match
      // so the feet don't slide.
      const w = Math.min(1, pace / WALK_SPEED);
      const r = THREE.MathUtils.clamp((pace - WALK_SPEED) / (RUN_SPEED - WALK_SPEED), 0, 1);
      idle.weight = 1 - w;
      walk.weight = w * (1 - r);
      run.weight = r;
      const natural = THREE.MathUtils.lerp(WALK_SPEED, RUN_SPEED, r);
      walk.timeScale = run.timeScale = pace > 0.05 ? THREE.MathUtils.clamp(pace / natural, 0.7, 1.4) : 1;
    }
    mixer.update(dt);

    // Sitting: bend at the hips and knees, and sink into the seat.
    const m = model!;
    if (sit > 0) {
      turnBone(bones.upperLegL, X, -1.5 * sit, m);
      turnBone(bones.upperLegR, X, -1.5 * sit, m);
      turnBone(bones.lowerLegL, X, 1.5 * sit, m);
      turnBone(bones.lowerLegR, X, 1.5 * sit, m);
    }
    holder.position.y = -0.42 * sit * heightScale;

    // The head and right arm follow the placeholder's (hidden) head and arm.
    const h = person.head.rotation;
    turnBone(bones.head, X, h.x, m);
    turnBone(bones.head, Z, -h.z, m);
    turnBone(bones.upperArmR, X, person.rightArm.rotation.x, m); // negative = raised to point
  };
}
