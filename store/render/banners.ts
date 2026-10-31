/**
 * App Store header and search artwork, the Google Play feature graphic and
 * the YouTube Shorts thumbnail from the raw captures.
 *
 *   npm run banners
 *
 * Reads out/raw/android-tablet and out/raw/android-phone, writes art/.
 */
import {
  closeSync,
  cpSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  readSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { bundle } from "@remotion/bundler";
import { renderStill, selectComposition } from "@remotion/renderer";
import { ACCENT, THEME } from "../devices";
import type { BannerProps } from "./Banner";
import type { Shot, SlideProps } from "./Slide";

const STORE = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PUBLIC = join(STORE, "public");
const RAW = join(STORE, "out", "raw");
const OUT = join(STORE, "art");

const TITLE = "Your servers, in your *pocket*";
const SUBTITLE = "SSH, files, Docker and remote desktop. No server needed.";

const SIZES = [
  { id: "header", width: 3840, height: 1646 },
  { id: "search", width: 3840, height: 2560 },
  // Google Play feature graphic.
  { id: "feature", width: 1024, height: 500 },
];

function shot(source: string, id: string): Shot {
  const file = join(RAW, source, `${id}.png`);
  if (!existsSync(file)) {
    console.error(`Missing ${file}. Run the capture first.`);
    process.exit(1);
  }
  const to = join(PUBLIC, "raw", source);
  mkdirSync(to, { recursive: true });
  cpSync(file, join(to, `${id}.png`));
  const fd = openSync(file, "r");
  const head = Buffer.alloc(24);
  readSync(fd, head, 0, 24, 0);
  closeSync(fd);
  const cropFile = join(RAW, source, `${id}.json`);
  const crop = existsSync(cropFile)
    ? (JSON.parse(readFileSync(cropFile, "utf8")) as Shot["crop"])
    : { top: 0, bottom: 0 };
  return {
    src: `raw/${source}/${id}.png`,
    width: head.readUInt32BE(16),
    height: head.readUInt32BE(20),
    crop,
  };
}

mkdirSync(join(PUBLIC, "brand"), { recursive: true });
cpSync(
  join(STORE, "..", "assets", "brand", "logo.svg"),
  join(PUBLIC, "brand", "logo.svg"),
);
const tablet = shot("android-tablet", "split");
const phone = shot("android-phone", "home");

console.log("Bundling...");
const serveUrl = await bundle({
  entryPoint: join(STORE, "render", "index.ts"),
  publicDir: PUBLIC,
});

mkdirSync(OUT, { recursive: true });
for (const size of SIZES) {
  const inputProps: BannerProps = {
    ...size,
    title: TITLE,
    subtitle: SUBTITLE,
    tablet,
    phone,
    theme: THEME,
    accent: ACCENT,
  };
  const composition = await selectComposition({
    serveUrl,
    id: "Banner",
    inputProps: inputProps as unknown as Record<string, unknown>,
  });
  const name = `${size.id}-${size.width}x${size.height}.png`;
  await renderStill({
    composition,
    serveUrl,
    output: join(OUT, name),
    inputProps: inputProps as unknown as Record<string, unknown>,
    imageFormat: "png",
  });
  console.log(`  ${name}`);
}

// Shorts are vertical, so the thumbnail is a store slide at 1080 x 1920.
const thumb: SlideProps = {
  width: 1080,
  height: 1920,
  title: "Your servers, in your *pocket*",
  subtitle: "SSH, files, Docker and remote desktop",
  shots: [shot("android-phone", "home")],
  kind: "phone",
  theme: THEME,
  accent: ACCENT,
  logo: true,
};
const slide = await selectComposition({
  serveUrl,
  id: "Slide",
  inputProps: thumb as unknown as Record<string, unknown>,
});
await renderStill({
  composition: slide,
  serveUrl,
  output: join(OUT, "youtube-short-1080x1920.png"),
  inputProps: thumb as unknown as Record<string, unknown>,
  imageFormat: "png",
});
console.log("  youtube-short-1080x1920.png");
