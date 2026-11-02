// The Long Trail: entry point.
//
// The flow:
//   title screen -> "The Lantern Wakes" intro -> the mirror (pick and name
//   your traveler) -> Della in the doorway -> camp at dusk (Milestone 1).
// Coming back later, "Tap to begin" goes straight to camp.
// The satchel journal button is mounted first, so it's there on every screen.

import "./style.css";
import * as THREE from "three";
import { AudioManager } from "./audio";
import { loadSave, writeSave } from "./save";
import { travelerById, type Traveler } from "./travelers";
import { createWorld, WIN_X } from "./scene/world";
import { Director, Skip } from "./scene/director";
import type { Person } from "./scene/people";
import { mountSatchel } from "./ui/satchel";
import { Sync } from "./journal/sync";
import { campHint, chapterCard, creationScreen, say, skipButton, storybook, titleScreen } from "./ui/screens";
import { startCamp, type CampSession } from "./camp/play";
import { createCamp } from "./camp/camp";
import { createLeg1 } from "./trail/leg1";
import { ITEMS, pickNote, recordPick, type ItemId } from "./trail/gather";
import { clockDay } from "./journal/data";

// The Claude preview link can only serve web files, so that build ("npm run
// build:preview") tucks the music inside the page instead of loading it.
const MUSIC_URL =
  import.meta.env.MODE === "preview"
    ? (await import("../public/audio/lantern-wakes-v1.m4a?inline")).default
    : `${import.meta.env.BASE_URL}audio/lantern-wakes-v1.m4a`;
/** MoeCodin's Lantern Wakes loop: 10 bars of 8 beats at 90 BPM = 53.333 s. */
const MUSIC_LOOP_SECONDS = (10 * 8 * 60) / 90;

const REPLAY_KEY = "longtrail.replay";
const CHANGE_KEY = "longtrail.change-traveler";
const save = loadSave();
const audio = new AudioManager(save.muted);
const director = new Director();

// The story pauses while the journal is open or while the phone is held upright
// (the game is landscape only).
let journalOpen = false;
/** The camp, once you've arrived there. */
let camp: CampSession | null = null;
const portrait = window.matchMedia("(orientation: portrait)");
const updatePause = () => {
  director.paused = journalOpen || portrait.matches;
  camp?.setPaused(director.paused);
};
portrait.addEventListener("change", updatePause);
updatePause();

const rotateNotice = document.createElement("div");
rotateNotice.className = "rotate-notice";
rotateNotice.innerHTML = `<div class="rotate-phone"></div><p>Turn your phone sideways to play</p><p class="muted">The Long Trail is played in landscape.</p>`;
document.body.appendChild(rotateNotice);

// 1. The satchel comes first, before any 3D, so logging is never behind a loading screen.
const journal = mountSatchel({
  muted: save.muted,
  onOpen: () => {
    journalOpen = true;
    updatePause();
  },
  onClose: () => {
    journalOpen = false;
    updatePause();
  },
  onToggleSound: () => {
    save.muted = !save.muted;
    audio.setMuted(save.muted);
    writeSave(save);
    return save.muted;
  },
  travelerName: () => save.traveler?.name ?? null,
  // Replaying starts fresh from the title, whose tap also wakes up the sound.
  onReplayIntro: () => {
    sessionStorage.setItem(REPLAY_KEY, "1");
    location.reload();
  },
  onChangeTraveler: () => {
    sessionStorage.setItem(CHANGE_KEY, "1");
    location.reload();
  },
  onChange: () => sync.schedule(),
  gathered: () => ITEMS.map((i) => ({ id: i.id, name: i.name, count: save.gather.gathered[i.id] ?? 0, about: i.about, where: i.where })),
  onRested: () => camp?.note("You bank the fire and crawl into your tent. The day is written down. Goodnight."),
});
// The online backup (only does anything once you've signed in from the journal).
// The Claude preview link can't reach Supabase, so it leaves the backup out.
const sync = new Sync(journal, {
  get: () => ({
    data: {
      traveler: save.traveler,
      introSeen: save.introSeen,
      portraitStage: save.portraitStage,
      gather: save.gather,
      legsDone: save.legsDone,
      legsSeen: save.legsSeen,
    },
    updated: save.updated ?? 0,
  }),
  // progress from another device: take it, but keep this device's sound setting
  apply: (data, updated) => {
    Object.assign(save, data, { updated });
    writeSave(save, false);
  },
});
if (import.meta.env.MODE !== "preview") journal.sync = sync;
sync.onStatus = () => journal.refresh();
// Coming back to the game on a new day shows yesterday's page first.
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible" && mode === "camp") journal.greetNewDay();
});

// 2. The 3D world.
const canvas = document.getElementById("world") as HTMLCanvasElement;
const world = createWorld(canvas);
const { camera, spots, traveler, della } = world;
const look = spots.titleLook.clone();
window.addEventListener("resize", () => {
  world.resize();
  camp?.resize();
});
// The kit models download in the background while the title is showing.
// If they fail to load, the simple placeholder shapes stay in place.
const kitsReady = world.dressWithKits().catch((err) => console.warn("Kit models did not load:", err));
audio.preloadMusic(MUSIC_URL);

/** ?speed=4 plays the intro faster, handy for testing. */
const SPEED = Number(new URLSearchParams(location.search).get("speed")) || 1;

let mode: "title" | "scene" | "camp" = "title";
let fireSoundTimer = 0;
let last = performance.now();
const clock = { real: 0 };
function frame(now: number) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  clock.real += dt;
  director.update(dt * SPEED);
  if (mode === "title") {
    // a slow drift over the valley at night
    const t = clock.real * 0.04;
    camera.position.set(spots.title.x + Math.sin(t) * 10, spots.title.y + Math.sin(t * 0.7) * 2, spots.title.z + Math.cos(t) * 4);
    camera.lookAt(look);
  }
  if (mode === "camp" && camp) {
    camp.update(dt, clock.real);
    camp.render();
    // the fire sounds louder the closer you are to it
    fireSoundTimer -= dt;
    if (fireSoundTimer <= 0) {
      fireSoundTimer = 0.25;
      audio.setFire(here === "camp" ? Math.max(0.08, 0.75 - camp.distanceToFire() * 0.07) : 0, 0.3);
    }
  } else {
    world.render(dt, clock.real);
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// ---------- helpers ----------

const blackout = document.createElement("div");
blackout.className = "blackout";
document.body.appendChild(blackout);
const fadeBlack = (on: boolean) => blackout.classList.toggle("on", on);

const flashEl = document.createElement("div");
flashEl.className = "flash";
document.body.appendChild(flashEl);

function lightning(strength = 1) {
  world.flash(strength);
  flashEl.style.opacity = String(0.55 * strength);
  setTimeout(() => (flashEl.style.opacity = "0"), 70);
  setTimeout(() => world.flash(strength * 0.6), 160);
}

const lookFor = (t: Traveler) => ({
  skin: t.skin,
  hair: t.hair,
  cloak: t.cloak,
  scarf: t.scarf,
  hairStyle: t.id === "ren" ? ("short" as const) : t.id === "mara" ? ("long" as const) : ("curly" as const),
  cast: t.id,
});

function face(p: Person, target: THREE.Vector3) {
  p.root.rotation.y = Math.atan2(target.x - p.root.position.x, target.z - p.root.position.z);
}

/** Walk a person to a spot at an easy pace. */
async function walkTo(p: Person, target: THREE.Vector3, speed = 1.1) {
  const from = p.root.position.clone();
  const dist = from.distanceTo(target);
  face(p, target);
  await director.tween(
    dist / speed,
    (t) => {
      p.root.position.lerpVectors(from, target, t);
      p.setWalk(t * dist * 5, Math.min(1, Math.min(t, 1 - t) * 8));
    },
    (t) => t,
  );
  p.setWalk(0, 0);
}

function placeCamera(pos: THREE.Vector3, target: THREE.Vector3) {
  camera.position.copy(pos);
  look.copy(target);
  camera.lookAt(look);
}

/** Put everything back where the intro starts: asleep by the fire, storm outside. */
function resetIntroScene() {
  traveler.root.position.set(-1.9, 0.05, -0.2);
  traveler.root.rotation.y = -Math.PI / 2 + 0.3;
  traveler.setWalk(0, 0);
  traveler.setSit(1);
  traveler.head.rotation.set(0.25, 0, 0.45);
  traveler.setLook({ skin: "#d2a07a", hair: "#3a2a20", cloak: "#4f5a4a", scarf: "#8a7a5a", hairStyle: "short", cast: "unknown" });
  world.blanket.visible = true;
  della.root.visible = false;
  della.root.position.set(spots.dellaIn.x + 2.2, 0, spots.dellaIn.z);
  world.door.rotation.y = 0;
  world.setLantern(0);
  world.setStorm(1);
  world.setItemsGlow(0);
}

/** Where the scene should be if the player skips: standing at the mirror, lantern lit. */
function jumpToMirror() {
  world.blanket.visible = false;
  traveler.setSit(0);
  traveler.head.rotation.set(0, 0, 0);
  traveler.root.position.copy(spots.mirror);
  face(traveler, new THREE.Vector3(spots.mirror.x + 1, 0, spots.mirror.z));
  world.setStorm(0.15);
  world.setLantern(1);
  audio.startRain(0.08, 1);
  placeCamera(spots.mirrorCam, spots.mirrorLook);
}

// ---------- the intro ----------

async function lanternWakes() {
  mode = "scene";
  director.reset();
  resetIntroScene();
  const skip = skipButton(() => director.skip());
  fadeBlack(true);

  try {
    // Storybook opening
    await director.wait(0.8);
    await storybook((s) => director.wait(s));

    // The storm
    placeCamera(spots.fireCam, spots.fireLook);
    audio.startRain(0.45, 2);
    audio.setMusicVolume(0.35, 2);
    await director.wait(0.4);
    fadeBlack(false);
    await director.moveCamera(camera, look, new THREE.Vector3(-3.2, 1.55, 1.9), spots.fireLook, 4);
    lightning(1);
    await director.wait(0.5);
    audio.thunder(1);
    await director.wait(4.5);
    lightning(0.6);
    await director.wait(1.1);
    audio.thunder(0.6);
    await director.wait(3.5);

    // ...and then a strange quiet
    audio.setRain(0.06, 5);
    void director.tween(5, (t) => world.setStorm(1 - t * 0.85));
    await director.moveCamera(camera, look, spots.windowCam, spots.windowLook, 5);

    // The light: the Summit lantern flickers on, far across the valley
    await director.wait(0.8);
    audio.setMusicVolume(0.85, 6);
    void director.moveCamera(camera, look, new THREE.Vector3(WIN_X - 0.3, 1.35, 0.6), spots.windowLook, 7);
    await director.tween(6, (t) => world.setLantern(t), (t) => t);
    await director.wait(1);

    // The traveler wakes and goes to the window
    world.blanket.visible = false;
    await director.tween(1.6, (t) => {
      traveler.head.rotation.set(0.25 * (1 - t), 0, 0.45 * (1 - t));
      traveler.setSit(1 - t);
    });
    await walkTo(traveler, spots.window);
    face(traveler, new THREE.Vector3(spots.window.x, 0, -10));
    await director.wait(3.5);

    // The mirror by the door
    void director.moveCamera(camera, look, spots.mirrorCam, spots.mirrorLook, 4);
    await walkTo(traveler, spots.mirror);
    face(traveler, new THREE.Vector3(spots.mirror.x + 1, 0, spots.mirror.z));
    await director.wait(1);
  } catch (err) {
    if (!(err instanceof Skip)) throw err;
    fadeBlack(false);
    document.querySelectorAll(".storybook").forEach((n) => n.remove());
  }
  director.reset();
  skip.remove();
  jumpToMirror();
  await meetTheMirror();
}

async function meetTheMirror() {
  const result = await creationScreen(save.traveler, save.portraitStage);
  save.traveler = result;
  writeSave(save);
  const t = travelerById(result.id);
  traveler.setLook(lookFor(t));
  // Changing your traveler later goes straight back to camp.
  if (save.introSeen) return goToCamp(false);
  await dellaInTheDoorway(result.name);
}

async function dellaInTheDoorway(name: string) {
  // turn from the mirror toward the door
  face(traveler, new THREE.Vector3(spots.dellaIn.x, 0, spots.dellaIn.z + 0.5));
  await director.moveCamera(camera, look, spots.doorCam, spots.doorLook, 2.5);
  await director.tween(1.2, (t) => (world.door.rotation.y = -1.7 * t));
  della.root.visible = true;
  await walkTo(della, spots.dellaIn, 0.8);
  face(della, traveler.root.position);
  await say("Della", "You saw it too, then.");
  await say("Della", "It's lit for someone. Don't look at me, my knees have done their walking.");

  // she points at the table
  void director.tween(0.6, (t) => (della.rightArm.rotation.x = -1.3 * t));
  await director.moveCamera(camera, look, spots.tableCam, spots.tableLook, 2.5);
  await director.tween(1.2, (t) => world.setItemsGlow(t));
  await say("Della", `My old lantern, my journal and a good walking stick. They're yours now, ${name}.`);
  await say("Della", "Get some sleep. We'll pack at dusk.");
  void director.tween(0.6, (t) => (della.rightArm.rotation.x = -1.3 * (1 - t)));

  save.introSeen = true;
  writeSave(save);
  fadeBlack(true);
  await director.wait(1.4);
  await chapterCard("Dusk", "At the edge of Lowmeadow, where the trail begins, you make camp.");
  await goToCamp(true);
}

// ---------- camp and the trail ----------

type Place = "camp" | "leg1";
/** Where you're walking around right now. */
let here: Place = "camp";
/** Just inside camp's north edge, by the trail sign, facing the fire: where you arrive back from the trail. */
const FROM_TRAIL = { x: 0.6, z: -6.2, facing: 0 };

/** The satchel button gives a little hop when something goes in. */
function bumpSatchel() {
  const b = document.querySelector(".satchel-btn");
  b?.classList.remove("bump");
  void (b as HTMLElement | null)?.offsetWidth;
  b?.classList.add("bump");
}

async function goToCamp(firstTime: boolean) {
  await enter("camp", { firstTime });
}

/**
 * Walk into a place: fade to black, clear away the last place, maybe show a
 * chapter card, build the new one and fade back in.
 */
async function enter(where: Place, opts: { firstTime?: boolean; card?: [string, string]; startAt?: { x: number; z: number; facing: number } } = {}) {
  fadeBlack(true);
  if (camp) {
    await new Promise((r) => setTimeout(r, 700));
    camp.dispose();
    camp = null;
    mode = "scene";
  }
  if (opts.card) await chapterCard(...opts.card);
  let hint: (() => void) | null = null;
  const t = travelerById(save.traveler!.id);
  const today = clockDay(Date.now());
  here = where;
  camp = startCamp({
    renderer: world.renderer,
    canvas,
    look: lookFor(t),
    build: where === "camp" ? createCamp : (r, look) => createLeg1(r, look, save.gather, today),
    startAt: opts.startAt,
    onFirstMove: () => hint?.(),
    tick: () => audio.tick(),
    onRest: () => journal.open("rest"),
    onExit: (id) => void leave(id),
    onGather: (spot) => {
      const id = spot.gather as ItemId;
      // a pick on a new morning still counts for today, whenever you set out
      const n = recordPick(save.gather, spot.id, id, clockDay(Date.now()));
      writeSave(save);
      sync.schedule();
      bumpSatchel();
      audio.tick();
      return pickNote(id, n);
    },
  });
  await camp.ready;
  updatePause();
  mode = "camp";
  audio.setRain(0, 2);
  audio.setMusicVolume(where === "camp" ? 0.4 : 0.5, 3);
  if (where !== "camp") audio.setFire(0, 1);
  // a beat for the first frame to draw before the fade lifts
  await new Promise((r) => setTimeout(r, 300));
  fadeBlack(false);
  if (where === "camp") {
    hint = campHint(!!opts.firstTime);
    setTimeout(() => journal.greetNewDay(), 1200);
  }
}

/** Leaving a place by its exit: setting out from camp, heading back, or making camp at the end of a leg. */
let leaving = false;
async function leave(exit: string) {
  if (leaving) return;
  leaving = true;
  try {
    if (exit === "exit:leg1") {
      const first = !save.legsSeen.includes(1);
      if (first) {
        save.legsSeen.push(1);
        writeSave(save);
      }
      await enter("leg1", { card: first ? ["Leg 1", "The Lantern in the Window"] : undefined });
    } else if (exit === "exit:back") {
      await enter("camp", { startAt: FROM_TRAIL });
    } else if (exit === "exit:camp") {
      const first = !save.legsDone.includes(1);
      if (first) {
        save.legsDone.push(1);
        writeSave(save);
      }
      await enter("camp", {
        startAt: FROM_TRAIL,
        card: first ? ["Leg 1 walked", "Past the last lantern, where the houses stop, you make your first camp on the trail."] : undefined,
      });
    }
  } finally {
    leaving = false;
  }
}

// ---------- start ----------

async function start() {
  world.setStorm(0);
  world.setLantern(0);
  placeCamera(spots.title, spots.titleLook);
  const replay = sessionStorage.getItem(REPLAY_KEY) === "1";
  sessionStorage.removeItem(REPLAY_KEY);
  const changeTraveler = sessionStorage.getItem(CHANGE_KEY) === "1" && save.introSeen && !!save.traveler;
  sessionStorage.removeItem(CHANGE_KEY);
  const returning = save.introSeen && save.traveler && !replay ? save.traveler.name : null;
  const choice = await titleScreen(returning);
  // This tap is what lets iPhone play sound.
  audio.unlock();
  // Where the browser allows it (mostly Android), hold the screen in landscape.
  try {
    await (screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> }).lock?.("landscape");
  } catch {
    // iPhone Safari can't lock orientation; the "turn your phone" notice covers it.
  }
  void audio.playMusic(MUSIC_URL, MUSIC_LOOP_SECONDS, 0.7, 3);
  await kitsReady;
  // Testing shortcuts: ?from=camp goes straight to camp (picking a traveler
  // first if there isn't one yet). Dev server only: ?from=mirror opens the
  // mirror screen, ?from=della jumps to Della at the door, ?from=leg1 goes
  // straight to the first leg of the trail.
  const params = new URLSearchParams(location.search);
  const from = import.meta.env.DEV || params.get("from") === "camp" ? params.get("from") : null;
  if (changeTraveler) {
    mode = "scene";
    jumpToMirror();
    return meetTheMirror();
  }
  if (from === "camp") {
    if (!save.traveler) {
      mode = "scene";
      save.introSeen = true;
      jumpToMirror();
      return meetTheMirror();
    }
    return goToCamp(false);
  }
  if (from === "leg1" && save.traveler) return enter("leg1");
  if (from === "mirror") {
    mode = "scene";
    jumpToMirror();
    return meetTheMirror();
  }
  if (from === "della" && save.traveler) {
    mode = "scene";
    jumpToMirror();
    traveler.setLook(lookFor(travelerById(save.traveler.id)));
    return dellaInTheDoorway(save.traveler.name);
  }
  if (returning && choice === "begin") {
    await goToCamp(false);
  } else {
    await lanternWakes();
  }
}

void start();
