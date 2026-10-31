import { sendEvent, stopAnalytics } from "@/core/analytics/client";
import { DEFAULT_POSTHOG_KEY } from "@/core/analytics/config";
import { installId, setConsent } from "@/core/analytics/consent";
import { crashEvent } from "@/core/analytics/events";
import { answerConsent, resetAnalyticsId } from "@/core/analytics";
import { readUsage, recordFeature } from "@/core/analytics/usage";
import { resetAnalytics } from "./helpers";

const mockInstances: {
  key: string;
  options: Record<string, unknown>;
  capture: jest.Mock;
  flush: jest.Mock;
  optOut: jest.Mock;
  shutdown: jest.Mock;
}[] = [];

jest.mock("posthog-react-native", () => ({
  __esModule: true,
  default: class {
    capture = jest.fn();
    flush = jest.fn(async () => {});
    optOut = jest.fn(async () => {});
    shutdown = jest.fn(async () => {});
    key: string;
    options: Record<string, unknown>;
    constructor(key: string, options: Record<string, unknown>) {
      this.key = key;
      this.options = options;
      mockInstances.push(this as never);
    }
  },
}));

beforeEach(async () => {
  mockInstances.length = 0;
  await resetAnalytics();
});

const crash = () => crashEvent(new TypeError("boom"), false);

describe("sendEvent", () => {
  it("sends nothing before the question is answered", async () => {
    expect(await sendEvent(crash())).toBe(false);
    expect(mockInstances).toHaveLength(0);
  });

  it("sends nothing when the answer is no", async () => {
    await setConsent("off");
    expect(await sendEvent(crash())).toBe(false);
    expect(mockInstances).toHaveLength(0);
  });

  it("sends an allowed event once on", async () => {
    await setConsent("on");
    expect(await sendEvent(crash())).toBe(true);
    expect(mockInstances).toHaveLength(1);
    expect(mockInstances[0].capture).toHaveBeenCalledWith("crash", {
      crash_class: "TypeError",
      fatal: false,
    });
  });

  it("drops an event that fails the allowlist", async () => {
    await setConsent("on");
    const bad = crash();
    bad.properties.hostname = "prod-db-01";
    expect(await sendEvent(bad)).toBe(false);
    expect(mockInstances).toHaveLength(0);
  });

  it("starts PostHog with the privacy options", async () => {
    await setConsent("on");
    await sendEvent(crash());
    const { key, options } = mockInstances[0];
    expect(key).toBe(DEFAULT_POSTHOG_KEY);
    expect(options).toMatchObject({
      host: "https://us.i.posthog.com",
      persistence: "memory",
      disableGeoip: true,
      personProfiles: "never",
      captureAppLifecycleEvents: false,
      enableSessionReplay: false,
      preloadFeatureFlags: false,
      disableRemoteFeatureFlags: true,
      errorTracking: { autocapture: false },
      bootstrap: { distinctId: await installId() },
    });
    expect((options.customAppProperties as () => object)()).toEqual({});
  });

  it("reuses one client", async () => {
    await setConsent("on");
    await sendEvent(crash());
    await sendEvent(crash());
    expect(mockInstances).toHaveLength(1);
  });
});

describe("opt out", () => {
  it("stops the client and stops later sends", async () => {
    await answerConsent(true);
    await sendEvent(crash());
    const client = mockInstances[0];
    await answerConsent(false);
    expect(client.optOut).toHaveBeenCalled();
    expect(client.shutdown).toHaveBeenCalled();
    expect(await sendEvent(crash())).toBe(false);
    expect(client.capture).toHaveBeenCalledTimes(1);
  });

  it("forgets the counts", async () => {
    await answerConsent(true);
    await recordFeature("terminal");
    await answerConsent(false);
    expect((await readUsage()).features).toEqual({});
  });

  it("is safe with no client", async () => {
    await expect(stopAnalytics()).resolves.toBeUndefined();
  });
});

describe("reset id", () => {
  it("starts a new client under a new id", async () => {
    await setConsent("on");
    await sendEvent(crash());
    const first = await installId();
    await resetAnalyticsId();
    await sendEvent(crash());
    expect(mockInstances).toHaveLength(2);
    expect(await installId()).not.toBe(first);
    expect(
      (mockInstances[1].options.bootstrap as { distinctId: string }).distinctId,
    ).not.toBe(first);
  });
});
