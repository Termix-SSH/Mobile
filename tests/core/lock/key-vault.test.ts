import { randomBytes } from "node:crypto";
import {
  VAULT_BIO,
  VAULT_FAILS,
  VAULT_PEPPER,
  VAULT_PIN,
  createKeyVault,
  type VaultItemOptions,
} from "@/core/lock/key-vault";

const KEY = "ab".repeat(32);
const FAST = { N: 2 ** 4, r: 8, p: 1 };

function fakeStore(options: { bio?: "ok" | "broken" | "none" } = {}) {
  const items = new Map<string, string>();
  const calls: [string, string, VaultItemOptions | undefined][] = [];
  return {
    items,
    calls,
    async get(key: string, item?: VaultItemOptions) {
      calls.push(["get", key, item]);
      if (item?.biometric && options.bio === "broken") {
        throw new Error("key permanently invalidated");
      }
      return items.get(key) ?? null;
    },
    async set(key: string, value: string, item?: VaultItemOptions) {
      calls.push(["set", key, item]);
      if (item?.biometric && options.bio === "none") {
        throw new Error("no biometrics");
      }
      items.set(key, value);
    },
    async remove(key: string) {
      items.delete(key);
    },
  };
}

const crypto = { random: (n: number) => new Uint8Array(randomBytes(n)) };

describe("key vault", () => {
  it("seals the key so only the PIN or biometrics open it", async () => {
    const store = fakeStore();
    const vault = createKeyVault(store, crypto, FAST);
    expect(await vault.active()).toBe(false);
    await vault.seal("2468", KEY, true);
    expect(await vault.active()).toBe(true);
    expect(store.items.get(VAULT_PIN)).not.toContain(KEY);
    expect(await vault.openPin("2468")).toBe(KEY);
    expect(await vault.openBiometric("Unlock")).toBe(KEY);
    // The biometric copy is written and read only with the biometric flag.
    const bioCalls = store.calls.filter(([, key]) => key === VAULT_BIO);
    expect(bioCalls.every(([, , item]) => item?.biometric)).toBe(true);
  });

  it("refuses a wrong PIN", async () => {
    const vault = createKeyVault(fakeStore(), crypto, FAST);
    await vault.seal("2468", KEY, false);
    await expect(vault.openPin("1357")).rejects.toMatchObject({
      code: "WRONG_PIN",
    });
  });

  it("does not open without the device secret", async () => {
    const store = fakeStore();
    const vault = createKeyVault(store, crypto, FAST);
    await vault.seal("2468", KEY, false);
    store.items.delete(VAULT_PEPPER);
    await expect(vault.openPin("2468")).rejects.toMatchObject({
      code: "BAD_VAULT",
    });
  });

  it("does not open when the device secret is a different one", async () => {
    const store = fakeStore();
    const vault = createKeyVault(store, crypto, FAST);
    await vault.seal("2468", KEY, false);
    store.items.set(
      VAULT_PEPPER,
      Buffer.from(randomBytes(32)).toString("base64"),
    );
    await expect(vault.openPin("2468")).rejects.toMatchObject({
      code: "WRONG_PIN",
    });
  });

  it("falls back to the PIN when biometrics changed or are missing", async () => {
    const broken = createKeyVault(fakeStore({ bio: "broken" }), crypto, FAST);
    await broken.seal("2468", KEY, true);
    await expect(broken.openBiometric("Unlock")).rejects.toMatchObject({
      code: "BIO_UNAVAILABLE",
    });
    expect(await broken.openPin("2468")).toBe(KEY);

    const none = createKeyVault(fakeStore({ bio: "none" }), crypto, FAST);
    await none.seal("2468", KEY, true);
    expect(await none.openPin("2468")).toBe(KEY);
  });

  it("changes the PIN without changing the key", async () => {
    const vault = createKeyVault(fakeStore(), crypto, FAST);
    await vault.seal("2468", KEY, false);
    await vault.changePin(KEY, "9999");
    expect(await vault.openPin("9999")).toBe(KEY);
    await expect(vault.openPin("2468")).rejects.toThrow();
  });

  it("keeps failed tries across restarts and clears everything", async () => {
    const store = fakeStore();
    const vault = createKeyVault(store, crypto, FAST);
    await vault.seal("2468", KEY, true);
    await vault.saveFails({ fails: 3, until: 0 });
    const again = createKeyVault(store, crypto, FAST);
    expect(await again.loadFails()).toEqual({ fails: 3, until: 0 });
    await again.clear();
    for (const key of [VAULT_PIN, VAULT_BIO, VAULT_PEPPER, VAULT_FAILS]) {
      expect(store.items.has(key)).toBe(false);
    }
    expect(await again.active()).toBe(false);
  });
});
