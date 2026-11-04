// Meeting your fox, the first time you're at camp (see the story outline's
// "The fox"). A fox kit lost in the storm has followed the light of your fire.
//
//   1. A little while after you arrive, a bush by the trail sign rustles.
//   2. Walk over: two small eyes, a cross little yip. He's hungry.
//   3. Take one of Della's bruised apples from the crate.
//   4. Back at the bush, choose how to say hello. The kit comes out.
//   5. He follows you to the fire, you name him, and he stays.
//
// There's no way to get it wrong. If you never go near the bush, he comes
// out by himself after a while and sits down beside you.

import * as THREE from "three";
import type { CampSession } from "./play";
import type { Spot } from "./area";
import type { Fox } from "./fox";
import { model } from "../scene/kits";
import type { KeepsakeChoice } from "../ui/screens";

export type FoxHello = "apple" | "still" | "soft" | "alone";

export interface MeetingDeps {
  session: CampSession;
  /** The traveler's name, for their lines. */
  name: string;
  say(speaker: string, line: string, opts?: { you?: boolean }): Promise<void>;
  pickOne(kicker: string, title: string, choices: KeepsakeChoice[]): Promise<string>;
  nameFox(suggestions: string[]): Promise<string>;
  card(kicker: string, line: string): Promise<void>;
  /** Freeze the traveler while the words are up, and let them go again after. */
  pause(): void;
  resume(): void;
  /** You've met him: save his name. */
  done(fox: { name: string; hello: FoxHello }): void;
}

/** The bush he hides in: at the edge of the clearing, a few steps from the trail sign. */
const BUSH = { x: 4.3, z: -7.4 };
/** Seconds after arriving before the first rustle (sooner if you look at something). */
const FIRST_RUSTLE = 20;
/** Seconds between nudges if you haven't found him yet. */
const NUDGE = 15;
/** If you never go near, he comes out on his own after this long. */
const COMES_ANYWAY = 100;

const HELLOS: KeepsakeChoice[] = [
  {
    id: "apple",
    name: "Set the apple down",
    line: "And take a step back.",
    art: '<path d="M16 10c-5-3-10 0-10 7s5 11 10 9c5 2 10-2 10-9s-5-10-10-7z"/><path d="M16 10c0-3 1-5 3-6"/>',
  },
  {
    id: "still",
    name: "Sit very still",
    line: "Let him come to you.",
    art: '<circle cx="16" cy="8" r="3.5"/><path d="M16 12v8M9 26c2-4 4-6 7-6s5 2 7 6M10 16l6 2 6-2"/>',
  },
  {
    id: "soft",
    name: "Talk to him softly",
    line: "Hello, little one.",
    art: '<path d="M5 9h17a3 3 0 0 1 3 3v6a3 3 0 0 1-3 3h-9l-5 4v-4H5a3 3 0 0 1-3-3v-6a3 3 0 0 1 3-3z"/>',
  },
];

export function startFoxMeeting(deps: MeetingDeps): { use(spot: Spot): string | null; dispose(): void } {
  const { session, name } = deps;
  const area = session.area;
  const YOU = { you: true };

  // ---------- the bush, and the eyes inside it ----------
  const bush = new THREE.Group();
  bush.position.set(BUSH.x, 0, BUSH.z);
  area.scene.add(bush);
  // a stand-in until the kit bush loads
  const standIn = new THREE.Mesh(new THREE.IcosahedronGeometry(0.75, 0), new THREE.MeshStandardMaterial({ color: "#4f6b38", flatShading: true }));
  standIn.position.y = 0.55;
  standIn.scale.set(1.2, 0.85, 1);
  bush.add(standIn);
  model("nature", "Bush_Common")
    .then((b) => {
      standIn.visible = false;
      b.scale.setScalar(1.05);
      bush.add(b);
    })
    .catch(() => {});
  area.blockers.push({ x: BUSH.x, z: BUSH.z, r: 0.6 });

  // two small glints that look out at you now and then
  const eyeMat = new THREE.MeshBasicMaterial({ color: "#fff2c4", transparent: true, opacity: 0 });
  const eyes = new THREE.Group();
  for (const side of [-1, 1]) {
    const e = new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 6), eyeMat);
    e.position.set(side * 0.07, 0, 0);
    eyes.add(e);
  }
  eyes.position.y = 0.42;
  bush.add(eyes);

  // from the bush, which way the camp is (that's where you stand to look in)
  const toCamp = new THREE.Vector2(-BUSH.x, -BUSH.z).normalize();
  const spot: Spot = {
    id: "fox:bush",
    label: "Look",
    x: BUSH.x,
    z: BUSH.z,
    range: 2.0,
    standX: BUSH.x + toCamp.x * 1.35,
    standZ: BUSH.z + toCamp.y * 1.35,
    tapTargets: [bush],
  };

  // ---------- where we are in the scene ----------
  type Stage = "waiting" | "rustling" | "found" | "apple" | "out" | "done";
  let stage: Stage = "waiting";
  let clock = 0; // seconds since arriving
  let sinceStage = 0;
  let nudged = 0;
  let shake = 0; // how hard the bush is shaking (fades out)
  let glint = 0; // the eyes: seconds left showing
  let nextGlint = 3;
  let busy = false;
  let gone = false;
  let fox: Fox | null = null;
  void session.fox.then((f) => (fox = f));

  const setStage = (s: Stage) => {
    stage = s;
    sinceStage = 0;
    nudged = 0;
  };

  function rustle(strength = 1) {
    shake = Math.max(shake, strength);
  }

  function startRustling() {
    setStage("rustling");
    area.spots.push(spot);
    rustle(1.2);
    glint = 1.4;
    session.note("Something rustles in the bushes by the trail sign.");
    void (async () => {
      busy = true;
      deps.pause();
      await new Promise((r) => setTimeout(r, 1600));
      await deps.say(name, "Hello? ...Just the wind, probably.", YOU);
      deps.resume();
      busy = false;
    })();
  }

  /** Walked up to the bush: a yip, and a hint about the apples. */
  async function found() {
    busy = true;
    setStage("found");
    rustle(1.4);
    glint = 0;
    deps.pause();
    session.note("A tiny, cross yip! Two small eyes back away into the leaves.");
    await new Promise((r) => setTimeout(r, 2800));
    await deps.say(name, "That's not the wind.", YOU);
    await deps.say(name, "Whoever you are, you sound hungry. And Della packed plenty of apples...", YOU);
    deps.resume();
    busy = false;
  }

  /** At the crate with something hungry waiting. */
  async function takeApple() {
    busy = true;
    deps.pause();
    await deps.say(name, "Bruised ones first. Della's rules.", YOU);
    deps.resume();
    session.note("You take a bruised apple from the crate.");
    setStage("apple");
    spot.label = "Kneel";
    busy = false;
  }

  /** Where the kit comes to: between the bush and you, a little closer to you. */
  function meetingSpot() {
    const p = session.travelerAt();
    return { x: p.x + (BUSH.x - p.x) * 0.45, z: p.z + (BUSH.z - p.z) * 0.45 };
  }

  /** He comes out: with the apple you chose how, or on his own if you never came looking. */
  async function comeOut(hello: FoxHello) {
    busy = true;
    setStage("out");
    area.spots.splice(area.spots.indexOf(spot), 1);
    deps.pause();
    if (hello === "alone") {
      // he's been watching you all this time; now he trots out and sits by you
      rustle(1.3);
      await new Promise((r) => setTimeout(r, 900));
    } else {
      if (hello === "apple") session.note("You set the apple down in the grass and step back.");
      if (hello === "still") session.note("You set the apple down, sit back on your heels, and wait. Very still.");
      if (hello === "soft") await deps.say(name, "Hey there. It's all right. Nobody here is going to hurt you.", YOU);
      await new Promise((r) => setTimeout(r, 1400));
      rustle(0.8);
      await new Promise((r) => setTimeout(r, 900));
    }
    if (fox) {
      fox.placeAt(BUSH.x + toCamp.x * 0.5, BUSH.z + toCamp.y * 0.5, Math.atan2(toCamp.x, toCamp.y));
      fox.setVisible(true);
      fox.hold(meetingSpot());
    }
    session.note("A muddy nose. Then a whole fox kit, wet from the storm, one ear folded over.");
    await new Promise((r) => setTimeout(r, 3200));
    if (hello === "alone") {
      await deps.say(name, "Oh! Hello. Have you been there the whole time?", YOU);
      session.note("He looks at you, then at Della's apple crate. Very pointedly.");
      await new Promise((r) => setTimeout(r, 2600));
      await deps.say(name, "Bruised ones first. Della's rules.", YOU);
    }
    fox?.hop();
    session.note("He eats the apple in three bites, then sneezes.");
    await new Promise((r) => setTimeout(r, 2600));
    await deps.say(name, "Oh. Look at you. You got caught in the storm too, didn't you?", YOU);
    // he follows you to the fire
    fox?.hold({ x: 0.75, z: 1.25 });
    session.note("He trots after you to the fire and curls up close to the warm stones.");
    await new Promise((r) => setTimeout(r, 2400));
    await deps.say(name, "You can stay by the fire. Just for tonight.", YOU);
    const foxName = await deps.nameFox(["Ember", "Pip", "Rowan", "Sorrel"]);
    await deps.card("That night", `${foxName} did not stay just for tonight.`);
    fox?.hold(null);
    fox?.hop();
    setStage("done");
    deps.done({ name: foxName, hello });
    deps.resume();
    busy = false;
  }

  // for testing in the browser console (dev server only)
  if (import.meta.env.DEV) (window as unknown as Record<string, unknown>).__meeting = { state: () => ({ stage, clock, sinceStage, busy }), skip: () => (clock = FIRST_RUSTLE) };

  // ---------- every frame: the timers and the bush ----------
  let t = 0;
  session.onFrame((dt, paused) => {
    if (gone) return;
    t += dt;
    // the clocks wait while the journal or a card is open
    if (!paused) {
      clock += dt;
      sinceStage += dt;
    }

    if (!busy && !paused) {
      if (stage === "waiting" && clock > FIRST_RUSTLE) startRustling();
      else if (stage === "rustling") {
        // a nudge now and then, pointing the way
        if (sinceStage > NUDGE * (nudged + 1)) {
          nudged++;
          rustle(1);
          glint = 1.2;
          session.note(nudged === 1 ? "The bush by the trail sign rustles again." : "Something small is watching you from the bush by the trail sign.");
        }
        const p = session.travelerAt();
        if (Math.hypot(p.x - BUSH.x, p.z - BUSH.z) < 2.2) void found();
        else if (sinceStage > COMES_ANYWAY) void comeOut("alone");
      } else if (stage === "found" || stage === "apple") {
        if (sinceStage > NUDGE * (nudged + 1)) {
          nudged++;
          rustle(0.7);
          session.note(stage === "found" ? "Whatever it is, it sounds hungry. Maybe it smells Della's apples." : "The bush gives a hopeful little rustle.");
        }
        if (sinceStage > COMES_ANYWAY) void comeOut("alone");
      }
    }

    // the bush shakes and settles
    shake = Math.max(0, shake - dt * 0.9);
    const w = shake * shake;
    bush.rotation.z = Math.sin(t * 23) * 0.06 * w;
    bush.rotation.x = Math.sin(t * 17 + 1) * 0.04 * w;
    bush.scale.set(1 + Math.sin(t * 29) * 0.03 * w, 1, 1);

    // the eyes look toward you, show for a moment, and blink
    if (stage === "rustling") {
      nextGlint -= dt;
      if (nextGlint <= 0) {
        glint = 1.1;
        nextGlint = 4 + Math.random() * 3;
      }
    }
    if (glint > 0) glint -= dt;
    const blink = Math.sin(t * 5) > 0.93 ? 0 : 1;
    eyeMat.opacity = stage === "rustling" || stage === "waiting" ? THREE.MathUtils.clamp(glint * 3, 0, 1) * blink : 0;
    const p = session.travelerAt();
    const toYou = new THREE.Vector2(p.x - BUSH.x, p.z - BUSH.z).normalize();
    eyes.position.set(toYou.x * 0.62, 0.42, toYou.y * 0.62);
    eyes.rotation.y = Math.atan2(toYou.x, toYou.y);
  });

  return {
    /** Camp things work a little differently while he's hiding. */
    use(s) {
      if (busy || stage === "done") return null;
      if (s.id === "fox:bush") {
        if (stage === "rustling") {
          // after the button's own tidy-up, so the yip's note stays on screen
          queueMicrotask(() => void found());
          return "";
        }
        if (stage === "found") {
          rustle(0.8);
          return "Two small eyes, deep in the leaves. Watching you. Hungry, you think.";
        }
        if (stage === "apple") {
          void (async () => {
            busy = true;
            deps.pause();
            const hello = (await deps.pickOne("Something in the bush", "How do you say hello?", HELLOS)) as FoxHello;
            busy = false;
            await comeOut(hello);
          })();
          return "";
        }
      }
      if (s.id === "supplies" && stage === "found") {
        void takeApple();
        return "";
      }
      // looking at something before the rustle brings it sooner
      if (stage === "waiting" && clock < FIRST_RUSTLE - 4) clock = FIRST_RUSTLE - 4;
      return null;
    },
    dispose() {
      gone = true;
    },
  };
}
