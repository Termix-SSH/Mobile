describe("deviceWord", () => {
  afterEach(() => jest.resetModules());

  function load(deviceType: number | null) {
    jest.doMock("expo-device", () => ({
      DeviceType: { PHONE: 1, TABLET: 2 },
      deviceType,
    }));
    return require("@/utils/device-word") as typeof import("@/utils/device-word");
  }

  it("says phone on a phone", () => {
    const { deviceWord, DeviceWord } = load(1);
    expect(deviceWord).toBe("phone");
    expect(DeviceWord).toBe("Phone");
  });

  it("says tablet on an iPad or tablet", () => {
    const { deviceWord, DeviceWord } = load(2);
    expect(deviceWord).toBe("tablet");
    expect(DeviceWord).toBe("Tablet");
  });

  it("falls back to phone when the type is unknown", () => {
    expect(load(null).deviceWord).toBe("phone");
  });
});
