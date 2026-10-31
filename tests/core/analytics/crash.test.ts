import { installCrashReporting } from "@/core/analytics/crash";
import { setConsent } from "@/core/analytics/consent";
import { HOSTILE, resetAnalytics } from "./helpers";

const mockCapture = jest.fn();

jest.mock("posthog-react-native", () => ({
  __esModule: true,
  default: class {
    capture = mockCapture;
    flush = async () => {};
  },
}));

beforeEach(async () => {
  mockCapture.mockClear();
  await resetAnalytics();
});

function fakeUtils() {
  const previous = jest.fn();
  let handler: (e: unknown, fatal?: boolean) => void = previous;
  return {
    previous,
    utils: {
      getGlobalHandler: () => handler,
      setGlobalHandler: (h: typeof handler) => {
        handler = h;
      },
    },
    fire: (e: unknown, fatal?: boolean) => handler(e, fatal),
  };
}

const flush = () => new Promise((r) => setTimeout(r, 0));

describe("installCrashReporting", () => {
  it("reports the class and still runs the old handler", async () => {
    await setConsent("on");
    const { utils, previous, fire } = fakeUtils();
    installCrashReporting(utils);
    const err = new TypeError(HOSTILE.join(" "));
    fire(err, true);
    await flush();
    expect(previous).toHaveBeenCalledWith(err, true);
    expect(mockCapture).toHaveBeenCalledWith("crash", {
      crash_class: "TypeError",
      fatal: true,
    });
    expect(JSON.stringify(mockCapture.mock.calls)).not.toContain(HOSTILE[0]);
  });

  it("sends nothing when off but still runs the old handler", async () => {
    await setConsent("off");
    const { utils, previous, fire } = fakeUtils();
    installCrashReporting(utils);
    fire(new Error("x"), false);
    await flush();
    expect(previous).toHaveBeenCalled();
    expect(mockCapture).not.toHaveBeenCalled();
  });

  it("installs once", () => {
    const { utils } = fakeUtils();
    const set = jest.spyOn(utils, "setGlobalHandler");
    installCrashReporting(utils);
    installCrashReporting(utils);
    expect(set).toHaveBeenCalledTimes(1);
  });
});
