import {
  analyticsConfig,
  DEFAULT_POSTHOG_HOST,
  DEFAULT_POSTHOG_KEY,
} from "@/core/analytics/config";

describe("analyticsConfig", () => {
  it("uses the default project", () => {
    expect(analyticsConfig({})).toEqual({
      apiKey: DEFAULT_POSTHOG_KEY,
      host: DEFAULT_POSTHOG_HOST,
    });
  });

  it("takes a custom key and host and trims the slash", () => {
    expect(
      analyticsConfig({
        EXPO_PUBLIC_POSTHOG_API_KEY: " phc_custom ",
        EXPO_PUBLIC_POSTHOG_HOST: "https://ph.example.org//",
      }),
    ).toEqual({ apiKey: "phc_custom", host: "https://ph.example.org" });
  });

  it("ignores blank values", () => {
    expect(
      analyticsConfig({
        EXPO_PUBLIC_POSTHOG_API_KEY: "  ",
        EXPO_PUBLIC_POSTHOG_HOST: "",
      }).apiKey,
    ).toBe(DEFAULT_POSTHOG_KEY);
  });
});
