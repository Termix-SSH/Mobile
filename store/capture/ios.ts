import { spawn } from "node:child_process";
import type { Source } from "../devices";
import { LogWatch, run, showcaseUrl, sleep } from "./proc";
import { cropFrom, type CaptureTarget, type TourResult } from "./types";

const BUNDLE_ID = "com.karmaa.termix";

interface DeviceType {
  name: string;
  identifier: string;
}

interface Runtime {
  identifier: string;
  version: string;
  isAvailable: boolean;
  platform?: string;
  name: string;
  supportedDeviceTypes?: { identifier: string }[];
}

const simctl = (...args: string[]) => run("xcrun", ["simctl", ...args], true);

/** Newest installed iOS runtime that can run the device type. */
function newestRuntime(type: DeviceType): Runtime {
  const { runtimes } = JSON.parse(simctl("list", "runtimes", "-j")) as {
    runtimes: Runtime[];
  };
  const ios = runtimes
    .filter((r) => r.isAvailable && /^iOS/.test(r.name))
    .filter(
      (r) =>
        !r.supportedDeviceTypes ||
        r.supportedDeviceTypes.some((d) => d.identifier === type.identifier),
    )
    .sort((a, b) =>
      a.version.localeCompare(b.version, undefined, { numeric: true }),
    );
  const last = ios.at(-1);
  if (!last) throw new Error(`No installed iOS runtime runs the ${type.name}`);
  return last;
}

function deviceType(match: RegExp): DeviceType {
  const { devicetypes } = JSON.parse(simctl("list", "devicetypes", "-j")) as {
    devicetypes: DeviceType[];
  };
  const found = devicetypes
    .filter((d) => match.test(d.name))
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
  const last = found.at(-1);
  if (!last) {
    throw new Error(
      `No simulator device type matches ${match}. Have: ${devicetypes.map((d) => d.name).join(", ")}`,
    );
  }
  return last;
}

/**
 * A foldable like the iPhone Duo has an inner and an outer screen, and simctl
 * won't pick one. Its error lists them, so take the biggest (the inner one).
 */
function screenshot(udid: string, file: string) {
  try {
    simctl("io", udid, "screenshot", "--type=png", file);
  } catch (err) {
    const text = String(err);
    const displays = [...text.matchAll(/--display=(\S+).*?(\d+)x(\d+)/g)];
    if (!displays.length) throw err;
    const [biggest] = displays.sort(
      (a, b) => Number(b[2]) * Number(b[3]) - Number(a[2]) * Number(a[3]),
    );
    simctl(
      "io",
      udid,
      "screenshot",
      "--type=png",
      `--display=${biggest[1]}`,
      file,
    );
  }
}

/** Creates (or reuses) and boots the simulator for a device. */
function boot(device: Source): string {
  // A connected hardware keyboard keeps the on screen one hidden.
  run("defaults", [
    "write",
    "com.apple.iphonesimulator",
    "ConnectHardwareKeyboard",
    "-bool",
    "true",
  ]);
  const type = deviceType(device.match as RegExp);
  const runtime = newestRuntime(type);
  const name = `termix-store-${device.id}`;
  const { devices } = JSON.parse(simctl("list", "devices", "-j")) as {
    devices: Record<string, { name: string; udid: string; state: string }[]>;
  };
  let udid = devices[runtime.identifier]?.find((d) => d.name === name)?.udid;
  if (!udid) {
    udid = simctl("create", name, type.identifier, runtime.identifier).trim();
  }
  console.log(`  ${type.name} on ${runtime.name} (${udid})`);
  try {
    simctl("boot", udid);
  } catch {
    // Already booted.
  }
  simctl("bootstatus", udid, "-b");
  simctl(
    "status_bar",
    udid,
    "override",
    "--time",
    "9:41",
    "--dataNetwork",
    "wifi",
    "--wifiMode",
    "active",
    "--wifiBars",
    "3",
    "--cellularMode",
    "active",
    "--cellularBars",
    "4",
    "--batteryState",
    "charged",
    "--batteryLevel",
    "100",
  );
  return udid;
}

export function iosTarget(device: Source, app: string): CaptureTarget {
  const udid = boot(device);
  simctl("install", udid, app);
  const log = new LogWatch("xcrun", [
    "simctl",
    "spawn",
    udid,
    "log",
    "stream",
    "--style",
    "compact",
    "--level",
    "info",
    "--predicate",
    'eventMessage CONTAINS "SHOWCASE_"',
  ]);

  const launch = (url: string) => {
    run(
      "env",
      [
        `SIMCTL_CHILD_TERMIX_LAB_URL=${url}`,
        "xcrun",
        "simctl",
        "launch",
        "--terminate-running-process",
        udid,
        BUNDLE_ID,
      ],
      true,
    );
  };

  return {
    async still(capture, theme, accent, file) {
      log.clear();
      launch(showcaseUrl(capture.scenario, { theme, accent }));
      const ready = await log.wait(
        new RegExp(`SHOWCASE_READY ${capture.scenario}\\b.*`),
        90_000,
      );
      screenshot(udid, file);
      return cropFrom(ready);
    },

    async tour(theme, accent, file): Promise<TourResult> {
      log.clear();
      try {
        simctl("terminate", udid, BUNDLE_ID);
      } catch {
        // Not running.
      }
      const rec = spawn(
        "xcrun",
        ["simctl", "io", udid, "recordVideo", "--codec=h264", "--force", file],
        { stdio: "ignore" },
      );
      await sleep(1500);
      const recordedAt = Date.now();
      launch(showcaseUrl("tour", { theme, accent, video: true }));
      const start = await log.wait(/SHOWCASE_START (\d+)/, 90_000);
      const startedAt = Date.now();
      const done = await log.wait(/SHOWCASE_DONE (\d+)/, 120_000);
      await sleep(800);
      rec.kill("SIGINT");
      await new Promise((r) => rec.once("exit", r));
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
        simctl("status_bar", udid, "clear");
        simctl("shutdown", udid);
      } catch {
        // Fine if it is already down.
      }
    },
  };
}
