import PostHog from "posthog-react-native";
import { analyticsConfig } from "./config";
import { getConsent, installId } from "./consent";
import type { AnalyticsEvent } from "./events";
import { isAllowedEvent } from "./sanitize";

let instance: PostHog | null = null;
let starting: Promise<PostHog> | null = null;

async function start(): Promise<PostHog> {
  const { apiKey, host } = analyticsConfig();
  const client = new PostHog(apiKey, {
    host,
    bootstrap: { distinctId: await installId() },
    persistence: "memory",
    // One report is a few events, so send each one at once.
    flushAt: 1,
    disableGeoip: true,
    personProfiles: "never",
    captureAppLifecycleEvents: false,
    enableSessionReplay: false,
    preloadFeatureFlags: false,
    disableRemoteFeatureFlags: true,
    disableSurveys: true,
    errorTracking: { autocapture: false },
    // No device model, locale or app name next to the report.
    customAppProperties: () => ({}),
  });
  return client;
}

function getClient(): Promise<PostHog> {
  if (instance) return Promise.resolve(instance);
  starting ??= start().then((c) => {
    instance = c;
    return c;
  });
  return starting;
}

/**
 * Sends one event. Does nothing unless the person said yes and the event
 * passes the allowlist. Returns whether it was handed to PostHog.
 */
export async function sendEvent(e: AnalyticsEvent): Promise<boolean> {
  if (getConsent() !== "on" || !isAllowedEvent(e)) return false;
  try {
    const client = await getClient();
    // Opt out may have happened while the client was starting.
    if (getConsent() !== "on") return false;
    client.capture(e.event, e.properties);
    await client.flush();
    return true;
  } catch {
    return false;
  }
}

/** Stops all capture and drops anything queued. Safe to call any time. */
export async function stopAnalytics(): Promise<void> {
  const pending = starting;
  const client = instance;
  instance = null;
  starting = null;
  try {
    const c = client ?? (pending ? await pending : null);
    if (!c) return;
    await c.optOut();
    await c.shutdown(500);
  } catch {
    // Nothing to stop.
  }
}

/** For tests. */
export function resetClientState(): void {
  instance = null;
  starting = null;
}
