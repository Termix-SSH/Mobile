/**
 * App Store header and search artwork and the Google Play feature graphic
 * from the raw captures.
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
  rmSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { bundle } from "@remotion/bundler";
import { renderStill, selectComposition } from "@remotion/renderer";
import { ACCENT, THEME } from "../devices";
import type { BannerProps } from "./Banner";
import type { Shot } from "./Slide";

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

rmSync(OUT, { recursive: true, force: true });
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
