import {
  convertKeyToOpenssh,
  inspectKey,
  isSshEngineAvailable,
  SshError,
} from "@/modules/termix-ssh";

export interface ImportedKey {
  key: string;
  /** The `authorized_keys` line, when the key could be read. */
  publicKey?: string;
  /** A PuTTY key was turned into OpenSSH text. */
  converted: boolean;
  /** The key is locked and no passphrase (or a wrong one) was given. */
  locked: boolean;
}

/**
 * Gets a picked or pasted private key ready to save. PuTTY keys become OpenSSH
 * text with the same passphrase, so every client reads them. Without the SSH
 * engine (web, Expo Go) the text is kept as it is.
 */
export function importPrivateKey(
  text: string,
  passphrase?: string,
): ImportedKey {
  const key = text.trim();
  const plain = { key, converted: false, locked: false };
  if (!isSshEngineAvailable || !key) return plain;
  try {
    const info = inspectKey(key, passphrase);
    if (info.format !== "ppk") {
      return { ...plain, publicKey: info.publicOpenssh };
    }
    return {
      key: convertKeyToOpenssh(key, passphrase, passphrase),
      publicKey: info.publicOpenssh,
      converted: true,
      locked: false,
    };
  } catch (err) {
    const locked =
      err instanceof SshError &&
      (err.kind === "passphraseRequired" || err.kind === "badPassphrase");
    return { ...plain, locked };
  }
}

/** One line for the toast after loading a key file. */
export function importMessage(name: string, imported: ImportedKey): string {
  if (imported.converted)
    return `Loaded ${name} and changed it to OpenSSH format`;
  if (imported.locked) {
    return `Loaded ${name}. It needs its passphrase to connect`;
  }
  return `Loaded ${name}`;
}

export type KeyStatus =
  | { kind: "empty" }
  /** No engine here (web, Expo Go), so the key can't be checked. */
  | { kind: "unchecked" }
  | { kind: "ok"; keyType: string; bits: number; fingerprint: string }
  | { kind: "needsPassphrase" }
  | { kind: "wrongPassphrase" }
  | { kind: "invalid" };

/** What the phone can tell about a key and its passphrase. */
export function keyStatus(text: string, passphrase?: string): KeyStatus {
  const key = text.trim();
  if (!key) return { kind: "empty" };
  if (!isSshEngineAvailable) return { kind: "unchecked" };
  try {
    const info = inspectKey(key, passphrase || undefined);
    return {
      kind: "ok",
      keyType: info.keyType,
      bits: info.bits,
      fingerprint: info.sha256,
    };
  } catch (err) {
    if (err instanceof SshError && err.kind === "passphraseRequired") {
      return { kind: "needsPassphrase" };
    }
    if (err instanceof SshError && err.kind === "badPassphrase") {
      return { kind: "wrongPassphrase" };
    }
    return { kind: "invalid" };
  }
}

/** One plain line for a key status, or null when there is nothing to say. */
export function keyStatusText(status: KeyStatus): string | null {
  switch (status.kind) {
    case "ok":
      return `${status.keyType}${status.bits ? ` ${status.bits} bit` : ""} | ${status.fingerprint}`;
    case "needsPassphrase":
      return "This key is locked. Enter its passphrase.";
    case "wrongPassphrase":
      return "That passphrase doesn't open this key.";
    case "invalid":
      return "This doesn't look like a private key.";
    default:
      return null;
  }
}
