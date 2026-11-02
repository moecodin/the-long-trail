// The satchel: a leather bag of the game's things, kept apart from the journal
// (which is only your real-life days). Its tabs:
//
//   Items      Della's trail tools, your keepsake, and everything you've gathered
//   Cards      the trail card album: recipes now, places and critters later
//   Map        a hand-drawn map of the trail; places you haven't reached stay in fog
//   Progress   legs walked, what you've found, and side paths (filled in as they're built)
//
// The satchel only reads the game's save; it never changes it.

import { el, escapeHtml as esc } from "../ui/dom";
import { live, weekOf, journalDay, type JournalData } from "./data";
import { doodle } from "./doodles";
import { trailCard } from "./cards";
import { KIND_LABEL, RECIPE_HINTS, TRAIL_CARDS, knownRecipes, recipe, type CardKind } from "./recipes";
import { openPaths, pathDone, type PathSave } from "../trail/paths";
import "./satchel.css";

export type SatchelPage = "items" | "cards" | "map" | "progress";

/** One kind of thing you can pick on the trail. */
export interface GatheredItem {
  id: string;
  name: string;
  count: number;
  about: string;
  where: string;
}

export interface SatchelOptions {
  onOpen(): void;
  onClose(): void;
  travelerName(): string | null;
  /** Everything you can gather on the trail, and how many of each you've picked. */
  gathered(): GatheredItem[];
  /** The game's save, read-only. */
  game(): PathSave & {
    tools: readonly string[];
    keepsake: string | null;
    shortcuts: readonly string[];
    legsDone: readonly number[];
  };
  /** The journal's data, to count the days you've logged this week. */
  journal(): JournalData;
  /** Open a recipe in the journal (from its card). */
  openRecipe(id: string): void;
}

const TABS: { id: SatchelPage; label: string }[] = [
  { id: "items", label: "Items" },
  { id: "cards", label: "Cards" },
  { id: "map", label: "Map" },
  { id: "progress", label: "Progress" },
];

/** The six trail tools. Della gives the first two in Leg 1; the rest are found further on. */
const TOOLS: { id: string; name: string; about: string }[] = [
  { id: "stick", name: "Walking stick", about: "Della's good walking stick. Steady on rough ground, and handy for poking at things that look a bit off." },
  { id: "lantern", name: "Della's lantern", about: "It lights what the dark hides. Chalk marks too, if you know where to look." },
];
const TOOL_SLOTS = 6;

const KEEPSAKES: Record<string, { name: string; line: string; art: string }> = {
  candle: { name: "Candle lantern", line: "Her little one, for the dark bits.", art: "lantern" },
  flower: { name: "Pressed meadowflower", line: "From the meadow behind her cottage.", art: "flower" },
  spoon: { name: "Wooden spoon", line: "Worn smooth from a hundred soups.", art: "spoon" },
};

/** The trail's first act has six legs; only the ones built so far have names here. */
const ACT1_LEGS = 6;
/** Logged days in a week that open the next leg of the main trail. */
const DAYS_TO_OPEN = 3;
const LEGS: Record<number, { name: string; built?: boolean; secrets: string[]; shortcuts: { id: string; name: string }[] }> = {
  1: {
    name: "Della's yard",
    built: true,
    secrets: ["leg1:stone", "leg1:log", "leg1:chalk"],
    shortcuts: [{ id: "leg1:gate", name: "Della's back gate" }],
  },
  2: { name: "The Mill Road", secrets: [], shortcuts: [] },
};

/** Places on the map, in the map's own 0-100 by 0-60 drawing space. */
const PLACES: { id: string; name: string; x: number; y: number; leg?: number; about: string }[] = [
  { id: "camp", name: "Your camp", x: 16, y: 49, about: "Where you rest each night. The fire is always waiting." },
  { id: "leg1", name: "Della's yard", x: 38, y: 33, leg: 1, about: "Della's cottage, her herb bed and hens, and the lane north to a clearing." },
];

/** Things you carry for a side path (handed over, or kept). */
const CARRIED: { id: string; name: string; art: string; sub: string; about: string; has(q: readonly string[]): boolean }[] = [
  { id: "tin", name: "Della's pie tin", art: "tin", sub: "To go back to the Tansys", about: "Borrowed for a blackberry pie, months ago. Della says Mrs. Tansy will want it back before you go.", has: (q) => q.includes("goodbye:tin:got") && !q.includes("goodbye:tin") },
  { id: "specs", name: "Mr. Oakes's spectacles", art: "specs", sub: "To go back to Mr. Oakes", about: "Round, a little bent, and very much missed. He lives in the last cottage in the lane.", has: (q) => q.includes("goodbye:specs:got") && !q.includes("goodbye:specs") },
  { id: "letter", name: "A letter for Pell", art: "letter", sub: "From the Millers", about: "\"For Pell, at the mill road. They'll know you by it.\" Sealed with a thumbprint of flour.", has: (q) => q.includes("goodbye:letter") },
  { id: "thimble", name: "A silver thimble", art: "thimble", sub: "Someone's kettle", about: "Far too small for any hand you know. Someone very small must be missing it.", has: (q) => q.includes("thimble:found") && !q.includes("thimble:done") },
  { id: "mapscrap", name: "Map scrap: the Stone Bridge", art: "map", sub: "A gift from the mice", about: "A tiny drawing of a stone bridge, done in what looks like blackberry ink. The first piece of something bigger.", has: (q) => q.includes("thimble:done") },
];

const doodleFor = (id: string) => (id === "chamomile" ? "flower" : id);

export class Satchel {
  private panel: HTMLElement | null = null;
  private page: SatchelPage = "items";
  /** What's picked on each page. */
  private itemPick = "";
  private cardPick = "";
  private placePick = "";

  constructor(private opts: SatchelOptions) {}

  get isOpen() {
    return !!this.panel;
  }

  open(page?: SatchelPage) {
    if (page) this.page = page;
    if (!this.panel) {
      this.opts.onOpen();
      this.panel = el("div", "journal-backdrop satchel-backdrop");
      // keep taps inside the satchel from reaching the game underneath
      for (const t of ["pointerdown", "pointerup", "click"]) this.panel.addEventListener(t, (e) => e.stopPropagation());
      this.panel.addEventListener("keydown", (e) => e.stopPropagation());
      this.panel.addEventListener("click", (e) => this.onClick(e));
      document.body.appendChild(this.panel);
      requestAnimationFrame(() => this.panel?.classList.add("in"));
    }
    this.render();
  }

  close() {
    const p = this.panel;
    if (!p) return;
    this.panel = null;
    p.classList.remove("in");
    setTimeout(() => p.remove(), 250);
    this.opts.onClose();
  }

  /** The save changed (picked something, synced from another device): redraw if open. */
  refresh() {
    if (this.panel) this.render();
  }

  private render() {
    if (!this.panel) return;
    const [left, right] = this.pages();
    const name = this.opts.travelerName();
    this.panel.innerHTML = `
      <div class="j-book s-bag" role="dialog" aria-label="${name ? `${esc(name)}'s satchel` : "Your satchel"}">
        <button class="j-close" data-act="close" aria-label="Close satchel">✕</button>
        <div class="j-tabs" role="tablist">${TABS.map(
          (t) => `<button role="tab" aria-selected="${t.id === this.page}" data-go="${t.id}">${t.label}</button>`,
        ).join("")}</div>
        <section class="j-page">${left}</section>
        <section class="j-page">${right}</section>
      </div>`;
  }

  private pages(): [string, string] {
    switch (this.page) {
      case "items":
        return this.itemsPages();
      case "cards":
        return this.cardsPages();
      case "map":
        return this.mapPages();
      case "progress":
        return this.progressPages();
    }
  }

  // ---------- items ----------

  private itemsPages(): [string, string] {
    const g = this.opts.game();
    const items = this.opts.gathered();
    const found = items.filter((i) => i.count > 0);
    const tools = TOOLS.filter((t) => g.tools.includes(t.id));
    const keep = g.keepsake ? KEEPSAKES[g.keepsake] : null;
    const carried = CARRIED.filter((c) => c.has(g.quests));
    const valid = [...tools.map((t) => `tool:${t.id}`), ...(keep ? ["keepsake"] : []), ...carried.map((c) => `carry:${c.id}`), ...items.map((i) => `item:${i.id}`)];
    if (!valid.includes(this.itemPick)) this.itemPick = tools.length ? `tool:${tools[0].id}` : found.length ? `item:${found[0].id}` : (valid[0] ?? "");
    const pick = this.itemPick;
    const slot = (id: string, art: string, label: string, on: boolean, empty = false) =>
      empty
        ? `<span class="s-slot empty" aria-label="${label}">?</span>`
        : `<button class="s-slot${on ? " on" : ""}" data-act="pick-item" data-id="${id}" aria-pressed="${on}" aria-label="${esc(label)}">${doodle(art, "s-doodle")}</button>`;
    const toolSlots = Array.from({ length: TOOL_SLOTS }, (_, n) => {
      const t = tools[n];
      return t ? slot(`tool:${t.id}`, t.id, t.name, pick === `tool:${t.id}`) : slot("", "", "A trail tool not found yet", false, true);
    }).join("");
    const left = `
      <h2>Trail tools</h2>
      <div class="s-slots">${toolSlots}</div>
      ${keep ? `<h2>Keepsake</h2><div class="s-slots">${slot("keepsake", keep.art, keep.name, pick === "keepsake")}</div>` : ""}
      ${carried.length ? `<h2>Carrying</h2><div class="s-slots">${carried.map((c) => slot(`carry:${c.id}`, c.art, c.name, pick === `carry:${c.id}`)).join("")}</div>` : ""}
      <h2>Gathered</h2>
      <p class="j-date">${found.length ? `${found.reduce((n, i) => n + i.count, 0)} picked on the trail so far` : "Nothing picked yet. Look for a sparkle on the trail"}</p>
      <div class="s-slots">${items
        .map((i) =>
          i.count
            ? `<button class="s-slot${pick === `item:${i.id}` ? " on" : ""}" data-act="pick-item" data-id="item:${i.id}" aria-pressed="${pick === `item:${i.id}`}" aria-label="${esc(i.name)}, ${i.count}">${doodle(doodleFor(i.id), "s-doodle")}<span class="s-count">${i.count}</span></button>`
            : `<button class="s-slot unfound${pick === `item:${i.id}` ? " on" : ""}" data-act="pick-item" data-id="item:${i.id}" aria-pressed="${pick === `item:${i.id}`}" aria-label="Not found yet">${doodle(doodleFor(i.id), "s-doodle")}</button>`,
        )
        .join("")}</div>`;
    return [left, this.itemAbout(pick)];
  }

  private itemAbout(pick: string): string {
    const [kind, id] = pick.split(":");
    const show = (art: string, title: string, sub: string, body: string, extra = "") =>
      `<div class="j-gshow">${doodle(art, "j-gbig")}
         <div class="tc-about"><h2>${title}</h2><p class="j-date">${sub}</p></div></div>
       <p class="j-note">${body}</p>${extra}`;
    if (kind === "tool") {
      const t = TOOLS.find((x) => x.id === id);
      if (!t) return "";
      return show(t.id, esc(t.name), "A trail tool, from Della", esc(t.about), `<p class="j-small j-faint">There are ${TOOL_SLOTS} trail tools in all. The rest are found further along the trail.</p>`);
    }
    if (kind === "keepsake") {
      const k = KEEPSAKES[this.opts.game().keepsake ?? ""];
      if (!k) return "";
      return show(k.art, esc(k.name), "Your keepsake from Della's table", `<span class="hand">${esc(k.line)}</span>`, `<p class="j-small j-faint">It sits by your tent at camp.</p>`);
    }
    if (kind === "carry") {
      const c = CARRIED.find((x) => x.id === id);
      if (!c) return "";
      return show(c.art, esc(c.name), esc(c.sub), esc(c.about));
    }
    const it = this.opts.gathered().find((x) => x.id === id);
    if (!it) return `<p class="hand j-faint">Tap something on the left to look at it closer.</p>`;
    return it.count
      ? show(doodleFor(it.id), esc(it.name), esc(it.where), esc(it.about), `<p class="hand">${it.count} in your satchel</p><p class="j-small j-faint">Everything you pick grows back the next morning. Some recipes need these, so keep an eye out.</p>`)
      : show(doodleFor(it.id), "Still out there", esc(it.where), `<span class="j-faint">Something grows ${esc(it.where.toLowerCase())}. Walk up to the sparkle and tap Pick.</span>`);
  }

  // ---------- cards ----------

  /** Every card in the album so far: the ones you have face up, the rest face down with a hint. */
  private album() {
    const g = this.opts.game();
    const known = knownRecipes();
    const up = [...known, ...TRAIL_CARDS.filter((c) => g.cards.includes(c.id))];
    const down: { id: string; kind: CardKind; hint: string }[] = [
      ...Object.entries(RECIPE_HINTS)
        .filter(([id]) => !known.some((r) => r.id === id))
        .map(([id, hint]) => ({ id: `down:${id}`, kind: "recipe" as CardKind, hint })),
      ...TRAIL_CARDS.filter((c) => !g.cards.includes(c.id)).map((c) => ({ id: `down:${c.id}`, kind: c.kind, hint: c.hint })),
    ];
    return { up, down };
  }

  private cardsPages(): [string, string] {
    const { up, down } = this.album();
    if (!this.cardPick || ![...up.map((c) => c.id), ...down.map((d) => d.id)].includes(this.cardPick)) this.cardPick = up[0]?.id ?? "";
    const pick = this.cardPick;
    const grid = [
      ...up.map((c) => trailCard(c, { picked: c.id === pick })),
      ...down.map((d) => trailCard(null, { waiting: d, waitingId: d.id, picked: pick === d.id })),
    ].join("");
    const r = recipe(pick);
    const t = TRAIL_CARDS.find((c) => c.id === pick);
    const w = down.find((d) => d.id === pick);
    const right = r
      ? `<div class="tc-show">${trailCard(r, { big: true, still: true })}
           <div class="tc-about">
             <h2>${esc(r.name)}</h2>
             <p class="j-date">${r.meal} · serves ${r.serves}</p>
             <p class="j-small j-faint">${r.minutes}${r.starter ? "" : " · found on the trail"}</p>
             <div class="j-spread"><button class="j-btn small" data-act="open-recipe" data-id="${r.id}">Open in my journal</button></div>
           </div></div>`
      : t
        ? `<div class="tc-show">${trailCard(t, { big: true, still: true })}
           <div class="tc-about">
             <h2>${esc(t.name)}</h2>
             <p class="j-date">A ${KIND_LABEL[t.kind].toLowerCase()} card · Leg ${t.leg}</p>
             <p class="j-small j-faint">${esc(t.how)}</p>
           </div></div>`
        : w
          ? `<div class="tc-show">${trailCard(null, { big: true, still: true, waiting: w })}
           <div class="tc-about">
             <h2>Still on the trail</h2>
             <p class="j-date">A ${KIND_LABEL[w.kind].toLowerCase()} card</p>
             <p class="hand">${esc(w.hint)}…</p>
           </div></div>`
          : "";
    return [
      `<h2>Trail cards</h2>
       <p class="j-date">${up.length} found so far. Tap one to look closer</p>
       <div class="tc-grid">${grid}</div>`,
      right,
    ];
  }

  // ---------- map ----------

  private reached(p: (typeof PLACES)[number]) {
    return !p.leg || this.opts.game().legsSeen.includes(p.leg) || this.opts.game().legsDone.includes(p.leg);
  }

  private mapPages(): [string, string] {
    const g = this.opts.game();
    // where you've got to: the furthest leg you've set out on, else camp
    const here = [...PLACES].reverse().find((p) => p.leg && g.legsSeen.includes(p.leg)) ?? PLACES[0];
    if (!PLACES.some((p) => p.id === this.placePick)) this.placePick = here.id;
    const pick = PLACES.find((p) => p.id === this.placePick)!;
    const pins = PLACES.map((p) => {
      const seen = this.reached(p);
      return `<g class="s-pin${seen ? "" : " unseen"}${p.id === pick.id ? " on" : ""}" data-act="pick-place" data-id="${p.id}" role="button" aria-label="${esc(p.name)}" tabindex="0">
        <circle cx="${p.x}" cy="${p.y}" r="6" fill="transparent"/>
        <circle class="s-dot" cx="${p.x}" cy="${p.y}" r="2.4"/>
        ${p.id === here.id ? `<path class="s-here" d="M${p.x} ${p.y - 3.5}l-2-4h4Z"/>` : ""}
        <text x="${p.x + 3.5}" y="${p.y + 1.2}">${esc(p.name)}</text>
      </g>`;
    }).join("");
    const map = `<svg class="s-map" viewBox="0 0 100 60" role="img" aria-label="Map of the trail so far">
      <defs>
        <linearGradient id="s-fog" x1="0" x2="1" y1="0" y2="0"><stop offset="0.48" stop-color="var(--s-map)" stop-opacity="0"/><stop offset="0.72" stop-color="var(--s-map)" stop-opacity="0.92"/></linearGradient>
      </defs>
      <path class="s-hill" d="M58 22c4-5 8-5 11 0M74 14c3-4 6-4 9 0M84 8l4-6 4 6"/>
      <path class="s-trail" d="M16 49C22 46 26 40 30 37S35 34 38 33S52 30 58 26S74 16 80 12S90 6 93 4"/>
      <path class="s-lane" d="M38 33c3 3 3 7 7 9"/>
      <path class="s-tree" d="M24 30l2-4 2 4ZM28 33l2-4 2 4ZM47 45l2-4 2 4ZM51 43l2-4 2 4ZM9 40l2-4 2 4Z"/>
      <rect x="0" y="0" width="100" height="60" fill="url(#s-fog)" pointer-events="none"/>
      ${pins}
      <text class="s-fogtext" x="80" y="40">still in fog</text>
    </svg>`;
    const seen = this.reached(pick);
    const leg = pick.leg ? LEGS[pick.leg] : null;
    const right = `
      <h2>${esc(pick.name)}</h2>
      <p class="j-date">${pick.leg ? `Leg ${pick.leg}` : "Home base"}${pick.id === here.id ? " · you are here" : ""}</p>
      <p class="j-note">${seen ? esc(pick.about) : "You haven't set out this way yet."}</p>
      ${leg && seen ? this.legFinds(pick.leg!) : ""}
      <p class="j-small j-faint">The map fills in as you walk. Everything past the fog is still ahead of you.</p>`;
    return [`<h2>The Long Trail</h2><div class="s-mapwrap">${map}</div>`, right];
  }

  /** What there is to find on a leg, and how much you have. */
  private legFinds(n: number) {
    const leg = LEGS[n];
    if (!leg) return "";
    const g = this.opts.game();
    const secrets = leg.secrets.filter((s) => g.secrets.includes(s)).length;
    return `<ul class="j-list s-finds">
      <li><span class="j-item static"><span>Secrets</span><span class="hand">${secrets} of ${leg.secrets.length}</span></span></li>
      ${leg.shortcuts.map((s) => `<li><span class="j-item static"><span>${esc(s.name)}</span><span class="hand">${g.shortcuts.includes(s.id) ? "opened" : "not yet"}</span></span></li>`).join("")}
    </ul>`;
  }

  // ---------- progress ----------

  private progressPages(): [string, string] {
    const g = this.opts.game();
    const d = this.opts.journal();
    const today = journalDay(d);
    const week = weekOf(today);
    const loggedDays = new Set(live(d.meals).filter((m) => weekOf(m.day) === week).map((m) => m.day)).size;
    const next = Array.from({ length: ACT1_LEGS }, (_, i) => i + 1).find((n) => !g.legsDone.includes(n)) ?? ACT1_LEGS + 1;
    const legs = Array.from({ length: ACT1_LEGS }, (_, i) => {
      const n = i + 1;
      const done = g.legsDone.includes(n);
      const leg = LEGS[n];
      const state = done ? "done" : n === next && leg ? "here" : "locked";
      const name = leg && (done || g.legsSeen.includes(n) || n === next) ? leg.name : "";
      // the first leg is always open; every leg after needs 3 logged days in a week
      const open = n === 1 || loggedDays >= DAYS_TO_OPEN;
      const note = done
        ? "walked"
        : n !== next
          ? ""
          : !open
            ? `opens after ${DAYS_TO_OPEN} logged days (${loggedDays} of ${DAYS_TO_OPEN})`
            : leg?.built
              ? g.legsSeen.includes(n) ? "on the way" : "ready to walk"
              : "open! still being built";
      return `<li class="s-leg ${state}"><span class="s-step" aria-hidden="true"></span>
        <span>Leg ${n}${name ? ` · ${esc(name)}` : ""}</span><span class="hand j-faint">${note}</span></li>`;
    }).join("");
    const found = (have: number, of: number | null, label: string) =>
      `<li><span class="j-item static"><span>${label}</span><span class="hand">${have}${of ? ` of ${of}` : ""}</span></span></li>`;
    const items = this.opts.gathered();
    const secretsAll = Object.values(LEGS).flatMap((l) => l.secrets);
    const left = `
      <h2>Act 1</h2>
      <p class="j-date">${g.legsDone.length} of ${ACT1_LEGS} legs walked</p>
      <ul class="s-legs">${legs}</ul>
      <p class="j-small j-faint">Logged ${loggedDays} ${loggedDays === 1 ? "day" : "days"} in your journal this week. Logging is what opens the main trail.</p>`;
    const right = `
      <h2>Found so far</h2>
      <ul class="j-list">
        ${found(knownRecipes().length, null, "Recipes")}
        ${found(this.album().up.length, null, "Trail cards")}
        ${found(g.tools.length, TOOL_SLOTS, "Trail tools")}
        ${found(items.filter((i) => i.count > 0).length, items.length, "Things to gather")}
        ${found(g.secrets.filter((s) => secretsAll.includes(s)).length, secretsAll.length, "Secrets")}
      </ul>
      <h2>Side paths</h2>
      ${this.sidePaths()}`;
    return [left, right];
  }

  /** The side paths you've reached, each with its steps ticked off. */
  private sidePaths() {
    const g = this.opts.game();
    const paths = openPaths(g);
    if (!paths.length) return `<p class="j-note j-faint">Side paths are always open, no logging needed. They'll show up here as you reach them.</p>`;
    return `<ul class="s-paths">${paths
      .map((p) => {
        const done = pathDone(p, g);
        return `<li class="s-path${done ? " done" : ""}">
          <p class="s-path-name"><span>${esc(p.name)}</span><span class="hand j-faint">${done ? "done" : `Leg ${p.leg}`}</span></p>
          ${done ? `<p class="j-small j-faint">${esc(p.reward)}</p>` : `<ul class="s-steps">${p.steps.map((st) => `<li class="${st.done(g) ? "ticked" : ""}">${esc(st.text)}</li>`).join("")}</ul>`}
        </li>`;
      })
      .join("")}</ul>
      <p class="j-small j-faint">Side paths never need a log, and they wait for you forever.</p>`;
  }

  // ---------- taps ----------

  private onClick(e: Event) {
    const b = (e.target as Element).closest<HTMLElement | SVGElement>("[data-act],[data-go]");
    if (!b) return;
    const go = b.dataset.go as SatchelPage | undefined;
    if (go) {
      this.page = go;
      return this.render();
    }
    const id = b.dataset.id ?? "";
    switch (b.dataset.act) {
      case "close":
        return this.close();
      case "pick-item":
        this.itemPick = id;
        return this.render();
      case "pick-card":
        this.cardPick = id;
        return this.render();
      case "pick-place":
        this.placePick = id;
        return this.render();
      case "open-recipe":
        this.close();
        return this.opts.openRecipe(id);
    }
  }
}
