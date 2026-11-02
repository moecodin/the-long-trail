// Side paths: little errands and threads that are always open once you reach
// a leg, and never need a log. Each one is a few steps; the satchel's Progress
// page lists them, ticking off what you've done. They never fade or time out.
//
// Steps are plain flags in the save's `quests` list (like "goodbye:tin"), set
// by the leg as you do them. A path can also read secrets and gathering.

import type { Save } from "../save";

export type PathSave = Pick<Save, "quests" | "secrets" | "gather" | "cards" | "legsSeen">;

export interface PathStep {
  text: string;
  done(s: PathSave): boolean;
}

export interface SidePath {
  id: string;
  leg: number;
  name: string;
  about: string;
  steps: PathStep[];
  /** What you get at the end. */
  reward: string;
}

const flag = (id: string) => (s: PathSave) => s.quests.includes(id);

export const SIDE_PATHS: SidePath[] = [
  {
    id: "hens",
    leg: 1,
    name: "Della's hens",
    about: "The hens lay wherever they like, and again every morning.",
    steps: [{ text: "Find 3 eggs around the hen house (two a day)", done: (s) => (s.gather.gathered.egg ?? 0) >= 3 }],
    reward: "A critter card: Della's Hens",
  },
  {
    id: "goodbyes",
    leg: 1,
    name: "Goodbyes in the lane",
    about: "Della says you can't leave Lowmeadow without saying goodbye properly.",
    steps: [
      { text: "Take Della's borrowed pie tin back to the Tansys", done: flag("goodbye:tin") },
      { text: "Find Mr. Oakes's spectacles (he dropped them by the well)", done: flag("goodbye:specs") },
      { text: "Say goodbye to the Millers", done: flag("goodbye:letter") },
    ],
    reward: "A place card: Lowmeadow Neighbors, and a letter for Pell",
  },
  {
    id: "thimble",
    leg: 1,
    name: "The mice's lost kettle",
    about: "Someone very small lives under the Millers' step.",
    steps: [
      { text: "Knock at the tiny door by the Millers' cottage", done: flag("thimble:heard") },
      { text: "Find their kettle (it's a silver thimble)", done: flag("thimble:found") },
      { text: "Bring it home to them", done: flag("thimble:done") },
    ],
    reward: "A scrap of map: a drawing of the Stone Bridge",
  },
  {
    id: "chalk",
    leg: 1,
    name: "Della's chalk marks",
    about: "Della walked this trail once. She left a mark in every leg, and only the lantern shows them.",
    steps: [{ text: "Find Della's chalk mark in Leg 1", done: (s) => s.secrets.includes("leg1:chalk") }],
    reward: "One mark per leg. Something waits where they lead",
  },
];

export const pathDone = (p: SidePath, s: PathSave) => p.steps.every((st) => st.done(s));

/** The side paths you can see: every path in a leg you've reached. */
export const openPaths = (s: PathSave) => SIDE_PATHS.filter((p) => s.legsSeen.includes(p.leg));
