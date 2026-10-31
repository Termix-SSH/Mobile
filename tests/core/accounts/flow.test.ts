import AsyncStorage from "@react-native-async-storage/async-storage";
import { endFlow, startFlow, takeFlow } from "@/core/accounts/link/flow";
import { callbackUrlFor, parseCallback } from "@/core/accounts/link/login";
import recorded from "../../fixtures/oidc/callbacks.json";

beforeEach(async () => {
  await endFlow();
  await AsyncStorage.clear();
});

test("the server keeps the flow id in every answer", () => {
  expect(callbackUrlFor(recorded.flow)).toBe(recorded.appCallbackUrl);
  expect(recorded.sso.returnTo).toBe(recorded.appCallbackUrl);
  expect(recorded.sso.otherSchemeStatus).toBe(400);
  expect(parseCallback(recorded.redirects.success)).toEqual({
    kind: "token",
    token: "jwt-1",
    flow: recorded.flow,
  });
  expect(parseCallback(recorded.redirects.secondFactor)).toEqual({
    kind: "secondFactor",
    step: { tempToken: "pending-1", factors: ["totp"] },
    flow: recorded.flow,
  });
  expect(parseCallback(recorded.redirects.error)).toMatchObject({
    kind: "error",
    message: "No Termix account matches that sign in.",
    flow: recorded.flow,
  });
});

test("a callback signs in only for the open flow, and only once", async () => {
  const id = await startFlow();
  const link = `${callbackUrlFor(id)}?success=true&token=t`;
  expect(await takeFlow("someoneelse0000")).toBe(false);
  expect(await takeFlow(null)).toBe(false);
  expect(await takeFlow(parseCallback(link)!.flow!)).toBe(true);
  expect(await takeFlow(parseCallback(link)!.flow!)).toBe(false);
});

test("an old flow runs out", async () => {
  const id = await startFlow();
  expect(await takeFlow(id, Date.now() + 16 * 60 * 1000)).toBe(false);
});

test("servers before 2.9 send no id, which only a plain flow takes", async () => {
  await startFlow(true);
  expect(await takeFlow(null)).toBe(true);
});

test("the flow survives the app being closed while the browser is open", async () => {
  const id = await startFlow();
  const stored = await AsyncStorage.getItem("signInFlow");
  jest.resetModules();
  // A new process: fresh module state, same storage on disk.
  const store = require("@react-native-async-storage/async-storage");
  await (store.default ?? store).setItem("signInFlow", stored);
  const again = require("@/core/accounts/link/flow");
  expect(await again.takeFlow(id)).toBe(true);
});

test("links that only start like the callback are not ours", () => {
  expect(parseCallback("termix-mobile://oidc-callbackx?token=a")).toBeNull();
  expect(parseCallback("termix-mobile://oidc-callback/a?token=b")).toEqual({
    kind: "token",
    token: "b",
    flow: null,
  });
});
