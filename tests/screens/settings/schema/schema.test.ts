import fs from "fs";
import path from "path";
import { features } from "@/core/features";
import { registerBuiltInFeatures } from "@/features";
import {
  buildSettingsGroups,
  SETTINGS_ITEMS,
  SETTINGS_SECTIONS,
  searchSettings,
  type SettingsEnv,
} from "@/screens/settings/schema";

jest.mock("@/contexts/AppLockContext", () => ({}));
jest.mock("@/widgets", () => ({ isWidgetSupported: false }));

const env = (over: Partial<SettingsEnv> = {}): SettingsEnv => ({
  signedIn: false,
  hasServer: false,
  isAdmin: false,
  os: "ios",
  widgets: false,
  appLock: false,
  plugins: [],
  ...over,
});

const ctx = { account: { kind: "local" }, client: null } as never;

beforeAll(() => registerBuiltInFeatures());

describe("settings schema", () => {
  it("has unique ids and known sections", () => {
    const ids = SETTINGS_ITEMS.map((i) => i.id);
    expect(new Set(ids).size).toBe(ids.length);
    const sections = new Set(SETTINGS_SECTIONS.map((s) => s.id));
    for (const item of SETTINGS_ITEMS)
      expect(sections.has(item.section)).toBe(true);
    expect(sections.size).toBe(SETTINGS_SECTIONS.length);
  });

  it("gives every item a screen or a control, not both", () => {
    for (const item of SETTINGS_ITEMS) {
      expect(!!item.href !== !!item.Control).toBe(true);
    }
  });

  it("points every href at a real route file", () => {
    for (const item of SETTINGS_ITEMS) {
      if (!item.href) continue;
      const rel = item.href.replace(/^\//, "").replace(/^\(tabs\)/, "(tabs)");
      const direct = path.join(__dirname, "../../../../app", `${rel}.tsx`);
      const dynamic = path.join(
        __dirname,
        "../../../../app",
        path.dirname(rel),
        "[pluginId].tsx",
      );
      expect(fs.existsSync(direct) || fs.existsSync(dynamic)).toBe(true);
    }
  });

  it("only uses sections that feature links point at", () => {
    const sections = new Set(SETTINGS_SECTIONS.map((s) => s.id));
    for (const link of features.settingsLinks(ctx)) {
      expect(sections.has(link.section ?? "accounts")).toBe(true);
    }
  });
});

describe("buildSettingsGroups", () => {
  it("hides server items on This device", () => {
    const groups = buildSettingsGroups(env(), []);
    const ids = groups.flatMap((g) => g.items.map((i) => i.id));
    expect(ids).not.toContain("sync");
    expect(ids).not.toContain("change-password");
    expect(ids).toContain("app-lock");
  });

  it("shows admin pages only to signed in admins", () => {
    const ids = (e: SettingsEnv) =>
      buildSettingsGroups(e, []).flatMap((g) => g.items.map((i) => i.id));
    expect(ids(env({ hasServer: true, signedIn: true }))).not.toContain(
      "api-keys",
    );
    expect(
      ids(env({ hasServer: true, signedIn: true, isAdmin: true })),
    ).toContain("api-keys");
  });

  it("shows lock options only when App Lock is on", () => {
    const ids = (e: SettingsEnv) =>
      buildSettingsGroups(e, []).flatMap((g) => g.items.map((i) => i.id));
    expect(ids(env())).not.toContain("lock-delay");
    expect(ids(env({ appLock: true }))).toEqual(
      expect.arrayContaining(["lock-delay", "change-pin"]),
    );
  });

  it("shows plugin rows when the server runs the plugin", () => {
    const ids = buildSettingsGroups(
      env({ plugins: ["telemetry"] }),
      [],
    ).flatMap((g) => g.items.map((i) => i.id));
    expect(ids).toContain("usage-statistics");
    expect(ids).not.toContain("server-alerts");
  });

  it("puts feature links in their section after the app rows", () => {
    const groups = buildSettingsGroups(env(), features.settingsLinks(ctx));
    const backup = groups.find((g) => g.section.id === "backup")!;
    expect(backup.items.map((i) => i.id)).toEqual([
      "local-data",
      "link:host-transfer",
    ]);
  });

  it("orders sections and skips empty ones", () => {
    const groups = buildSettingsGroups(env(), []);
    const orders = groups.map((g) => g.section.order);
    expect([...orders].sort((a, b) => a - b)).toEqual(orders);
    const terminal = groups.find((g) => g.section.id === "terminal");
    expect(terminal?.items.map((i) => i.id)).toContain("background-sessions");
  });
});

describe("searchSettings", () => {
  const groups = () =>
    buildSettingsGroups(env({ appLock: true }), features.settingsLinks(ctx));
  const top = (q: string) => searchSettings(groups(), q).map((h) => h.item.id);

  it("finds by label, keyword and description", () => {
    expect(top("theme")[0]).toBe("theme");
    expect(top("face id")).toContain("app-lock");
    expect(top("telemetry")).toContain("usage-stats");
    expect(top("import")).toContain("link:host-transfer");
  });

  it("needs every word to match", () => {
    expect(top("pin zebra")).toEqual([]);
    expect(top("lock delay")).toContain("lock-delay");
  });

  it("ranks label matches above keyword matches", () => {
    const ids = top("logs");
    expect(ids[0]).toBe("logs");
  });

  it("matches nothing for an empty query", () => {
    expect(top("   ")).toEqual([]);
  });

  it("matches the section name last", () => {
    const hits = searchSettings(groups(), "appearance");
    expect(hits.length).toBeGreaterThan(0);
    expect(hits.every((h) => h.sectionTitle === "Appearance")).toBe(true);
  });
});
