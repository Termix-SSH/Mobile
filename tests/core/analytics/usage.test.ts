import { setConsent } from "@/core/analytics/consent";
import {
  clearReported,
  clearUsage,
  noteSessions,
  readUsage,
  recordConnect,
  recordFeature,
} from "@/core/analytics/usage";
import { resetAnalytics } from "./helpers";

beforeEach(resetAnalytics);

describe("usage counts", () => {
  it("counts nothing before the answer is yes", async () => {
    await recordFeature("terminal");
    await recordConnect("local", "ok");
    await noteSessions(4);
    expect(await readUsage()).toMatchObject({
      features: {},
      connects: {},
      maxSessions: 0,
    });
  });

  it("counts once on", async () => {
    await setConsent("on");
    await recordFeature("terminal");
    await recordFeature("terminal");
    await recordConnect("relay", "auth");
    await noteSessions(2);
    await noteSessions(1);
    expect(await readUsage()).toMatchObject({
      features: { terminal: 2 },
      connects: { "relay|auth": 1 },
      maxSessions: 2,
    });
  });

  it("refuses names that are not ids and unknown transports", async () => {
    await setConsent("on");
    await recordFeature("Prod DB 01");
    await recordFeature("a/b");
    await recordConnect("prod-db", "ok");
    await recordConnect("local", "root@box");
    const usage = await readUsage();
    expect(usage.features).toEqual({});
    expect(usage.connects).toEqual({});
  });

  it("clears what was reported and keeps newer counts", async () => {
    await setConsent("on");
    await recordFeature("files");
    const sent = await readUsage();
    await recordFeature("files");
    await clearReported(sent, 1234);
    const after = await readUsage();
    expect(after.features).toEqual({ files: 1 });
    expect(after.lastSentAt).toBe(1234);
    expect(after.maxSessions).toBe(0);
  });

  it("forgets everything on opt out", async () => {
    await setConsent("on");
    await recordFeature("files");
    await clearUsage();
    expect((await readUsage()).features).toEqual({});
  });
});
