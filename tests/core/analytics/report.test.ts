import { setConsent } from "@/core/analytics/consent";
import { buildReport, maybeSendReport } from "@/core/analytics/report";
import {
  noteSessions,
  readUsage,
  recordConnect,
  recordFeature,
} from "@/core/analytics/usage";
import { HOSTILE, registerTabs, resetAnalytics } from "./helpers";

const mockSent: { event: string; properties: unknown }[] = [];
const mockAccounts: { id: string; kind: string; options?: object }[] = [
  { id: "local", kind: "local" },
];
const mockHosts: Record<string, { name: string; ip: string }[]> = {
  local: [
    { name: "prod-db-01.internal.example.com", ip: "192.168.1.50" },
    { name: "root@box", ip: "10.0.0.7" },
  ],
};

jest.mock("posthog-react-native", () => ({
  __esModule: true,
  default: class {
    capture = (event: string, properties: unknown) =>
      mockSent.push({ event, properties });
    flush = async () => {};
    optOut = async () => {};
    shutdown = async () => {};
  },
}));

jest.mock("@/core/accounts", () => ({
  accounts: { list: () => mockAccounts },
}));

jest.mock("@/core/data/repositories", () => ({
  repositoriesFor: (a: { id: string }) => ({
    hosts: { list: async () => mockHosts[a.id] ?? [] },
  }),
}));

jest.mock("expo-device", () => ({ osVersion: "17.4.1" }));

let undo: () => void;
beforeAll(() => {
  undo = registerTabs("terminal");
});
afterAll(() => undo());

beforeEach(async () => {
  mockSent.length = 0;
  mockAccounts.length = 1;
  await resetAnalytics();
  await setConsent("on");
});

describe("buildReport", () => {
  it("has a heartbeat with bucketed counts", async () => {
    await recordFeature("terminal");
    await noteSessions(3);
    await recordConnect("local", "ok");
    await recordConnect("relay", "auth");
    const events = await buildReport();
    expect(events.map((e) => e.event)).toEqual([
      "app_heartbeat",
      "connect_result",
      "connect_result",
    ]);
    expect(events[0].properties).toMatchObject({
      os_major: 17,
      mode: "standalone",
      host_bucket: "2-5",
      session_bucket: "2-5",
      feature_use: { terminal: "1" },
    });
  });

  it("says linked with more than one account", async () => {
    mockAccounts.push({ id: "s1", kind: "server" });
    const [hb] = await buildReport();
    expect(hb.properties.mode).toBe("linked");
  });

  it("never holds host names, addresses or other hostile values", async () => {
    await recordFeature("terminal");
    const json = JSON.stringify(await buildReport());
    for (const bad of [...HOSTILE, "prod-db", "internal.example.com"]) {
      expect(json).not.toContain(bad);
    }
  });
});

describe("maybeSendReport", () => {
  it("sends once and then waits a day", async () => {
    await recordFeature("terminal");
    const now = 10 * 24 * 60 * 60 * 1000;
    expect(await maybeSendReport(now)).toBe(true);
    expect(mockSent[0].event).toBe("app_heartbeat");
    const count = mockSent.length;
    expect(await maybeSendReport(now + 1000)).toBe(false);
    expect(mockSent).toHaveLength(count);
    expect(await maybeSendReport(now + 25 * 60 * 60 * 1000)).toBe(true);
  });

  it("clears the counts it sent", async () => {
    await recordFeature("terminal");
    await maybeSendReport(1e12);
    expect((await readUsage()).features).toEqual({});
  });

  it("sends nothing when off", async () => {
    await setConsent("off");
    expect(await maybeSendReport(1e12)).toBe(false);
    expect(mockSent).toHaveLength(0);
  });
});
