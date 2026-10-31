import {
  networkChanged,
  sampleFrom,
  SessionLifecycle,
} from "@/core/sessions/lifecycle";

const mockNetListeners: ((e: any) => void)[] = [];
const mockPowerListeners: ((e: any) => void)[] = [];
const mockIp = jest.fn(async () => "192.168.1.5");

jest.mock("expo-network", () => ({
  addNetworkStateListener: (l: (e: any) => void) => {
    mockNetListeners.push(l);
    return { remove: jest.fn() };
  },
  getNetworkStateAsync: jest.fn(async () => ({
    type: "WIFI",
    isConnected: true,
  })),
  getIpAddressAsync: () => mockIp(),
}));
jest.mock("expo-battery", () => ({
  addLowPowerModeListener: (l: (e: any) => void) => {
    mockPowerListeners.push(l);
    return { remove: jest.fn() };
  },
  isLowPowerModeEnabledAsync: jest.fn(async () => false),
}));

const flush = () => new Promise((r) => setTimeout(r, 0));

describe("network samples", () => {
  test("types read plainly and VPN is noticed", () => {
    expect(
      sampleFrom({ type: "CELLULAR", isConnected: true }, "10.0.0.2"),
    ).toEqual({
      connected: true,
      type: "mobile data",
      vpn: false,
      ip: "10.0.0.2",
    });
    expect(
      sampleFrom({ type: "VPN", isConnected: true }, "0.0.0.0"),
    ).toMatchObject({ vpn: true, ip: null });
    expect(sampleFrom({ type: "NONE", isConnected: true })).toMatchObject({
      connected: false,
    });
  });

  test("a change is a new way out, not just a repeat", () => {
    const wifi = { connected: true, type: "Wi-Fi", vpn: false, ip: "1.1.1.1" };
    expect(networkChanged(null, wifi)).toBe(false);
    expect(networkChanged(wifi, { ...wifi })).toBe(false);
    expect(networkChanged(wifi, { ...wifi, type: "mobile data" })).toBe(true);
    expect(networkChanged(wifi, { ...wifi, vpn: true })).toBe(true);
    expect(networkChanged(wifi, { ...wifi, ip: "2.2.2.2" })).toBe(true);
    expect(networkChanged(wifi, { ...wifi, ip: null })).toBe(false);
    expect(networkChanged(wifi, { ...wifi, connected: false })).toBe(true);
    const off = { ...wifi, connected: false };
    expect(networkChanged(off, { ...off, type: "x" })).toBe(false);
  });
});

describe("SessionLifecycle", () => {
  test("tells targets about trips away, but not a pulled down shade", () => {
    const life = new SessionLifecycle();
    const target = {
      notifyBackgrounded: jest.fn(),
      notifyForegrounded: jest.fn(),
    };
    const stop = life.register(target);
    life.onAppState("inactive");
    life.onAppState("active");
    expect(target.notifyBackgrounded).not.toHaveBeenCalled();
    expect(target.notifyForegrounded).not.toHaveBeenCalled();
    life.onAppState("inactive");
    life.onAppState("background");
    expect(life.isActive).toBe(false);
    life.onAppState("background");
    life.onAppState("active");
    expect(target.notifyBackgrounded).toHaveBeenCalledTimes(1);
    expect(target.notifyForegrounded).toHaveBeenCalledTimes(1);
    stop();
    life.onAppState("background");
    expect(target.notifyBackgrounded).toHaveBeenCalledTimes(1);
  });

  test("network and low power reach targets, and new targets get the current state", async () => {
    const life = new SessionLifecycle();
    const target = { notifyNetworkChanged: jest.fn(), setLowPower: jest.fn() };
    const watcher = jest.fn();
    life.register(target);
    life.watch(watcher);

    await life.onNetwork({ type: "WIFI", isConnected: true });
    expect(target.notifyNetworkChanged).toHaveBeenLastCalledWith({
      connected: true,
      type: "Wi-Fi",
      vpn: false,
      changed: false,
    });
    await life.onNetwork({ type: "WIFI", isConnected: true });
    expect(target.notifyNetworkChanged).toHaveBeenCalledTimes(1);
    await life.onNetwork({ type: "CELLULAR", isConnected: true });
    expect(target.notifyNetworkChanged).toHaveBeenLastCalledWith(
      expect.objectContaining({ type: "mobile data", changed: true }),
    );

    life.onLowPower(true);
    life.onLowPower(true);
    expect(target.setLowPower).toHaveBeenCalledTimes(1);
    expect(watcher).toHaveBeenCalledTimes(3);

    const late = { notifyNetworkChanged: jest.fn(), setLowPower: jest.fn() };
    life.register(late);
    expect(late.notifyNetworkChanged).toHaveBeenCalledWith(
      expect.objectContaining({ type: "mobile data", changed: false }),
    );
    expect(late.setLowPower).toHaveBeenCalledWith(true);
  });

  test("start listens once to the network and power modules", async () => {
    const life = new SessionLifecycle();
    life.start();
    life.start();
    expect(mockNetListeners).toHaveLength(1);
    expect(mockPowerListeners).toHaveLength(1);
    await flush();
    expect(life.network).toMatchObject({ type: "Wi-Fi", ip: "192.168.1.5" });
    mockPowerListeners[0]({ lowPowerMode: true });
    expect(life.isLowPower).toBe(true);
    life.stop();
  });
});
