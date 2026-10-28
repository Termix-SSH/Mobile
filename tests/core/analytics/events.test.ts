import {
  bucket,
  connectResultEvent,
  crashClassOf,
  crashEvent,
  heartbeatEvent,
  osMajor,
} from "@/core/analytics/events";
import { isAllowedEvent } from "@/core/analytics/sanitize";
import { HOSTILE, registerTabs } from "./helpers";

let undo: () => void;
beforeAll(() => {
  undo = registerTabs("terminal", "files", "remoteDesktop");
});
afterAll(() => undo());

describe("bucket", () => {
  it("puts counts into ranges", () => {
    expect([0, 1, 2, 5, 6, 20, 21, 100, 101, 5000].map(bucket)).toEqual([
      "0",
      "1",
      "2-5",
      "2-5",
      "6-20",
      "6-20",
      "21-100",
      "21-100",
      "100+",
      "100+",
    ]);
  });

  it("treats junk as zero", () => {
    expect(bucket(NaN)).toBe("0");
    expect(bucket(-4)).toBe("0");
  });
});

describe("osMajor", () => {
  it("keeps only the first number", () => {
    expect(osMajor("17.4.1")).toBe(17);
    expect(osMajor(14)).toBe(14);
    expect(osMajor(null)).toBe(0);
    expect(osMajor("iPhone 12")).toBe(0);
  });
});

describe("heartbeatEvent", () => {
  const base = {
    version: "2.0.0",
    platform: "ios",
    osVersion: "17.4",
    linked: true,
    hosts: 12,
    sessions: 3,
    features: { terminal: 40, files: 2 },
  };

  it("has bucketed counts and no exact numbers", () => {
    const e = heartbeatEvent(base);
    expect(e.properties).toEqual({
      app_version: "2.0.0",
      platform: "ios",
      os_major: 17,
      mode: "linked",
      host_bucket: "6-20",
      session_bucket: "2-5",
      feature_use: { files: "2-5", terminal: "21-100" },
    });
    expect(isAllowedEvent(e)).toBe(true);
  });

  it("says standalone with one account", () => {
    expect(heartbeatEvent({ ...base, linked: false }).properties.mode).toBe(
      "standalone",
    );
  });

  it("replaces a version that is not a version", () => {
    const e = heartbeatEvent({ ...base, version: HOSTILE[0] });
    expect(e.properties.app_version).toBe("unknown");
  });

  it("drops feature keys that are not plain ids", () => {
    const e = heartbeatEvent({
      ...base,
      features: { terminal: 1, "Prod DB 01": 3, "a/b": 1, "x:y": 1 },
    });
    expect(e.properties.feature_use).toEqual({ terminal: "1" });
  });

  it("counts camel case tab types like remoteDesktop", () => {
    const e = heartbeatEvent({ ...base, features: { remoteDesktop: 2 } });
    expect(e.properties.feature_use).toEqual({ remoteDesktop: "2-5" });
    expect(isAllowedEvent(e)).toBe(true);
  });
});

describe("connectResultEvent", () => {
  it("builds known results", () => {
    const e = connectResultEvent("local", "auth", 3);
    expect(e?.properties).toEqual({
      transport: "local",
      result_class: "auth",
      count_bucket: "2-5",
    });
    expect(isAllowedEvent(e!)).toBe(true);
  });

  it("refuses anything else", () => {
    expect(connectResultEvent("prod-db-01", "ok", 1)).toBeNull();
    expect(
      connectResultEvent("local", "Permission denied (root)", 1),
    ).toBeNull();
  });
});

describe("crash events", () => {
  class AppError extends Error {}
  class HostError extends Error {}

  it("uses the class name only", () => {
    expect(crashClassOf(new TypeError("x"))).toBe("TypeError");
    expect(crashClassOf(new AppError("x"))).toBe("AppError");
  });

  it("falls back to Error for unknown classes and non errors", () => {
    expect(crashClassOf(new HostError(HOSTILE[0]))).toBe("Error");
    expect(crashClassOf(HOSTILE[1])).toBe("Error");
    expect(crashClassOf(null)).toBe("Error");
  });

  it("never carries the message or stack", () => {
    const err = new Error(HOSTILE.join(" "));
    const e = crashEvent(err, true);
    expect(e.properties).toEqual({ crash_class: "Error", fatal: true });
    expect(isAllowedEvent(e)).toBe(true);
  });
});

describe("payloads hold no forbidden fields", () => {
  it("has none of the hostile values or forbidden key names", () => {
    const events = [
      heartbeatEvent({
        version: HOSTILE[0],
        platform: HOSTILE[1],
        osVersion: HOSTILE[2],
        linked: false,
        hosts: 3,
        sessions: 1,
        features: Object.fromEntries(HOSTILE.map((h) => [h, 5])),
      }),
      connectResultEvent(HOSTILE[3], HOSTILE[4], 1),
      connectResultEvent("relay", "network", 9),
      crashEvent(new Error(HOSTILE.join(",")), false),
    ].filter(Boolean);
    const json = JSON.stringify(events);
    for (const bad of HOSTILE) expect(json).not.toContain(bad);
    const allowed = new Set([
      "app_version",
      "platform",
      "os_major",
      "mode",
      "host_bucket",
      "session_bucket",
      "feature_use",
      "transport",
      "result_class",
      "count_bucket",
      "crash_class",
      "fatal",
    ]);
    for (const e of events) {
      for (const key of Object.keys(e!.properties)) {
        expect(allowed.has(key)).toBe(true);
      }
    }
  });
});
