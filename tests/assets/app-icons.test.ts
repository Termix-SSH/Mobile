import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { PNG } from "pngjs";

const spec = require("../../scripts/icon-spec.cjs");
const {
  copyNotificationIcons,
} = require("../../plugins/withNotificationIcon.js");

const root = path.join(__dirname, "../..");
const config = JSON.parse(
  fs.readFileSync(path.join(root, "app.json"), "utf8"),
).expo;
const splash = config.plugins.find(
  (p: unknown) => Array.isArray(p) && p[0] === "expo-splash-screen",
)[1];

function load(rel: string) {
  const file = path.join(root, rel.replace(/^\.\//, ""));
  expect(fs.existsSync(file)).toBe(true);
  return PNG.sync.read(fs.readFileSync(file));
}

function hex(png: PNG, x: number, y: number) {
  const i = (y * png.width + x) * 4;
  return (
    "#" +
    [0, 1, 2].map((c) => png.data[i + c].toString(16).padStart(2, "0")).join("")
  );
}

type Pixel = (
  x: number,
  y: number,
  r: number,
  g: number,
  b: number,
  a: number,
) => void;

function eachPixel(png: PNG, fn: Pixel) {
  for (let y = 0; y < png.height; y++) {
    for (let x = 0; x < png.width; x++) {
      const i = (y * png.width + x) * 4;
      fn(x, y, png.data[i], png.data[i + 1], png.data[i + 2], png.data[i + 3]);
    }
  }
}

function count(
  png: PNG,
  bad: (r: number, g: number, b: number, a: number) => boolean,
) {
  let n = 0;
  eachPixel(png, (_x, _y, r, g, b, a) => {
    if (bad(r, g, b, a)) n++;
  });
  return n;
}

function outsideSafeCircle(png: PNG) {
  const c = png.width / 2;
  const r = (spec.SAFE_CIRCLE * png.width) / 2;
  let outside = 0;
  eachPixel(png, (x, y, _r, _g, _b, a) => {
    if (a !== 0 && Math.hypot(x + 0.5 - c, y + 0.5 - c) > r) outside++;
  });
  return outside;
}

const notWhite = (r: number, g: number, b: number, a: number) =>
  a > 0 && (r !== 255 || g !== 255 || b !== 255);

test("app.json uses the brand tile color everywhere", () => {
  expect(config.backgroundColor).toBe(spec.BRAND.tile);
  expect(config.android.adaptiveIcon.backgroundColor).toBe(spec.BRAND.tile);
  expect(splash.backgroundColor).toBe(spec.BRAND.tile);
  expect(splash.dark.backgroundColor).toBe(spec.BRAND.tile);
});

test("app.json points at the generated images", () => {
  const want = (rel: string) => "./" + rel;
  expect(config.icon).toBe(want(spec.OUT.icon));
  expect(config.ios.icon).toEqual({
    light: want(spec.OUT.icon),
    dark: want(spec.OUT.iosDark),
    tinted: want(spec.OUT.iosTinted),
  });
  expect(config.android.adaptiveIcon.foregroundImage).toBe(
    want(spec.OUT.adaptive),
  );
  expect(config.android.adaptiveIcon.monochromeImage).toBe(
    want(spec.OUT.monochrome),
  );
  expect(splash.image).toBe(want(spec.OUT.splash));
  expect(splash.dark.image).toBe(want(spec.OUT.splash));
  expect(config.plugins).toContain("./plugins/withNotificationIcon.js");
});

test("iOS light icon is full bleed and opaque", () => {
  const png = load(spec.OUT.icon);
  expect([png.width, png.height]).toEqual([1024, 1024]);
  expect(count(png, (_r, _g, _b, a) => a !== 255)).toBe(0);
  expect(hex(png, 0, 0)).toBe(spec.BRAND.tile);
  expect(hex(png, 1023, 1023)).toBe(spec.BRAND.tile);
});

test("iOS dark icon has a transparent background", () => {
  const png = load(spec.OUT.iosDark);
  expect(png.width).toBe(1024);
  expect(png.data[3]).toBe(0);
  expect(png.data[png.data.length - 1]).toBe(0);
});

test("iOS tinted icon is grayscale", () => {
  const png = load(spec.OUT.iosTinted);
  expect(png.width).toBe(1024);
  expect(count(png, (r, g, b) => r !== g || g !== b)).toBe(0);
});

test("adaptive foreground stays inside the safe circle", () => {
  const png = load(spec.OUT.adaptive);
  expect(png.width).toBe(1024);
  expect(outsideSafeCircle(png)).toBe(0);
  // The glyph should still reach close to the edge of the circle.
  const c = png.width / 2;
  let reach = 0;
  eachPixel(png, (x, y, _r, _g, _b, a) => {
    if (a > 0) reach = Math.max(reach, Math.hypot(x + 0.5 - c, y + 0.5 - c));
  });
  expect(reach).toBeGreaterThan(((spec.SAFE_CIRCLE * png.width) / 2) * 0.85);
});

test("themed icon is a single color inside the safe circle", () => {
  const png = load(spec.OUT.monochrome);
  expect(png.width).toBe(1024);
  expect(outsideSafeCircle(png)).toBe(0);
  expect(count(png, notWhite)).toBe(0);
});

test("splash icon fits the Android 12 circle", () => {
  expect(outsideSafeCircle(load(spec.OUT.splash))).toBe(0);
});

test("notification icons exist for every density and are white", () => {
  for (const [density, size] of Object.entries(spec.NOTIFICATION_DENSITIES)) {
    const png = load(
      `${spec.OUT.notificationDir}/notification-icon-${density}.png`,
    );
    expect([density, png.width, png.height]).toEqual([density, size, size]);
    expect(count(png, notWhite)).toBe(0);
  }
});

test("config plugin copies the status bar icon into every density", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "termix-icons-"));
  try {
    copyNotificationIcons(root, tmp);
    for (const density of Object.keys(spec.NOTIFICATION_DENSITIES)) {
      expect(
        fs.existsSync(
          path.join(
            tmp,
            "app/src/main/res",
            `drawable-${density}`,
            "ic_stat_termix.png",
          ),
        ),
      ).toBe(true);
    }
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
