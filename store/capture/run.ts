/**
 * Launches the showcase build on each device and saves raw screenshots and
 * the App Preview recording to out/raw/<device>.
 *
 *   npm run capture -- --platform ios --app path/to/Termix.app
 *   npm run capture -- --platform android --app app.apk --device android-phone
 *
 * Flags: --device a,b  --media screenshots|video|both  --theme dark
 *        --accent f59145  --only hosts,terminal
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { capturesFor, devicesFor, type Platform } from "../devices";
import { androidTarget } from "./android";
import { iosTarget } from "./ios";
import type { CaptureTarget } from "./types";

const { values } = parseArgs({
  options: {
    platform: { type: "string", default: "both" },
    app: { type: "string" },
    device: { type: "string" },
    media: { type: "string", default: "both" },
    theme: { type: "string", default: "dark" },
    accent: { type: "string", default: "f59145" },
    only: { type: "string" },
    out: { type: "string", default: "out/raw" },
    attempts: { type: "string", default: "2" },
  },
});

if (!values.app) {
  console.error("--app is required (the showcase .app or .apk)");
  process.exit(2);
}
const app = resolve(values.app);
const platform = values.platform as Platform | "both";
const devices = devicesFor(platform, values.device?.split(",").filter(Boolean));
const only = values.only?.split(",").filter(Boolean);
const wantStills = values.media !== "video";
const wantVideo = values.media !== "screenshots";
const attempts = Math.max(1, Number(values.attempts) || 1);

async function retry(label: string, fn: () => Promise<void>) {
  for (let i = 1; ; i++) {
    try {
      await fn();
      return;
    } catch (error) {
      console.error(
        `  ${label} failed (try ${i}): ${(error as Error).message}`,
      );
      if (i >= attempts) throw error;
    }
  }
}

/** Shows as an annotation on the workflow run. */
function warn(message: string) {
  console.error(process.env.GITHUB_ACTIONS ? `::warning::${message}` : message);
}

let failed = 0;
let done = 0;
for (const device of devices) {
  console.log(`\n${device.label}`);
  const dir = join(values.out!, device.id);
  mkdirSync(dir, { recursive: true });
  let target: CaptureTarget;
  try {
    target =
      device.platform === "ios"
        ? iosTarget(device, app)
        : androidTarget(device, app);
  } catch (error) {
    warn(`${device.label} skipped: ${(error as Error).message}`);
    failed++;
    continue;
  }
  try {
    if (wantStills) {
      for (const capture of capturesFor(device)) {
        if (only && !only.includes(capture.id)) continue;
        const file = join(dir, `${capture.id}.png`);
        try {
          await retry(capture.id, () =>
            target.still(
              capture,
              capture.theme ?? values.theme!,
              values.accent!,
              file,
            ),
          );
          console.log(`  ${capture.id}.png`);
          done++;
        } catch {
          warn(`${device.label}: ${capture.id} failed`);
          failed++;
        }
      }
    }
    if (wantVideo) {
      try {
        let result;
        await retry("tour", async () => {
          result = await target.tour(
            values.theme!,
            values.accent!,
            join(dir, "tour.mp4"),
          );
        });
        writeFileSync(join(dir, "tour.json"), JSON.stringify(result, null, 2));
        console.log("  tour.mp4");
        done++;
      } catch {
        warn(`${device.label}: preview recording failed`);
        failed++;
      }
    }
  } finally {
    target.close();
  }
}

if (failed) console.error(`\n${failed} capture(s) failed, ${done} done`);
// Partial results still get rendered; nothing at all is a failure.
if (!done) process.exit(1);
