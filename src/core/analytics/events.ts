/**
 * Every event the app can send is built here from fixed keys. Nothing from
 * a host, login, server or error message ever reaches a property.
 */

import { features } from "@/core/features";

export type EventName = "app_heartbeat" | "connect_result" | "crash";

export interface AnalyticsEvent {
  event: EventName;
  properties: Record<
    string,
    string | number | boolean | Record<string, string>
  >;
}

export type Bucket = "0" | "1" | "2-5" | "6-20" | "21-100" | "100+";

export function bucket(n: number): Bucket {
  if (!Number.isFinite(n) || n <= 0) return "0";
  if (n === 1) return "1";
  if (n <= 5) return "2-5";
  if (n <= 20) return "6-20";
  if (n <= 100) return "21-100";
  return "100+";
}

export const CONNECT_RESULTS = [
  "ok",
  "unavailable",
  "network",
  "proxy",
  "hostKey",
  "auth",
  "server",
  "session",
  "cancelled",
] as const;
export type ConnectResultClass = (typeof CONNECT_RESULTS)[number];

export const CRASH_CLASSES = [
  "Error",
  "TypeError",
  "RangeError",
  "ReferenceError",
  "SyntaxError",
  "URIError",
  "EvalError",
  "AppError",
  "ApiError",
  "SshError",
] as const;
export type CrashClass = (typeof CRASH_CLASSES)[number];

export const FEATURE_KEY = /^[a-z][a-zA-Z0-9-]{0,31}$/;
export const MAX_FEATURES = 40;

/** Only tab types of built in features may be a key, never a plugin or free text. */
export function isKnownFeature(key: string): boolean {
  return (
    FEATURE_KEY.test(key) && features.sessionFeature(key)?.source === "native"
  );
}

export interface HeartbeatInput {
  version: string;
  platform: string;
  osVersion: string | number | null | undefined;
  linked: boolean;
  hosts: number;
  sessions: number;
  /** Tab type to number of times it was opened. */
  features: Record<string, number>;
}

/** The first number in an OS version, like 17 from "17.4.1". */
export function osMajor(v: string | number | null | undefined): number {
  const n = parseInt(String(v ?? ""), 10);
  return Number.isFinite(n) && n >= 0 && n < 1000 ? n : 0;
}

export function platformName(os: string): "ios" | "android" | "other" {
  return os === "ios" || os === "android" ? os : "other";
}

export function heartbeatEvent(input: HeartbeatInput): AnalyticsEvent {
  const featureUse: Record<string, string> = {};
  for (const key of Object.keys(input.features).sort()) {
    if (!isKnownFeature(key)) continue;
    if (Object.keys(featureUse).length >= MAX_FEATURES) break;
    featureUse[key] = bucket(input.features[key]);
  }
  return {
    event: "app_heartbeat",
    properties: {
      app_version: /^\d+\.\d+\.\d+([-.][0-9a-z.]+)?$/i.test(input.version)
        ? input.version
        : "unknown",
      platform: platformName(input.platform),
      os_major: osMajor(input.osVersion),
      mode: input.linked ? "linked" : "standalone",
      host_bucket: bucket(input.hosts),
      session_bucket: bucket(input.sessions),
      feature_use: featureUse,
    },
  };
}

export function connectResultEvent(
  transport: string,
  result: string,
  count: number,
): AnalyticsEvent | null {
  if (transport !== "local" && transport !== "relay") return null;
  if (!(CONNECT_RESULTS as readonly string[]).includes(result)) return null;
  return {
    event: "connect_result",
    properties: {
      transport,
      result_class: result,
      count_bucket: bucket(count),
    },
  };
}

/** Only the error class name is used. The message and stack are never read. */
export function crashClassOf(error: unknown): CrashClass {
  if (!(error instanceof Error)) return "Error";
  // Release builds minify class names, so our own errors are found by name.
  const known = CRASH_CLASSES as readonly string[];
  for (const name of [error.constructor?.name, error.name]) {
    if (name && name !== "Error" && known.includes(name)) {
      return name as CrashClass;
    }
  }
  return "Error";
}

export function crashEvent(error: unknown, fatal: boolean): AnalyticsEvent {
  return {
    event: "crash",
    properties: { crash_class: crashClassOf(error), fatal: !!fatal },
  };
}
