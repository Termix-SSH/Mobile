import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  CryptoDigestAlgorithm,
  digest,
  getRandomBytes,
  randomUUID,
} from "expo-crypto";
import { toBase64 } from "@/core/db/bytes";

/**
 * One browser sign in at a time. Its id rides in the callback path
 * (termix-mobile://oidc-callback/<id>), so a link from an old or someone
 * else's sign in is dropped, and each one works only once. Kept in storage
 * because Android may close the app while the browser is open.
 */
const KEY = "signInFlow";
const MAX_AGE_MS = 15 * 60 * 1000;

interface Flow {
  id: string;
  at: number;
  /** Started on a server before 2.9, whose callback has no id. */
  plain: boolean;
  /** Secret behind the challenge the login page gets. Only the app has it. */
  verifier?: string;
}

const base64Url = (bytes: Uint8Array) =>
  toBase64(bytes).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

/** The challenge for a verifier: base64url SHA-256. */
export async function challengeFor(verifier: string): Promise<string> {
  const hash = await digest(
    CryptoDigestAlgorithm.SHA256,
    new TextEncoder().encode(verifier),
  );
  return base64Url(new Uint8Array(hash));
}

/** The open sign in's challenge, for the login page address. */
export async function currentChallenge(): Promise<string | null> {
  const flow = await load();
  return flow?.verifier ? challengeFor(flow.verifier) : null;
}

let current: Flow | null = null;

export async function startFlow(plain = false): Promise<string> {
  const flow: Flow = {
    id: randomUUID().replace(/-/g, ""),
    at: Date.now(),
    plain,
    verifier: base64Url(getRandomBytes(32)),
  };
  current = flow;
  await AsyncStorage.setItem(KEY, JSON.stringify(flow)).catch(() => {});
  return flow.id;
}

async function load(): Promise<Flow | null> {
  if (current) return current;
  try {
    const raw = await AsyncStorage.getItem(KEY);
    current = raw ? (JSON.parse(raw) as Flow) : null;
  } catch {
    current = null;
  }
  return current;
}

/**
 * True when a callback belongs to the sign in that is open now. A match ends
 * the flow, so the same link can't sign in twice.
 */
export async function takeFlow(
  id: string | null,
  now = Date.now(),
): Promise<boolean> {
  return !!(await takeFlowEntry(id, now));
}

/** Like takeFlow, but gives back the flow with its verifier. */
export async function takeFlowEntry(
  id: string | null,
  now = Date.now(),
): Promise<{ verifier?: string } | null> {
  const flow = await load();
  if (!flow || now - flow.at > MAX_AGE_MS) return null;
  const ok = id ? id === flow.id : flow.plain;
  if (!ok) return null;
  await endFlow();
  return { verifier: flow.verifier };
}

export async function endFlow(): Promise<void> {
  current = null;
  await AsyncStorage.removeItem(KEY).catch(() => {});
}
