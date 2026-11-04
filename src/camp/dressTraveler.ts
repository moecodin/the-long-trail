// Give the walking traveler their KayKit body and the satchel on their hip.
// Shared by camp and every leg of the trail.

import * as THREE from "three";
import type { Person, PersonLook } from "../scene/people";
import { loadKayKit, wearKayKit } from "../scene/kaykitPeople";
import { loadSatchel, wearSatchel } from "../scene/satchel";
import { BASE, loader, model } from "../scene/kits";

/**
 * The body comes first and never waits on the satchel ("Adventure Satchel" by
 * Reidicus, CC BY 4.0, see CREDITS.md), which is hung on whichever body they
 * wear once it arrives. If the satchel fails, they go without.
 * Resolves once the body is on; pushes its per-frame update into `frameHooks`.
 */
export function dressTraveler(traveler: Person, frameHooks: ((dt: number) => void)[]): Promise<void> {
  let wearing: THREE.Object3D | null = null;
  let satchel: THREE.Object3D | null = null;
  const hang = () => {
    if (!wearing || !satchel) return;
    try {
      wearSatchel(wearing, satchel);
    } catch (err) {
      console.warn("Could not hang the satchel.", err);
    }
  };
  loadSatchel(loader, BASE)
    .then((bag) => {
      satchel = bag;
      hang();
    })
    .catch((err) => console.warn("Satchel model did not load; the traveler goes without.", err));
  return loadKayKit(loader, BASE).then((loaded) => {
    const castFor = (l: PersonLook) => l.cast ?? "unknown";
    const gear = (m: THREE.Object3D) => {
      wearing = m;
      hang();
    };
    frameHooks.push(wearKayKit(traveler, loaded, castFor, traveler.look, 1, gear));
  });
}

/** The hand-held lantern's size: the kit lantern is about 0.56 m tall without its chain. */
const LANTERN_SCALE = 0.42;

/**
 * The trail tools the traveler carries: Della's walking stick slung across
 * their back and her old lantern swinging from their right hand, lit (it's
 * always dusk on the trail so far). The stick is hand-built; the lantern is
 * the Fantasy Props kit's wall lantern with its bracket taken off and a carry
 * ring added (tools/prepare-hand-lantern.mjs).
 * Call `set` with the tools you have; it can be called again when that changes.
 */
export function carryTools(traveler: Person) {
  const gear = new THREE.Group();
  traveler.root.add(gear);
  const wood = new THREE.MeshStandardMaterial({ color: "#7a5532", roughness: 0.9 });
  const stick = new THREE.Group();
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.026, 1.25, 6), wood);
  shaft.castShadow = true;
  const knob = new THREE.Mesh(new THREE.SphereGeometry(0.04, 8, 6), wood);
  knob.position.y = 0.64;
  stick.add(shaft, knob);
  // Slung low across the back, below the hair. KayKit heads are big and the
  // hair hangs down to about 0.72 m and back to 0.40 m, so the stick sits
  // behind the cape at waist height, tilted so the knob end pokes out past
  // the hair on one side instead of running up through it.
  stick.position.set(0, 0.52, -0.31);
  stick.rotation.set(0, 0, 1.3);

  // The lantern's origin is the carry ring in the hand; everything hangs below it.
  const lantern = new THREE.Group();
  const hanging = new THREE.Group();
  hanging.scale.setScalar(LANTERN_SCALE);
  lantern.add(hanging);
  const iron = new THREE.MeshStandardMaterial({ color: "#3b3631", metalness: 0.6, roughness: 0.5 });
  // the carry ring the fingers curl through
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.07, 0.014, 6, 14), iron);
  ring.position.y = 0.06;
  ring.rotation.y = Math.PI / 2;
  hanging.add(ring);
  // the candle glow inside, seen through the panes (kit units, below the ring)
  const flame = new THREE.Mesh(
    new THREE.BoxGeometry(0.22, 0.32, 0.22),
    new THREE.MeshStandardMaterial({ color: "#ffd890", emissive: "#ffb050", emissiveIntensity: 2.4 }),
  );
  flame.position.y = -0.5;
  hanging.add(flame);
  const light = new THREE.PointLight("#ffb860", 3.2, 5, 1.8);
  light.position.y = -0.45 * LANTERN_SCALE;
  lantern.add(light);
  model("props", "Lantern_Hand")
    .then((m) => hanging.add(m))
    .catch((err) => {
      console.warn("Hand lantern model did not load; using a plain one.", err);
      const cap = new THREE.Mesh(new THREE.ConeGeometry(0.24, 0.17, 4), iron);
      cap.position.y = -0.24;
      cap.rotation.y = Math.PI / 4;
      const base = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.06, 0.32), iron);
      base.position.y = -0.7;
      hanging.add(cap, base);
    });

  // Where the hand is. Found again whenever the traveler changes body.
  let hand: THREE.Object3D | null = null;
  const findHand = () => {
    let o: THREE.Object3D | null = hand;
    while (o && o !== traveler.root) o = o.parent;
    if (!o) hand = traveler.root.getObjectByName("handslotr") ?? null;
    return hand;
  };
  const handAt = new THREE.Vector3();
  const lastHand = new THREE.Vector3();
  const swing = { x: 0, z: 0, vx: 0, vz: 0 };
  let haveLast = false;

  let t = 0;
  return {
    set(tools: readonly string[]) {
      gear.clear();
      if (tools.includes("stick")) gear.add(stick);
      if (tools.includes("lantern")) gear.add(lantern);
    },
    /** Keep the lantern in the hand, hanging straight down, swinging as the hand moves. */
    update(dt: number) {
      t += dt;
      light.intensity = 3.2 + Math.sin(t * 13) * 0.3 + Math.sin(t * 7.7) * 0.2;
      if (!lantern.parent) return;
      const h = findHand();
      if (h) {
        traveler.root.updateMatrixWorld(true);
        h.getWorldPosition(handAt);
        traveler.root.worldToLocal(handAt);
      } else {
        handAt.set(-0.26, 0.72, 0.04); // no body yet: at the right hip
      }
      // A little pendulum: the lantern lags behind when the hand moves, then settles.
      if (haveLast && dt > 0) {
        const step = Math.min(dt, 0.05);
        const ax = (handAt.x - lastHand.x) / Math.max(dt, 1e-3);
        const az = (handAt.z - lastHand.z) / Math.max(dt, 1e-3);
        swing.vx += (-swing.x * 40 - swing.vx * 5) * step - ax * 0.6 * step * 10;
        swing.vz += (-swing.z * 40 - swing.vz * 5) * step - az * 0.6 * step * 10;
        swing.x = THREE.MathUtils.clamp(swing.x + swing.vx * step, -0.5, 0.5);
        swing.z = THREE.MathUtils.clamp(swing.z + swing.vz * step, -0.5, 0.5);
      }
      lastHand.copy(handAt);
      haveLast = true;
      lantern.position.copy(handAt);
      // tip away from the way the hand moved (x motion tips around z, z motion around x)
      lantern.rotation.set(-swing.z + Math.sin(t * 2.1) * 0.03, 0, swing.x + Math.sin(t * 3) * 0.04);
    },
  };
}
