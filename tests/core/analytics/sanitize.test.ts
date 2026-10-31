import { isAllowedEvent } from "@/core/analytics/sanitize";
import type { AnalyticsEvent } from "@/core/analytics/events";
import { registerTabs } from "./helpers";

let undo: () => void;
beforeAll(() => {
  undo = registerTabs("terminal");
});
afterAll(() => undo());

const crash = (props: AnalyticsEvent["properties"]): AnalyticsEvent => ({
  event: "crash",
  properties: props,
});

describe("isAllowedEvent", () => {
  it("accepts a valid crash", () => {
    expect(
      isAllowedEvent(crash({ crash_class: "TypeError", fatal: false })),
    ).toBe(true);
  });

  it("rejects an unknown event name", () => {
    expect(isAllowedEvent({ event: "login" as never, properties: {} })).toBe(
      false,
    );
  });

  it("rejects an extra property", () => {
    expect(
      isAllowedEvent(
        crash({ crash_class: "Error", fatal: true, hostname: "box" }),
      ),
    ).toBe(false);
  });

  it("rejects a missing property", () => {
    expect(isAllowedEvent(crash({ crash_class: "Error" }))).toBe(false);
  });

  it("rejects values outside the allowed set", () => {
    expect(isAllowedEvent(crash({ crash_class: "box-01", fatal: true }))).toBe(
      false,
    );
    expect(isAllowedEvent(crash({ crash_class: "Error", fatal: "yes" }))).toBe(
      false,
    );
  });

  it("rejects bad heartbeat parts", () => {
    const ok = {
      app_version: "2.0.0",
      platform: "android",
      os_major: 14,
      mode: "standalone",
      host_bucket: "1",
      session_bucket: "0",
      feature_use: { terminal: "2-5" },
    };
    const make = (patch: object) =>
      ({
        event: "app_heartbeat",
        properties: { ...ok, ...patch },
      }) as AnalyticsEvent;
    expect(isAllowedEvent(make({}))).toBe(true);
    expect(isAllowedEvent(make({ host_bucket: "12" }))).toBe(false);
    expect(isAllowedEvent(make({ os_major: 1.5 }))).toBe(false);
    expect(isAllowedEvent(make({ app_version: "root@box" }))).toBe(false);
    expect(isAllowedEvent(make({ feature_use: { "prod-db": 3 } }))).toBe(false);
    expect(isAllowedEvent(make({ feature_use: { "Prod DB": "1" } }))).toBe(
      false,
    );
    expect(isAllowedEvent(make({ feature_use: ["terminal"] }))).toBe(false);
  });

  it("rejects non objects", () => {
    expect(isAllowedEvent(null as never)).toBe(false);
  });
});
