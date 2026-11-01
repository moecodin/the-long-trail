// The traveler's satchel: "Adventure Satchel" by Reidicus (CC BY 4.0, see
// CREDITS.md). It hangs on the left hip and rides along with the hip bone, so
// it sways with every step and sits down when the traveler does.
//
// Its textures were shrunk to 256px for phones, and the knife that hangs off
// the original's side is hidden (this is a no-combat game).

import * as THREE from "three";
import type { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

/** How tall the bag is, as a share of the KayKit model's height (about 2.3). */
const BAG_HEIGHT = 0.46;
/**
 * Where the bag's middle sits, in the KayKit model's own space (before it is
 * shrunk to our size): x = toward the traveler's left, y = up from the feet,
 * z = toward the front.
 */
const HIP_SPOT = new THREE.Vector3(0.5, 0.55, -0.08);
/** Turned a little toward the back, so the swinging arm passes in front of it. */
const HIP_TURN = -0.35;
/** Mesh names in the satchel file that we leave off. Object_5 is the knife. */
const HIDE = ["Object_5"];

let loading: Promise<THREE.Object3D> | null = null;

/** Load the satchel once, centered on its middle, front facing +x, at its game size. */
export function loadSatchel(loader: GLTFLoader, base: string): Promise<THREE.Object3D> {
  loading ??= loader.loadAsync(`${base}camp/Satchel.gltf`).then((gltf) => {
    const bag = gltf.scene;
    bag.traverse((o) => {
      if (HIDE.includes(o.name)) o.visible = false;
      if ((o as THREE.Mesh).isMesh) o.castShadow = true;
    });
    // Measure only what shows, so the hidden knife doesn't shift the middle.
    const box = new THREE.Box3();
    bag.updateMatrixWorld(true);
    bag.traverse((o) => {
      if ((o as THREE.Mesh).isMesh && o.visible) box.expandByObject(o);
    });
    const size = box.getSize(new THREE.Vector3());
    const middle = box.getCenter(new THREE.Vector3());
    const scale = BAG_HEIGHT / size.y;
    bag.scale.setScalar(scale);
    bag.position.copy(middle).multiplyScalar(-scale);
    const holder = new THREE.Group();
    holder.name = "Satchel";
    holder.add(bag);
    return holder;
  });
  return loading;
}

/**
 * Hang a copy of the satchel on a KayKit character's hip. Call it right after
 * the model is made (while it still stands in its resting pose), and again
 * whenever the model is swapped for another.
 */
export function wearSatchel(model: THREE.Object3D, satchel: THREE.Object3D) {
  const hips = model.getObjectByName("hips");
  if (!hips) return;
  const bag = satchel.clone();
  // Place it in the model's own space first, then hand it to the hip bone.
  // attach() keeps where it is now, so it stays put relative to the hips.
  bag.position.copy(HIP_SPOT);
  bag.rotation.y = HIP_TURN;
  model.add(bag);
  model.updateMatrixWorld(true);
  hips.attach(bag);
}
