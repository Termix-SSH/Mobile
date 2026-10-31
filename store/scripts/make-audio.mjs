#!/usr/bin/env node
/**
 * Makes the music bed (and click and key sounds) in public/audio. Copied from
 * the Videos repo, so previews and plugin videos share one track. They are
 * synthesized here, so they are ours to use with no license or Content ID
 * claims. Swap public/audio/music.mp3 for another track any time.
 *
 *   npm run audio
 */

import { spawnSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const RATE = 48000;
const OUT = join("public", "audio");
mkdirSync(OUT, { recursive: true });

let seed = 7;
function random() {
  seed = (seed * 1664525 + 1013904223) >>> 0;
  return seed / 4294967296;
}

function writeWav(file, left, right = left) {
  const frames = left.length;
  const buffer = Buffer.alloc(44 + frames * 4);
  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(36 + frames * 4, 4);
  buffer.write("WAVEfmt ", 8);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(2, 22);
  buffer.writeUInt32LE(RATE, 24);
  buffer.writeUInt32LE(RATE * 4, 28);
  buffer.writeUInt16LE(4, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write("data", 36);
  buffer.writeUInt32LE(frames * 4, 40);
  for (let i = 0; i < frames; i++) {
    const l = Math.max(-1, Math.min(1, left[i]));
    const r = Math.max(-1, Math.min(1, right[i]));
    buffer.writeInt16LE(Math.round(l * 32767), 44 + i * 4);
    buffer.writeInt16LE(Math.round(r * 32767), 46 + i * 4);
  }
  writeFileSync(file, buffer);
}

function normalize(channels, peak) {
  let max = 0;
  for (const ch of channels)
    for (const v of ch) max = Math.max(max, Math.abs(v));
  const gain = max > 0 ? peak / max : 1;
  for (const ch of channels) for (let i = 0; i < ch.length; i++) ch[i] *= gain;
}

const midi = (note) => 440 * Math.pow(2, (note - 69) / 12);

// Music: calm, warm, 84 bpm, four chords that loop.
function music(seconds) {
  const n = Math.round(seconds * RATE);
  const left = new Float32Array(n);
  const right = new Float32Array(n);
  const sendL = new Float32Array(n);
  const sendR = new Float32Array(n);
  const beat = 60 / 84;
  const bar = beat * 4;
  const chordLength = bar * 2;
  const chords = [
    { bass: 45, notes: [57, 60, 64, 67, 71] }, // Am9
    { bass: 41, notes: [53, 57, 60, 64, 67] }, // Fmaj9
    { bass: 48, notes: [55, 60, 64, 67, 71] }, // Cmaj7
    { bass: 43, notes: [55, 59, 62, 64, 69] }, // G6/9
  ];
  const chordCount = Math.ceil(seconds / chordLength) + 1;

  // Pad: detuned soft tones with slow swells, crossfading between chords.
  for (let c = 0; c < chordCount; c++) {
    const chord = chords[c % chords.length];
    const start = c * chordLength;
    const attack = 1.6;
    const release = 2.2;
    const end = start + chordLength;
    const from = Math.max(0, Math.floor((start - 0.01) * RATE));
    const to = Math.min(n, Math.floor((end + release) * RATE));
    chord.notes.forEach((note, v) => {
      const f = midi(note);
      const pan = 0.5 + (v / (chord.notes.length - 1) - 0.5) * 0.6;
      const phases = [random(), random(), random()].map((p) => p * Math.PI * 2);
      for (let i = from; i < to; i++) {
        const t = i / RATE;
        const local = t - start;
        let env =
          local < attack
            ? Math.sin(((local / attack) * Math.PI) / 2) ** 2
            : t < end
              ? 1
              : Math.max(0, 1 - (t - end) / release) ** 2;
        env *= 0.85 + 0.15 * Math.sin(t * 0.5 + v);
        let s = 0;
        for (let d = 0; d < 3; d++) {
          const detune = 1 + (d - 1) * 0.0025;
          const w = 2 * Math.PI * f * detune * t + phases[d];
          s += Math.sin(w) + 0.22 * Math.sin(2 * w) + 0.07 * Math.sin(3 * w);
        }
        s *= env * 0.014;
        left[i] += s * (1 - pan);
        right[i] += s * pan;
        sendL[i] += s * 0.6;
        sendR[i] += s * 0.6;
      }
    });

    // Bass: soft round notes on beats one and three.
    for (let b = 0; b < 4; b++) {
      const t0 = start + b * beat * 2;
      const f = midi(chord.bass);
      const len = beat * 2 + 0.25;
      const i0 = Math.floor(t0 * RATE);
      const i1 = Math.min(n, Math.floor((t0 + len) * RATE));
      for (let i = i0; i < i1; i++) {
        const local = i / RATE - t0;
        const env =
          Math.min(1, local / 0.04) *
          (0.55 + 0.45 * Math.exp(-local * 2)) *
          Math.min(1, (len - local) / 0.25);
        const s =
          (Math.sin(2 * Math.PI * f * local) +
            0.18 * Math.sin(4 * Math.PI * f * local)) *
          env *
          0.05;
        left[i] += s;
        right[i] += s;
      }
    }

    // Plucks: a slow arpeggio an octave up, after the first two chords.
    if (c >= 2) {
      const pattern = [0, 2, 1, 3, 2, 4, 3, 1];
      for (let k = 0; k < 16; k++) {
        if (random() < 0.18) continue;
        const note = chord.notes[pattern[k % 8]] + 12;
        const f = midi(note);
        const t0 = start + k * (beat / 2) + (random() - 0.5) * 0.012;
        const i0 = Math.floor(t0 * RATE);
        const i1 = Math.min(n, i0 + Math.floor(1.4 * RATE));
        const pan = k % 2 ? 0.3 : 0.7;
        const velocity = 0.6 + random() * 0.4;
        for (let i = i0; i < i1; i++) {
          const local = (i - i0) / RATE;
          const env = Math.min(1, local / 0.004) * Math.exp(-local * 3.2);
          const w = 2 * Math.PI * f * local;
          const s =
            (Math.sin(w) + 0.25 * Math.sin(2 * w) * Math.exp(-local * 6)) *
            env *
            0.045 *
            velocity;
          left[i] += s * (1 - pan);
          right[i] += s * pan;
          sendL[i] += s * 0.9;
          sendR[i] += s * 0.9;
        }
      }
    }

    // Soft pulse: a gentle low thump and a quiet shaker, from chord four on.
    if (c >= 4) {
      for (let b = 0; b < 8; b++) {
        const t0 = start + b * beat;
        const i0 = Math.floor(t0 * RATE);
        if (b % 2 === 0) {
          for (let i = i0; i < Math.min(n, i0 + RATE * 0.25); i++) {
            const local = (i - i0) / RATE;
            const f = 48 + 40 * Math.exp(-local * 30);
            const s =
              Math.sin(2 * Math.PI * f * local) * Math.exp(-local * 14) * 0.07;
            left[i] += s;
            right[i] += s;
          }
        }
        for (let h = 0; h < 2; h++) {
          const j0 = i0 + Math.floor((h * beat * RATE) / 2);
          let lp = 0;
          const accent = h === 1 ? 1 : 0.5;
          for (let i = j0; i < Math.min(n, j0 + RATE * 0.06); i++) {
            const local = (i - j0) / RATE;
            const white = random() * 2 - 1;
            lp += (white - lp) * 0.5;
            const s = (white - lp) * Math.exp(-local * 70) * 0.012 * accent;
            left[i] += s * 0.8;
            right[i] += s * 1.2;
          }
        }
      }
    }
  }

  // Echo on the sends, then a small room.
  const delay = Math.floor(beat * 0.75 * RATE);
  for (let i = delay; i < n; i++) {
    sendL[i] += sendR[i - delay] * 0.32;
    sendR[i] += sendL[i - delay] * 0.32;
  }
  const reverb = (input) => {
    const combs = [1557, 1617, 1491, 1422, 1277, 1356].map((d) =>
      Math.floor((d * RATE) / 44100),
    );
    const out = new Float32Array(n);
    for (const d of combs) {
      const buf = new Float32Array(d);
      let idx = 0;
      let damp = 0;
      for (let i = 0; i < n; i++) {
        const y = buf[idx];
        damp = y * 0.6 + damp * 0.4;
        buf[idx] = input[i] + damp * 0.82;
        out[i] += y / combs.length;
        idx = (idx + 1) % d;
      }
    }
    for (const d of [556, 441]) {
      const buf = new Float32Array(d);
      let idx = 0;
      for (let i = 0; i < n; i++) {
        const b = buf[idx];
        const y = -out[i] + b;
        buf[idx] = out[i] + b * 0.5;
        out[i] = y;
        idx = (idx + 1) % d;
      }
    }
    return out;
  };
  const wetL = reverb(sendL);
  const wetR = reverb(sendR);
  for (let i = 0; i < n; i++) {
    const t = i / RATE;
    const fade = Math.min(1, t / 3, (seconds - t) / 4);
    left[i] = Math.tanh((left[i] + wetL[i] * 0.9) * 1.0) * Math.max(0, fade);
    right[i] = Math.tanh((right[i] + wetR[i] * 0.9) * 1.0) * Math.max(0, fade);
  }
  normalize([left, right], 0.8);
  return [left, right];
}

function click() {
  const n = Math.floor(0.06 * RATE);
  const out = new Float32Array(n);
  let lp = 0;
  for (let i = 0; i < n; i++) {
    const t = i / RATE;
    const white = random() * 2 - 1;
    lp += (white - lp) * 0.35;
    out[i] =
      (white - lp) * Math.exp(-t * 900) * 0.7 +
      Math.sin(2 * Math.PI * 2300 * t) * Math.exp(-t * 300) * 0.25 +
      Math.sin(2 * Math.PI * 190 * t) * Math.exp(-t * 90) * 0.35;
  }
  normalize([out], 0.9);
  return out;
}

function key(variant) {
  const n = Math.floor(0.08 * RATE);
  const out = new Float32Array(n);
  const body = 150 + variant * 22 + random() * 20;
  const tone = 1500 + variant * 260;
  let lp = 0;
  for (let i = 0; i < n; i++) {
    const t = i / RATE;
    const white = random() * 2 - 1;
    lp += (white - lp) * 0.25;
    out[i] =
      (white - lp) * Math.exp(-t * 520) * 0.55 +
      Math.sin(2 * Math.PI * tone * t) * Math.exp(-t * 400) * 0.12 +
      Math.sin(2 * Math.PI * body * t) * Math.exp(-t * 70) * 0.4;
  }
  normalize([out], 0.9);
  return out;
}

const tmp = join(OUT, "music.wav");
console.log("music");
const [l, r] = music(240);
writeWav(tmp, l, r);
const mp3 = spawnSync(
  "ffmpeg",
  [
    "-y",
    "-loglevel",
    "error",
    "-i",
    tmp,
    "-b:a",
    "192k",
    join(OUT, "music.mp3"),
  ],
  { stdio: "inherit" },
);
if (mp3.status !== 0) throw new Error("ffmpeg failed");
rmSync(tmp);
writeWav(join(OUT, "click.wav"), click());
for (let v = 0; v < 4; v++) writeWav(join(OUT, `key${v}.wav`), key(v));
console.log(`wrote ${OUT}`);
