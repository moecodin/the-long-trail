// Little ink doodles for the journal: the drawing inside each day's stamp, and
// the pictures on the recipe cards. All hand-drawn SVG, so they're tiny and
// take on the journal's ink color.

import type { Mood } from "./data";

/** A small line drawing, drawn on a 32 by 32 grid in the current ink color. */
const D: Record<string, string> = {
  fern: `<path d="M16 29C16 20 15 11 17 3M16 25l-6-3M16 25l6-3M16 20l-5.5-3M16 20l5.5-3M16 15l-4.5-2.5M16 15l4.5-2.5M16.5 10l-3-2M16.5 10l3-2"/>`,
  mushroom: `<path d="M5 17C5 8 27 8 27 17Z"/><path d="M12 17c0 6-1 10 1 11h6c2-1 1-5 1-11"/><path d="M11 13h.1M19 12h.1M15.5 14.5h.1" stroke-width="3"/>`,
  acorn: `<path d="M8 13C8 7 24 7 24 13Z"/><path d="M16 7V4"/><path d="M9.5 13c0 9 4.5 14 6.5 15 2-1 6.5-6 6.5-15"/><path d="M10 10.5h12" stroke-dasharray="1.5 2"/>`,
  pine: `<path d="M16 3l-7 10h4l-6 8h5l-6 7h20l-6-7h5l-6-8h4Z"/><path d="M16 28v3"/>`,
  leaf: `<path d="M6 26C6 12 14 5 27 5c0 13-7 21-21 21Z"/><path d="M6 26C11 19 16 14 22 10M12 20h5M15 16.5h5"/>`,
  flower: `<circle cx="16" cy="12" r="3"/><circle cx="16" cy="5.5" r="3.2"/><circle cx="22.2" cy="10" r="3.2"/><circle cx="19.8" cy="17.3" r="3.2"/><circle cx="12.2" cy="17.3" r="3.2"/><circle cx="9.8" cy="10" r="3.2"/><path d="M16 20.5V30M16 26c-3-3-6-3-8-2 2 2 5 3 8 2"/>`,
  moon: `<path d="M20 5a11 11 0 1 0 7 17A9 9 0 1 1 20 5Z"/><path d="M8 5v4M6 7h4M26 4v2.5M24.7 5.2h2.6"/>`,
  sun: `<circle cx="16" cy="16" r="6"/><path d="M16 3v4M16 25v4M3 16h4M25 16h4M6.8 6.8l2.8 2.8M22.4 22.4l2.8 2.8M6.8 25.2l2.8-2.8M22.4 9.6l2.8-2.8"/>`,
  rain: `<path d="M9 19a5 5 0 0 1 1-9.5 7 7 0 0 1 13 .5 4.5 4.5 0 0 1 1 9Z"/><path d="M11 23l-1.5 4M17 23l-1.5 4M23 23l-1.5 4"/>`,
  campfire: `<path d="M7 28l18-5M7 23l18 5"/><path d="M16 22c-6-4-3-10 0-16 1 4 5 6 4 10 2-1 2-3 2-4 2 4 0 9-6 10Z"/>`,
  teacup: `<path d="M7 13h15v5a7.5 7.5 0 0 1-15 0Z"/><path d="M22 15c5 0 5 6-1 6M12 9c-1-2 1-3 0-5M17 9c-1-2 1-3 0-5M5 28.5h20"/>`,
  summit: `<path d="M3 28l10-16 5 7 4-5 7 14Z"/><path d="M13 12V4l6 2-6 2"/><path d="M10.5 16l2.5 2 2-2"/>`,
  birds: `<path d="M4 15c3-3 6-3 8 0 2-3 5-3 8 0M16 24c2-2 4-2 5.5 0 1.5-2 3.5-2 5.5 0"/>`,
  apple: `<path d="M16 10c-5-3-11 0-10 8s6 11 10 9c4 2 9-1 10-9s-5-11-10-8Z"/><path d="M16 10c0-3 1-5 3-6M17 7c3-2 6-1 7 1-3 1-5 1-7-1Z"/>`,
  lantern: `<path d="M11 9h10l1 16H10Z"/><path d="M13 9V6h6v3M16 6V3M14 3h4M9 25h14v3H9Z"/><path d="M16 21c-2-2-1-4 0-6 1 2 2 4 0 6Z"/>`,
  thyme: `<path d="M16 29C16 21 15 12 16 4"/><ellipse cx="12.5" cy="24" rx="2.6" ry="1.3" transform="rotate(25 12.5 24)"/><ellipse cx="19.5" cy="21" rx="2.6" ry="1.3" transform="rotate(-25 19.5 21)"/><ellipse cx="12.8" cy="17" rx="2.3" ry="1.2" transform="rotate(25 12.8 17)"/><ellipse cx="19" cy="14" rx="2.3" ry="1.2" transform="rotate(-25 19 14)"/><ellipse cx="13.6" cy="10" rx="2" ry="1" transform="rotate(25 13.6 10)"/><path d="M16 4h.1M18 6h.1M14.5 5.5h.1" stroke-width="3"/>`,
  chives: `<path d="M11 29C11 19 9 11 6 4M14.5 29c0-10 0-17 1-25M18 29c0-9 2-16 5-22M21.5 29c0-7 3-11 6-14"/><circle cx="6" cy="4" r="1.8"/><path d="M8 29h16"/>`,
  sage: `<path d="M16 30V13"/><path d="M16 23C9 23 6 18 7 12c6 0 9 5 9 11ZM16 18c6 0 9-5 8-11-6 0-8 5-8 11Z"/><path d="M16 23l-5-5M16 18l4.5-5"/>`,
  egg: `<path d="M16 4c-6 0-10 10-10 16a10 10 0 0 0 20 0C26 14 22 4 16 4Z"/><path d="M4 29c4-2 8-2 12-1s8 1 12-1"/>`,
  feather: `<path d="M8 28C9 16 15 7 26 4c-1 11-8 18-18 24Z"/><path d="M8 28L20 12M13 19h5M16 15h4"/>`,
};

/** Day doodles cycle through the trail's nature drawings, one per date. */
const DAY = ["fern", "mushroom", "acorn", "pine", "leaf", "flower", "birds", "apple", "feather"];

/** A rested day's doodle shows how the day felt. */
const MOOD: Record<Mood, string> = {
  rough: "rain",
  tired: "moon",
  calm: "teacup",
  good: "sun",
  proud: "summit",
};

/** A doodle's inner drawing, without the svg around it. */
export const doodleArt = (name: string) => D[name] ?? D.fern;

export function doodle(name: string, cls = "j-doodle") {
  return `<svg class="${cls}" viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${D[name] ?? D.fern}</svg>`;
}

/** The same doodle every time for the same date. */
export function dayDoodle(day: string) {
  let h = 0;
  for (const c of day) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return DAY[h % DAY.length];
}

export const moodDoodle = (mood: Mood | null) => (mood ? MOOD[mood] : "campfire");

// ---------- recipe card pictures (64 by 48, a little color) ----------

const INK = `stroke="#3b2a1e" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"`;

export const CARD_ART: Record<string, string> = {
  oats: `<g ${INK}>
    <path d="M22 12h20v4c3 1 3 3 3 5v17c0 3-2 4-4 4H23c-2 0-4-1-4-4V21c0-2 0-4 3-5Z" fill="#fff8e6"/>
    <path d="M21 9h22v4H21Z" fill="#c9a26b"/>
    <path d="M19.6 26c5 2 19 2 25 0V38c0 3-2 4-4 4H23c-2 0-4-1-3.4-4Z" fill="#e8cf9a"/>
    <path d="M24 30h.1M30 31h.1M37 30h.1M27 35h.1M34 36h.1" stroke-width="2.4"/>
    <path d="M47 40c0-5 3-8 8-8 0 5-3 8-8 8Z" fill="#d9603b"/><path d="M48.5 38.5c1.5-1.8 3-3 5-4.5"/>
    <path d="M9 42c0-4 3-7 7-7 0 4-3 7-7 7Z" fill="#9cb86a"/>
  </g>`,
  soup: `<g ${INK}>
    <path d="M12 22h40v6c0 9-7 14-20 14S12 37 12 28Z" fill="#8a6a4a"/>
    <ellipse cx="32" cy="22" rx="20" ry="4" fill="#c7843f"/>
    <path d="M24 21.5h.1M31 23h.1M38 21.5h.1M28 20.5h.1" stroke="#7a9a4a" stroke-width="2.6"/>
    <path d="M12 25H7M52 25h5"/>
    <path d="M24 15c-2-3 2-4 0-8M32 15c-2-3 2-4 0-8M40 15c-2-3 2-4 0-8" stroke-width="1.3"/>
  </g>`,
  scramble: `<g ${INK}>
    <ellipse cx="32" cy="32" rx="25" ry="11" fill="#fff8e6"/>
    <ellipse cx="32" cy="32" rx="18" ry="7" fill="none" stroke-width="1"/>
    <path d="M14 26c0-5 4-7 8-7s8 2 8 6v9H14Z" fill="#d8a25b"/>
    <path d="M16 27c0-3 3-5 6-5s6 2 6 4v6H16Z" fill="#f1d39a" stroke-width="1"/>
    <path d="M32 31c2-4 7-5 10-3 4-1 7 2 6 5-1 3-5 4-8 3-3 2-8 1-8-2Z" fill="#f6d34c"/>
    <path d="M36 31c1-1 3-1 4 0M42 33h.1" />
    <path d="M30 35c2-2 5-2 7 0M44 37c1-1 3-1 4 1" stroke="#4f7a36" stroke-width="2"/>
  </g>`,
  skillet: `<g ${INK}>
    <path d="M45 27l15-5" stroke-width="4"/><path d="M45 27l15-5" stroke="#6b4a2a" stroke-width="2"/>
    <ellipse cx="28" cy="28" rx="20" ry="11" fill="#4a4440"/>
    <ellipse cx="28" cy="27" rx="17" ry="8.5" fill="#efe1bd"/>
    <path d="M17 27c2-3 5-4 8-2M26 23c3-1 6 0 7 2M20 31c3 1 6 0 8-2" stroke="#e3c48a" stroke-width="3.5"/>
    <path d="M19 25h.1M31 30h.1M36 25h.1M24 30h.1" stroke="#5c8a3e" stroke-width="3"/>
    <path d="M33 28l3-1M22 22l2 1" stroke="#c94f32" stroke-width="2.6"/>
  </g>`,
  yogurt: `<g ${INK}>
    <path d="M12 24h40c0 10-8 17-20 17S12 34 12 24Z" fill="#7aa0b8"/>
    <ellipse cx="32" cy="24" rx="20" ry="5" fill="#fbf5e8"/>
    <circle cx="25" cy="22.5" r="2.4" fill="#6b4f9e"/><circle cx="30" cy="24.5" r="2.4" fill="#6b4f9e"/><circle cx="37" cy="22" r="2.6" fill="#c9374a"/><circle cx="41" cy="24.5" r="2.2" fill="#6b4f9e"/>
    <path d="M18 23c2-1 4-1 5 0" stroke="#b5884a" stroke-width="2"/>
    <path d="M46 10c2 0 3 2 3 4v4" stroke="#d9a031"/><path d="M45 20c1 2 3 2 4 0" stroke="#d9a031"/>
  </g>`,
  chili: `<g ${INK}>
    <path d="M10 24h44c0 10-9 17-22 17S10 34 10 24Z" fill="#a8522f"/>
    <ellipse cx="32" cy="24" rx="22" ry="5" fill="#8e2f22"/>
    <path d="M22 23.5c1-1 3-1 4 0M34 25c1-1 3-1 4 0M28 22c1-1 3-1 4 0M40 22.5c1-1 3-1 4 0M17 24.5c1-1 2-1 3 0" stroke="#f0d9b0" stroke-width="1.4"/>
    <path d="M46 14c4-2 7 0 8 4-3 2-7 1-8-4Z" fill="#c9374a"/><path d="M46 14c-1-2-2-3-4-3" stroke="#4f7a36" stroke-width="2"/>
    <path d="M26 16c-2-3 2-4 0-8M34 16c-2-3 2-4 0-8" stroke-width="1.3"/>
  </g>`,
};

export function cardArt(id: string) {
  return `<svg class="tc-art" viewBox="0 0 64 48" aria-hidden="true">${CARD_ART[id] ?? ""}</svg>`;
}
