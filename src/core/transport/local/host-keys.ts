/**
 * Host key trust on this phone, with the same cases as core's
 * host-key-verifier.ts. The saved value is the raw key blob in hex, so a key
 * trusted here matches one trusted on a server after sync.
 */
import { CryptoDigestAlgorithm, digest } from "expo-crypto";
import type { HostConnectRepository, SavedHostKey } from "@/core/data/types";
import { toBase64, type SshHostKey } from "@/modules/termix-ssh";
import type { HostKeyData } from "../types";

export type AskHostKey = (
  scenario: "new" | "changed",
  data: HostKeyData,
) => Promise<boolean>;

export interface HostKeyCheck {
  /** Null for a host that is not saved: trust lasts for this session only. */
  hostId: number | null;
  saved: SavedHostKey | null;
  key: SshHostKey;
  /** Jump hops save a first key without asking, like the server. */
  jump: boolean;
  name?: string;
  /** Null when nobody can be asked (background work). */
  ask: AskHostKey | null;
  repo?: HostConnectRepository;
}

function hexToBytes(hex: string): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(hex.length >> 1);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

/** `SHA256:...` like OpenSSH prints, for a saved hex blob. */
export async function sha256OfBlob(hex: string): Promise<string> {
  if (!/^[0-9a-f]+$/i.test(hex) || hex.length % 2) return hex;
  const hash = await digest(CryptoDigestAlgorithm.SHA256, hexToBytes(hex));
  return `SHA256:${toBase64(new Uint8Array(hash)).replace(/=+$/, "")}`;
}

function dialogData(c: HostKeyCheck): HostKeyData {
  return {
    ip: c.key.host,
    port: c.key.port,
    hostname: c.name,
    fingerprint: c.key.sha256,
    keyType: c.key.keyType,
    algorithm: "sha256",
  };
}

/** True when the connection may go on. Saves the key when the user trusts it. */
export async function checkHostKey(c: HostKeyCheck): Promise<boolean> {
  const save = (changed: boolean) =>
    c.hostId != null && c.repo
      ? c.repo.saveHostKey(
          c.hostId,
          { fingerprint: c.key.blobHex, keyType: c.key.keyType },
          changed,
        )
      : Promise.resolve();

  if (c.hostId == null) {
    return c.ask ? c.ask("new", dialogData(c)) : true;
  }
  if (!c.saved) {
    if (c.jump) {
      await save(false);
      return true;
    }
    // Background work with no saved key goes on without saving, like the server.
    if (!c.ask) return true;
    const ok = await c.ask("new", dialogData(c));
    if (ok) await save(false);
    return ok;
  }
  if (c.saved.fingerprint.toLowerCase() === c.key.blobHex.toLowerCase()) {
    c.repo?.touchHostKey(c.hostId).catch(() => {});
    return true;
  }
  if (!c.ask) return false;
  const ok = await c.ask("changed", {
    ...dialogData(c),
    oldFingerprint: await sha256OfBlob(c.saved.fingerprint),
    oldKeyType: c.saved.keyType,
  });
  if (ok) await save(true);
  return ok;
}
