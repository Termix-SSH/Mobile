import { setConsent } from "@/core/analytics/consent";
import { trackTabOpened } from "@/core/analytics/track";
import { readUsage } from "@/core/analytics/usage";
import { HOSTILE, registerTabs, resetAnalytics } from "./helpers";

const flush = () => new Promise((r) => setTimeout(r, 0));

let remove: () => void;

beforeEach(async () => {
  await resetAnalytics();
  await setConsent("on");
  remove = registerTabs("analytics-test");
});

afterEach(() => remove());

describe("trackTabOpened", () => {
  it("counts a tab of a built in feature", async () => {
    trackTabOpened("analytics-test");
    await flush();
    expect((await readUsage()).features).toEqual({ "analytics-test": 1 });
  });

  it("ignores tab types no feature owns", async () => {
    for (const bad of HOSTILE) trackTabOpened(bad);
    trackTabOpened("my-community-plugin");
    await flush();
    expect((await readUsage()).features).toEqual({});
  });
});
