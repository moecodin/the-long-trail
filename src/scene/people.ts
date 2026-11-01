// Simple low-poly people built from basic shapes. These are stand-ins until
// the KayKit character models come in with Milestone 1.

import * as THREE from "three";

export interface PersonLook {
  skin: string;
  hair: string;
  cloak: string;
  scarf: string;
  /** "bun" is for Della. */
  hairStyle: "short" | "long" | "curly" | "bun";
}

export interface Person {
  root: THREE.Group;
  head: THREE.Group;
  leftLeg: THREE.Object3D;
  rightLeg: THREE.Object3D;
  rightArm: THREE.Object3D;
  leftArm: THREE.Object3D;
  setLook(look: PersonLook): void;
  /** 0 = standing, 1 = sitting down. */
  setSit(amount: number): void;
  /** Swing arms and legs; phase in radians, amount 0 to 1. */
  setWalk(phase: number, amount: number): void;
}

const mat = (color: string) => new THREE.MeshStandardMaterial({ color, flatShading: true, roughness: 0.9 });

export function makePerson(look: PersonLook, height = 1): Person {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);

  const mats = {
    skin: mat(look.skin),
    hair: mat(look.hair),
    cloak: mat(look.cloak),
    scarf: mat(look.scarf),
    boots: mat("#3b2a20"),
    trousers: mat("#5b4a3a"),
  };

  const limb = (len: number, radius: number, m: THREE.Material) => {
    const pivot = new THREE.Group();
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius * 0.85, len, 6), m);
    mesh.position.y = -len / 2;
    mesh.castShadow = true;
    pivot.add(mesh);
    return pivot;
  };

  // legs
  const leftLeg = limb(0.5, 0.075, mats.trousers);
  const rightLeg = limb(0.5, 0.075, mats.trousers);
  leftLeg.position.set(-0.09, 0.55, 0);
  rightLeg.position.set(0.09, 0.55, 0);
  for (const leg of [leftLeg, rightLeg]) {
    const boot = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.1, 0.2), mats.boots);
    boot.position.set(0, -0.5, 0.04);
    leg.add(boot);
    body.add(leg);
  }

  // torso: a cloak that flares a little at the bottom
  const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.26, 0.62, 7), mats.cloak);
  torso.position.y = 0.86;
  torso.castShadow = true;
  body.add(torso);
  const scarf = new THREE.Mesh(new THREE.TorusGeometry(0.13, 0.05, 5, 8), mats.scarf);
  scarf.rotation.x = Math.PI / 2;
  scarf.position.y = 1.17;
  body.add(scarf);

  // arms
  const leftArm = limb(0.48, 0.055, mats.cloak);
  const rightArm = limb(0.48, 0.055, mats.cloak);
  leftArm.position.set(-0.22, 1.13, 0);
  rightArm.position.set(0.22, 1.13, 0);
  leftArm.rotation.z = -0.12;
  rightArm.rotation.z = 0.12;
  for (const arm of [leftArm, rightArm]) {
    const hand = new THREE.Mesh(new THREE.SphereGeometry(0.055, 6, 5), mats.skin);
    hand.position.y = -0.5;
    arm.add(hand);
    body.add(arm);
  }

  // head
  const head = new THREE.Group();
  head.position.y = 1.32;
  const face = new THREE.Mesh(new THREE.IcosahedronGeometry(0.16, 1), mats.skin);
  face.castShadow = true;
  head.add(face);
  const hair = new THREE.Group();
  head.add(hair);
  body.add(head);

  const buildHair = (style: PersonLook["hairStyle"]) => {
    hair.clear();
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.172, 8, 6, 0, Math.PI * 2, 0, Math.PI * 0.55), mats.hair);
    cap.rotation.x = -0.35;
    cap.position.z = -0.02;
    hair.add(cap);
    if (style === "long") {
      const back = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.34, 0.08), mats.hair);
      back.position.set(0, -0.12, -0.12);
      hair.add(back);
      const braid = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.03, 0.3, 5), mats.hair);
      braid.position.set(0.12, -0.24, 0.06);
      braid.rotation.z = 0.2;
      hair.add(braid);
    } else if (style === "curly") {
      for (let i = 0; i < 9; i++) {
        const a = (i / 9) * Math.PI * 2;
        const curl = new THREE.Mesh(new THREE.IcosahedronGeometry(0.07, 0), mats.hair);
        curl.position.set(Math.cos(a) * 0.15, 0.08 + Math.sin(i * 1.7) * 0.03, Math.sin(a) * 0.15 - 0.02);
        hair.add(curl);
      }
    } else if (style === "bun") {
      const bun = new THREE.Mesh(new THREE.IcosahedronGeometry(0.08, 0), mats.hair);
      bun.position.set(0, 0.12, -0.13);
      hair.add(bun);
    }
  };
  buildHair(look.hairStyle);

  body.scale.setScalar(height);

  const person: Person = {
    root,
    head,
    leftLeg,
    rightLeg,
    leftArm,
    rightArm,
    setLook(next) {
      mats.skin.color.set(next.skin);
      mats.hair.color.set(next.hair);
      mats.cloak.color.set(next.cloak);
      mats.scarf.color.set(next.scarf);
      buildHair(next.hairStyle);
    },
    setSit(amount) {
      body.position.y = -0.42 * amount * height;
      leftLeg.rotation.x = -1.45 * amount;
      rightLeg.rotation.x = -1.45 * amount;
    },
    setWalk(phase, amount) {
      const s = Math.sin(phase) * 0.55 * amount;
      leftLeg.rotation.x = s;
      rightLeg.rotation.x = -s;
      leftArm.rotation.x = -s * 0.8;
      rightArm.rotation.x = s * 0.8;
      body.position.y = Math.abs(Math.cos(phase)) * 0.03 * amount;
    },
  };
  return person;
}
