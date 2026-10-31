import * as SecureStore from "expo-secure-store";
import { AccountClient } from "@/core/api/AccountClient";
import {
  biometricName,
  canSaveLogin,
  clearSavedLogin,
  hasSavedLogin,
  markOffered,
  readSavedLogin,
  saveLogin,
  shouldOfferSave,
} from "@/core/accounts/saved-login";
import { accountStorage } from "@/core/storage/kv";
import { resetStorage } from "../../helpers/http";

jest.mock("expo-local-authentication", () => ({
  AuthenticationType: { FINGERPRINT: 1, FACIAL_RECOGNITION: 2 },
  supportedAuthenticationTypesAsync: jest.fn(async () => [2]),
}));

const store = SecureStore as jest.Mocked<typeof SecureStore>;

beforeEach(async () => {
  await resetStorage();
  store.canUseBiometricAuthentication.mockReturnValue(true);
});

const client = (id = "s1") =>
  new AccountClient({
    accountId: id,
    serverUrl: "https://termix.example",
    storage: accountStorage(id),
  });

test("saves behind biometrics and reads it back", async () => {
  const c = client();
  expect(await hasSavedLogin(c)).toBe(false);
  await saveLogin(c, { username: "luke", password: "pw" });
  expect(await hasSavedLogin(c)).toBe(true);
  const options = store.setItemAsync.mock.calls.at(-1)![2];
  expect(options).toMatchObject({ requireAuthentication: true });
  expect(await readSavedLogin(c)).toEqual({ username: "luke", password: "pw" });
});

test("backing out of Face ID keeps the login, a dropped key clears it", async () => {
  const c = client();
  await saveLogin(c, { username: "luke", password: "pw" });
  store.getItemAsync.mockRejectedValueOnce(new Error("User canceled"));
  expect(await readSavedLogin(c)).toBeNull();
  expect(await hasSavedLogin(c)).toBe(true);
  store.getItemAsync.mockRejectedValueOnce(
    new Error("Key permanently invalidated"),
  );
  expect(await readSavedLogin(c)).toBeNull();
  expect(await hasSavedLogin(c)).toBe(false);
});

test("offered once per server, never with one saved or no biometrics", async () => {
  const c = client();
  expect(await shouldOfferSave(c)).toBe(true);
  await markOffered(c);
  expect(await shouldOfferSave(c)).toBe(false);
  const other = client("s2");
  await saveLogin(other, { username: "a", password: "b" });
  expect(await shouldOfferSave(other)).toBe(false);
  store.canUseBiometricAuthentication.mockReturnValue(false);
  expect(canSaveLogin()).toBe(false);
  expect(await shouldOfferSave(client("s3"))).toBe(false);
});

test("clear and unlinking the server both remove it", async () => {
  const c = client();
  await saveLogin(c, { username: "luke", password: "pw" });
  await clearSavedLogin(c);
  expect(await hasSavedLogin(c)).toBe(false);
  await saveLogin(c, { username: "luke", password: "pw" });
  await c.wipe();
  expect(await hasSavedLogin(c)).toBe(false);
  expect(await store.getItemAsync("acct.s1.savedLogin")).toBeNull();
});

test("names the biometrics the way the phone does", async () => {
  expect(await biometricName()).toBe("Face ID");
});
