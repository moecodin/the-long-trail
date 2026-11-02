// Give the walking traveler their KayKit body and the satchel on their hip.
// Shared by camp and every leg of the trail.

import * as THREE from "three";
import type { Person, PersonLook } from "../scene/people";
import { loadKayKit, wearKayKit } from "../scene/kaykitPeople";
import { loadSatchel, wearSatchel } from "../scene/satchel";
import { BASE, loader } from "../scene/kits";

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

/**
 * The trail tools the traveler carries: Della's walking stick slung across
 * their back and her old lantern at their right hip, lit (it's always dusk on
 * the trail so far). Hand-built, since the kits don't have either.
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
  // diagonally across the back
  stick.position.set(0, 0.95, -0.16);
  stick.rotation.set(0.05, 0, 0.75);

  const lantern = new THREE.Group();
  const iron = new THREE.MeshStandardMaterial({ color: "#3b3631", metalness: 0.6, roughness: 0.5 });
  const glass = new THREE.MeshStandardMaterial({ color: "#ffd890", emissive: "#ffb050", emissiveIntensity: 1.6 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.13, 0.1), glass);
  const cap = new THREE.Mesh(new THREE.ConeGeometry(0.085, 0.06, 4), iron);
  cap.position.y = 0.095;
  cap.rotation.y = Math.PI / 4;
  const base = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.02, 0.12), iron);
  base.position.y = -0.075;
  const light = new THREE.PointLight("#ffb860", 3.2, 5, 1.8);
  light.position.y = 0.05;
  lantern.add(body, cap, base, light);
  lantern.position.set(-0.26, 0.72, 0.04);

  let t = 0;
  return {
    set(tools: readonly string[]) {
      gear.clear();
      if (tools.includes("stick")) gear.add(stick);
      if (tools.includes("lantern")) gear.add(lantern);
    },
    /** A little sway and flicker. */
    update(dt: number) {
      t += dt;
      lantern.rotation.z = Math.sin(t * 3) * 0.12;
      light.intensity = 3.2 + Math.sin(t * 13) * 0.3 + Math.sin(t * 7.7) * 0.2;
    },
  };
}
