# The Long Trail

A cozy, no-combat 3D adventure for iPhone with a built-in meal and weigh-in
tracker. You walk a traveler from Lowmeadow to the Summit, one trail leg a week.

This first build is the opening: **The Lantern Wakes** intro and the mirror
where you pick and name your traveler.

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
| `src/main.ts` | The order of scenes: title, intro, mirror, Della, end card |
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

Everything you see is built from simple shapes for now. Real low-poly models
(KayKit, CC0) come in with Milestone 1.
