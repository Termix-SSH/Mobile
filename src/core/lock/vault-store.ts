import * as Crypto from "expo-crypto";
import * as SecureStore from "expo-secure-store";
import { DEVICE_ONLY } from "@/core/storage/kv";
import {
  createKeyVault,
  type VaultItemOptions,
  type VaultStore,
} from "./key-vault";

function optionsFor(item?: VaultItemOptions): SecureStore.SecureStoreOptions {
  if (!item?.biometric) return DEVICE_ONLY;
  return {
    ...DEVICE_ONLY,
    requireAuthentication: true,
    authenticationPrompt: item.prompt,
  };
}

const store: VaultStore = {
  get: (key, item) => SecureStore.getItemAsync(key, optionsFor(item)),
  set: (key, value, item) =>
    SecureStore.setItemAsync(key, value, optionsFor(item)),
  remove: (key, item) => SecureStore.deleteItemAsync(key, optionsFor(item)),
};

/** The vault on the phone's Keychain or Keystore. */
export const keyVault = createKeyVault(store, {
  random: (bytes) => Crypto.getRandomBytes(bytes),
});
