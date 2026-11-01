// The three travelers you can pick from. Each has a still portrait (drawn
// below as simple vector art) and colors for the 3D figure.
//
// The portrait is the same picture all game. It just comes into focus, one
// stage per act: a pencil sketch, inked lines, soft color, then the full
// painting at the Summit. It never changes body shape or size.

import type { TravelerId } from "./save";

export interface Traveler {
  id: TravelerId;
  label: string;
  pronouns: { they: string; them: string; their: string };
  skin: string;
  skinShade: string;
  hair: string;
  cloak: string;
  scarf: string;
  eyes: string;
}

export const TRAVELERS: Traveler[] = [
  {
    id: "ren",
    label: "Male",
    pronouns: { they: "he", them: "him", their: "his" },
    skin: "#c98e65",
    skinShade: "#a8714e",
    hair: "#3a2a20",
    cloak: "#4f6b4a",
    scarf: "#c8873a",
    eyes: "#3b2b1e",
  },
  {
    id: "mara",
    label: "Female",
    pronouns: { they: "she", them: "her", their: "her" },
    skin: "#f0c9a6",
    skinShade: "#d6a682",
    hair: "#a8462c",
    cloak: "#5a5f8c",
    scarf: "#e3c06a",
    eyes: "#3f5a3a",
  },
  {
    id: "sol",
    label: "Non-binary",
    pronouns: { they: "they", them: "them", their: "their" },
    skin: "#8a5a3c",
    skinShade: "#6e4630",
    hair: "#1f1a24",
    cloak: "#8a4f5e",
    scarf: "#6fa3a0",
    eyes: "#2a1d16",
  },
];

export const travelerById = (id: TravelerId): Traveler => TRAVELERS.find((t) => t.id === id) ?? TRAVELERS[0];

/** Hair, drawn behind and in front of the face, for each traveler. */
function hairShapes(t: Traveler): { back: string; front: string; extra: string } {
  const h = t.hair;
  switch (t.id) {
    case "ren":
      return {
        back: `<path d="M62 92 Q60 52 100 46 Q140 52 138 92 L132 80 Q100 70 68 80 Z" fill="${h}"/>`,
        front: `<path d="M64 88 Q70 56 100 54 Q132 56 136 88 Q122 70 104 72 Q86 66 64 88 Z" fill="${h}"/>`,
        // short beard and brows
        extra: `<path d="M74 118 Q78 150 100 154 Q122 150 126 118 Q120 136 100 138 Q80 136 74 118 Z" fill="${h}" opacity="0.85"/>
                <path d="M80 98 Q87 94 94 98" stroke="${h}" stroke-width="3.5" fill="none" stroke-linecap="round"/>
                <path d="M106 98 Q113 94 120 98" stroke="${h}" stroke-width="3.5" fill="none" stroke-linecap="round"/>`,
      };
    case "mara":
      return {
        back: `<path d="M58 100 Q54 48 100 44 Q146 48 142 100 L146 150 Q140 170 128 176 L128 110 L72 110 L72 176 Q60 170 54 150 Z" fill="${h}"/>`,
        front: `<path d="M66 96 Q66 54 100 52 Q134 54 134 96 Q128 72 112 66 Q100 80 70 84 Z" fill="${h}"/>`,
        // braid over the shoulder, freckles, brows
        extra: `<g fill="${h}"><ellipse cx="138" cy="160" rx="9" ry="11"/><ellipse cx="141" cy="180" rx="8" ry="10"/><ellipse cx="143" cy="198" rx="7" ry="9"/></g>
                <circle cx="143" cy="210" r="4" fill="${t.scarf}"/>
                <g fill="${t.skinShade}" opacity="0.9"><circle cx="82" cy="116" r="1.6"/><circle cx="88" cy="119" r="1.6"/><circle cx="84" cy="121" r="1.4"/><circle cx="118" cy="116" r="1.6"/><circle cx="112" cy="119" r="1.6"/><circle cx="116" cy="121" r="1.4"/></g>
                <path d="M81 98 Q87 95 94 98" stroke="${h}" stroke-width="2.5" fill="none" stroke-linecap="round"/>
                <path d="M106 98 Q113 95 119 98" stroke="${h}" stroke-width="2.5" fill="none" stroke-linecap="round"/>`,
      };
    case "sol":
      return {
        back: `<g fill="${h}"><circle cx="72" cy="78" r="16"/><circle cx="90" cy="60" r="18"/><circle cx="112" cy="58" r="18"/><circle cx="130" cy="74" r="16"/><circle cx="66" cy="98" r="12"/><circle cx="134" cy="96" r="12"/></g>`,
        front: `<g fill="${h}"><circle cx="80" cy="74" r="12"/><circle cx="98" cy="66" r="13"/><circle cx="117" cy="68" r="12"/><circle cx="128" cy="82" r="9"/><circle cx="72" cy="88" r="8"/></g>`,
        // round spectacles and brows
        extra: `<g fill="none" stroke="#c9a24a" stroke-width="2.5"><circle cx="87" cy="108" r="11"/><circle cx="113" cy="108" r="11"/><path d="M98 107 Q100 104 102 107"/></g>
                <path d="M79 94 Q86 91 93 94" stroke="${h}" stroke-width="3" fill="none" stroke-linecap="round"/>
                <path d="M107 94 Q114 91 121 94" stroke="${h}" stroke-width="3" fill="none" stroke-linecap="round"/>`,
      };
  }
}

/** An original bust portrait as an SVG string (200 x 240). */
export function portraitSVG(t: Traveler): string {
  const hair = hairShapes(t);
  return `<svg viewBox="0 0 200 240" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${t.label} traveler portrait">
  <defs>
    <radialGradient id="bg-${t.id}" cx="50%" cy="40%" r="70%">
      <stop offset="0%" stop-color="#f6e7c8"/><stop offset="100%" stop-color="#d9b98a"/>
    </radialGradient>
  </defs>
  <rect width="200" height="240" fill="url(#bg-${t.id})"/>
  ${hair.back}
  <!-- cloak and shoulders -->
  <path d="M28 240 Q32 178 76 166 L124 166 Q168 178 172 240 Z" fill="${t.cloak}"/>
  <path d="M60 240 L72 176 L100 196 L128 176 L140 240 Z" fill="#00000022"/>
  <!-- neck and scarf -->
  <rect x="88" y="136" width="24" height="34" fill="${t.skinShade}"/>
  <path d="M70 166 Q100 186 130 166 Q134 178 126 186 Q100 198 74 186 Q66 178 70 166 Z" fill="${t.scarf}"/>
  <path d="M112 184 L120 214 L108 212 Z" fill="${t.scarf}"/>
  <!-- face -->
  <ellipse cx="62" cy="110" rx="7" ry="11" fill="${t.skinShade}"/>
  <ellipse cx="138" cy="110" rx="7" ry="11" fill="${t.skinShade}"/>
  <path d="M66 100 Q66 62 100 62 Q134 62 134 100 Q134 140 100 148 Q66 140 66 100 Z" fill="${t.skin}"/>
  <ellipse cx="87" cy="108" rx="4.5" ry="5" fill="${t.eyes}"/>
  <ellipse cx="113" cy="108" rx="4.5" ry="5" fill="${t.eyes}"/>
  <circle cx="88.5" cy="106.5" r="1.3" fill="#fff"/><circle cx="114.5" cy="106.5" r="1.3" fill="#fff"/>
  <path d="M100 110 Q97 122 101 124" stroke="${t.skinShade}" stroke-width="2.5" fill="none" stroke-linecap="round"/>
  <path d="M90 132 Q100 138 110 132" stroke="#7a3b2e" stroke-width="2.5" fill="none" stroke-linecap="round"/>
  <ellipse cx="80" cy="124" rx="7" ry="4" fill="#e0806a" opacity="0.25"/>
  <ellipse cx="120" cy="124" rx="7" ry="4" fill="#e0806a" opacity="0.25"/>
  ${hair.front}
  ${hair.extra}
</svg>`;
}

export const STAGE_NAMES = ["", "Pencil sketch (Act 1)", "Inked lines (Act 2)", "Soft color (Act 3)", "Full painting (Summit)"];
