// Backing up the journal (and your place in the story) to Supabase.
//
// The game always works from the copy on this device. When you're signed in,
// changes are sent up a couple of seconds after you make them, and anything
// newer from your other devices is brought down. If two devices changed the
// same entry, the most recent change wins.
//
// Sign-in is by email: Supabase sends a link, tapping it opens the game signed in. Only the
// project's publishable key lives here; it's meant to be public; Row Level
// Security in the database keeps each player's rows to themselves.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { JournalData } from "./data";

const SUPABASE_URL = "https://oearcgsdolpgkhtjapuf.supabase.co";
const SUPABASE_KEY = "sb_publishable_mLrQagHXSMQi7JnrObRHFw_YghOVBIF";
const TABLE = "journal_records";
/** The newest change (ms) already pulled from / pushed to the server, per account. */
const MARK_KEY = "longtrail.sync.marks";

type Kind = "meal" | "saved_meal" | "weigh_in" | "rest" | "water" | "settings" | "game";
const LISTS = { meal: "meals", saved_meal: "savedMeals", weigh_in: "weighIns", rest: "rests", water: "water" } as const;

interface Row {
  kind: Kind;
  id: string;
  data: unknown;
  updated: number;
  deleted: boolean;
}

export type SyncStatus = "signed-out" | "syncing" | "synced" | "offline";

/** Your place in the story, synced alongside the journal. */
export interface GameLink {
  get(): { data: object; updated: number };
  /** Newer progress arrived from another device. */
  apply(data: object, updated: number): void;
}

export interface SyncHost {
  data: JournalData;
  /** Save after remote changes were merged in, and redraw if open. */
  refresh(): void;
}

let clientPromise: Promise<SupabaseClient> | null = null;
/** The Supabase library is only downloaded once it's needed. */
function client() {
  clientPromise ??= import("@supabase/supabase-js").then(({ createClient }) =>
    createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: true, autoRefreshToken: true, storageKey: "longtrail.auth" } }),
  );
  return clientPromise;
}

/** True if this device has signed in before (checked without downloading anything). */
const hasSession = () => {
  try {
    return !!localStorage.getItem("longtrail.auth");
  } catch {
    return false;
  }
};

export class Sync {
  status: SyncStatus = "signed-out";
  email: string | null = null;
  lastSynced: number | null = null;
  private timer = 0;
  private running: Promise<void> | null = null;
  private again = false;
  onStatus: () => void = () => {};

  constructor(
    private host: SyncHost,
    private game: GameLink,
  ) {
    // a sign-in link from the email lands back here with the session in the address
    const fromLink = /access_token=|[?&]code=|error_description=/.test(location.hash + location.search);
    if (import.meta.env.MODE === "preview") return;
    if (hasSession() || fromLink) void this.start(fromLink);
    window.addEventListener("online", () => this.schedule(0));
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") this.schedule(0);
    });
  }

  private set(status: SyncStatus) {
    this.status = status;
    this.onStatus();
  }

  private async start(fromLink = false) {
    const sb = await client();
    const { data } = await sb.auth.getSession();
    if (fromLink) {
      // tidy the address bar so the sign-in details don't linger there
      history.replaceState(null, "", location.pathname);
    }
    if (!data.session) return this.set("signed-out");
    this.email = data.session.user.email ?? null;
    this.schedule(0);
  }

  /** Email a sign-in link that brings you back to this page. Returns an error message, or null. */
  async sendLink(email: string): Promise<string | null> {
    try {
      const sb = await client();
      const back = location.origin + location.pathname;
      const { error } = await sb.auth.signInWithOtp({ email, options: { shouldCreateUser: true, emailRedirectTo: back } });
      return error ? friendly(error.message) : null;
    } catch {
      return "Couldn't reach the backup. Are you online?";
    }
  }

  async signOut() {
    const sb = await client();
    await sb.auth.signOut();
    this.email = null;
    this.lastSynced = null;
    this.set("signed-out");
  }

  /** Sync soon (changes made in a burst go up together). */
  schedule(ms = 2000) {
    if (!this.email || import.meta.env.MODE === "preview") return;
    clearTimeout(this.timer);
    this.timer = window.setTimeout(() => void this.syncNow(), ms);
  }

  async syncNow(): Promise<void> {
    if (!this.email) return;
    if (this.running) {
      this.again = true;
      return this.running;
    }
    this.running = this.run().finally(() => {
      this.running = null;
      if (this.again) {
        this.again = false;
        this.schedule(0);
      }
    });
    return this.running;
  }

  private marks(): { pulled: number; pushed: number } {
    try {
      const all = JSON.parse(localStorage.getItem(MARK_KEY) ?? "{}");
      return all[this.email!] ?? { pulled: 0, pushed: 0 };
    } catch {
      return { pulled: 0, pushed: 0 };
    }
  }

  private saveMarks(m: { pulled: number; pushed: number }) {
    try {
      const all = JSON.parse(localStorage.getItem(MARK_KEY) ?? "{}");
      all[this.email!] = m;
      localStorage.setItem(MARK_KEY, JSON.stringify(all));
    } catch {
      // storage full or blocked: the next sync just sends a bit more
    }
  }

  private async run() {
    this.set("syncing");
    try {
      const sb = await client();
      const marks = this.marks();
      const d = this.host.data;

      // 1. bring down anything that changed elsewhere (with a day of slack for clocks that disagree)
      const since = Math.max(0, marks.pulled - 86_400_000);
      let pulledTo = marks.pulled;
      let changed = false;
      for (let from = 0; ; from += 1000) {
        const { data, error } = await sb
          .from(TABLE)
          .select("kind,id,data,updated,deleted")
          .gt("updated", since)
          .order("updated")
          .range(from, from + 999);
        if (error) throw error;
        for (const row of data as Row[]) {
          pulledTo = Math.max(pulledTo, row.updated);
          if (this.merge(row)) changed = true;
        }
        if (data.length < 1000) break;
      }
      if (changed) this.host.refresh();

      // 2. send up everything changed here since the last push
      const rows: Row[] = [];
      for (const [kind, key] of Object.entries(LISTS) as [Kind, (typeof LISTS)[keyof typeof LISTS]][]) {
        for (const r of d[key] as { id: string; updated: number; deleted?: boolean }[]) {
          if (r.updated > marks.pushed) rows.push({ kind, id: r.id, data: r, updated: r.updated, deleted: !!r.deleted });
        }
      }
      if (d.settingsUpdated > marks.pushed) {
        rows.push({ kind: "settings", id: "settings", data: d.settings, updated: d.settingsUpdated, deleted: false });
      }
      const g = this.game.get();
      if (g.updated > marks.pushed) rows.push({ kind: "game", id: "game", data: g.data, updated: g.updated, deleted: false });
      let pushedTo = marks.pushed;
      for (let i = 0; i < rows.length; i += 500) {
        const batch = rows.slice(i, i + 500);
        const { error } = await sb.from(TABLE).upsert(batch, { onConflict: "user_id,kind,id" });
        if (error) throw error;
        for (const r of batch) pushedTo = Math.max(pushedTo, r.updated);
      }

      this.saveMarks({ pulled: Math.max(pulledTo, pushedTo), pushed: pushedTo });
      this.lastSynced = Date.now();
      this.set("synced");
    } catch (err) {
      console.warn("Journal backup didn't sync:", err);
      this.set("offline");
      // try again in a while
      clearTimeout(this.timer);
      this.timer = window.setTimeout(() => void this.syncNow(), 60_000);
    }
  }

  /** Merge one row from the server into this device. True if anything changed here. */
  private merge(row: Row): boolean {
    const d = this.host.data;
    if (row.kind === "settings") {
      if (row.updated <= d.settingsUpdated) return false;
      d.settings = { ...d.settings, ...(row.data as object) };
      d.settingsUpdated = row.updated;
      return true;
    }
    if (row.kind === "game") {
      if (row.updated <= this.game.get().updated) return false;
      this.game.apply(row.data as object, row.updated);
      return false;
    }
    const list = d[LISTS[row.kind as keyof typeof LISTS]] as { id: string; updated: number }[];
    const i = list.findIndex((x) => x.id === row.id);
    if (i >= 0 && list[i].updated >= row.updated) return false;
    const rec = { ...(row.data as object), id: row.id, updated: row.updated, deleted: row.deleted || undefined };
    if (i >= 0) list[i] = rec as never;
    else list.push(rec as never);
    return true;
  }
}

function friendly(msg: string) {
  if (/rate limit|too many/i.test(msg)) return "Too many tries. Wait a few minutes and try again.";
  return msg;
}
