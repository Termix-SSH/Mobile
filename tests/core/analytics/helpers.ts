import { resetClientState } from "@/core/analytics/client";
import { resetConsentState } from "@/core/analytics/consent";
import { resetCrashState } from "@/core/analytics/crash";
import { resetUsageState } from "@/core/analytics/usage";
import { features } from "@/core/features";
import { resetStorage } from "../../helpers/http";

export async function resetAnalytics() {
  await resetStorage();
  resetConsentState();
  resetUsageState();
  resetClientState();
  resetCrashState();
}

/** Strings that must never show up in a report. */
export const HOSTILE = [
  "prod-db-01.internal.example.com",
  "root",
  "admin@corp",
  "192.168.1.50",
  "10.0.0.7",
  "/home/luke/.ssh/id_ed25519",
  "rm -rf /",
  "https://termix.mycorp.net",
  "my-community-plugin",
  "super-secret-password",
];

/** Registers built in features that own these tab types. Returns the undo. */
export function registerTabs(...types: string[]): () => void {
  const removes = types.map((type) =>
    features.register({
      id: `test-${type}`,
      title: type,
      source: "native",
      sessionTabs: [{ type }],
    } as never),
  );
  return () => removes.forEach((r) => r());
}
