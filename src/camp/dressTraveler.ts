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
