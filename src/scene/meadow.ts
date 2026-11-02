// Natural-looking ground and grass.
//
// Real meadows aren't an even sprinkle: grass grows in clumps, thickest
// against fences, rocks, paths and tree roots, with open, short-cropped
// ground in between, and flowers come in little drifts of one kind.
// This file plans those clumps ("patches") and paints a soft ground
// texture to match, so each clump sits on its own darker, lusher spot.

import * as THREE from "three";

export type PatchKind = "grass" | "flowers" | "clover" | "ferns" | "pebbles";

/** A clump of plants: where it is, how wide, and what grows in it. */
export interface Patch {
  x: number;
  z: number;
  r: number;
  kind: PatchKind;
  /** Picks the one flower (or grass) model this clump uses, so drifts stay one kind. */
  pick: number;
}

/** Something plants like to grow around: a fence post, a rock, a house corner, a tree. */
export interface Hug {
  x: number;
  z: number;
  r: number;
}

// ---------- smooth noise (same numbers every time, so the meadow never reshuffles) ----------

function hash(ix: number, iz: number) {
  let h = (ix * 374761393 + iz * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}
function valueNoise(x: number, z: number) {
  const ix = Math.floor(x), iz = Math.floor(z);
  const fx = x - ix, fz = z - iz;
  const sx = fx * fx * (3 - 2 * fx), sz = fz * fz * (3 - 2 * fz);
  const a = hash(ix, iz), b = hash(ix + 1, iz), c = hash(ix, iz + 1), d = hash(ix + 1, iz + 1);
  return a + (b - a) * sx + (c - a) * sz + (a - b - c + d) * sx * sz;
}
/** Soft rolling noise, 0..1, with features about `scale` meters across. */
export function meadowNoise(x: number, z: number, scale = 6, seed = 0) {
  let sum = 0, amp = 1, norm = 0, f = 1 / scale;
  for (let o = 0; o < 3; o++) {
    sum += valueNoise(x * f + seed * 17.3 + o * 31.7, z * f - seed * 9.1) * amp;
    norm += amp;
    amp *= 0.5;
    f *= 2.1;
  }
  return sum / norm;
}

// ---------- planning the clumps ----------

export interface PatchPlan {
  rnd: () => number;
  /** A random spot somewhere in the area to try. */
  sample: () => { x: number; z: number };
  /** May a plant grow here? (Not on the path, not inside a tent...) */
  ok: (x: number, z: number) => boolean;
  /** How much plants like this spot, 0..1: near a path edge or the edge of a clearing is high. */
  edge: (x: number, z: number) => number;
  /** Things to grow around. */
  hugs: Hug[];
  /** How many clumps hug things, and how many grow out in the open. */
  hugCount: number;
  openCount: number;
  seed?: number;
}

/** Plan where the clumps go: hugging things first, then drifts in the open. */
export function planPatches(p: PatchPlan): Patch[] {
  const { rnd } = p;
  const out: Patch[] = [];
  const kindFor = (x: number, z: number, hugging: boolean): PatchKind => {
    // flowers gather in a few sunny areas of the meadow, not everywhere
    const sunny = meadowNoise(x, z, 9, (p.seed ?? 0) + 3);
    const roll = rnd();
    if (sunny > 0.58 && roll < 0.55) return "flowers";
    if (roll < 0.1) return "flowers";
    if (roll < 0.2) return "clover";
    if (hugging && roll < 0.3) return "ferns";
    if (hugging && roll < 0.36) return "pebbles";
    return "grass";
  };
  const tooClose = (x: number, z: number, r: number) => out.some((q) => Math.hypot(q.x - x, q.z - z) < (q.r + r) * 0.55);

  // clumps tucked against things
  for (let i = 0, tries = 0; i < p.hugCount && tries < p.hugCount * 6 && p.hugs.length; tries++) {
    const h = p.hugs[Math.floor(rnd() * p.hugs.length)];
    const a = rnd() * Math.PI * 2;
    const d = h.r + 0.15 + rnd() * 0.45;
    const x = h.x + Math.cos(a) * d, z = h.z + Math.sin(a) * d;
    const r = 0.45 + rnd() * 0.55;
    if (!p.ok(x, z) || tooClose(x, z, r)) continue;
    out.push({ x, z, r, kind: kindFor(x, z, true), pick: rnd() });
    i++;
  }
  // drifts out in the open, mostly near edges and in the lusher parts of the meadow
  for (let i = 0, tries = 0; i < p.openCount && tries < p.openCount * 25; tries++) {
    const { x, z } = p.sample();
    const lush = meadowNoise(x, z, 5, p.seed ?? 0);
    const want = 0.08 + p.edge(x, z) * 0.7 + Math.max(0, lush - 0.5) * 1.4;
    if (rnd() > want || !p.ok(x, z)) continue;
    const r = 0.5 + rnd() * 0.9 + p.edge(x, z) * 0.3;
    if (tooClose(x, z, r)) continue;
    out.push({ x, z, r, kind: kindFor(x, z, false), pick: rnd() });
    i++;
  }
  return out;
}

/** One kind of plant a clump can hold: the model, its size, and how common it is. */
export type PlantChoice = [model: THREE.Object3D, scale: number, weight: number];

export interface FillPlan {
  rnd: () => number;
  ok: (x: number, z: number) => boolean;
  /** The plants for each kind of clump. Flower clumps use one of `flowers` each. */
  plants: Record<PatchKind, PlantChoice[]>;
  /** Plants per square meter of clump. */
  density?: number;
  add: (o: THREE.Object3D, x: number, z: number, s: number) => void;
}

const weighted = (list: PlantChoice[], roll: number) => {
  const total = list.reduce((s, c) => s + c[2], 0);
  let t = roll * total;
  for (const c of list) if ((t -= c[2]) <= 0) return c;
  return list[list.length - 1];
};

/** Grow the plants in each clump: taller in the middle, smaller and sparser at the rim. */
export function fillPatches(patches: Patch[], f: FillPlan) {
  const { rnd } = f;
  const density = f.density ?? 6;
  for (const p of patches) {
    const list = f.plants[p.kind];
    if (!list.length) continue;
    const n = Math.max(2, Math.round(Math.PI * p.r * p.r * density * (p.kind === "pebbles" ? 0.3 : p.kind === "ferns" ? 0.35 : p.kind === "flowers" ? 0.6 : 1)));
    // a flower drift is one kind of flower, with a little grass mixed in
    const main = weighted(list, p.pick);
    for (let i = 0; i < n; i++) {
      const a = rnd() * Math.PI * 2;
      const t = Math.pow(rnd(), 0.75);
      const x = p.x + Math.cos(a) * t * p.r, z = p.z + Math.sin(a) * t * p.r;
      if (!f.ok(x, z)) continue;
      let choice: PlantChoice;
      if (p.kind === "flowers") choice = rnd() < 0.7 ? main : weighted(f.plants.grass, rnd());
      else choice = weighted(list, rnd());
      const grow = 1.4 - t * 0.65;
      f.add(choice[0], x, z, choice[1] * grow * (0.85 + rnd() * 0.3));
    }
  }
}

// ---------- painting the ground ----------

export interface GroundPaint {
  /** The ground plane's size and middle, in world meters. */
  plane: { width: number; depth: number; cx: number; cz: number };
  /** The part of the ground the texture covers (where you walk); outside it, the edge color carries on. */
  width: number;
  depth: number;
  cx: number;
  cz: number;
  patches: Patch[];
  /** Shady spots: darker, cooler ground under trees and bushes. */
  shade?: Hug[];
  /** Pixels across (the texture is square). */
  size?: number;
  seed?: number;
}

/**
 * A soft texture laid over the ground's own colors (it only darkens and tints,
 * so the dirt paths stay where the scene put them): big gentle patches of
 * lusher and drier grass, a darker spot under every clump and tree, and a fine
 * speckle so it never reads as one flat color.
 */
export function paintGround(g: GroundPaint): THREE.CanvasTexture {
  const size = g.size ?? 1024;
  const seed = g.seed ?? 0;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  const toPx = (x: number, z: number) => [((x - g.cx) / g.width + 0.5) * size, ((z - g.cz) / g.depth + 0.5) * size] as const;
  const mPerPx = g.width / size;

  // 1. big soft patches, worked out small and stretched up (smooth, and quick on a phone)
  const low = 192;
  const lowCanvas = document.createElement("canvas");
  lowCanvas.width = lowCanvas.height = low;
  const lctx = lowCanvas.getContext("2d")!;
  const img = lctx.createImageData(low, low);
  const lush = [0.6, 0.76, 0.56], dry = [1, 0.93, 0.66], mid = [0.9, 0.93, 0.8];
  for (let j = 0; j < low; j++) {
    for (let i = 0; i < low; i++) {
      const x = g.cx + ((i + 0.5) / low - 0.5) * g.width;
      const z = g.cz + ((j + 0.5) / low - 0.5) * g.depth;
      const n = meadowNoise(x, z, 7, seed);
      const m = meadowNoise(x, z, 2.5, seed + 5);
      const t = THREE.MathUtils.clamp((n - 0.5) * 3 + (m - 0.5) * 1.2, -1, 1);
      const to = t < 0 ? lush : dry;
      const k = Math.abs(t);
      const o = (j * low + i) * 4;
      for (let ch = 0; ch < 3; ch++) img.data[o + ch] = Math.round((mid[ch] + (to[ch] - mid[ch]) * k) * 255);
      img.data[o + 3] = 255;
    }
  }
  lctx.putImageData(img, 0, 0);
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(lowCanvas, 0, 0, size, size);

  // 2. darker spots under trees, and a lusher spot under every clump
  ctx.globalCompositeOperation = "multiply";
  const blob = (x: number, z: number, r: number, rgb: [number, number, number]) => {
    const [px, pz] = toPx(x, z);
    const pr = r / mPerPx;
    const grad = ctx.createRadialGradient(px, pz, 0, px, pz, pr);
    grad.addColorStop(0, `rgb(${rgb.map((v) => Math.round(v * 255)).join(",")})`);
    grad.addColorStop(0.55, `rgb(${rgb.map((v) => Math.round((v + (1 - v) * 0.45) * 255)).join(",")})`);
    grad.addColorStop(1, "rgb(255,255,255)");
    ctx.fillStyle = grad;
    ctx.fillRect(px - pr, pz - pr, pr * 2, pr * 2);
  };
  for (const s of g.shade ?? []) blob(s.x, s.z, s.r, [0.55, 0.66, 0.6]);
  for (const p of g.patches) {
    if (p.kind === "pebbles") blob(p.x, p.z, p.r * 1.2, [0.9, 0.86, 0.78]);
    else if (p.kind === "flowers") blob(p.x, p.z, p.r * 1.6, [0.72, 0.86, 0.6]);
    else blob(p.x, p.z, p.r * 1.7, [0.5, 0.7, 0.44]);
  }

  // 3. a fine speckle, like short grass catching the light
  const tile = document.createElement("canvas");
  tile.width = tile.height = 64;
  const tctx = tile.getContext("2d")!;
  const timg = tctx.createImageData(64, 64);
  for (let i = 0; i < 64 * 64; i++) {
    const v = 0.86 + hash(i, seed + 99) * 0.14;
    timg.data[i * 4] = timg.data[i * 4 + 1] = Math.round(v * 255);
    timg.data[i * 4 + 2] = Math.round(Math.min(1, v + 0.02) * 255);
    timg.data[i * 4 + 3] = 255;
  }
  tctx.putImageData(timg, 0, 0);
  ctx.fillStyle = ctx.createPattern(tile, "repeat")!;
  ctx.fillRect(0, 0, size, size);
  ctx.globalCompositeOperation = "source-over";

  const tex = new THREE.CanvasTexture(canvas);
  // the numbers are used as-is (a gentle multiplier), not as display colors
  tex.colorSpace = THREE.NoColorSpace;
  tex.anisotropy = 4;
  // stretch the picture over just the focus box; past its edges the edge color carries on
  const P = g.plane;
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.repeat.set(P.width / g.width, P.depth / g.depth);
  tex.offset.set(
    (P.cx - P.width / 2 - (g.cx - g.width / 2)) / g.width,
    (g.cz + g.depth / 2 - (P.cz + P.depth / 2)) / g.depth,
  );
  return tex;
}

/** Lay the painted texture over a ground mesh that already has its own vertex colors. */
export function applyGroundPaint(ground: THREE.Mesh, tex: THREE.Texture) {
  const mat = ground.material as THREE.MeshStandardMaterial;
  mat.map = tex;
  // the texture only darkens, so lift the base a touch to keep the same overall brightness
  mat.color.setScalar(1.12);
  mat.needsUpdate = true;
}

/**
 * Make grass take the ground's light: point every blade's normal straight up,
 * so a clump shades like the soft ground it grows from instead of a cluster of
 * dark, edge-on blades. Returns a copy; the kit model itself is left alone.
 */
export function groundLit(src: THREE.Object3D, tint = 1): THREE.Object3D {
  const o = src.clone();
  o.traverse((c) => {
    const m = c as THREE.Mesh;
    if (!m.isMesh) return;
    const geo = m.geometry.clone();
    const n = geo.attributes.normal as THREE.BufferAttribute;
    // the blades are in the model's own space; "up" there is up in the world too (models stand upright)
    for (let i = 0; i < n.count; i++) n.setXYZ(i, 0, 1, 0);
    n.needsUpdate = true;
    m.geometry = geo;
    if (tint !== 1) {
      const mat = (m.material as THREE.MeshStandardMaterial).clone();
      mat.color.multiplyScalar(tint);
      m.material = mat;
    }
  });
  return o;
}
