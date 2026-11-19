import fs from "node:fs";
import path from "node:path";
import {
  POWER_SNAPSHOT_VERSION,
  powerAccessOf,
  toPowerDevices,
  widgetCanReach,
} from "@/widgets/power";
import type { AccountClient } from "@/core/api/AccountClient";

jest.mock("@/modules/termix-widgets", () => ({
  isWidgetSupported: true,
  setPowerSnapshotJson: jest.fn(),
  setPowerAccessJson: jest.fn(),
  clearPowerWidget: jest.fn(),
}));

function fakeClient(over: Partial<Record<string, unknown>> = {}) {
  return {
    isAuthenticated: () => true,
    isPluginEnabled: (id: string) => id === "wake-on-lan",
    certPins: () => [],
    clientCert: () => null,
    rootBase: () => "https://termix.example",
    requestHeaders: () => ({
      Authorization: "Bearer abc",
      "CF-Access-Client-Id": "x",
      "User-Agent": "Termix",
    }),
    ...over,
  } as unknown as AccountClient;
}

describe("toPowerDevices", () => {
  it("maps the devices answer", () => {
    const devices = toPowerDevices("acc", "home", {
      devices: [
        {
          hostId: 7,
          name: " Desktop ",
          address: "192.168.1.20",
          status: "online",
          canWake: true,
          canShutdown: true,
          shutdownConfirm: true,
        },
      ],
    });
    expect(devices).toEqual([
      {
        key: "acc:7",
        accountId: "acc",
        hostId: 7,
        name: "Desktop",
        address: "192.168.1.20",
        server: "home",
        status: "online",
        canWake: true,
        canShutdown: true,
        confirmShutdown: true,
      },
    ]);
  });

  it("drops bad rows and falls back on odd values", () => {
    const devices = toPowerDevices("acc", "", {
      devices: [
        { hostId: "x" },
        { hostId: -1 },
        { hostId: 3, status: "melting", address: "10.0.0.3" },
        null,
      ],
    });
    expect(devices).toHaveLength(1);
    expect(devices[0]).toMatchObject({
      hostId: 3,
      name: "10.0.0.3",
      status: "unknown",
      canWake: false,
      canShutdown: false,
      confirmShutdown: false,
    });
  });

  it("returns nothing for an unexpected body", () => {
    expect(toPowerDevices("acc", "", null)).toEqual([]);
    expect(toPowerDevices("acc", "", { devices: "no" })).toEqual([]);
  });
});

describe("widgetCanReach", () => {
  it("needs a session and the plugin", () => {
    expect(widgetCanReach(fakeClient())).toBe(true);
    expect(widgetCanReach(fakeClient({ isAuthenticated: () => false }))).toBe(
      false,
    );
    expect(widgetCanReach(fakeClient({ isPluginEnabled: () => false }))).toBe(
      false,
    );
  });

  it("leaves pinned and client certificate servers to the app", () => {
    expect(widgetCanReach(fakeClient({ certPins: () => ["pin"] }))).toBe(false);
    expect(
      widgetCanReach(fakeClient({ clientCert: () => ({ name: "c" }) })),
    ).toBe(false);
  });
});

test("access carries the base and request headers without the user agent", () => {
  expect(powerAccessOf(fakeClient())).toEqual({
    base: "https://termix.example",
    headers: { Authorization: "Bearer abc", "CF-Access-Client-Id": "x" },
  });
});

describe("native contract", () => {
  const root = path.join(__dirname, "../..");
  const read = (...parts: string[]) =>
    fs.readFileSync(path.join(root, ...parts), "utf8");
  const ts = read("src", "widgets", "power.ts");
  const swift = read(
    "modules",
    "termix-widgets",
    "ios",
    "widget",
    "PowerStore.swift",
  );
  const kotlin = read(
    "modules",
    "termix-widgets",
    "android",
    "src",
    "main",
    "java",
    "expo",
    "modules",
    "termixwidgets",
    "PowerStore.kt",
  );

  const tsFields = ts
    .match(/export interface PowerDevice \{([\s\S]*?)\n\}/)![1]
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => /^\w+:/.test(line))
    .map((line) => line.split(":")[0])
    .sort();

  it("PowerDevice has the same fields in Swift and Kotlin", () => {
    const swiftBody = swift.match(
      /struct PowerDevice[^{]*\{([\s\S]*?)\n\}/,
    )![1];
    const swiftFields = [...swiftBody.matchAll(/^ {2}let (\w+):/gm)]
      .map((m) => m[1])
      .sort();
    const kotlinBody = kotlin.match(
      /data class PowerDevice\(([\s\S]*?)\n\)/,
    )![1];
    const kotlinFields = [...kotlinBody.matchAll(/val (\w+):/g)]
      .map((m) => m[1])
      .sort();
    expect(swiftFields).toEqual(tsFields);
    expect(kotlinFields).toEqual(tsFields);
    for (const field of tsFields) expect(kotlin).toContain(`"${field}"`);
  });

  it("uses the same version and storage keys everywhere", () => {
    expect(swift).toContain(`supportedVersion = ${POWER_SNAPSHOT_VERSION}`);
    expect(kotlin).toContain(`SUPPORTED_VERSION = ${POWER_SNAPSHOT_VERSION}`);
    const appModule = read(
      "modules",
      "termix-widgets",
      "ios",
      "TermixWidgetsModule.swift",
    );
    for (const key of [
      "termix.widget.power.v1",
      "termix.widget.power.overrides.v1",
      "termix.widget.power",
    ]) {
      expect(appModule).toContain(`"${key}"`);
      expect(swift).toContain(`"${key}"`);
    }
  });
});
