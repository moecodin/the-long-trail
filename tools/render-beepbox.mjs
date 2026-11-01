// Turns a BeepBox song link into a seamless game loop.
//
//   npm run music
//
// Reads the BeepBox link from a text file, renders the song's loop section
// (the part between BeepBox's loop markers) to a WAV, and, if ffmpeg is
// installed, converts it to a small .m4a that iPhone Safari can play.
// When you change the song in BeepBox, paste the new link into the text file
// and run this again.
import { Synth, Song } from "beepbox";
import { execFileSync } from "node:child_process";
import fs from "node:fs";

const [linkFile, outBase] = process.argv.slice(2);
if (!linkFile || !outBase) {
  console.error("usage: node tools/render-beepbox.mjs <link.txt> <output path without extension>");
  process.exit(1);
}

const url = fs.readFileSync(linkFile, "utf8").trim();
const song = new Song(url.slice(url.indexOf("#") + 1));
const RATE = 44100;
const synth = new Synth(song);
synth.samplesPerSecond = RATE;
synth.loopRepeatCount = -1; // keep looping between the loop markers

const perBar = synth.getSamplesPerBar();
const introLen = Math.round(perBar * song.loopStart);
const loopLen = Math.round(perBar * song.loopLength);
const total = introLen + loopLen * 2;
const left = new Float32Array(total);
const right = new Float32Array(total);
synth.synthesize(left, right, total, true);

// Keep the second pass of the loop. It already contains the echo and reverb
// tails from the pass before it, so the end flows straight back into the start.
const start = introLen + loopLen;
const wav = Buffer.alloc(44 + loopLen * 4);
wav.write("RIFF", 0);
wav.writeUInt32LE(36 + loopLen * 4, 4);
wav.write("WAVEfmt ", 8);
wav.writeUInt32LE(16, 16);
wav.writeUInt16LE(1, 20);
wav.writeUInt16LE(2, 22);
wav.writeUInt32LE(RATE, 24);
wav.writeUInt32LE(RATE * 4, 28);
wav.writeUInt16LE(4, 32);
wav.writeUInt16LE(16, 34);
wav.write("data", 36);
wav.writeUInt32LE(loopLen * 4, 40);
const clip = (v) => Math.round(Math.max(-1, Math.min(1, v)) * 32767);
for (let i = 0; i < loopLen; i++) {
  wav.writeInt16LE(clip(left[start + i]), 44 + i * 4);
  wav.writeInt16LE(clip(right[start + i]), 46 + i * 4);
}
fs.writeFileSync(`${outBase}.wav`, wav);
console.log(`Loop is ${(loopLen / RATE).toFixed(3)} s (${song.loopLength} bars at ${song.tempo} BPM).`);

try {
  execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-i", `${outBase}.wav`, "-c:a", "aac", "-b:a", "112k", `${outBase}.m4a`]);
  fs.rmSync(`${outBase}.wav`);
  console.log(`Wrote ${outBase}.m4a`);
} catch {
  console.log(`Wrote ${outBase}.wav. Install ffmpeg to get the smaller .m4a the game loads.`);
}
