type Mod = typeof import("@/modules/termix-session-service");

function load(native: unknown): Mod {
  let mod: Mod | undefined;
  jest.isolateModules(() => {
    jest.doMock("expo-modules-core", () => ({
      requireOptionalNativeModule: () => native,
    }));
    mod = require("@/modules/termix-session-service");
  });
  return mod!;
}

afterEach(() => jest.dontMock("expo-modules-core"));

test("without the module every call is safe and does nothing", () => {
  const m = load(null);
  expect(m.isSessionServiceAvailable).toBe(false);
  expect(
    m.showSessionService({
      title: "t",
      lines: [],
      actionLabel: "a",
      channelName: "c",
    }),
  ).toBe(false);
  expect(m.isSessionServiceRunning()).toBe(false);
  expect(m.notificationsEnabled()).toBe(true);
  expect(m.ignoresBatteryOptimizations()).toBe(true);
  expect(m.openBatteryOptimizationSettings()).toBe(false);
  expect(m.openNotificationSettings()).toBe(false);
  m.hideSessionService();
  m.beginGrace();
  m.endGrace();
  const stop = m.addDisconnectAllListener(() => {});
  stop();
});

test("calls reach the native module and errors don't escape", async () => {
  const remove = jest.fn();
  let listener: (() => void) | null = null;
  const native = {
    isSupported: true,
    show: jest.fn(() => true),
    hide: jest.fn(),
    isRunning: jest.fn(() => true),
    notificationsEnabled: jest.fn(() => false),
    ignoresBatteryOptimizations: jest.fn(() => {
      throw new Error("boom");
    }),
    openBatteryOptimizationSettings: jest.fn(() => true),
    openNotificationSettings: jest.fn(() => true),
    beginGrace: jest.fn(async () => {}),
    endGrace: jest.fn(async () => {
      throw new Error("x");
    }),
    addListener: jest.fn((_e: string, cb: () => void) => {
      listener = cb;
      return { remove };
    }),
  };
  const m = load(native);
  expect(m.isSessionServiceAvailable).toBe(true);
  expect(
    m.showSessionService({
      title: "2 sessions open",
      lines: ["a | Connected"],
      actionLabel: "Disconnect all",
      channelName: "Sessions",
    }),
  ).toBe(true);
  expect(native.show).toHaveBeenCalledWith(
    "2 sessions open",
    ["a | Connected"],
    "Disconnect all",
    "Sessions",
  );
  expect(m.isSessionServiceRunning()).toBe(true);
  expect(m.notificationsEnabled()).toBe(false);
  expect(m.ignoresBatteryOptimizations()).toBe(true);
  expect(m.openBatteryOptimizationSettings()).toBe(true);
  m.beginGrace();
  m.endGrace();
  await Promise.resolve();
  expect(native.beginGrace).toHaveBeenCalled();

  const cb = jest.fn();
  const stop = m.addDisconnectAllListener(cb);
  listener!();
  expect(cb).toHaveBeenCalled();
  stop();
  expect(remove).toHaveBeenCalled();

  native.show.mockImplementationOnce(() => {
    throw new Error("not allowed");
  });
  expect(
    m.showSessionService({
      title: "t",
      lines: [],
      actionLabel: "a",
      channelName: "c",
    }),
  ).toBe(false);
});
