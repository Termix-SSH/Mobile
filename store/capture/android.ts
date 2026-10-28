import { spawnSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import type { Source } from "../devices";
import { LogWatch, run, showcaseUrl, sleep } from "./proc";
import { cropFrom, type CaptureTarget, type TourResult } from "./types";

const PACKAGE = "com.karmaa.termix";
const ACTIVITY = `${PACKAGE}/.MainActivity`;
const REMOTE_VIDEO = "/sdcard/termix-tour.mp4";

/**
 * The emulator must be running already (the workflow starts one AVD per
 * device). `serial` picks it when more than one is up.
 */
export function androidTarget(
  device: Source,
  apk: string,
  serial = process.env.ANDROID_SERIAL,
): CaptureTarget {
  const base = serial ? ["-s", serial] : [];
  const adb = (...args: string[]) => run("adb", [...base, ...args], true);
  const shell = (...args: string[]) => adb("shell", ...args);
  const demo = (...args: string[]) =>
    shell("am", "broadcast", "-a", "com.android.systemui.demo", ...args);

  console.log(`  ${device.label} (${serial ?? "default emulator"})`);
  adb("wait-for-device");
  adb("install", "-r", "-g", apk);
  shell("settings", "put", "global", "sysui_demo_allowed", "1");
  demo("-e", "command", "enter");
  demo("-e", "command", "clock", "-e", "hhmm", "0941");
  demo(
    "-e",
    "command",
    "battery",
    "-e",
    "level",
    "100",
    "-e",
    "plugged",
    "false",
  );
  demo("-e", "command", "network", "-e", "wifi", "show", "-e", "level", "4");
  demo("-e", "command", "notifications", "-e", "visible", "false");

  adb("logcat", "-c");
  const log = new LogWatch("adb", [
    ...base,
    "logcat",
    "-v",
    "raw",
    "-s",
    "TermixLab:I",
  ]);

  const launch = (url: string) => {
    shell("am", "force-stop", PACKAGE);
    // adb joins the args into one remote shell line, so quote the URL there.
    shell(
      "am",
      "start",
      "-W",
      "-n",
      ACTIVITY,
      "--es",
      "TERMIX_LAB_URL",
      `'${url}'`,
    );
  };

  return {
    async still(capture, theme, accent, file) {
      log.clear();
      launch(showcaseUrl(capture.scenario, { theme, accent }));
      const ready = await log.wait(
        new RegExp(`SHOWCASE_READY ${capture.scenario}\\b.*`),
        120_000,
      );
      const png = spawnSync("adb", [...base, "exec-out", "screencap", "-p"], {
        maxBuffer: 64 << 20,
      });
      if (png.status !== 0) throw new Error("screencap failed");
      writeFileSync(file, png.stdout);
      return cropFrom(ready);
    },

    async tour(theme, accent, file): Promise<TourResult> {
      log.clear();
      shell("am", "force-stop", PACKAGE);
      const rec = new LogWatch("adb", [
        ...base,
        "shell",
        "screenrecord",
        "--bit-rate",
        "16000000",
        REMOTE_VIDEO,
      ]);
      await sleep(1500);
      const recordedAt = Date.now();
      launch(showcaseUrl("tour", { theme, accent, video: true }));
      const start = await log.wait(/SHOWCASE_START (\d+)/, 120_000);
      const startedAt = Date.now();
      const done = await log.wait(/SHOWCASE_DONE (\d+)/, 150_000);
      await sleep(800);
      try {
        shell("pkill", "-INT", "screenrecord");
      } catch {
        // Already stopped.
      }
      await sleep(2000);
      rec.stop();
      adb("pull", REMOTE_VIDEO, file);
      const startMs = Number(start[1]);
      return {
        startOffset: (startedAt - recordedAt) / 1000,
        duration: (Number(done[1]) - startMs) / 1000,
        marks: log.matches(/SHOWCASE_MARK (\S+) (\d+)/).map((m) => ({
          name: m[1],
          t: (Number(m[2]) - startMs) / 1000,
        })),
      };
    },

    close() {
      log.stop();
      try {
        demo("-e", "command", "exit");
      } catch {
        // Emulator already gone.
      }
    },
  };
}
