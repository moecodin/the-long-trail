// The tracker's data: everything you log in the satchel journal.
//
// It's saved on this device first (so logging is instant and works offline),
// and every record carries an id and an "updated" time so it can be synced to
// Supabase later without changing anything here.
//
// Weights are always stored in kilograms and heights in centimeters; the
// journal shows them in the units you picked.

export type Units = "lb" | "kg";
export type Sex = "male" | "female";
export type Pace = "gentle" | "steady";
export type Mood = "tired" | "calm" | "good" | "proud" | "rough";

/** How active you are on a normal day, as the multiplier the calorie formula uses. */
export const ACTIVITY = {
  still: { label: "Mostly sitting", factor: 1.2 },
  light: { label: "On my feet a bit", factor: 1.375 },
  active: { label: "Active most days", factor: 1.55 },
  very: { label: "Very active", factor: 1.725 },
} as const;
export type Activity = keyof typeof ACTIVITY;

export interface Settings {
  setupDone: boolean;
  units: Units;
  heightCm: number;
  age: number;
  sex: Sex;
  activity: Activity;
  pace: Pace;
  /** Your own calorie number, if you nudged the one the journal worked out. */
  kcalOverride: number | null;
  hideKcal: boolean;
}

interface Synced {
  id: string;
  /** When this record last changed (ms), for syncing. */
  updated: number;
  deleted?: boolean;
}

export interface Nutrients {
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber: number;
}

export interface Meal extends Synced, Nutrients {
  /** The journal day this meal belongs to (YYYY-MM-DD, see journalDay). */
  day: string;
  at: number;
  name: string;
  servings: number;
  takeout: boolean;
  recipeId?: string;
}

export interface SavedMeal extends Synced, Nutrients {
  name: string;
  takeout: boolean;
}

export interface WeighIn extends Synced {
  day: string;
  at: number;
  kg: number;
}

export interface Rest extends Synced {
  day: string;
  at: number;
  mood: Mood | null;
  line: string;
  /** True when the journal closed the day for you because you forgot. */
  auto: boolean;
}

export interface Water extends Synced {
  day: string;
  cups: number;
}

export interface JournalData {
  version: 1;
  settings: Settings;
  meals: Meal[];
  savedMeals: SavedMeal[];
  weighIns: WeighIn[];
  rests: Rest[];
  water: Water[];
  /** The last day the "yesterday" summary was shown for. */
  summarySeenFor: string | null;
  /** When the settings last changed (ms), for syncing. */
  settingsUpdated: number;
}

const KEY = "longtrail.journal.v1";

export const freshSettings = (): Settings => ({
  setupDone: false,
  units: "lb",
  heightCm: 170,
  age: 35,
  sex: "female",
  activity: "light",
  pace: "gentle",
  kcalOverride: null,
  hideKcal: false,
});

const fresh = (): JournalData => ({
  version: 1,
  settings: freshSettings(),
  meals: [],
  savedMeals: [],
  weighIns: [],
  rests: [],
  water: [],
  summarySeenFor: null,
  settingsUpdated: 0,
});

export function loadJournal(): JournalData {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return fresh();
    const d = JSON.parse(raw) as JournalData;
    return { ...fresh(), ...d, settings: { ...freshSettings(), ...d.settings } };
  } catch {
    return fresh();
  }
}

export function saveJournal(d: JournalData): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(d));
  } catch {
    // Private browsing can block storage; the journal still works for this visit.
  }
}

export const newId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

// ---------- days ----------

/** A day ends at 4 a.m., so a late snack still counts for the evening before. */
export const DAY_START_HOUR = 4;

const pad = (n: number) => String(n).padStart(2, "0");
export const dateKey = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

export function addDays(day: string, n: number): string {
  const [y, m, d] = day.split("-").map(Number);
  return dateKey(new Date(y, m - 1, d + n));
}

/** The calendar day a moment belongs to, before thinking about rests. */
export function clockDay(at: number): string {
  return dateKey(new Date(at - DAY_START_HOUR * 3600_000));
}

/**
 * The journal day a new entry at this moment goes to. Usually the clock day,
 * but once you've rested at camp, the rest of the night counts toward tomorrow.
 */
export function journalDay(d: JournalData, at = Date.now()): string {
  const day = clockDay(at);
  const rest = restFor(d, day);
  return rest && !rest.auto && rest.at <= at ? addDays(day, 1) : day;
}

export const live = <T extends Synced>(list: T[]) => list.filter((x) => !x.deleted);
export const mealsFor = (d: JournalData, day: string) => live(d.meals).filter((m) => m.day === day).sort((a, b) => a.at - b.at);
export const restFor = (d: JournalData, day: string) => live(d.rests).find((r) => r.day === day) ?? null;
export const waterFor = (d: JournalData, day: string) => live(d.water).find((w) => w.day === day)?.cups ?? 0;

export function totals(meals: Meal[]): Nutrients {
  return meals.reduce(
    (t, m) => ({
      kcal: t.kcal + m.kcal * m.servings,
      protein: t.protein + m.protein * m.servings,
      carbs: t.carbs + m.carbs * m.servings,
      fat: t.fat + m.fat * m.servings,
      fiber: t.fiber + m.fiber * m.servings,
    }),
    { kcal: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 },
  );
}

// ---------- targets ----------

export interface Targets {
  kcal: number;
  /** What the formula worked out, before any nudge of yours. */
  kcalSuggested: number;
  protein: number;
  fiber: number;
  cups: number;
}

/** The latest weigh-in, or null. */
export const latestWeight = (d: JournalData) => live(d.weighIns).sort((a, b) => b.at - a.at)[0]?.kg ?? null;

/**
 * Daily targets. Calories use the Mifflin-St Jeor formula for the energy your
 * body uses at rest, times your activity, minus a gentle (250) or steady (500)
 * daily difference. It never suggests below 1,200 (1,500 for men).
 * Protein is 1.2 g per kg you weigh; fiber is 14 g per 1,000 kcal.
 */
export function targets(s: Settings, kg: number | null): Targets {
  const weight = kg ?? 75;
  const bmr = 10 * weight + 6.25 * s.heightCm - 5 * s.age + (s.sex === "male" ? 5 : -161);
  const maintain = bmr * ACTIVITY[s.activity].factor;
  const floor = s.sex === "male" ? 1500 : 1200;
  const kcalSuggested = Math.max(floor, Math.round((maintain - (s.pace === "steady" ? 500 : 250)) / 10) * 10);
  const kcal = s.kcalOverride ?? kcalSuggested;
  return {
    kcal,
    kcalSuggested,
    protein: Math.round((weight * 1.2) / 5) * 5,
    fiber: Math.round((kcal / 1000) * 14),
    cups: 8,
  };
}

// ---------- units ----------

export const KG_PER_LB = 0.45359237;
export const toDisplayWeight = (kg: number, u: Units) => (u === "lb" ? kg / KG_PER_LB : kg);
export const fromDisplayWeight = (v: number, u: Units) => (u === "lb" ? v * KG_PER_LB : v);
export const fmtWeight = (kg: number, u: Units) => `${toDisplayWeight(kg, u).toFixed(1)} ${u}`;

// ---------- weekly averages (all the game ever reads) ----------

/** Monday of the week a day falls in. */
export function weekOf(day: string): string {
  const [y, m, d] = day.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  const back = (date.getDay() + 6) % 7;
  return dateKey(new Date(y, m - 1, d - back));
}

export function weeklyAverages(d: JournalData): { week: string; kg: number }[] {
  const byWeek = new Map<string, number[]>();
  for (const w of live(d.weighIns)) {
    const k = weekOf(w.day);
    if (!byWeek.has(k)) byWeek.set(k, []);
    byWeek.get(k)!.push(w.kg);
  }
  return [...byWeek.entries()]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([week, list]) => ({ week, kg: list.reduce((a, b) => a + b, 0) / list.length }));
}

// ---------- closing days ----------

/**
 * Close any past day you logged meals on but forgot to rest at camp. Returns
 * the days that were closed for you.
 */
export function autoRest(d: JournalData, now = Date.now()): string[] {
  const today = journalDay(d, now);
  const closed: string[] = [];
  const days = new Set(live(d.meals).map((m) => m.day));
  for (const day of days) {
    if (day < today && !restFor(d, day)) {
      d.rests.push({ id: `rest-${day}`, updated: now, day, at: now, mood: null, line: "", auto: true });
      closed.push(day);
    }
  }
  return closed;
}

/** The day to show the "yesterday at camp" summary for, if it hasn't been shown yet. */
export function summaryDue(d: JournalData, now = Date.now()): string | null {
  // by the clock, not by rests: resting tonight doesn't make today "yesterday" yet
  const today = clockDay(now);
  const past = [...new Set(live(d.meals).map((m) => m.day))].filter((day) => day < today).sort();
  const last = past.at(-1);
  if (!last || d.summarySeenFor === last || (d.summarySeenFor && d.summarySeenFor > last)) return null;
  return last;
}

// ---------- suggested journal lines for resting at camp ----------

export const MOODS: { id: Mood; label: string }[] = [
  { id: "rough", label: "Rough" },
  { id: "tired", label: "Tired" },
  { id: "calm", label: "Calm" },
  { id: "good", label: "Good" },
  { id: "proud", label: "Proud" },
];

/** A few lines to pick from, shaped by your day. Never a judgment. */
export function suggestedLines(d: JournalData, day: string, mood: Mood | null): string[] {
  const meals = mealsFor(d, day);
  const t = totals(meals);
  const tg = targets(d.settings, latestWeight(d));
  const cups = waterFor(d, day);
  const lines: string[] = [];
  if (meals.some((m) => m.takeout)) lines.push("Supper at the inn tonight. Warm, loud and nobody had to wash up.");
  if (meals.some((m) => m.recipeId)) lines.push("Cooked something real today. The camp smelled like home.");
  if (t.protein >= tg.protein * 0.9) lines.push("Ate well and strong today. My legs will thank me tomorrow.");
  if (t.fiber >= tg.fiber * 0.9) lines.push("Plenty of greens and grains. The forager would be proud.");
  if (cups >= tg.cups) lines.push("Kept the canteen busy all day.");
  if (meals.length >= 3) lines.push("Wrote down every meal. One small step, then another.");
  const byMood: Record<Mood, string> = {
    rough: "Not my best day on the trail. Tomorrow is a fresh page.",
    tired: "Tired feet, warm fire. That's enough for today.",
    calm: "A quiet day. The fire crackles and the stars come out.",
    good: "A good day. I can almost see the Summit lantern from here.",
    proud: "I kept going today, and I'm proud of that.",
  };
  if (mood) lines.unshift(byMood[mood]);
  lines.push("Another day walked. The trail will be there in the morning.");
  return [...new Set(lines)].slice(0, 4);
}
