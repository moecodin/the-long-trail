# The Long Trail

A cozy, no-combat 3D adventure for iPhone with a built-in meal and weigh-in
tracker. You walk a traveler from Lowmeadow to the Summit, one trail leg a week.

What's playable so far: the opening (**The Lantern Wakes** intro and the
mirror where you pick and name your traveler), then **camp** (Milestone 1),
where you walk your traveler around a clearing at dusk, and **Leg 1** of the
trail (Milestone 3, in progress): Della's yard and the lane out of Lowmeadow,
with herbs, apples and eggs to gather.

## The satchel journal (the tracker)

Tap the satchel in the top-right corner, on any screen. The first time, it asks
a few things (units, height, age, activity, pace) and works out daily targets
for calories, protein, fiber and water. You can nudge the calorie number.

- **Today:** what you've eaten, protein and fiber bars, and the canteen (tap a
  cup to fill it).
- **Log:** a meal's name and calories (protein, carbs, fat and fiber are
  optional). Tick "Takeout" for an inn night. Meals are saved to **Meals** so
  the next time is one tap.
- **Trends:** the last 7 or 30 days as small charts. Tap a bar to see the day.
- **Scale:** weigh-ins and weekly averages. The game itself only ever reads the
  weekly averages, never a single day.
- **Rest at camp:** walk to the campfire and press **Rest** (or use the button on
  Today). Pick a mood and a line, or write your own. If you forget, the journal
  closes the day for you, and the next day it shows you yesterday so you can
  fix anything you missed. A day runs until 4 a.m.
- **Setup:** change your details, hide calorie numbers, and **back up** your
  journal by signing in with an email link (Supabase). Everything is saved on
  the phone first, so it works offline and catches up when you're back online.

### The backup (Supabase)

The table and its security rules are in `supabase/schema.sql` (run once in the
Supabase SQL Editor). The game only holds the project's publishable key, which
is meant to be public. Row Level Security keeps each player's rows to
themselves. **Never put a secret key in this repo.** In Supabase under
Authentication → URL Configuration, the Site URL is the GitHub Pages address and
`https://moecodin.github.io/the-long-trail/**` and `http://localhost:5173/**`
are allowed redirect URLs. Supabase's built-in email only sends a few emails an
hour, and only to members of the Supabase team. Set up your own SMTP (for example
Resend) before other people play.

## Walking around camp

- **Drag anywhere** on the screen: a thumb joystick appears under your finger.
  Push a little to stroll, further to jog.
- **Tap a spot** to walk there. Tap a thing (the tent, the fire, the sign) to
  walk over and look at it.
- **The round button** in the bottom right shows up when you're next to
  something: Look, Read, Sit on the bench, or Rest at the fire.
- On a computer: WASD or arrow keys to walk (hold Shift to jog), E or Space
  for the button.
- Add `?from=camp` to the address to skip straight to camp.
- The satchel has **Change traveler** if you want to pick someone else.
- **The fox** follows you around: it walks or scampers to catch up, and waits
  beside you (glancing up now and then) when you stop.

## Leg 1: The Lantern in the Window

At camp, walk to the trail sign and press **Set out**. You arrive at the south
end of Della's yard at dusk: her cottage with the lantern in the window, the
herb bed, the hen house and the apple tree. The garden gate opens onto the lane
north out of Lowmeadow, past the neighbors' cottages and the well, to a ring of
stones where you **Make camp**. The signpost where you arrive takes you **Back
to camp** any time.

**Gathering:** anything with a soft gold ring and sparkles can be picked. Walk
up and press **Pick** (or tap it). The traveler bends down, it floats into the
satchel, and the journal's **Gathered** page counts it. Every spot grows back
the next morning (the journal's day starts at 4 a.m.). Leg 1 has thyme, chives
and sage in the herb bed, eggs by the hen house, windfall apples under the
apple tree, and chamomile and field mushrooms along the lane. The models are in
`src/trail/gather.ts` (`ITEMS`), so swapping one is a one-line change.

Add `?from=leg1` to the address (dev server) to start right in Leg 1.

## Play it

- **On your computer:** see "Run it yourself" below.
- **On your phone:** once this is merged into `main`, GitHub Pages publishes it
  at `https://moecodin.github.io/the-long-trail/` (turn Pages on once under
  Settings → Pages → Source: **GitHub Actions**).
- **Preview link:** `npm run build:preview` makes a version with the music built into the page, for hosts that only serve web files (like the Claude preview link).
- Add `?speed=3` to the address to play the intro three times faster while testing.

## Landscape only

The game is played with the phone sideways. iPhone Safari can't lock the
screen's orientation, so when the phone is upright the game shows a "turn your
phone sideways" notice and pauses the story (the satchel button still works).
When the game is wrapped as an iPhone app (Milestone 6), set the supported
orientations in Xcode to Landscape Left and Landscape Right only.

## Run it yourself

You need [Node.js](https://nodejs.org) 20 or newer.

```bash
npm install      # once, downloads the tools
npm run dev      # starts the game at http://localhost:5173
```

`npm run dev` also prints a "Network" address. Open that on your phone (on the
same Wi-Fi) to play it there. Changes you save show up instantly.

`npm run build` makes the finished version in `dist/`.

## Where things are

| Path | What it is |
| --- | --- |
| `src/main.ts` | The order of scenes: title, intro, mirror, Della, camp |
| `src/camp/camp.ts` | The camp clearing: tent, campfire, bench, supplies, cart, trail sign |
| `src/camp/play.ts` | Walking at camp: movement, the follow camera, looking at things |
| `src/camp/controls.ts` | The thumb joystick, tap-to-walk, keyboard and the action button |
| `src/scene/world.ts` | The 3D cottage, valley, storm and the Summit lantern |
| `src/scene/people.ts` | The simple stand-in figures for your traveler and Della |
| `src/scene/director.ts` | The timing helper that runs scripted scenes (and pauses for the journal) |
| `src/travelers.ts` | The three travelers, their colors and their portraits |
| `src/ui/` | The 2D screens and the satchel journal button |
| `src/audio.ts` | Music looping, the iPhone sound unlock, rain and thunder |
| `src/save.ts` | What the game remembers on your device |
| `public/audio/` | Music files the game loads |
| `music/` | BeepBox song links |

## Music

`public/audio/lantern-wakes-v1.m4a` is MoeCodin's "The Lantern Wakes" (10 bars
at 90 BPM, a 53.333 second loop), converted from the BeepBox WAV export.

To update it, export a new loop WAV from BeepBox and convert it:

```bash
ffmpeg -i lantern-wakes-loop.wav -c:a aac -b:a 112k public/audio/lantern-wakes-v1.m4a
```

Or paste the new BeepBox link into `music/lantern-wakes-v1.txt` and run
`npm run music`, which renders the loop straight from the link.

If the loop length changes, update `MUSIC_LOOP_SECONDS` in `src/main.ts`.

## Art

Models come from the Quaternius MegaKits and KayKit Adventurers (both CC0),
plus a CC BY campfire, see [CREDITS.md](CREDITS.md). Anything with a CC BY
license must be listed there. `tools/prepare-kits.mjs` copies the kit models
the game uses into `public/models/` and shrinks their textures. Hand-picked
extras like the campfire live in `public/models/camp/`.

### Models we can't share (the fox)

Some models (like the fox from Fab) can be used in the game but must not be
shared as files, so they never go in this public repo. `public/models/private/`
is ignored by git. To set up the fox:

1. `node tools/prepare-fox.mjs ~/Downloads/fox.fbx` makes
   `public/models/private/fox.glb`.
2. For the live game, upload that file to the Supabase project's public
   storage bucket `game-art` (the address is `FOX_URL` in `src/camp/fox.ts`).
3. To test with your local copy instead, put
   `VITE_FOX_URL=./models/private/fox.glb` in a `.env.local` file.

If the fox can't be loaded, camp works fine without it.
