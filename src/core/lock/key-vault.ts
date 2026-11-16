import { xchacha20poly1305 } from "@noble/ciphers/chacha.js";
import { scryptAsync } from "@noble/hashes/scrypt.js";
import { fromBase64, toBase64, utf8Decode, utf8Encode } from "@/core/db/bytes";

/**
 * With App Lock on, this device's database key is not kept in the clear at
 * all. It is sealed twice: once with a key made from the PIN and a random
 * device secret, once in a Keychain/Keystore item that only opens after a
 * biometric check. Turning the lock flag off by hand gets nothing, since the
 * plain key is gone; the key exists only in memory while the app is open.
 */

export interface VaultStore {
  get(key: string, options?: VaultItemOptions): Promise<string | null>;
  set(key: string, value: string, options?: VaultItemOptions): Promise<void>;
  remove(key: string, options?: VaultItemOptions): Promise<void>;
}

export interface VaultItemOptions {
  /** The item opens only after a biometric check (and is lost if the
   * enrolled biometrics change). */
  biometric?: boolean;
  prompt?: string;
}

export interface VaultCrypto {
  random(bytes: number): Uint8Array;
}

export const VAULT_PIN = "vault.pin";
export const VAULT_BIO = "vault.bio";
export const VAULT_PEPPER = "vault.pepper";
export const VAULT_FAILS = "vault.fails";

/** About a second on a phone. The device secret is what stops guessing off it. */
export const VAULT_KDF = { N: 2 ** 14, r: 8, p: 1 };

interface SealedPin {
  v: 1;
  salt: string;
  nonce: string;
  box: string;
}

export class VaultError extends Error {
  constructor(
    message: string,
    readonly code: "WRONG_PIN" | "NO_VAULT" | "BIO_UNAVAILABLE" | "BAD_VAULT",
  ) {
    super(message);
    this.name = "VaultError";
  }
}

export function createKeyVault(
  store: VaultStore,
  crypto: VaultCrypto,
  kdf = VAULT_KDF,
) {
  async function pepper(create: boolean): Promise<Uint8Array> {
    const saved = await store.get(VAULT_PEPPER);
    if (saved) return fromBase64(saved);
    if (!create) throw new VaultError("The device secret is gone", "BAD_VAULT");
    const fresh = crypto.random(32);
    await store.set(VAULT_PEPPER, toBase64(fresh));
    return fresh;
  }

  async function pinKey(pin: string, salt: Uint8Array, secret: Uint8Array) {
    const input = new Uint8Array([
      ...utf8Encode(pin.normalize("NFKC")),
      0,
      ...secret,
    ]);
    return scryptAsync(input, salt, { ...kdf, dkLen: 32 });
  }

  async function sealPin(pin: string, dbKey: string): Promise<void> {
    const secret = await pepper(true);
    const salt = crypto.random(16);
    const nonce = crypto.random(24);
    const key = await pinKey(pin, salt, secret);
    const box = xchacha20poly1305(key, nonce).encrypt(utf8Encode(dbKey));
    const sealed: SealedPin = {
      v: 1,
      salt: toBase64(salt),
      nonce: toBase64(nonce),
      box: toBase64(box),
    };
    await store.set(VAULT_PIN, JSON.stringify(sealed));
  }

  async function openPin(pin: string): Promise<string> {
    const raw = await store.get(VAULT_PIN);
    if (!raw) throw new VaultError("No sealed key", "NO_VAULT");
    let sealed: SealedPin;
    try {
      sealed = JSON.parse(raw);
    } catch {
      throw new VaultError("The sealed key is damaged", "BAD_VAULT");
    }
    const secret = await pepper(false);
    const key = await pinKey(pin, fromBase64(sealed.salt), secret);
    try {
      const plain = xchacha20poly1305(key, fromBase64(sealed.nonce)).decrypt(
        fromBase64(sealed.box),
      );
      return utf8Decode(plain);
    } catch {
      throw new VaultError("Wrong PIN", "WRONG_PIN");
    }
  }

  return {
    /** Whether the key is sealed, so the plain one must not be used. */
    async active(): Promise<boolean> {
      return !!(await store.get(VAULT_PIN));
    },

    /** Seals the key with the PIN (and biometrics when asked), checks it opens, then drops nothing: the caller removes the plain key. */
    async seal(pin: string, dbKey: string, biometric: boolean): Promise<void> {
      await sealPin(pin, dbKey);
      if ((await openPin(pin)) !== dbKey) {
        throw new VaultError("The sealed key did not open", "BAD_VAULT");
      }
      if (biometric) await this.sealBiometric(dbKey);
      await store.remove(VAULT_FAILS).catch(() => {});
    },

    async sealBiometric(dbKey: string): Promise<boolean> {
      try {
        await store.set(VAULT_BIO, dbKey, { biometric: true });
        return true;
      } catch {
        // No biometrics on this phone: the PIN still opens it.
        await store.remove(VAULT_BIO).catch(() => {});
        return false;
      }
    },

    openPin,

    /** Shows the system biometric prompt. */
    async openBiometric(prompt: string): Promise<string> {
      let key: string | null = null;
      try {
        key = await store.get(VAULT_BIO, { biometric: true, prompt });
      } catch {
        key = null;
      }
      if (!key) {
        throw new VaultError(
          "Biometrics can't open the key",
          "BIO_UNAVAILABLE",
        );
      }
      return key;
    },

    async changePin(dbKey: string, newPin: string): Promise<void> {
      await sealPin(newPin, dbKey);
      if ((await openPin(newPin)) !== dbKey) {
        throw new VaultError("The sealed key did not open", "BAD_VAULT");
      }
    },

    /** Removes every sealed copy. The caller puts the plain key back first. */
    async clear(): Promise<void> {
      await store.remove(VAULT_BIO).catch(() => {});
      await store.remove(VAULT_PIN).catch(() => {});
      await store.remove(VAULT_PEPPER).catch(() => {});
      await store.remove(VAULT_FAILS).catch(() => {});
    },

    /** Failed PIN tries, kept across restarts so killing the app resets nothing. */
    async loadFails(): Promise<{ fails: number; until: number }> {
      try {
        const saved = JSON.parse((await store.get(VAULT_FAILS)) ?? "null");
        if (
          saved &&
          Number.isFinite(saved.fails) &&
          Number.isFinite(saved.until)
        ) {
          return { fails: saved.fails, until: saved.until };
        }
      } catch {
        // Treated as no failures; the next wrong PIN starts counting again.
      }
      return { fails: 0, until: 0 };
    },

    async saveFails(limit: { fails: number; until: number }): Promise<void> {
      await store.set(VAULT_FAILS, JSON.stringify(limit));
    },
  };
}

export type KeyVault = ReturnType<typeof createKeyVault>;
