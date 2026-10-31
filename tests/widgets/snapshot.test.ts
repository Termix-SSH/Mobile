import { buildSignedOutSnapshot, buildWidgetSnapshot } from "@/widgets";
import { widgetPalette } from "@/widgets/palette";
import type { SSHHost } from "@/types";

const host = (id: number, name: string): SSHHost =>
  ({ id, name, ip: `10.0.0.${id}`, username: "root", folder: "" }) as SSHHost;

const palette = widgetPalette("dracula");

test("a device with hosts and no server is ready", () => {
  const snap = buildWidgetSnapshot({
    hosts: [host(1, "a"), host(2, "b")],
    statuses: {},
    accent: "#f59145",
    serverUrl: null,
    authenticated: true,
    palette,
  });
  expect(snap.state).toBe("ready");
  expect(snap.server).toBe("");
  expect(snap.summary).toEqual({ total: 2, online: 0, offline: 0, unknown: 2 });
});

test("phone checked statuses count in the summary", () => {
  const snap = buildWidgetSnapshot({
    hosts: [host(1, "a"), host(2, "b")],
    statuses: {
      1: { status: "online", lastChecked: "now" },
      2: { status: "offline", lastChecked: "now" },
    },
    accent: "#f59145",
    authenticated: true,
  });
  expect(snap.summary).toMatchObject({ online: 1, offline: 1 });
  expect(snap.hosts[0].name).toBe("a");
});

test("the theme travels in the snapshot, signed out too", () => {
  const ready = buildWidgetSnapshot({
    hosts: [host(1, "a")],
    statuses: {},
    accent: "#f59145",
    authenticated: true,
    palette,
  });
  expect(ready.theme).toEqual(palette);
  expect(buildSignedOutSnapshot("#f59145", 1, palette).theme).toEqual(palette);
  expect(buildSignedOutSnapshot("#f59145").theme).toBeNull();
});

describe("widgetPalette", () => {
  it("uses hex colors from the theme", () => {
    for (const key of ["background", "card", "border", "text"] as const) {
      expect(palette[key]).toMatch(/^#[0-9a-f]{6}$/i);
    }
    expect(palette.textTertiary).toMatch(/^#[0-9a-f]{8}$/i);
  });

  it("knows light from dark", () => {
    expect(widgetPalette("light").isDark).toBe(false);
    expect(widgetPalette("nord").isDark).toBe(true);
  });

  it("follows the system for the system theme", () => {
    expect(widgetPalette("system", "light").id).toBe("light");
    expect(widgetPalette("system", "dark").id).toBe("dark");
  });
});
