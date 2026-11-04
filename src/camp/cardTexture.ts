// A trail card drawn onto a canvas, so it can stand on the tent shelf in 3D.
// It copies the album's card look (journal.css .tc): the warm window, the
// kind label, the picture, the name band, and the kit frame over the top.

import * as THREE from "three";
import { CARD_ART } from "../journal/doodles";
import { KIND_LABEL, TRAIL_CARDS, recipe } from "../journal/recipes";

const W = 250, H = 350;

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((ok, fail) => {
    const img = new Image();
    img.onload = () => ok(img);
    img.onerror = fail;
    img.src = src;
  });
}

/** The card's name and kind, whether it's a recipe or a trail card. */
export function cardFace(id: string): { name: string; kind: string } | null {
  const r = recipe(id);
  if (r) return { name: r.name, kind: KIND_LABEL.recipe };
  const t = TRAIL_CARDS.find((c) => c.id === id);
  return t ? { name: t.name, kind: KIND_LABEL[t.kind] } : null;
}

export async function cardTexture(id: string): Promise<THREE.Texture | null> {
  const face = cardFace(id);
  if (!face) return null;
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const g = c.getContext("2d")!;
  // the warm window
  const grad = g.createRadialGradient(W / 2, H * 0.42, 10, W / 2, H * 0.42, W * 0.75);
  grad.addColorStop(0, "#fbe9c4");
  grad.addColorStop(1, "#e9bf7c");
  g.fillStyle = grad;
  g.fillRect(W * 0.04, H * 0.03, W * 0.92, H * 0.94);
  // kind label
  g.fillStyle = "#8e3b2acc";
  g.font = "600 18px Georgia, serif";
  g.textAlign = "center";
  g.fillText(face.kind.toUpperCase(), W / 2, H * 0.12);
  // the picture
  const art = CARD_ART[id];
  if (art) {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 48" width="640" height="480">${art}</svg>`;
    try {
      const img = await loadImage(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`);
      g.drawImage(img, W * 0.1, H * 0.17, W * 0.8, W * 0.6);
    } catch {
      // no picture, just the name
    }
  }
  // the name band
  g.fillStyle = "#fff4dc";
  g.fillRect(0, H * 0.72, W, H * 0.12);
  g.strokeStyle = "#4a3424";
  g.lineWidth = 2;
  g.beginPath();
  g.moveTo(0, H * 0.72);
  g.lineTo(W, H * 0.72);
  g.moveTo(0, H * 0.84);
  g.lineTo(W, H * 0.84);
  g.stroke();
  g.fillStyle = "#3b2a1e";
  g.font = `26px "Patrick Hand", "Comic Sans MS", cursive`;
  g.fillText(face.name, W / 2, H * 0.8, W * 0.86);
  // the frame over everything
  try {
    g.drawImage(await loadImage(`${import.meta.env.BASE_URL}cards/frame.png`), 0, 0, W, H);
  } catch {
    // plain edges are fine
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
