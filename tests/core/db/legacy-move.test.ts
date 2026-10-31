import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";
import {
  BACKGROUND_FLAG,
  moveLegacyData,
  moveServerSecretsForBackground,
  MOVED_FLAG,
} from "@/core/db/legacy-move";
import { resetStorage } from "../../helpers/http";

beforeEach(async () => {
  await resetStorage();
  jest.clearAllMocks();
});

test("drops 1.x plain tokens and saves Keychain items as device only", async () => {
  await AsyncStorage.setItem("jwt", "old-token");
  await AsyncStorage.setItem("serverConfig", "{}");
  await AsyncStorage.setItem("termix-theme", "dark");
  await SecureStore.setItemAsync("appLockPin", "1234");
  await SecureStore.setItemAsync("acct.a1.session", "tok");

  expect(await moveLegacyData({ accountIds: ["local", "a1"] })).toBe(true);

  expect(await AsyncStorage.getItem("jwt")).toBeNull();
  expect(await AsyncStorage.getItem("serverConfig")).toBeNull();
  expect(await AsyncStorage.getItem("termix-theme")).toBe("dark");
  expect(await SecureStore.getItemAsync("appLockPin")).toBe("1234");
  expect(await SecureStore.getItemAsync("acct.a1.session")).toBe("tok");

  const deviceOnly = {
    keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  };
  expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith("appLockPin");
  expect(SecureStore.setItemAsync).toHaveBeenCalledWith(
    "appLockPin",
    "1234",
    deviceOnly,
  );
  // A linked server stays readable for background sync.
  expect(SecureStore.setItemAsync).toHaveBeenLastCalledWith(
    "acct.a1.session",
    "tok",
    { keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY },
  );
  expect(await AsyncStorage.getItem(MOVED_FLAG)).toBe("1");
  expect(await AsyncStorage.getItem(BACKGROUND_FLAG)).toBe("1");
});

test("runs only once", async () => {
  await moveLegacyData({ accountIds: [] });
  await AsyncStorage.setItem("jwt", "came back");
  expect(await moveLegacyData({ accountIds: [] })).toBe(false);
  expect(await AsyncStorage.getItem("jwt")).toBe("came back");
});

test("moves linked server secrets and keys for background sync once", async () => {
  await SecureStore.setItemAsync("acct.a1.session", "tok");
  await SecureStore.setItemAsync("db.key.a1", "k".repeat(64));
  await SecureStore.setItemAsync("acct.local.session", "x");
  jest.clearAllMocks();

  expect(
    await moveServerSecretsForBackground({ accountIds: ["local", "a1"] }),
  ).toBe(true);

  const after = {
    keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
  };
  expect(SecureStore.setItemAsync).toHaveBeenCalledWith(
    "acct.a1.session",
    "tok",
    after,
  );
  expect(SecureStore.setItemAsync).toHaveBeenCalledWith(
    "db.key.a1",
    "k".repeat(64),
    after,
  );
  expect(SecureStore.setItemAsync).not.toHaveBeenCalledWith(
    "acct.local.session",
    expect.anything(),
    expect.anything(),
  );
  expect(await SecureStore.getItemAsync("acct.a1.session")).toBe("tok");
  expect(await moveServerSecretsForBackground({ accountIds: ["a1"] })).toBe(
    false,
  );
});
