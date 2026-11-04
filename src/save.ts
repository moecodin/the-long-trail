// Everything the game remembers between visits: your traveler, what you've
// gathered and how far along the trail you are. It lives in the browser's
// local storage on this device (and in your online backup once you sign in).

import { freshGather, type GatherSave } from "./trail/gather";

export type TravelerId = "ren" | "mara" | "sol";
export type ToolId = "stick" | "lantern";

export interface Save {
  version: 1;
  traveler: { id: TravelerId; name: string } | null;
  introSeen: boolean;
  /** 1 to 4: how clear the mirror portrait is (one step per act). */
  portraitStage: 1 | 2 | 3 | 4;
  muted: boolean;
  /** What you've picked on the trail, and which spots are picked for today. */
  gather: GatherSave;
  /** Legs of the trail you've walked to the end of (and made camp). */
  legsDone: number[];
  /** Legs you've set out on at least once (so the chapter card shows only the first time). */
  legsSeen: number[];
  /** The trail tools you carry (Della gives the stick and lantern in Leg 1). */
  tools: ToolId[];
  /** What you took from Della's table. */
  keepsake: "candle" | "flower" | "spoon" | null;
  /** Your line to your future self, on the journal's first page. */
  firstLine: string;
  /** Secrets you've found, like "leg1:stone". */
  secrets: string[];
  /** Shortcuts you've opened, like "leg1:gate". */
  shortcuts: string[];
  /** One-time conversations you've had, like "della:firstCamp". */
  talks: string[];
  /** Recipes found on the trail, like "bread" (the starters are always known). */
  recipes: string[];
  /** Place and critter cards you've earned, like "hens". */
  cards: string[];
  /** Side path steps you've done, like "goodbye:tin" (see trail/paths.ts). */
  quests: string[];
  /** Rewards for logging you've been given, like "lantern:2" or "keep:feather" (see journal/loot.ts). */
  loot: string[];
  /** Your fox, once you've met him at camp (see camp/foxMeeting.ts). How you first said hello flavors his mood lines. */
  fox: { name: string; hello: "apple" | "still" | "soft" | "alone" } | null;
  /** When this last changed (ms), for syncing. */
  updated?: number;
}

const KEY = "longtrail.save.v1";

const fresh = (): Save => ({
  version: 1,
  traveler: null,
  introSeen: false,
  portraitStage: 1,
  muted: false,
  gather: freshGather(),
  legsDone: [],
  legsSeen: [],
  tools: [],
  keepsake: null,
  firstLine: "",
  secrets: [],
  shortcuts: [],
  talks: [],
  recipes: [],
  cards: [],
  quests: [],
  loot: [],
  fox: null,
});

export function loadSave(): Save {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return fresh();
    const s = { ...fresh(), ...JSON.parse(raw) } as Save;
    s.gather = { ...freshGather(), ...s.gather };
    return s;
  } catch {
    return fresh();
  }
}

/** Save to this device. `touch` marks it changed (so it syncs); synced-in saves pass false. */
export function writeSave(save: Save, touch = true): void {
  if (touch) save.updated = Date.now();
  try {
    localStorage.setItem(KEY, JSON.stringify(save));
  } catch {
    // Private browsing can block storage. The game still plays; it just won't remember.
  }
}
