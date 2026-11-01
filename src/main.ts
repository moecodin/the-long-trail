// The Long Trail: entry point.
//
// The flow for this milestone:
//   title screen -> "The Lantern Wakes" intro -> the mirror (pick and name
//   your traveler) -> Della in the doorway -> end card.
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
import { creationScreen, endCard, say, skipButton, storybook, titleScreen } from "./ui/screens";

// The Claude preview link can only serve web files, so that build ("npm run
// build:preview") tucks the music inside the page instead of loading it.
const MUSIC_URL =
  import.meta.env.MODE === "preview"
    ? (await import("../public/audio/lantern-wakes-v1.m4a?inline")).default
    : `${import.meta.env.BASE_URL}audio/lantern-wakes-v1.m4a`;
/** MoeCodin's Lantern Wakes loop: 10 bars of 8 beats at 90 BPM = 53.333 s. */
const MUSIC_LOOP_SECONDS = (10 * 8 * 60) / 90;

const REPLAY_KEY = "longtrail.replay";
const save = loadSave();
const audio = new AudioManager(save.muted);
const director = new Director();

// The story pauses while the journal is open or while the phone is held upright
// (the game is landscape only).
let journalOpen = false;
const portrait = window.matchMedia("(orientation: portrait)");
const updatePause = () => (director.paused = journalOpen || portrait.matches);
portrait.addEventListener("change", updatePause);
updatePause();

const rotateNotice = document.createElement("div");
rotateNotice.className = "rotate-notice";
rotateNotice.innerHTML = `<div class="rotate-phone"></div><p>Turn your phone sideways to play</p><p class="muted">The Long Trail is played in landscape.</p>`;
document.body.appendChild(rotateNotice);

// 1. The satchel comes first, before any 3D, so logging is never behind a loading screen.
mountSatchel({
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
});

// 2. The 3D world.
const canvas = document.getElementById("world") as HTMLCanvasElement;
const world = createWorld(canvas);
const { camera, spots, traveler, della } = world;
const look = spots.titleLook.clone();
window.addEventListener("resize", () => world.resize());
// The kit models download in the background while the title is showing.
// If they fail to load, the simple placeholder shapes stay in place.
const kitsReady = world.dressWithKits().catch((err) => console.warn("Kit models did not load:", err));
audio.preloadMusic(MUSIC_URL);

/** ?speed=4 plays the intro faster, handy for testing. */
const SPEED = Number(new URLSearchParams(location.search).get("speed")) || 1;

let mode: "title" | "scene" = "title";
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
  world.render(dt, clock.real);
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
  traveler.setLook({ skin: "#d2a07a", hair: "#3a2a20", cloak: "#4f5a4a", scarf: "#8a7a5a", hairStyle: "short" });
  world.blanket.visible = true;
  della.root.visible = false;
  della.root.position.set(4 + 1.6, 0, 1.6);
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
  await finish();
}

async function finish() {
  const t = travelerById(save.traveler!.id);
  const choice = await endCard(save.traveler!.name, t);
  if (choice === "replay") return lanternWakes();
  jumpToMirror();
  traveler.setLook(lookFor(t));
  della.root.visible = false;
  world.setItemsGlow(0);
  await meetTheMirror();
}

// ---------- start ----------

async function start() {
  world.setStorm(0);
  world.setLantern(0);
  placeCamera(spots.title, spots.titleLook);
  const replay = sessionStorage.getItem(REPLAY_KEY) === "1";
  sessionStorage.removeItem(REPLAY_KEY);
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
  // Testing shortcut (dev server only): ?from=della jumps to Della at the door.
  if (import.meta.env.DEV && new URLSearchParams(location.search).get("from") === "della" && save.traveler) {
    mode = "scene";
    jumpToMirror();
    traveler.setLook(lookFor(travelerById(save.traveler.id)));
    return dellaInTheDoorway(save.traveler.name);
  }
  if (returning && choice === "begin") {
    mode = "scene";
    jumpToMirror();
    traveler.setLook(lookFor(travelerById(save.traveler!.id)));
    placeCamera(spots.doorCam, spots.doorLook);
    await finish();
  } else {
    await lanternWakes();
  }
}

void start();
