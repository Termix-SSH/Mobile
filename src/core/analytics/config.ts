/** Same public project as the Usage Statistics plugin. */
export const DEFAULT_POSTHOG_KEY =
  "phc_xM8UznirsFxUkGE68gH4jzeqevf4kh76wGw7Ci7hH2dd";
export const DEFAULT_POSTHOG_HOST = "https://us.i.posthog.com";

export interface AnalyticsConfig {
  apiKey: string;
  host: string;
}

/**
 * POSTHOG_API_KEY and POSTHOG_HOST at build time (as EXPO_PUBLIC_ variables)
 * point the app at a custom project.
 */
export function analyticsConfig(
  env: Record<string, string | undefined> = process.env,
): AnalyticsConfig {
  const key = env.EXPO_PUBLIC_POSTHOG_API_KEY?.trim();
  const host = env.EXPO_PUBLIC_POSTHOG_HOST?.trim();
  return {
    apiKey: key || DEFAULT_POSTHOG_KEY,
    host: (host || DEFAULT_POSTHOG_HOST).replace(/\/+$/, ""),
  };
}
