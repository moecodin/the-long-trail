// Making camp pieces from things you've gathered. Everything packs up and
// travels with you, since you make camp somewhere new at the end of each leg.
//
//   Folding camp chair   6 dry sticks, lashed with Della's rope. It becomes
//                        your seat by the fire (before that, a fallen log).
//   Roll-up fox basket   8 dry sticks and 3 chamomile for the lining. It goes
//                        in the fox's corner of the tent.
//
// You make them at the coil of rope by the supplies ("Make"). Making one uses
// up what it needs from the satchel.

import * as THREE from "three";
import { item, type GatherSave, type ItemId } from "../trail/gather";

export type PieceId = "chair" | "basket";

export interface CampPiece {
  id: PieceId;
  name: string;
  needs: Partial<Record<ItemId, number>>;
  /** The note when you make it. */
  made: (fox: string) => string;
}

export const PIECES: CampPiece[] = [
  {
    id: "chair",
    name: "folding camp chair",
    needs: { twig: 6 },
    made: () => "You lash six sticks with Della's rope and stretch the old canvas over them: a folding camp chair! It packs flat, and it's yours.",
  },
  {
    id: "basket",
    name: "roll-up fox basket",
    needs: { twig: 8, chamomile: 3 },
    made: (fox) => `You weave a little basket and line it with chamomile. It rolls up for the road. ${fox} climbs in before you've even finished.`,
  },
];

/** The next thing you could make, or null once you've made them all. */
export const nextPiece = (built: readonly string[]) => PIECES.find((p) => !built.includes(p.id)) ?? null;

/** What's still missing for a piece, like "4 more dry sticks". Empty when you have everything. */
export function missing(p: CampPiece, g: GatherSave): string[] {
  return Object.entries(p.needs).flatMap(([id, n]) => {
    const have = g.gathered[id as ItemId] ?? 0;
    return have >= n! ? [] : [`${n! - have} more ${item(id)!.name.toLowerCase()}`];
  });
}

/** Use up what the piece needs and mark it made. */
export function makePiece(p: CampPiece, g: GatherSave, built: string[]) {
  for (const [id, n] of Object.entries(p.needs)) g.gathered[id as ItemId] = (g.gathered[id as ItemId] ?? 0) - n!;
  built.push(p.id);
}

/** What you're told when you tap Make. */
export function makeHint(p: CampPiece, g: GatherSave): string {
  const need = Object.entries(p.needs)
    .map(([id, n]) => `${n} ${item(id)!.name.toLowerCase()}`)
    .join(" and ");
  const short = missing(p, g);
  return `A ${p.name} needs ${need}. You need ${short.join(" and ")}. Dry sticks fall around the edge of camp every day.`;
}

const flat = (color: string) => new THREE.MeshStandardMaterial({ color, flatShading: true, roughness: 0.95 });

/** A low folding camp chair: crossed wooden legs, a canvas seat and back. Seat top is about 0.42 m up; it faces +z. */
export function buildCampChair(): THREE.Group {
  const g = new THREE.Group();
  const wood = flat("#8a6440");
  const canvas = new THREE.MeshStandardMaterial({ color: "#b5502e", roughness: 1, side: THREE.DoubleSide });
  for (const side of [-1, 1]) {
    // an X of legs on each side
    for (const tilt of [-0.55, 0.55]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.5, 0.035), wood);
      leg.position.set(side * 0.24, 0.21, 0);
      leg.rotation.x = tilt;
      g.add(leg);
    }
    // the back posts
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.5, 0.035), wood);
    post.position.set(side * 0.24, 0.62, -0.2);
    post.rotation.x = -0.2;
    g.add(post);
    // the seat rails
    const rail = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.035, 0.46), wood);
    rail.position.set(side * 0.24, 0.4, 0);
    g.add(rail);
  }
  const seat = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.02, 0.42), canvas);
  seat.position.y = 0.39;
  const back = new THREE.Mesh(new THREE.PlaneGeometry(0.46, 0.28), canvas);
  back.position.set(0, 0.7, -0.22);
  back.rotation.x = -0.2;
  g.add(seat, back);
  g.traverse((o) => {
    if (o instanceof THREE.Mesh) o.castShadow = o.receiveShadow = true;
  });
  return g;
}

/** A round woven basket lined with chamomile, for the fox. */
export function buildFoxBasket(): THREE.Group {
  const g = new THREE.Group();
  const weave = flat("#b08a54");
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.38, 0.06, 14), weave);
  base.position.y = 0.03;
  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.06, 6, 18), weave);
  rim.rotation.x = Math.PI / 2;
  rim.position.y = 0.12;
  const wall = new THREE.Mesh(new THREE.CylinderGeometry(0.44, 0.4, 0.12, 14, 1, true), weave);
  (wall.material as THREE.Material).side = THREE.DoubleSide;
  wall.position.y = 0.08;
  const lining = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.36, 0.03, 14), flat("#e8e2b0"));
  lining.position.y = 0.075;
  g.add(base, wall, rim, lining);
  // little chamomile flowers tucked in the lining
  const petal = flat("#fbf7ea"), heart = flat("#e8c03a");
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + 0.3;
    const f = new THREE.Mesh(new THREE.CircleGeometry(0.035, 6), petal);
    f.rotation.x = -Math.PI / 2;
    f.position.set(Math.cos(a) * 0.26, 0.095, Math.sin(a) * 0.26);
    const h = new THREE.Mesh(new THREE.CircleGeometry(0.012, 5), heart);
    h.rotation.x = -Math.PI / 2;
    h.position.set(f.position.x, 0.097, f.position.z);
    g.add(f, h);
  }
  g.traverse((o) => {
    if (o instanceof THREE.Mesh) o.receiveShadow = true;
  });
  return g;
}
