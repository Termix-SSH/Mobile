import { useSyncExternalStore } from "react";
import { randomUUID } from "expo-crypto";
import { plainStore, secureStore } from "@/core/storage/kv";

/** Off until the person answers the first-run question. */
export type Consent = "unanswered" | "on" | "off";

const CONSENT_KEY = "analytics.consent.v1";
const ID_KEY = "analytics.installId";

let current: Consent = "unanswered";
let loaded = false;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((l) => l());
}

export function getConsent(): Consent {
  return current;
}

export function consentLoaded(): boolean {
  return loaded;
}

export async function loadConsent(): Promise<Consent> {
  const saved = await plainStore.get(CONSENT_KEY);
  current = saved === "on" || saved === "off" ? saved : "unanswered";
  loaded = true;
  emit();
  return current;
}

export async function setConsent(value: "on" | "off"): Promise<void> {
  current = value;
  loaded = true;
  emit();
  await plainStore.set(CONSENT_KEY, value);
}

/** The random id reports go out under. Not the sync device id. */
export async function installId(): Promise<string> {
  const saved = await secureStore.get(ID_KEY);
  if (saved) return saved;
  return resetInstallId();
}

export async function resetInstallId(): Promise<string> {
  const id = randomUUID();
  await secureStore.set(ID_KEY, id);
  return id;
}

/** For tests. */
export function resetConsentState(): void {
  current = "unanswered";
  loaded = false;
  emit();
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

export function useConsent(): { consent: Consent; loaded: boolean } {
  const consent = useSyncExternalStore(subscribe, getConsent, getConsent);
  const isLoaded = useSyncExternalStore(
    subscribe,
    consentLoaded,
    consentLoaded,
  );
  return { consent, loaded: isLoaded };
}
