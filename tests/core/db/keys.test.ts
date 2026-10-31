import * as SecureStore from "expo-secure-store";
import { deleteDbKey, getDbKey } from "@/core/db/keys";
import { resetStorage } from "../../helpers/http";

beforeEach(resetStorage);

test("a key is made once per account and kept on this device only", async () => {
  const a = await getDbKey("local");
  expect(a).toMatch(/^[0-9a-f]{64}$/);
  expect(await getDbKey("local")).toBe(a);
  expect(await getDbKey("other")).not.toBe(a);
  expect(SecureStore.setItemAsync).toHaveBeenCalledWith("db.key.local", a, {
    keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  });
});

test("deleting a key makes a new one next time", async () => {
  const a = await getDbKey("local");
  await deleteDbKey("local");
  expect(await getDbKey("local")).not.toBe(a);
});

test("a linked server's key is readable after the first unlock", async () => {
  const key = await getDbKey("acct1");
  expect(SecureStore.setItemAsync).toHaveBeenCalledWith("db.key.acct1", key, {
    keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
  });
});
