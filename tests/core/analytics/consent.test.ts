import {
  getConsent,
  installId,
  loadConsent,
  resetInstallId,
  setConsent,
} from "@/core/analytics/consent";
import { resetAnalytics } from "./helpers";

beforeEach(resetAnalytics);

describe("consent", () => {
  it("is unanswered by default", async () => {
    expect(await loadConsent()).toBe("unanswered");
    expect(getConsent()).toBe("unanswered");
  });

  it("keeps the answer", async () => {
    await setConsent("on");
    expect(getConsent()).toBe("on");
    await loadConsent();
    expect(getConsent()).toBe("on");
    await setConsent("off");
    expect(await loadConsent()).toBe("off");
  });
});

describe("install id", () => {
  it("is made once and kept", async () => {
    const a = await installId();
    expect(a).toMatch(/^[0-9a-f-]{36}$/);
    expect(await installId()).toBe(a);
  });

  it("changes on reset", async () => {
    const a = await installId();
    const b = await resetInstallId();
    expect(b).not.toBe(a);
    expect(await installId()).toBe(b);
  });
});
