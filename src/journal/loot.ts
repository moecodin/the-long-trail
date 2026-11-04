// Loot: little rewards for logging your real days in the journal.
//
//   Lantern sparks    one for every day you've logged a meal. Every 4 sparks
//                     hangs another lit lantern around camp.
//   Satchel surprise  every 7 logged days, a cozy treasure card drops into
//                     the satchel's card album (see TREASURE_CARDS in recipes.ts).
//   Journal keepsakes at 10, 30, 60, 100 and 150 logged days, something
//                     small to keep. They stand on the shelf in your tent.
//
// Logged days count every day you ever logged a meal on, not just this week,
// and they never go down. Missing a day costs nothing.

import { live, type JournalData } from "./data";

export const SPARKS_PER_LANTERN = 4;
export const DAYS_PER_SURPRISE = 7;

/** How many different days you've logged at least one meal on. */
export function loggedDays(d: JournalData): number {
  return new Set(live(d.meals).map((m) => m.day)).size;
}

/** Lanterns hung at camp for this many sparks. */
export const lanternsFor = (sparks: number) => Math.floor(sparks / SPARKS_PER_LANTERN);

export interface JournalKeepsake {
  id: string;
  /** Logged days it takes. */
  days: number;
  name: string;
  /** Doodle for the satchel (see doodles.ts). */
  art: string;
  line: string;
}

export const JOURNAL_KEEPSAKES: JournalKeepsake[] = [
  { id: "keep:feather", days: 10, name: "Jay feather", art: "feather", line: "A bright blue feather, tucked in the journal at ten logged days. Ten days of looking after yourself." },
  { id: "keep:compass", days: 30, name: "Brass compass", art: "compass", line: "It doesn't always point north, but it always points somewhere worth going. Thirty logged days." },
  { id: "keep:bell", days: 60, name: "Little brass bell", art: "bell", line: "A tiny bell with a clear, small ring. Sixty days, and the trail knows your step." },
  { id: "keep:jar", days: 100, name: "Jar of glow bugs", art: "jar", line: "They come and go as they like, and light up the tent at night. One hundred logged days!" },
  { id: "keep:badge", days: 150, name: "Old trail badge", art: "summit", line: "Worn smooth by someone who walked this way long ago. A hundred and fifty days. They'd be proud." },
];

/** Keepsakes you've earned with this many logged days. */
export const keepsakesFor = (days: number) => JOURNAL_KEEPSAKES.filter((k) => days >= k.days);
