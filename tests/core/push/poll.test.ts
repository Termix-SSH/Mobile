import { checkAlerts, hashId } from "@/core/push/poll";
import { accountFromPush, alertLink } from "@/core/push/links";
import {
  getPushPref,
  meetsSeverity,
  resetPushPrefsCache,
  savePushPref,
} from "@/core/push/prefs";
import { plainStore } from "@/core/storage/kv";

const mockShown: { title: string; url: string; critical: boolean }[] = [];
let mockItems: {
  id: string;
  title: string;
  message: string;
  severity: string;
}[] = [];

jest.mock("@/modules/termix-session-service", () => ({
  showAlertNotification: (alert: {
    title: string;
    url: string;
    critical: boolean;
  }) => {
    mockShown.push(alert);
    return true;
  },
}));

jest.mock("@/core/accounts", () => ({
  accounts: {
    list: () => [{ id: "acc1", kind: "server" }],
    client: () => ({
      load: async () => {},
      isAuthenticated: () => true,
      api: {
        alerts: {
          available: () => true,
          list: async () => ({ items: mockItems, unread: mockItems.length }),
        },
      },
    }),
  },
}));

const item = (id: number, severity = "critical") => ({
  id: String(id),
  title: `alert ${id}`,
  message: "body",
  severity,
});

beforeEach(async () => {
  mockShown.length = 0;
  mockItems = [];
  await plainStore.remove("push.prefs");
  resetPushPrefsCache();
});

describe("background alert check", () => {
  it("only remembers the inbox on the first run", async () => {
    await savePushPref("acc1", { enabled: true });
    mockItems = [item(1), item(2)];
    expect(await checkAlerts()).toBe(0);
    expect((await getPushPref("acc1")).lastSeenId).toBe(2);
  });

  it("shows new alerts at or above the severity, once", async () => {
    await savePushPref("acc1", { enabled: true, lastSeenId: 2 });
    mockItems = [item(4, "info"), item(3, "warning"), item(2), item(5)];
    expect(await checkAlerts()).toBe(2);
    expect(mockShown.map((s) => s.title)).toEqual(["alert 3", "alert 5"]);
    expect(mockShown[1]).toMatchObject({
      critical: true,
      url: alertLink("acc1"),
    });
    expect(await checkAlerts()).toBe(0);
  });

  it("skips servers that are off", async () => {
    await savePushPref("acc1", { enabled: false, lastSeenId: 0 });
    mockItems = [item(1)];
    expect(await checkAlerts()).toBe(0);
  });
});

describe("helpers", () => {
  it("ranks severities", () => {
    expect(meetsSeverity("critical", "warning")).toBe(true);
    expect(meetsSeverity("success", "warning")).toBe(false);
    expect(meetsSeverity("info", "info")).toBe(true);
  });

  it("reads the account from a push", () => {
    expect(accountFromPush({ accountKey: "acc1" })).toBe("acc1");
    expect(accountFromPush({ accountKey: 5 })).toBeNull();
    expect(accountFromPush(null)).toBeNull();
  });

  it("gives each server and alert its own notification id", () => {
    expect(hashId("a", 1)).not.toBe(hashId("b", 1));
    expect(hashId("a", 1)).not.toBe(hashId("a", 2));
    expect(hashId("a", 1)).toBeGreaterThanOrEqual(0);
  });
});
