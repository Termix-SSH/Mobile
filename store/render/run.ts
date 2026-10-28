/**
 * Frames the raw captures into store screenshots and App Previews.
 *
 *   npm run render
 *   npm run render -- --device iphone --theme dark --write-metadata
 *
 * Reads out/raw/<device>, writes out/final/<platform>/<device>.
 * --write-metadata also copies the Android shots into fastlane/metadata.
 */
import { spawnSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  readSync,
  closeSync,
  rmSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { bundle } from "@remotion/bundler";
import {
  renderMedia,
  renderStill,
  selectComposition,
} from "@remotion/renderer";
import { PREVIEW_CAPTIONS, SLIDES } from "../captions";
import { DEVICES, MAX_SLIDES, type Device, type Size } from "../devices";
import type { TourResult } from "../capture/types";
import type { PreviewProps } from "./Preview";
import type { Shot, SlideProps } from "./Slide";

const STORE = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PUBLIC = join(STORE, "public");

const { values } = parseArgs({
  options: {
    raw: { type: "string", default: "out/raw" },
    out: { type: "string", default: "out/final" },
    device: { type: "string" },
    theme: { type: "string", default: "dark" },
    accent: { type: "string", default: "f59145" },
    "no-music": { type: "boolean", default: false },
    "write-metadata": { type: "boolean", default: false },
  },
});

const raw = resolve(STORE, values.raw!);
const out = resolve(STORE, values.out!);
const accent = `#${values.accent!.replace(/^#/, "")}`;
const only = values.device?.split(",").filter(Boolean);

/** Width and height from a PNG header. */
function pngSize(file: string): Size {
  const fd = openSync(file, "r");
  const head = Buffer.alloc(24);
  readSync(fd, head, 0, 24, 0);
  closeSync(fd);
  return { width: head.readUInt32BE(16), height: head.readUInt32BE(20) };
}

function videoSize(file: string): Size {
  const res = spawnSync(
    "ffprobe",
    [
      "-v",
      "error",
      "-select_streams",
      "v:0",
      "-show_entries",
      "stream=width,height",
      "-of",
      "csv=p=0",
      file,
    ],
    { encoding: "utf8" },
  );
  const [width, height] = res.stdout.trim().split(",").map(Number);
  if (!width || !height) throw new Error(`ffprobe could not read ${file}`);
  return { width, height };
}

const even = (n: number) => Math.round(n / 2) * 2;

function music(): boolean {
  if (values["no-music"]) return false;
  if (existsSync(join(PUBLIC, "audio", "music.mp3"))) return true;
  const res = spawnSync("node", ["scripts/make-audio.mjs"], {
    cwd: STORE,
    stdio: "inherit",
  });
  return res.status === 0;
}

function prepare(device: Device): boolean {
  const from = join(raw, device.id);
  if (!existsSync(from)) return false;
  const to = join(PUBLIC, "raw", device.id);
  rmSync(to, { recursive: true, force: true });
  mkdirSync(to, { recursive: true });
  cpSync(from, to, { recursive: true });
  return true;
}

mkdirSync(join(PUBLIC, "brand"), { recursive: true });
cpSync(
  join(STORE, "..", "assets", "brand", "logo.svg"),
  join(PUBLIC, "brand", "logo.svg"),
);
const devices = DEVICES.filter(
  (d) => (!only?.length || only.includes(d.id)) && prepare(d),
);
if (!devices.length) {
  console.error(`No captures found in ${raw}`);
  process.exit(1);
}

console.log("Bundling...");
const serveUrl = await bundle({
  entryPoint: join(STORE, "render", "index.ts"),
  publicDir: PUBLIC,
});
const withMusic = music();

for (const device of devices) {
  const dir = join(out, device.platform, device.id);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  console.log(`\n${device.label}`);

  const shotFor = (id: string): Shot | null => {
    const file = join(PUBLIC, "raw", device.id, `${id}.png`);
    if (!existsSync(file)) return null;
    return { src: `raw/${device.id}/${id}.png`, ...pngSize(file) };
  };

  const slides = SLIDES.filter((s) => device.wide || !s.wideOnly)
    .map((s) => ({ slide: s, shots: s.shots.map(shotFor) }))
    .filter(({ slide, shots }) => {
      const ok = shots.every(Boolean);
      if (!ok) console.warn(`  skipped ${slide.id}: missing capture`);
      return ok;
    })
    .slice(0, MAX_SLIDES[device.platform]);

  for (const [i, { slide, shots }] of slides.entries()) {
    const first = shots[0]!;
    const size = device.still ?? {
      width: even(first.width),
      height: even(first.height),
    };
    const inputProps: SlideProps = {
      ...size,
      title: slide.title,
      subtitle: slide.subtitle,
      shots: shots as Shot[],
      theme: values.theme!,
      accent,
      logo: i === 0,
    };
    const composition = await selectComposition({
      serveUrl,
      id: "Slide",
      inputProps: inputProps as unknown as Record<string, unknown>,
    });
    const name = `${String(i + 1).padStart(2, "0")}-${slide.id}.png`;
    await renderStill({
      composition,
      serveUrl,
      output: join(dir, name),
      inputProps: inputProps as unknown as Record<string, unknown>,
      imageFormat: "png",
    });
    console.log(`  ${name}`);
  }

  const tourFile = join(PUBLIC, "raw", device.id, "tour.mp4");
  const tourJson = join(PUBLIC, "raw", device.id, "tour.json");
  if (
    device.preview !== undefined &&
    existsSync(tourFile) &&
    existsSync(tourJson)
  ) {
    const tour = JSON.parse(readFileSync(tourJson, "utf8")) as TourResult;
    const video = videoSize(tourFile);
    const size = device.preview ?? {
      width: even(video.width / 2),
      height: even(video.height / 2),
    };
    // App Store previews run 15 to 30 seconds.
    const duration = Math.min(30, Math.max(15, tour.duration + 0.8));
    const inputProps: PreviewProps = {
      ...size,
      video: `raw/${device.id}/tour.mp4`,
      videoWidth: video.width,
      videoHeight: video.height,
      startOffset: Math.max(0, tour.startOffset),
      duration,
      captions: tour.marks
        .filter((m) => PREVIEW_CAPTIONS[m.name])
        .map((m) => ({ t: Math.max(0, m.t), title: PREVIEW_CAPTIONS[m.name] })),
      theme: values.theme!,
      accent,
      music: withMusic,
    };
    const composition = await selectComposition({
      serveUrl,
      id: "Preview",
      inputProps: inputProps as unknown as Record<string, unknown>,
    });
    await renderMedia({
      composition,
      serveUrl,
      codec: "h264",
      audioCodec: "aac",
      audioBitrate: "256k",
      crf: 18,
      pixelFormat: "yuv420p",
      outputLocation: join(dir, "preview.mp4"),
      inputProps: inputProps as unknown as Record<string, unknown>,
    });
    console.log("  preview.mp4");
  }

  if (values["write-metadata"] && device.fdroid) {
    const meta = join(
      STORE,
      "..",
      "fastlane",
      "metadata",
      "android",
      "en-US",
      "images",
      device.fdroid,
    );
    rmSync(meta, { recursive: true, force: true });
    mkdirSync(meta, { recursive: true });
    slides.forEach(({ slide }, i) => {
      const name = `${String(i + 1).padStart(2, "0")}-${slide.id}.png`;
      cpSync(join(dir, name), join(meta, `${i + 1}.png`));
    });
    console.log(`  copied to fastlane/metadata (${device.fdroid})`);
  }
}
