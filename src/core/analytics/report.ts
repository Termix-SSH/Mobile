import { Platform } from "react-native";
import Constants from "expo-constants";
import * as Device from "expo-device";
import { accounts } from "@/core/accounts";
import { repositoriesFor } from "@/core/data/repositories";
import { sendEvent } from "./client";
import { getConsent } from "./consent";
import {
  connectResultEvent,
  heartbeatEvent,
  type AnalyticsEvent,
} from "./events";
import { clearReported, readUsage } from "./usage";

const DAY = 24 * 60 * 60 * 1000;

/** Hosts kept on this phone: This device plus servers with an offline copy. */
async function hostCount(): Promise<number> {
  let total = 0;
  for (const account of accounts.list()) {
    const local = account.kind === "local" || account.options?.sync === true;
    if (!local) continue;
    try {
      total += (await repositoriesFor(account, null).hosts.list()).length;
    } catch {
      // Counted as zero.
    }
  }
  return total;
}

/** The exact events the next report would send. Used by send and preview. */
export async function buildReport(): Promise<AnalyticsEvent[]> {
  const usage = await readUsage();
  const events: AnalyticsEvent[] = [
    heartbeatEvent({
      version: Constants.expoConfig?.version ?? "unknown",
      platform: Platform.OS,
      osVersion: Device.osVersion,
      linked: accounts.list().length > 1,
      hosts: await hostCount(),
      sessions: usage.maxSessions,
      features: usage.features,
    }),
  ];
  for (const [key, count] of Object.entries(usage.connects).sort()) {
    const [transport, result] = key.split("|");
    const e = connectResultEvent(transport, result, count);
    if (e) events.push(e);
  }
  return events;
}

/** Sends the report when a day has passed since the last one. */
export async function maybeSendReport(now = Date.now()): Promise<boolean> {
  if (getConsent() !== "on") return false;
  const before = await readUsage();
  if (now - before.lastSentAt < DAY) return false;
  const events = await buildReport();
  let ok = true;
  for (const e of events) ok = (await sendEvent(e)) && ok;
  if (ok) await clearReported(before, now);
  return ok;
}
