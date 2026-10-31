import {
  filterTailscaleDevices,
  parseTailscaleDevicesResponse,
  tailnetAddress,
  tailscaleHostDraft,
} from "@/features/tailscale/tailscale";

const device = {
  id: "device-1",
  hostname: "build-server",
  name: "build-server.example.ts.net",
  addresses: ["fd7a:115c:a1e0::1", "100.76.12.1"],
  os: "linux",
  lastSeen: "2026-10-20T12:00:00Z",
};

test("address selection prefers the first Tailscale IPv4 address", () => {
  expect(tailnetAddress(device)).toBe("100.76.12.1");
  expect(
    tailnetAddress({ ...device, addresses: ["100.76.12.2", "100.76.12.3"] }),
  ).toBe("100.76.12.2");
  expect(tailnetAddress({ ...device, addresses: ["fd7a:115c:a1e0::1"] })).toBe(
    "fd7a:115c:a1e0::1",
  );
  expect(tailnetAddress({ ...device, addresses: [] })).toBe("");
});

test("device filtering searches hostname, name, OS, and every address", () => {
  const devices = [device, { ...device, id: "device-2", hostname: "laptop" }];
  for (const query of [
    " BUILD-SERVER ",
    "EXAMPLE.TS.NET",
    "LiNuX",
    "76.12",
    "FD7A",
  ]) {
    expect(filterTailscaleDevices(devices, query).length).toBeGreaterThan(0);
  }
  expect(filterTailscaleDevices(devices, "laptop").map((d) => d.id)).toEqual([
    "device-2",
  ]);
  expect(filterTailscaleDevices(devices, "missing")).toHaveLength(0);
  expect(filterTailscaleDevices(devices, " \n ")).toBe(devices);
});

test("a host draft uses Tailscale SSH and includes no secrets", () => {
  expect(tailscaleHostDraft(device, "  alice  ")).toEqual({
    name: "build-server",
    ip: "100.76.12.1",
    port: 22,
    username: "alice",
    authType: "tailscale",
  });
  const draft = tailscaleHostDraft(
    { ...device, hostname: "", password: "secret", apiKey: "secret" } as any,
    " \t ",
  );
  expect(draft.name).toBe(device.name);
  expect(draft.username).toBe("root");
  expect(Object.keys(draft).sort()).toEqual([
    "authType",
    "ip",
    "name",
    "port",
    "username",
  ]);
});

test("successful responses normalize devices and strip unrelated fields", () => {
  expect(
    parseTailscaleDevicesResponse({
      devices: [{ ...device, apiKey: "secret" }],
      hasApiKey: true,
      apiKey: "secret",
    }),
  ).toEqual({ devices: [device], hasApiKey: true });
  expect(
    parseTailscaleDevicesResponse({
      devices: [
        null,
        "bad",
        {},
        { id: "partial", addresses: ["100.1.2.3", 42, null], lastSeen: null },
      ],
      hasApiKey: true,
    }),
  ).toEqual({
    devices: [
      {
        id: "partial",
        name: "",
        hostname: "",
        addresses: ["100.1.2.3"],
        os: "",
        lastSeen: "",
      },
    ],
    hasApiKey: true,
  });
});

test("API-key and upstream error response bodies retain their actionable error", () => {
  for (const body of [
    { devices: [], hasApiKey: false },
    { devices: [], hasApiKey: true, error: "Invalid API key" },
    { devices: [], hasApiKey: true, error: "Tailscale API unavailable" },
    {
      devices: [],
      hasApiKey: false,
      error: "Unable to read Tailscale configuration",
    },
  ]) {
    expect(parseTailscaleDevicesResponse(body)).toEqual(body);
  }
});

test("unknown response shapes are rejected", () => {
  for (const body of [
    null,
    undefined,
    [],
    "offline",
    {},
    { devices: [] },
    { devices: [], hasApiKey: "true" },
    { devices: null, hasApiKey: true },
    { devices: [], hasApiKey: true, error: { message: "failed" } },
  ]) {
    expect(parseTailscaleDevicesResponse(body)).toBeNull();
  }
});
