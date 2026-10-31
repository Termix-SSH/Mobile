import {
  CONNECT_RESULTS,
  CRASH_CLASSES,
  isKnownFeature,
  MAX_FEATURES,
  type AnalyticsEvent,
} from "./events";

const BUCKET = /^(0|1|2-5|6-20|21-100|100\+)$/;
const VERSION = /^(unknown|\d+\.\d+\.\d+([-.][0-9a-z.]+)?)$/i;

type Check = (v: unknown) => boolean;

const oneOf =
  (list: readonly string[]): Check =>
  (v) =>
    typeof v === "string" && list.includes(v);
const matches =
  (re: RegExp): Check =>
  (v) =>
    typeof v === "string" && re.test(v);
const small: Check = (v) =>
  typeof v === "number" && Number.isInteger(v) && v >= 0 && v < 1000;
const bool: Check = (v) => typeof v === "boolean";

const featureUse: Check = (v) => {
  if (!v || typeof v !== "object" || Array.isArray(v)) return false;
  const entries = Object.entries(v as Record<string, unknown>);
  if (entries.length > MAX_FEATURES) return false;
  return entries.every(([k, val]) => isKnownFeature(k) && matches(BUCKET)(val));
};

/** The only properties each event may carry, and what a value may look like. */
const SCHEMA: Record<string, Record<string, Check>> = {
  app_heartbeat: {
    app_version: matches(VERSION),
    platform: oneOf(["ios", "android", "other"]),
    os_major: small,
    mode: oneOf(["standalone", "linked"]),
    host_bucket: matches(BUCKET),
    session_bucket: matches(BUCKET),
    feature_use: featureUse,
  },
  connect_result: {
    transport: oneOf(["local", "relay"]),
    result_class: oneOf(CONNECT_RESULTS),
    count_bucket: matches(BUCKET),
  },
  crash: {
    crash_class: oneOf(CRASH_CLASSES),
    fatal: bool,
  },
};

/**
 * True only when the event has a known name and exactly the known
 * properties with values of the expected shape. Anything else is dropped.
 */
export function isAllowedEvent(e: AnalyticsEvent): boolean {
  const schema = SCHEMA[e?.event];
  if (!schema || !e.properties || typeof e.properties !== "object") {
    return false;
  }
  const keys = Object.keys(e.properties);
  if (keys.length !== Object.keys(schema).length) return false;
  return keys.every((k) => schema[k] && schema[k](e.properties[k]));
}
