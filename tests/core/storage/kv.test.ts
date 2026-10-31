import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";
import { accountStorage } from "@/core/storage/kv";
import { resetStorage } from "../../helpers/http";

beforeEach(resetStorage);

test("each account reads only its own keys", async () => {
  const a = accountStorage("a");
  const b = accountStorage("b");
  await a.data.setJson("list", [1]);
  await b.data.setJson("list", [2]);
  expect(await a.data.getJson("list")).toEqual([1]);
  expect(await b.data.getJson("list")).toEqual([2]);
});

test("secrets go to device only secure storage, never to plain storage", async () => {
  await accountStorage("local").secrets.set("session", "tok");
  expect(SecureStore.setItemAsync).toHaveBeenCalledWith(
    "acct.local.session",
    "tok",
    { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY },
  );
  expect(await AsyncStorage.getAllKeys()).toEqual([]);
});

test("a linked server's secrets stay readable for background sync", async () => {
  await accountStorage("a").secrets.set("session", "tok");
  expect(SecureStore.setItemAsync).toHaveBeenCalledWith(
    "acct.a.session",
    "tok",
    { keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY },
  );
  expect(await AsyncStorage.getAllKeys()).toEqual([]);
});

test("wipe removes the keys it is given", async () => {
  const a = accountStorage("a");
  await a.data.set("x", "1");
  await a.secrets.set("y", "2");
  await a.wipe({ data: ["x"], secrets: ["y"] });
  expect(await a.data.get("x")).toBeNull();
  expect(await a.secrets.get("y")).toBeNull();
});

test("bad JSON reads as nothing", async () => {
  await AsyncStorage.setItem("acct.a.broken", "{");
  expect(await accountStorage("a").data.getJson("broken")).toBeNull();
});
