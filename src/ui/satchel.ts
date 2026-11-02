// The corner buttons: sound, the journal and the satchel. They sit in the
// corner of every screen, even the intro, because logging always comes first.
// The journal (src/journal/journal.ts) is your real-life days; the satchel
// (src/journal/satchel.ts) holds the game's things.

import { el } from "./dom";
import { Journal, type JournalOptions } from "../journal/journal";
import { Satchel, type SatchelOptions as BagOptions } from "../journal/satchel";

const JOURNAL_ICON = `<svg viewBox="0 0 64 64" aria-hidden="true">
  <rect x="12" y="8" width="40" height="48" rx="4" fill="#f3e6c8" stroke="#5a3a22" stroke-width="3"/>
  <path d="M20 8v48" stroke="#5a3a22" stroke-width="3"/>
  <path d="M27 20h17M27 28h17M27 36h11" stroke="#8a5a2c" stroke-width="2.5" stroke-linecap="round"/>
  <path d="M40 4v18l4-4 4 4V4" fill="#8e3b2a" stroke="#5a3a22" stroke-width="2" stroke-linejoin="round"/>
</svg>`;

const SATCHEL_ICON = `<svg viewBox="0 0 64 64" aria-hidden="true">
  <path d="M20 22 Q20 8 32 8 Q44 8 44 22" fill="none" stroke="#5a3a22" stroke-width="4" stroke-linecap="round"/>
  <rect x="10" y="20" width="44" height="34" rx="8" fill="#a8743c" stroke="#5a3a22" stroke-width="3"/>
  <path d="M10 28 Q32 40 54 28 L54 22 Q54 20 52 20 L12 20 Q10 20 10 22 Z" fill="#8a5a2c" stroke="#5a3a22" stroke-width="3" stroke-linejoin="round"/>
  <rect x="28" y="30" width="8" height="9" rx="2" fill="#e3c06a" stroke="#5a3a22" stroke-width="2"/>
  <path d="M18 46 h10 M18 50 h16" stroke="#e8d2a8" stroke-width="2" stroke-linecap="round"/>
</svg>`;

const SOUND_ON = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9h4l5-4v14l-5-4H4z" fill="currentColor"/><path d="M16 8.5a5 5 0 0 1 0 7M18.5 6a8.5 8.5 0 0 1 0 12" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round"/></svg>`;
const SOUND_OFF = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9h4l5-4v14l-5-4H4z" fill="currentColor"/><path d="M16 9l5 6M21 9l-5 6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>`;

export interface CornerOptions extends JournalOptions {
  onToggleSound(): boolean;
  muted: boolean;
  /** What the satchel shows (its open/close and name come from the journal's options). */
  satchel: Omit<BagOptions, "onOpen" | "onClose" | "travelerName" | "openRecipe" | "journal">;
}

/** Put the sound, journal and satchel buttons in the corner. Returns the journal and satchel they open. */
export function mountSatchel(opts: CornerOptions): { journal: Journal; satchel: Satchel } {
  const bag: Satchel = new Satchel({
    ...opts.satchel,
    onOpen: opts.onOpen,
    onClose: opts.onClose,
    travelerName: opts.travelerName,
    journal: () => journal.data,
    openRecipe: (id) => journal.openRecipe(id, "cards"),
  });
  const journal = new Journal({ ...opts, openSatchelCards: () => bag.open("cards") });
  const bar = el("div", "corner-bar");
  const sound = el("button", "round-btn sound-btn", opts.muted ? SOUND_OFF : SOUND_ON);
  sound.setAttribute("aria-label", "Sound on or off");
  const book = el("button", "satchel-btn journal-btn", JOURNAL_ICON);
  book.setAttribute("aria-label", "Open your journal");
  const satchel = el("button", "satchel-btn bag-btn", SATCHEL_ICON);
  satchel.setAttribute("aria-label", "Open your satchel");
  bar.append(sound, book, satchel);
  document.body.appendChild(bar);

  sound.addEventListener("click", (e) => {
    e.stopPropagation();
    const muted = opts.onToggleSound();
    sound.innerHTML = muted ? SOUND_OFF : SOUND_ON;
  });

  book.addEventListener("click", (e) => {
    e.stopPropagation();
    if (bag.isOpen) bag.close();
    if (journal.isOpen) journal.close();
    else journal.open();
  });
  satchel.addEventListener("click", (e) => {
    e.stopPropagation();
    if (journal.isOpen) journal.close();
    if (bag.isOpen) bag.close();
    else bag.open();
  });
  return { journal, satchel: bag };
}
