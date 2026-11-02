// The satchel journal: an open field journal with bookmark tabs on its edge.
//
//   Today       what you've eaten, protein, fiber and the canteen (water)
//   Log         write down a meal (name + calories, the rest is optional)
//   Meals       meals you've saved (one tap to add again) and your recipes
//   Cards       the trail card album: recipes now, places and critters later
//   Trends      the last 7 or 30 days, drawn as small charts
//   Scale       weigh-ins and the weekly averages (the only thing the game reads)
//   Setup       units, your details, the daily targets and a few options
//
// Plus three pages that open on their own: first-time setup, "Rest at camp"
// at the end of the day, and a look back at yesterday the first time you open
// the game the next day (you can fix anything you forgot).
//
// Each day's page gets an ink stamp with a little doodle: faint until you log
// something, inked once you do, and a mood doodle once you rest at camp.

import { el, escapeHtml as esc } from "../ui/dom";
import {
  ACTIVITY,
  MOODS,
  addDays,
  autoRest,
  clockDay,
  fmtWeight,
  fromDisplayWeight,
  journalDay,
  latestWeight,
  live,
  loadJournal,
  mealsFor,
  newId,
  restFor,
  saveJournal,
  suggestedLines,
  summaryDue,
  targets,
  toDisplayWeight,
  totals,
  waterFor,
  weeklyAverages,
  type Activity,
  type JournalData,
  type Meal,
  type Mood,
  type Pace,
  type SavedMeal,
  type Sex,
  type Units,
} from "./data";
import type { Sync } from "./sync";
import { cardArt, dayDoodle, doodle, moodDoodle } from "./doodles";
import { KIND_LABEL, WAITING, knownRecipes, recipe, type CardKind, type Recipe } from "./recipes";
import "./journal.css";

export type JournalPage = "today" | "log" | "meals" | "cards" | "gathered" | "trends" | "scale" | "setup";
type Screen = JournalPage | "welcome" | "rest" | "yesterday" | "recipe";

export interface JournalOptions {
  onOpen(): void;
  onClose(): void;
  travelerName(): string | null;
  onChangeTraveler(): void;
  onReplayIntro(): void;
  /** Called after you rest at camp (the camp can dim the fire, say goodnight...). */
  onRested?(): void;
  /** Called after every change, so it can be synced. */
  onChange?(d: JournalData): void;
  /** Everything you can gather on the trail, and how many of each you've picked (the game keeps these). */
  gathered?(): GatheredItem[];
}

/** One kind of thing you can pick on the trail, for the Gathered page. */
export interface GatheredItem {
  id: string;
  name: string;
  count: number;
  about: string;
  where: string;
}

const TABS: { id: JournalPage; label: string }[] = [
  { id: "today", label: "Today" },
  { id: "log", label: "Log" },
  { id: "meals", label: "Meals" },
  { id: "cards", label: "Cards" },
  { id: "gathered", label: "Gather" },
  { id: "trends", label: "Trends" },
  { id: "scale", label: "Scale" },
  { id: "setup", label: "Setup" },
];

/** The trail card frame and back, from Quaternius' 3D Card Kit (see tools/render-card-frames.mjs). */
const CARD_IMG = `${import.meta.env.BASE_URL}cards/`;

const fmt = (n: number) => Math.round(n).toLocaleString("en-US");
const num = (v: FormDataEntryValue | string | null | undefined) => {
  const n = parseFloat(String(v ?? "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
};
const pct = (v: number, of: number) => `${Math.max(0, Math.min(100, (v / (of || 1)) * 100)).toFixed(0)}%`;

function dayDate(day: string) {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(y, m - 1, d);
}
const longDay = (day: string) => dayDate(day).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
const shortDay = (day: string) => dayDate(day).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
const clock = (at: number) => new Date(at).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });

/** A meal being written or changed on the Log page. */
interface Draft {
  id: string | null;
  day: string;
  name: string;
  kcal: string;
  servings: string;
  protein: string;
  carbs: string;
  fat: string;
  fiber: string;
  takeout: boolean;
  save: boolean;
  /** Set when the meal came from one of your recipes. */
  recipeId?: string;
  /** Where to go after saving. */
  back: Screen;
}

export class Journal {
  private d: JournalData = loadJournal();
  private panel: HTMLElement | null = null;
  private screen: Screen = "today";
  private draft: Draft | null = null;
  private trendDays: 7 | 30 = 7;
  private restMood: Mood | null = null;
  private restLine = "";
  /** Settings being edited on the welcome / setup page (applied on save). */
  private form: Record<string, string> = {};
  private toastTimer = 0;
  /** The online backup, once main.ts hooks it up. */
  sync: Sync | null = null;
  private backup = { email: "", step: "email" as "email" | "sent", msg: "", busy: false };
  /** The recipe open on the recipe page, and which tab it was opened from. */
  private recipeId = "";
  private recipeBack: "meals" | "cards" = "cards";
  /** The card picked in the album (a recipe id, or "waiting-N"). */
  private cardPick = "";
  /** The thing picked on the Gathered page. */
  private itemPick = "";
  /** Each day's stamp as last drawn, so a newly inked stamp can thump down. */
  private stampsDrawn = new Map<string, string>();

  constructor(private opts: JournalOptions) {
    autoRest(this.d);
    this.persist(false);
  }

  get data() {
    return this.d;
  }

  /** Changes arrived from another device: save them here and redraw. */
  refresh() {
    autoRest(this.d);
    saveJournal(this.d);
    if (this.panel && !this.panel.contains(document.activeElement)) this.render();
  }

  get isOpen() {
    return !!this.panel;
  }

  /** Open the journal. With no page it picks: setup the first time, yesterday's summary if due, else Today. */
  open(page?: JournalPage | "rest") {
    autoRest(this.d);
    this.persist(false);
    let screen: Screen = page ?? "today";
    if (!this.d.settings.setupDone) screen = "welcome";
    else if (!page && summaryDue(this.d)) screen = "yesterday";
    this.screen = screen;
    if (screen === "rest" || screen === "yesterday") this.startRest();
    if (!this.panel) {
      this.opts.onOpen();
      this.panel = el("div", "journal-backdrop");
      // keep taps inside the journal from reaching the game underneath
      for (const t of ["pointerdown", "pointerup", "click"]) this.panel.addEventListener(t, (e) => e.stopPropagation());
      this.panel.addEventListener("keydown", (e) => e.stopPropagation());
      this.panel.addEventListener("click", (e) => this.onClick(e));
      this.panel.addEventListener("input", (e) => this.onInput(e));
      this.panel.addEventListener("change", (e) => this.onInput(e));
      document.body.appendChild(this.panel);
      requestAnimationFrame(() => this.panel?.classList.add("in"));
    }
    this.render();
  }

  /** On a new day, show yesterday's summary right away (called once the game starts). */
  greetNewDay() {
    autoRest(this.d);
    this.persist(false);
    if (this.d.settings.setupDone && summaryDue(this.d) && !this.panel) this.open();
  }

  close() {
    const p = this.panel;
    if (!p) return;
    this.panel = null;
    this.draft = null;
    p.classList.remove("in");
    setTimeout(() => p.remove(), 250);
    this.opts.onClose();
  }

  // ---------- saving ----------

  private persist(changed = true) {
    saveJournal(this.d);
    if (changed) this.opts.onChange?.(this.d);
  }

  private toast(msg: string) {
    const t = this.panel?.querySelector<HTMLElement>(".j-toast");
    if (!t) return;
    t.textContent = msg;
    t.classList.add("show");
    clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => t.classList.remove("show"), 1800);
  }

  private go(screen: Screen) {
    this.screen = screen;
    this.render();
  }

  // ---------- drawing ----------

  private render() {
    if (!this.panel) return;
    const s = this.screen;
    const [left, right] = this.pages(s);
    const tab = s === "recipe" ? this.recipeBack : s;
    const tabbed = (TABS as { id: string }[]).some((t) => t.id === tab);
    const name = this.opts.travelerName();
    this.panel.innerHTML = `
      <div class="j-book" role="dialog" aria-label="${name ? `${esc(name)}'s journal` : "Your journal"}">
        <div class="j-ribbon" aria-hidden="true"></div>
        <button class="j-close" data-act="close" aria-label="Close journal">✕</button>
        ${
          tabbed
            ? `<div class="j-tabs" role="tablist">${TABS.map(
                (t) => `<button role="tab" aria-selected="${t.id === tab}" data-go="${t.id}">${t.label}</button>`,
              ).join("")}</div>`
            : ""
        }
        <section class="j-page">${left}</section>
        <section class="j-page">${right}</section>
      </div>
      <div class="j-toast" role="status" aria-live="polite"></div>`;
  }

  private pages(s: Screen): [string, string] {
    switch (s) {
      case "welcome":
        return this.setupPages(true);
      case "setup":
        return this.setupPages(false);
      case "today":
        return this.todayPages();
      case "log":
        return this.logPages();
      case "meals":
        return this.mealsPages();
      case "cards":
        return this.cardsPages();
      case "gathered":
        return this.gatheredPages();
      case "recipe":
        return this.recipePages();
      case "trends":
        return this.trendsPages();
      case "scale":
        return this.scalePages();
      case "rest":
        return this.restPages();
      case "yesterday":
        return this.yesterdayPages();
    }
  }

  private get tg() {
    return targets(this.d.settings, latestWeight(this.d));
  }

  /** The summary box for a day: calories, protein, fiber, canteen. */
  private dayTiles(day: string, cupsEditable: boolean) {
    const t = totals(mealsFor(this.d, day));
    const tg = this.tg;
    const cups = waterFor(this.d, day);
    const hide = this.d.settings.hideKcal;
    return `
      ${
        hide
          ? ""
          : `<div class="j-tile">
        <div class="j-row"><span class="hand">Eaten so far</span><span class="hand">of ${fmt(tg.kcal)} kcal</span></div>
        <div class="j-big">${fmt(t.kcal)}</div>
        <div class="j-bar"><i style="width:${pct(t.kcal, tg.kcal)}"></i></div>
      </div>`
      }
      <div class="j-tile">
        <div class="j-row"><span>Protein</span><span class="hand">${fmt(t.protein)} / ${tg.protein} g</span></div>
        <div class="j-bar"><i style="width:${pct(t.protein, tg.protein)}"></i></div>
        <div class="j-row"><span>Fiber</span><span class="hand">${fmt(t.fiber)} / ${tg.fiber} g</span></div>
        <div class="j-bar"><i style="width:${pct(t.fiber, tg.fiber)}"></i></div>
      </div>
      <div class="j-tile">
        <div class="j-row"><span>Canteen</span><span class="hand">${cups} of ${tg.cups} cups</span></div>
        <div class="j-cups">${Array.from({ length: Math.max(tg.cups, cups) }, (_, i) =>
          cupsEditable
            ? `<button class="j-cup ${i < cups ? "full" : ""}" data-act="cup" data-day="${day}" data-n="${i + 1}" aria-label="${i + 1} cups"></button>`
            : `<span class="j-cup ${i < cups ? "full" : ""}"></span>`,
        ).join("")}</div>
      </div>`;
  }

  private mealList(day: string, empty: string) {
    const meals = mealsFor(this.d, day);
    if (!meals.length) return `<p class="hand j-faint">${empty}</p>`;
    const hide = this.d.settings.hideKcal;
    return `<ul class="j-list">${meals
      .map(
        (m) => `<li>
          <button class="j-item" data-act="edit-meal" data-id="${m.id}">
            <span>${esc(m.name)}${m.servings !== 1 ? ` <span class="j-faint">×${m.servings}</span>` : ""}${m.takeout ? ` <span class="j-tag">inn</span>` : ""}</span>
            <span class="hand">${hide ? clock(m.at) : `${fmt(m.kcal * m.servings)} kcal`}</span>
          </button>
          <button class="j-x" data-act="del-meal" data-id="${m.id}" aria-label="Remove ${esc(m.name)}">✕</button>
        </li>`,
      )
      .join("")}</ul>`;
  }

  private todayPages(): [string, string] {
    const day = journalDay(this.d);
    const rested = clockDay(Date.now()) !== day;
    const lastRest = rested ? restFor(this.d, addDays(day, -1)) : null;
    return [
      `${this.pageHead(rested ? "Tomorrow's page" : "Today on the trail", longDay(day), day)}
       ${this.dayTiles(day, true)}`,
      `<h2>Meals</h2>
       ${
         lastRest
           ? `<div class="j-rested">${this.stamp(lastRest.day, true)}<p class="j-note">${lastRest.line ? `<span class="hand">“${esc(lastRest.line)}”</span><br>` : ""}<span class="j-faint">Rested at camp. Anything you log tonight goes on this new page.</span></p></div>`
           : ""
       }
       ${this.mealList(day, "Nothing written yet today.")}
       <div class="j-spread">
         <button class="j-btn" data-act="new-meal">Log a meal</button>
         ${rested ? "" : `<button class="j-btn ghost" data-act="rest">Rest at camp</button>`}
       </div>`,
    ];
  }

  // ---------- log a meal ----------

  private newDraft(day: string, back: Screen, from?: Partial<SavedMeal> & { recipeId?: string }): Draft {
    return {
      id: null,
      day,
      name: from?.name ?? "",
      kcal: from?.kcal != null ? String(from.kcal) : "",
      servings: "1",
      protein: from?.protein ? String(from.protein) : "",
      carbs: from?.carbs ? String(from.carbs) : "",
      fat: from?.fat ? String(from.fat) : "",
      fiber: from?.fiber ? String(from.fiber) : "",
      takeout: from?.takeout ?? false,
      save: !from,
      recipeId: from?.recipeId,
      back,
    };
  }

  private logPages(): [string, string] {
    const dr = (this.draft ??= this.newDraft(journalDay(this.d), "today"));
    const editing = !!dr.id;
    const today = journalDay(this.d);
    const saved = live(this.d.savedMeals);
    const field = (key: keyof Draft, label: string, mode = "decimal") =>
      `<label class="j-field"><span>${label}</span><input name="${key}" inputmode="${mode}" value="${esc(String(dr[key]))}" autocomplete="off"></label>`;
    return [
      `<h2>${editing ? "Change a meal" : "Log a meal"}</h2>
       <p class="j-date">${dr.day === today ? "Today" : longDay(dr.day)}${editing ? "" : ", the time is added for you"}</p>
       <label class="j-field"><span>What was it?</span><input name="name" value="${esc(dr.name)}" list="j-saved" autocomplete="off" enterkeyhint="next"></label>
       <datalist id="j-saved">${[...saved.map((m) => m.name), ...knownRecipes().map((r) => r.name)].map((n) => `<option value="${esc(n)}">`).join("")}</datalist>
       <div class="j-two">${field("kcal", "Calories", "numeric")}${field("servings", "Servings")}</div>
       <label class="j-check"><input type="checkbox" name="takeout" ${dr.takeout ? "checked" : ""}><span>Takeout or eating out <span class="j-faint">(an inn night)</span></span></label>`,
      `<h2>If you know them</h2>
       <p class="j-date">Optional, in grams</p>
       <div class="j-four">${field("protein", "Protein")}${field("carbs", "Carbs")}${field("fat", "Fat")}${field("fiber", "Fiber")}</div>
       ${editing ? "" : `<label class="j-check"><input type="checkbox" name="save" ${dr.save ? "checked" : ""}><span>Save to My meals</span></label>`}
       <div class="j-spread">
         <button class="j-btn" data-act="save-meal">${editing ? "Save changes" : dr.day === today ? "Add to today" : "Add to that day"}</button>
         ${
           editing
             ? `<button class="j-btn ghost" data-act="del-meal" data-id="${dr.id}">Remove</button>`
             : `<button class="j-btn ghost" data-go="meals">Pick from My meals</button>`
         }
         ${dr.back !== "log" && (editing || dr.back !== "today") ? `<button class="j-link" data-act="cancel-meal">Cancel</button>` : ""}
       </div>`,
    ];
  }

  private saveMeal() {
    const dr = this.draft;
    if (!dr) return;
    const name = dr.name.trim();
    if (!name) return this.toast("Give the meal a name first");
    const kcal = Math.round(num(dr.kcal));
    if (!kcal) return this.toast("How many calories? A guess is fine");
    const servings = num(dr.servings) || 1;
    const nutrients = { kcal, protein: num(dr.protein), carbs: num(dr.carbs), fat: num(dr.fat), fiber: num(dr.fiber) };
    const now = Date.now();
    if (dr.id) {
      const m = this.d.meals.find((x) => x.id === dr.id);
      if (m) Object.assign(m, nutrients, { name, servings, takeout: dr.takeout, updated: now });
    } else {
      // a meal added to an earlier day is timed in that day's evening
      const at = dr.day === journalDay(this.d, now) ? now : dayDate(dr.day).getTime() + 19 * 3600_000;
      const meal: Meal = { id: newId(), updated: now, day: dr.day, at, name, servings, takeout: dr.takeout, ...nutrients };
      if (dr.recipeId) meal.recipeId = dr.recipeId;
      this.d.meals.push(meal);
      if (dr.save) {
        const existing = live(this.d.savedMeals).find((s) => s.name.toLowerCase() === name.toLowerCase());
        if (existing) Object.assign(existing, nutrients, { takeout: dr.takeout, updated: now });
        else this.d.savedMeals.push({ id: newId(), updated: now, name, takeout: dr.takeout, ...nutrients });
      }
    }
    this.persist();
    // a meal logged from a recipe goes on to today's page, so you can see it there
    const back = dr.back === "log" || dr.back === "recipe" ? "today" : dr.back;
    this.draft = null;
    this.go(back);
    this.toast(dr.id ? "Changed" : `Written down: ${name}`);
  }

  // ---------- my meals ----------

  private mealsPages(): [string, string] {
    const saved = live(this.d.savedMeals).sort((a, b) => a.name.localeCompare(b.name));
    const hide = this.d.settings.hideKcal;
    return [
      `<h2>My meals</h2>
       <p class="j-date">One tap adds it to today</p>
       ${
         saved.length
           ? `<ul class="j-list">${saved
               .map(
                 (m) => `<li>
                   <button class="j-item" data-act="add-saved" data-id="${m.id}"><span>${esc(m.name)}${m.takeout ? ` <span class="j-tag">inn</span>` : ""}</span><span class="hand">${hide ? "+" : `${fmt(m.kcal)} kcal`}</span></button>
                   <button class="j-x" data-act="del-saved" data-id="${m.id}" aria-label="Forget ${esc(m.name)}">✕</button>
                 </li>`,
               )
               .join("")}</ul>`
           : `<p class="hand j-faint">Meals you log are saved here, so the next time is one tap.</p>`
       }`,
      `<h2>Recipes</h2>
       <p class="j-date">Real ones, to cook at home</p>
       <ul class="j-list">${knownRecipes()
         .map(
           (r) => `<li><button class="j-item" data-act="open-recipe" data-id="${r.id}" data-from="meals"><span>${esc(r.name)}</span><span class="hand j-faint">${hide ? r.meal.toLowerCase() : `${fmt(r.kcal)} kcal`}</span></button></li>`,
         )
         .join("")}</ul>
       <p class="j-faint j-small">More recipes are found along the trail, in villages and inns.</p>`,
    ];
  }

  // ---------- day stamps ----------

  /** A page's heading and date, with that day's stamp beside them. */
  private pageHead(title: string, date: string, day: string) {
    return `<div class="j-head"><div><h2>${title}</h2><p class="j-date">${date}</p></div>${this.stamp(day)}</div>`;
  }

  /**
   * The ink stamp for a day: a faint pencil outline until you log something,
   * "On the trail" with the day's doodle once you have, and "Rested at camp"
   * with a doodle for your mood once the day is closed.
   */
  private stamp(day: string, small = false) {
    const r = restFor(this.d, day);
    const logged =
      mealsFor(this.d, day).length > 0 || waterFor(this.d, day) > 0 || live(this.d.weighIns).some((w) => w.day === day);
    const state = r ? (r.auto ? "slept" : "rested") : logged ? "logged" : "blank";
    const before = this.stampsDrawn.get(day);
    this.stampsDrawn.set(day, state);
    const fresh = before !== undefined && before !== state && state !== "blank";
    const words = { blank: "Today's stamp", logged: "On the trail", rested: "Rested at camp", slept: "Slept by the fire" }[state];
    const pic = r ? moodDoodle(r.mood) : dayDoodle(day);
    const date = dayDate(day).toLocaleDateString("en-US", { month: "short", day: "numeric" }).toUpperCase();
    let h = 0;
    for (const c of day) h = (h * 33 + c.charCodeAt(0)) % 997;
    const tilt = (h % 15) - 7;
    const id = `st-${day}-${small ? "s" : "b"}`;
    const label = state === "blank" ? "Today's stamp, not inked yet. Log something to ink it." : `Stamp: ${words}, ${date}`;
    return `<div class="j-daystamp ${state}${small ? " small" : ""}${fresh ? " fresh" : ""}" style="--tilt:${tilt}deg" role="img" aria-label="${label}">
      <svg viewBox="0 0 100 100" aria-hidden="true">
        <defs>
          <path id="${id}-t" d="M18 50a32 32 0 0 1 64 0"/>
          <path id="${id}-b" d="M14 50a36 36 0 0 0 72 0"/>
          <filter id="${id}-ink"><feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="${h}"/><feDisplacementMap in="SourceGraphic" scale="2.2"/></filter>
        </defs>
        <g filter="url(#${id}-ink)">
          <circle cx="50" cy="50" r="46" fill="none" stroke="currentColor" stroke-width="3"/>
          <circle cx="50" cy="50" r="27" fill="none" stroke="currentColor" stroke-width="1.2"/>
          <text font-size="${Math.min(11.5, 112 / words.length).toFixed(1)}" letter-spacing="0.8"><textPath href="#${id}-t" startOffset="50%" text-anchor="middle">${words.toUpperCase()}</textPath></text>
          <text font-size="11" letter-spacing="1.5"><textPath href="#${id}-b" startOffset="50%" text-anchor="middle">· ${date} ·</textPath></text>
          <svg x="31" y="31" width="38" height="38" viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${doodle(pic).replace(/^<svg[^>]*>|<\/svg>$/g, "")}</svg>
        </g>
      </svg>
    </div>`;
  }

  // ---------- trail cards ----------

  /** One trail card in the Card Kit frame. Recipes are the only cards so far. */
  private card(r: Recipe | null, opts: { big?: boolean; still?: boolean; picked?: boolean; waiting?: { kind: CardKind; hint: string }; n?: number } = {}) {
    const cls = `tc ${r ? "recipe" : "back"}${opts.big ? " big" : ""}`;
    const label = r ? `${esc(r.name)} recipe card` : `A ${KIND_LABEL[opts.waiting!.kind].toLowerCase()} card still out on the trail`;
    // the album's cards are buttons; a card shown on its own is just a picture
    const open = opts.still
      ? `<div class="${cls}" role="img" aria-label="${label}">`
      : `<button class="${cls}" data-act="pick-card" data-id="${r ? r.id : `waiting-${opts.n}`}" aria-pressed="${!!opts.picked}" aria-label="${label}">`;
    const close = opts.still ? "</div>" : "</button>";
    if (!r) return `${open}<img src="${CARD_IMG}back.png" alt="" draggable="false">${close}`;
    return `${open}
      <span class="tc-window">
        <span class="tc-kind">Recipe</span>
        ${cardArt(r.id)}
        <span class="tc-name">${esc(r.name)}</span>
        ${opts.big ? `<span class="tc-line">${esc(r.line)}</span>` : ""}
      </span>
      <img class="tc-frame" src="${CARD_IMG}frame.png" alt="" draggable="false">${close}`;
  }

  private cardsPages(): [string, string] {
    const known = knownRecipes();
    if (!this.cardPick) this.cardPick = known[0]?.id ?? "";
    const pick = this.cardPick;
    const grid = [
      ...known.map((r) => this.card(r, { picked: r.id === pick })),
      ...WAITING.map((w, n) => this.card(null, { waiting: w, n, picked: pick === `waiting-${n}` })),
    ].join("");
    const r = recipe(pick);
    const w = pick.startsWith("waiting-") ? WAITING[Number(pick.slice(8))] : null;
    const right = r
      ? `<div class="tc-show">${this.card(r, { big: true, still: true })}
           <div class="tc-about">
             <h2>${esc(r.name)}</h2>
             <p class="j-date">${r.meal} · serves ${r.serves}</p>
             <p class="j-small j-faint">${r.minutes}</p>
             <div class="j-spread"><button class="j-btn small" data-act="open-recipe" data-id="${r.id}" data-from="cards">Open the recipe</button></div>
           </div></div>`
      : w
        ? `<div class="tc-show">${this.card(null, { big: true, still: true, waiting: w })}
           <div class="tc-about">
             <h2>Still on the trail</h2>
             <p class="j-date">A ${KIND_LABEL[w.kind].toLowerCase()} card</p>
             <p class="hand">${esc(w.hint)}…</p>
           </div></div>`
        : "";
    return [
      `<h2>Trail cards</h2>
       <p class="j-date">${known.length} found so far. Tap one to look closer</p>
       <div class="tc-grid">${grid}</div>`,
      right,
    ];
  }

  // ---------- gathered ----------

  private gatheredPages(): [string, string] {
    const items = this.opts.gathered?.() ?? [];
    const found = items.filter((i) => i.count > 0);
    if (!items.some((i) => i.id === this.itemPick)) this.itemPick = (found[0] ?? items[0])?.id ?? "";
    const it = items.find((i) => i.id === this.itemPick);
    const total = found.reduce((n, i) => n + i.count, 0);
    return [
      `<h2>Gathered</h2>
       <p class="j-date">${found.length ? `${total} picked on the trail so far` : "Nothing picked yet. Look for a sparkle on the trail"}</p>
       <ul class="j-gathered">${items
         .map(
           (i) => `<li><button class="j-item${i.count ? "" : " j-unfound"}" data-act="pick-item" data-id="${i.id}" aria-pressed="${i.id === this.itemPick}">
             <span class="j-gi">${doodle(i.id === "chamomile" ? "flower" : i.id, "j-gdoodle")}${i.count ? esc(i.name) : "Not found yet"}</span>
             <span class="hand">${i.count ? `× ${i.count}` : ""}</span></button></li>`,
         )
         .join("")}</ul>`,
      it
        ? `<div class="j-gshow">${doodle(it.id === "chamomile" ? "flower" : it.id, "j-gbig")}
             <div class="tc-about">
               <h2>${it.count ? esc(it.name) : "Still out there"}</h2>
               <p class="j-date">${esc(it.where)}</p>
               ${it.count ? `<p class="hand">${it.count} in your satchel</p>` : ""}
             </div></div>
           ${it.count ? `<p class="j-note">${esc(it.about)}</p>` : `<p class="j-note j-faint">Something grows ${esc(it.where.toLowerCase())}. Walk up to the sparkle and tap Pick.</p>`}
           <p class="j-small j-faint">Everything you pick grows back the next morning. Some recipes need these, so keep an eye out.</p>`
        : "",
    ];
  }

  // ---------- a recipe ----------

  private recipePages(): [string, string] {
    const r = recipe(this.recipeId);
    if (!r) return this.cardsPages();
    const hide = this.d.settings.hideKcal;
    const row = (label: string, v: string) => `<div class="j-row"><span>${label}</span><span class="hand">${v}</span></div>`;
    return [
      `<h2>${esc(r.name)}</h2>
       <p class="j-date">${r.meal} · serves ${r.serves} · ${r.minutes}</p>
       <div class="tc-show">${this.card(r, { still: true })}
         <div class="j-tile tc-about">
           <span class="j-small j-faint">Each serving, about</span>
           ${hide ? "" : row("Calories", `${fmt(r.kcal)} kcal`)}
           ${row("Protein", `${r.protein} g`)}${row("Carbs", `${r.carbs} g`)}${row("Fat", `${r.fat} g`)}${row("Fiber", `${r.fiber} g`)}
         </div>
       </div>
       <div class="j-spread">
         <button class="j-btn" data-act="log-recipe">Log a serving</button>
         <button class="j-link" data-go="${this.recipeBack}">Back to ${this.recipeBack === "cards" ? "cards" : "recipes"}</button>
       </div>`,
      `<h2>You'll need</h2>
       <ul class="j-ingredients">${r.ingredients.map((i) => `<li>${esc(i)}</li>`).join("")}</ul>
       <h2>Steps</h2>
       <ol class="j-steps">${r.steps.map((st) => `<li>${esc(st)}</li>`).join("")}</ol>`,
    ];
  }

  // ---------- trends ----------

  private trendsPages(): [string, string] {
    const n = this.trendDays;
    const today = journalDay(this.d);
    const days = Array.from({ length: n }, (_, i) => addDays(today, i - n + 1));
    const rows = days.map((day) => {
      const meals = mealsFor(this.d, day);
      return { day, logged: meals.length > 0, ...totals(meals) };
    });
    const tg = this.tg;
    const logged = rows.filter((r) => r.logged);
    const avg = (k: "kcal" | "protein" | "fiber") => (logged.length ? logged.reduce((a, r) => a + r[k], 0) / logged.length : 0);
    const toggle = `<div class="j-seg">${([7, 30] as const)
      .map((k) => `<button data-act="trend-days" data-n="${k}" aria-pressed="${k === n}">${k} days</button>`)
      .join("")}</div>`;
    const hide = this.d.settings.hideKcal;
    return [
      `<h2>Trends</h2>
       ${toggle}
       ${
         hide
           ? `<p class="hand j-faint">Calories are hidden (you can show them again in Setup).</p>`
           : `<div class="j-row"><span>Calories a day</span><span class="hand">${logged.length ? `about ${fmt(avg("kcal"))}` : "nothing logged yet"}</span></div>
              ${barChart(rows, "kcal", tg.kcal, "kcal")}`
       }
       <p class="j-chart-tip hand" aria-live="polite">Tap a bar to see that day.</p>`,
      `<h2>&nbsp;</h2>
       <div class="j-row"><span>Protein a day</span><span class="hand">${logged.length ? `about ${fmt(avg("protein"))} g` : ""}</span></div>
       ${barChart(rows, "protein", tg.protein, "g")}
       <div class="j-row"><span>Fiber a day</span><span class="hand">${logged.length ? `about ${fmt(avg("fiber"))} g` : ""}</span></div>
       ${barChart(rows, "fiber", tg.fiber, "g")}
       <p class="j-faint j-small">The dashed line is your daily target. Days you didn't log are left blank.</p>`,
    ];
  }

  // ---------- scale ----------

  private scalePages(): [string, string] {
    const u = this.d.settings.units;
    const weeks = weeklyAverages(this.d).slice(-12);
    const list = live(this.d.weighIns).sort((a, b) => b.at - a.at);
    let note = "";
    if (weeks.length >= 2) {
      const [a, b] = weeks.slice(-2);
      note = b.kg < a.kg - 0.05 ? "Lighter than last week" : b.kg > a.kg + 0.05 ? "A little up this week" : "Steady this week";
    }
    return [
      `<h2>Weekly averages</h2>
       <p class="j-date">The trail only ever reads these, never a single day</p>
       ${weeks.length ? lineChart(weeks.map((w) => ({ label: `Week of ${shortDay(w.week)}`, v: toDisplayWeight(w.kg, u) })), u) : `<p class="hand j-faint">Your first weigh-in starts the chart.</p>`}
       ${note ? `<p><span class="j-stamp">${note}</span></p>` : ""}
       <p class="j-chart-tip hand" aria-live="polite"></p>`,
      `<h2>Weigh-ins</h2>
       <div class="j-inline">
         <label class="j-field"><span>Today's weight (${u})</span><input name="weigh" inputmode="decimal" autocomplete="off"></label>
         <button class="j-btn" data-act="weigh">Add</button>
       </div>
       ${
         list.length
           ? `<ul class="j-list">${list
               .slice(0, 30)
               .map(
                 (w) => `<li><span class="j-item static"><span>${shortDay(w.day)}</span><span class="hand">${fmtWeight(w.kg, u)}</span></span>
                   <button class="j-x" data-act="del-weigh" data-id="${w.id}" aria-label="Remove this weigh-in">✕</button></li>`,
               )
               .join("")}</ul>`
           : ""
       }`,
    ];
  }

  // ---------- setup ----------

  private setupPages(first: boolean): [string, string] {
    const s = this.d.settings;
    if (!Object.keys(this.form).length) this.fillForm();
    const f = this.form;
    const u = (f.units as Units) ?? s.units;
    const preview = targets(this.formSettings(), this.formWeightKg());
    const opt = (name: string, value: string, label: string) =>
      `<label class="j-chip"><input type="radio" name="${name}" value="${value}" ${f[name] === value ? "checked" : ""}><span>${label}</span></label>`;
    const input = (name: string, label: string, mode = "decimal") =>
      `<label class="j-field"><span>${label}</span><input name="${name}" inputmode="${mode}" value="${esc(f[name] ?? "")}" autocomplete="off"></label>`;
    const name = this.opts.travelerName();
    const left = `
      <h2>${first ? "Before we set out" : "Setup"}</h2>
      <p class="j-date">${first ? "A few things so the journal can work out your daily targets" : "Your details and targets"}</p>
      <div class="j-opts"><span>Units</span>${opt("units", "lb", "lb, ft, in")}${opt("units", "kg", "kg, cm")}</div>
      ${
        u === "lb"
          ? `<div class="j-three">${input("ft", "Height ft", "numeric")}${input("in", "in")}${input("age", "Age", "numeric")}</div>`
          : `<div class="j-two">${input("cm", "Height cm", "numeric")}${input("age", "Age", "numeric")}</div>`
      }
      ${input("weight", first ? `Weight today (${u}), optional` : `Starting weight (${u}), if no weigh-ins yet`)}
      <div class="j-opts"><span>Body, for the formula</span>${opt("sex", "female", "Female")}${opt("sex", "male", "Male")}</div>
      <div class="j-opts wrap"><span>A normal day</span>${(Object.keys(ACTIVITY) as Activity[]).map((a) => opt("activity", a, ACTIVITY[a].label)).join("")}</div>
      ${first ? "" : this.backupBlock()}`;
    const right = `
      <h2>Daily targets</h2>
      <div class="j-opts"><span>Pace</span>${opt("pace", "gentle", "Gentle")}${opt("pace", "steady", "Steady")}</div>
      <div class="j-tile">
        <div class="j-row"><span>Calories</span><span class="j-nudge">
          <button class="j-btn ghost small" data-act="nudge" data-n="-50" aria-label="50 less">−</button>
          <span class="j-big">${fmt(preview.kcal)}</span>
          <button class="j-btn ghost small" data-act="nudge" data-n="50" aria-label="50 more">+</button></span></div>
        <p class="j-faint j-small">${
          f.kcal ? `Your own number. The journal suggested ${fmt(preview.kcalSuggested)}. <button class="j-link" data-act="nudge-reset">Use that</button>` : "Worked out from your details. Nudge it if your doctor or dietitian gave you a number."
        }</p>
        <div class="j-row"><span>Protein</span><span class="hand">${preview.protein} g</span></div>
        <div class="j-row"><span>Fiber</span><span class="hand">${preview.fiber} g</span></div>
        <div class="j-row"><span>Water</span><span class="hand">${preview.cups} cups</span></div>
      </div>
      <label class="j-check"><input type="checkbox" name="hideKcal" ${f.hideKcal === "1" ? "checked" : ""}><span>Hide calorie numbers <span class="j-faint">(track meals without counting)</span></span></label>
      <div class="j-spread">
        <button class="j-btn" data-act="save-setup">${first ? "Start my journal" : "Save"}</button>
        ${!first && name ? `<button class="j-link" data-act="change-traveler">Change traveler</button><button class="j-link" data-act="replay">Replay intro</button>` : ""}
      </div>
      ${first && this.sync ? `<p class="j-faint j-small">Started a journal on another device? Sign in to bring it here:</p>${this.backupBlock()}` : ""}`;
    return [left, right];
  }

  /** Sign in to back up the journal, or show who you're backed up as. */
  private backupBlock() {
    const sy = this.sync;
    if (!sy) return "";
    const b = this.backup;
    if (sy.email) {
      const when = sy.status === "syncing" ? "Saving now..." : sy.status === "offline" ? "Offline for now. It will catch up when you're back online." : sy.lastSynced ? `Saved ${clock(sy.lastSynced)}` : "";
      return `<div class="j-tile j-backup"><div class="j-row"><span>Backed up as</span><span class="hand">${esc(sy.email)}</span></div>
        <p class="j-faint j-small">${when}</p>
        <div class="j-spread"><button class="j-link" data-act="sync-now">Save now</button><button class="j-link" data-act="sign-out">Sign out</button></div></div>`;
    }
    return `<div class="j-tile j-backup">
      <div class="j-row"><span>Back up your journal</span></div>
      ${
        b.step === "email"
          ? `<p class="j-faint j-small">Sign in with your email to keep your journal safe and use it on other devices. No password: we email you a link.</p>
             <div class="j-inline"><label class="j-field"><span>Email</span><input name="backupEmail" type="email" inputmode="email" autocomplete="email" value="${esc(b.email)}"></label>
             <button class="j-btn small" data-act="send-link" ${b.busy ? "disabled" : ""}>Send link</button></div>`
          : `<p class="j-small">Check your email (${esc(b.email)}) and tap <b>Sign in</b>. It opens the game again, signed in and backed up.</p>
             <button class="j-link" data-act="backup-back">Use a different email</button>`
      }
      ${b.msg ? `<p class="j-small j-msg">${esc(b.msg)}</p>` : ""}
    </div>`;
  }

  private async backupAction(act: string) {
    const sy = this.sync;
    const b = this.backup;
    if (!sy || b.busy) return;
    if (act === "backup-back") {
      Object.assign(b, { step: "email", msg: "" });
      return this.render();
    }
    if (act === "sign-out") {
      await sy.signOut();
      return this.render();
    }
    if (act === "sync-now") {
      await sy.syncNow();
      return this.render();
    }
    b.busy = true;
    b.msg = "Sending...";
    this.render();
    const email = b.email.trim();
    const err = /^\S+@\S+\.\S+$/.test(email) ? await sy.sendLink(email) : "That email doesn't look right";
    if (!err) Object.assign(b, { step: "sent", msg: "" });
    b.busy = false;
    if (err) b.msg = err;
    this.render();
  }

  private fillForm() {
    const s = this.d.settings;
    const totalIn = s.heightCm / 2.54;
    const w = latestWeight(this.d);
    this.form = {
      units: s.units,
      ft: String(Math.floor(totalIn / 12)),
      in: String(Math.round(totalIn % 12)),
      cm: String(Math.round(s.heightCm)),
      age: s.setupDone ? String(s.age) : "",
      weight: w ? toDisplayWeight(w, s.units).toFixed(1) : "",
      sex: s.sex,
      activity: s.activity,
      pace: s.pace,
      kcal: s.kcalOverride ? String(s.kcalOverride) : "",
      hideKcal: s.hideKcal ? "1" : "",
    };
    if (!s.setupDone) this.form.ft = this.form.in = this.form.cm = "";
  }

  private formHeightCm() {
    const f = this.form;
    const cm = f.units === "lb" ? (num(f.ft) * 12 + num(f.in)) * 2.54 : num(f.cm);
    return cm > 90 && cm < 250 ? cm : this.d.settings.setupDone ? this.d.settings.heightCm : 170;
  }

  private formWeightKg() {
    const w = num(this.form.weight);
    return w > 0 ? fromDisplayWeight(w, this.form.units as Units) : latestWeight(this.d);
  }

  private formSettings() {
    const f = this.form;
    const age = num(f.age);
    return {
      ...this.d.settings,
      units: f.units as Units,
      heightCm: this.formHeightCm(),
      age: age >= 13 && age < 110 ? age : this.d.settings.age,
      sex: f.sex as Sex,
      activity: f.activity as Activity,
      pace: f.pace as Pace,
      kcalOverride: f.kcal ? num(f.kcal) : null,
      hideKcal: f.hideKcal === "1",
    };
  }

  private saveSetup() {
    const f = this.form;
    const age = num(f.age);
    if (!(age >= 13 && age < 110)) return this.toast("Please add your age");
    const cm = f.units === "lb" ? (num(f.ft) * 12 + num(f.in)) * 2.54 : num(f.cm);
    if (!(cm > 90 && cm < 250)) return this.toast("Please add your height");
    const first = !this.d.settings.setupDone;
    this.d.settings = { ...this.formSettings(), setupDone: true };
    this.d.settingsUpdated = Date.now();
    // a weight typed here counts as today's weigh-in if there isn't one yet
    const w = num(f.weight);
    const day = journalDay(this.d);
    if (w > 0 && !live(this.d.weighIns).some((x) => x.day === day)) {
      const kg = fromDisplayWeight(w, this.d.settings.units);
      if (Math.abs(kg - (latestWeight(this.d) ?? 0)) > 0.01) this.d.weighIns.push({ id: newId(), updated: Date.now(), day, at: Date.now(), kg });
    }
    // the journal hasn't been around for earlier days, so there's nothing to look back on
    if (first) this.d.summarySeenFor = addDays(day, -1);
    this.persist();
    this.form = {};
    this.go("today");
    this.toast(first ? "Your journal is ready" : "Saved");
  }

  // ---------- rest at camp ----------

  private startRest() {
    const r = restFor(this.d, this.screen === "yesterday" ? this.yesterdayDay() : journalDay(this.d));
    this.restMood = r?.mood ?? null;
    this.restLine = r?.line ?? "";
  }

  private restChoices(day: string) {
    const lines = suggestedLines(this.d, day, this.restMood);
    const custom = this.restLine && !lines.includes(this.restLine);
    return `
      <div class="j-opts wrap"><span>${this.screen === "yesterday" ? "How was the day?" : "How was today?"}</span>${MOODS.map(
        (m) => `<button class="j-chip-btn" data-act="mood" data-mood="${m.id}" aria-pressed="${this.restMood === m.id}">${m.label}</button>`,
      ).join("")}</div>
      <div class="j-lines">${lines
        .map((l) => `<button class="j-line hand" data-act="line" aria-pressed="${this.restLine === l}">${esc(l)}</button>`)
        .join("")}</div>
      <label class="j-field"><span>Or write your own</span><input name="restLine" value="${custom ? esc(this.restLine) : ""}" maxlength="140" autocomplete="off"></label>`;
  }

  private restPages(): [string, string] {
    const day = journalDay(this.d);
    return [
      `${this.pageHead("Rest at camp", longDay(day), day)}
       ${this.dayTiles(day, true)}`,
      `<h2>Tonight's line</h2>
       ${this.restChoices(day)}
       <div class="j-spread">
         <button class="j-btn" data-act="do-rest">Rest for the night</button>
         <button class="j-link" data-go="today">Not yet</button>
       </div>`,
    ];
  }

  private writeRest(day: string, auto: boolean) {
    const now = Date.now();
    const r = restFor(this.d, day);
    if (r) Object.assign(r, { mood: this.restMood, line: this.restLine.trim(), updated: now, auto: r.auto && auto });
    else this.d.rests.push({ id: `rest-${day}`, updated: now, day, at: now, mood: this.restMood, line: this.restLine.trim(), auto });
    this.persist();
  }

  // ---------- yesterday ----------

  private yesterdayDay() {
    return summaryDue(this.d) ?? addDays(journalDay(this.d), -1);
  }

  private yesterdayPages(): [string, string] {
    const day = this.yesterdayDay();
    const r = restFor(this.d, day);
    return [
      `${this.pageHead("Yesterday at camp", longDay(day), day)}
       ${this.mealList(day, "No meals written down.")}
       <div class="j-spread">
         <button class="j-btn ghost small" data-act="add-to-yesterday">Add a meal I forgot</button>
       </div>
       ${this.dayTiles(day, true)}`,
      `<h2>${r?.auto ? "You fell asleep by the fire" : "Your line"}</h2>
       ${r?.auto ? `<p class="j-faint j-small">The journal closed the day for you. Want to add how it went?</p>` : ""}
       ${this.restChoices(day)}
       <div class="j-spread"><button class="j-btn" data-act="yesterday-done">Looks right</button></div>`,
    ];
  }

  // ---------- events ----------

  private onInput(e: Event) {
    const t = e.target as HTMLInputElement;
    if (!t.name) return;
    const value = t.type === "checkbox" ? t.checked : t.value;
    if (this.screen === "log" && this.draft && t.name in this.draft) {
      (this.draft as unknown as Record<string, unknown>)[t.name] = value;
      // picking a saved meal's name fills in its numbers
      if (t.name === "name" && e.type === "change") {
        const typed = String(value).trim().toLowerCase();
        const m = live(this.d.savedMeals).find((s) => s.name.toLowerCase() === typed);
        const r = m ? null : knownRecipes().find((x) => x.name.toLowerCase() === typed);
        const from = m ?? (r && { name: r.name, kcal: r.kcal, protein: r.protein, carbs: r.carbs, fat: r.fat, fiber: r.fiber, recipeId: r.id });
        if (from && !this.draft.id) {
          this.draft = { ...this.newDraft(this.draft.day, this.draft.back, from), save: false };
          this.render();
        }
      }
      return;
    }
    if (t.name === "backupEmail") {
      this.backup.email = t.value;
      return;
    }
    if (t.name === "restLine") {
      this.restLine = t.value;
      if (e.type === "input") this.panel?.querySelectorAll(".j-line").forEach((b) => b.setAttribute("aria-pressed", "false"));
      return;
    }
    if (this.screen === "welcome" || this.screen === "setup") {
      if (t.type === "checkbox") this.form[t.name] = t.checked ? "1" : "";
      else this.form[t.name] = t.value;
      if (t.name === "units" && this.form.weight) {
        // keep the weight the same, just in the new units
        const kg = fromDisplayWeight(num(this.form.weight), t.value === "lb" ? "kg" : "lb");
        this.form.weight = toDisplayWeight(kg, t.value as Units).toFixed(1);
      }
      if (e.type !== "change") return;
      // Radios can change which fields show, so redraw both pages. Typed numbers
      // only change the targets, so redraw just the right page and leave the
      // field you're typing in (and the phone keyboard) alone.
      if (t.type === "radio") this.render();
      else {
        const right = this.panel?.querySelectorAll<HTMLElement>(".j-page")[1];
        if (right) right.innerHTML = this.setupPages(this.screen === "welcome")[1];
      }
    }
  }

  private onClick(e: Event) {
    const b = (e.target as HTMLElement).closest<HTMLElement>("[data-act],[data-go]");
    if (!b) return;
    const go = b.dataset.go as Screen | undefined;
    if (go) {
      if (go === "log" && !this.draft) this.draft = this.newDraft(journalDay(this.d), "today");
      if (go === "setup") this.form = {};
      return this.go(go);
    }
    const id = b.dataset.id ?? "";
    const now = Date.now();
    switch (b.dataset.act) {
      case "close":
        if (this.screen === "welcome") return this.close();
        if (this.screen === "yesterday") this.markYesterdaySeen();
        return this.close();
      case "new-meal":
        this.draft = this.newDraft(journalDay(this.d), "today");
        return this.go("log");
      case "edit-meal": {
        const m = this.d.meals.find((x) => x.id === id);
        if (!m) return;
        this.draft = {
          ...this.newDraft(m.day, this.screen, m),
          id: m.id,
          servings: String(m.servings),
          save: false,
        };
        return this.go("log");
      }
      case "cancel-meal": {
        const back = this.draft?.back ?? "today";
        this.draft = null;
        return this.go(back === "log" ? "today" : back);
      }
      case "save-meal":
        return this.saveMeal();
      case "del-meal": {
        const m = this.d.meals.find((x) => x.id === id);
        if (!m) return;
        Object.assign(m, { deleted: true, updated: now });
        this.persist();
        const back = this.screen === "log" ? (this.draft?.back ?? "today") : this.screen;
        this.draft = null;
        this.go(back === "log" ? "today" : back);
        return this.toast(`Removed ${m.name}`);
      }
      case "add-to-yesterday":
        this.draft = this.newDraft(this.yesterdayDay(), "yesterday");
        return this.go("log");
      case "add-saved": {
        const s = this.d.savedMeals.find((x) => x.id === id);
        if (!s) return;
        const day = journalDay(this.d, now);
        const { kcal, protein, carbs, fat, fiber, takeout, name } = s;
        this.d.meals.push({ id: newId(), updated: now, day, at: now, name, servings: 1, takeout, kcal, protein, carbs, fat, fiber });
        this.persist();
        return this.toast(`Added ${name} to today`);
      }
      case "del-saved": {
        const s = this.d.savedMeals.find((x) => x.id === id);
        if (!s) return;
        Object.assign(s, { deleted: true, updated: now });
        this.persist();
        this.render();
        return this.toast(`Forgot ${s.name}`);
      }
      case "cup": {
        const day = b.dataset.day!;
        const n = Number(b.dataset.n);
        const cur = waterFor(this.d, day);
        const cups = cur === n ? n - 1 : n; // tapping the last full cup empties it
        const w = live(this.d.water).find((x) => x.day === day);
        if (w) Object.assign(w, { cups, updated: now });
        else this.d.water.push({ id: `water-${day}`, updated: now, day, cups });
        this.persist();
        return this.render();
      }
      case "rest":
        this.screen = "rest";
        this.startRest();
        return this.render();
      case "mood":
        this.restMood = this.restMood === b.dataset.mood ? null : (b.dataset.mood as Mood);
        return this.redrawRest();
      case "line":
        this.restLine = b.textContent ?? "";
        return this.redrawRest();
      case "do-rest": {
        const day = journalDay(this.d);
        this.writeRest(day, false);
        this.close();
        this.opts.onRested?.();
        return;
      }
      case "yesterday-done": {
        this.writeRest(this.yesterdayDay(), true);
        this.markYesterdaySeen();
        this.go("today");
        return this.toast("A fresh page for today");
      }
      case "pick-card":
        this.cardPick = id;
        return this.render();
      case "pick-item":
        this.itemPick = id;
        return this.render();
      case "open-recipe":
        this.recipeId = id;
        this.recipeBack = b.dataset.from === "meals" ? "meals" : "cards";
        this.cardPick = id;
        return this.go("recipe");
      case "log-recipe": {
        const r = recipe(this.recipeId);
        if (!r) return;
        const { name, kcal, protein, carbs, fat, fiber } = r;
        this.draft = { ...this.newDraft(journalDay(this.d), "recipe", { name, kcal, protein, carbs, fat, fiber, recipeId: r.id }), save: false };
        return this.go("log");
      }
      case "trend-days":
        this.trendDays = Number(b.dataset.n) as 7 | 30;
        return this.render();
      case "bar": {
        const tip = this.panel?.querySelector(".j-chart-tip");
        if (tip) tip.textContent = b.dataset.tip ?? "";
        this.panel?.querySelectorAll("[data-act=bar]").forEach((x) => x.classList.toggle("on", x === b));
        return;
      }
      case "weigh": {
        const input = this.panel?.querySelector<HTMLInputElement>('[name="weigh"]');
        const v = num(input?.value);
        const u = this.d.settings.units;
        const kg = fromDisplayWeight(v, u);
        if (!(kg > 25 && kg < 350)) return this.toast(`Type your weight in ${u}`);
        this.d.weighIns.push({ id: newId(), updated: now, day: journalDay(this.d, now), at: now, kg });
        this.persist();
        this.render();
        return this.toast("Weigh-in written down");
      }
      case "del-weigh": {
        const w = this.d.weighIns.find((x) => x.id === id);
        if (!w) return;
        Object.assign(w, { deleted: true, updated: now });
        this.persist();
        return this.render();
      }
      case "nudge": {
        const cur = targets(this.formSettings(), this.formWeightKg()).kcal;
        this.form.kcal = String(Math.max(1000, cur + Number(b.dataset.n)));
        return this.render();
      }
      case "nudge-reset":
        this.form.kcal = "";
        return this.render();
      case "send-link":
      case "sign-out":
      case "sync-now":
      case "backup-back":
        return void this.backupAction(b.dataset.act);
      case "save-setup":
        return this.saveSetup();
      case "change-traveler":
        this.close();
        return this.opts.onChangeTraveler();
      case "replay":
        this.close();
        return this.opts.onReplayIntro();
    }
  }

  /** Redraw the rest page but keep whatever is typed in the "write your own" box. */
  private redrawRest() {
    this.render();
  }

  private markYesterdaySeen() {
    this.d.summarySeenFor = this.yesterdayDay();
    this.restMood = null;
    this.restLine = "";
    this.persist(false);
  }
}

// ---------- tiny charts (hand-drawn SVG, one series each) ----------

function barChart(rows: ({ day: string; logged: boolean } & Record<string, number | string | boolean>)[], key: string, target: number, unit: string) {
  const W = 300, H = 92, pad = 4;
  const vals = rows.map((r) => Number(r[key]) || 0);
  const max = Math.max(target * 1.25, ...vals, 1);
  const slot = (W - pad * 2) / rows.length;
  const bw = Math.max(2, Math.min(18, slot - 2));
  const y = (v: number) => H - pad - (v / max) * (H - pad * 2);
  const bars = rows
    .map((r, i) => {
      const x = pad + i * slot + (slot - bw) / 2;
      const v = vals[i];
      const tip = `${shortDay(r.day)}: ${r.logged ? `${fmt(v)} ${unit}` : "not logged"}`;
      const h = r.logged ? Math.max(2, H - pad - y(v)) : 0;
      return `<g data-act="bar" data-tip="${esc(tip)}" role="img" aria-label="${esc(tip)}">
        <rect x="${pad + i * slot}" y="0" width="${slot}" height="${H}" fill="transparent"/>
        ${r.logged ? `<path class="j-mark" d="${roundedTop(x, H - pad - h, bw, h)}"/>` : `<circle class="j-gap" cx="${x + bw / 2}" cy="${H - pad - 1.5}" r="1.5"/>`}
      </g>`;
    })
    .join("");
  return `<svg class="j-chart" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">
    <line class="j-base" x1="0" x2="${W}" y1="${H - pad}" y2="${H - pad}"/>
    ${bars}
    <line class="j-target" x1="0" x2="${W}" y1="${y(target)}" y2="${y(target)}"/>
  </svg>`;
}

/** A bar with a softly rounded top, sitting flat on the baseline. */
function roundedTop(x: number, top: number, w: number, h: number) {
  const r = Math.min(3, w / 2, h);
  return `M${x},${top + h} V${top + r} Q${x},${top} ${x + r},${top} H${x + w - r} Q${x + w},${top} ${x + w},${top + r} V${top + h} Z`;
}

function lineChart(points: { label: string; v: number }[], unit: string) {
  const W = 300, H = 110, padX = 10, padY = 14;
  const vs = points.map((p) => p.v);
  let lo = Math.min(...vs), hi = Math.max(...vs);
  if (hi - lo < 2) {
    const mid = (hi + lo) / 2;
    lo = mid - 1;
    hi = mid + 1;
  }
  const x = (i: number) => (points.length === 1 ? W / 2 : padX + (i / (points.length - 1)) * (W - padX * 2));
  const y = (v: number) => padY + (1 - (v - lo) / (hi - lo)) * (H - padY * 2);
  const path = points.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p.v).toFixed(1)}`).join(" ");
  const dots = points
    .map((p, i) => {
      const tip = `${p.label}: ${p.v.toFixed(1)} ${unit}`;
      return `<g data-act="bar" data-tip="${esc(tip)}" role="img" aria-label="${esc(tip)}">
        <circle cx="${x(i)}" cy="${y(p.v)}" r="14" fill="transparent"/>
        <circle class="j-dot" cx="${x(i)}" cy="${y(p.v)}" r="4"/></g>`;
    })
    .join("");
  return `<div class="j-line-wrap">
    <span class="j-axis top">${hi.toFixed(1)}</span><span class="j-axis bottom">${lo.toFixed(1)}</span>
    <svg class="j-chart tall" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">
      <line class="j-base" x1="0" x2="${W}" y1="${padY}" y2="${padY}"/><line class="j-base" x1="0" x2="${W}" y1="${H - padY}" y2="${H - padY}"/>
      <path class="j-trend" d="${path}"/>${dots}
    </svg></div>`;
}
