import { apiFit, fitMessage, PLUGIN_HOST_API } from "@/core/plugins/compat";

test("the app's plugin API is a plain version", () => {
  expect(PLUGIN_HOST_API).toMatch(/^\d+\.\d+\.\d+$/);
});

test("web view plugins must take the app's own API version", () => {
  expect(apiFit("^1.13", "webview", "1.13.0")).toBe("ok");
  expect(apiFit("^1.5.0", "webview", "1.13.0")).toBe("ok");
  expect(apiFit(">=1.2 <3", "webview", "1.13.0")).toBe("ok");
  expect(apiFit("^1.14", "webview", "1.13.0")).toBe("update-app");
  expect(apiFit("^2.0.0", "webview", "1.13.0")).toBe("update-app");
  expect(apiFit("^1.0.0", "webview", "2.1.0")).toBe("update-plugin");
  expect(apiFit("1.12.0", "webview", "1.13.0")).toBe("update-plugin");
});

test("the app's own screens only care about the major", () => {
  expect(apiFit("^1.14", "native", "1.13.0")).toBe("ok");
  expect(apiFit("^2.0", "native", "1.13.0")).toBe("update-app");
  expect(apiFit("^1.0", "native", "2.0.0")).toBe("update-plugin");
});

test("a missing or broken range never blocks", () => {
  expect(apiFit(undefined, "webview", "1.13.0")).toBe("ok");
  expect(apiFit("not a range", "webview", "1.13.0")).toBe("ok");
});

test("fitMessage names the thing to update", () => {
  expect(fitMessage("ok", "Alerts")).toBeNull();
  expect(fitMessage("update-app", "Alerts")?.title).toBe("Update the app");
  expect(fitMessage("update-plugin", "Alerts")?.hint).toMatch(/Alerts/);
});
