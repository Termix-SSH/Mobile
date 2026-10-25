function load(extra: Record<string, unknown> | undefined) {
  jest.resetModules();
  jest.doMock("expo-constants", () => ({
    __esModule: true,
    default: { expoConfig: extra ? { extra } : {} },
  }));
  return require("@/core/distribution");
}

test("the normal build can scan QR codes", () => {
  const d = load(undefined);
  expect(d.isFdroid).toBe(false);
  expect(d.canScanQr).toBe(true);
});

test("the F-Droid build cannot scan QR codes", () => {
  const d = load({ distribution: "fdroid" });
  expect(d.isFdroid).toBe(true);
  expect(d.canScanQr).toBe(false);
});
