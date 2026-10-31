import * as Network from "expo-network";
import {
  broadcastFor,
  hostBroadcast,
  magicPacket,
  parseMac,
  toBase64,
  wakeFromDevice,
  WakeError,
} from "@/core/wol";
import { clearFakeNet, fakeNet } from "../../helpers/net";

jest.mock("expo-network", () => ({ getIpAddressAsync: jest.fn() }));

afterEach(clearFakeNet);

test("parseMac takes the common spellings and rejects the rest", () => {
  const want = [0, 0x1a, 0x2b, 0x3c, 0x4d, 0x5e];
  expect(parseMac("00:1A:2B:3C:4D:5E")).toEqual(want);
  expect(parseMac("00-1a-2b-3c-4d-5e")).toEqual(want);
  expect(parseMac("001a.2b3c.4d5e")).toEqual(want);
  expect(parseMac(" 001A2B3C4D5E ")).toEqual(want);
  expect(parseMac("00:1A:2B:3C:4D")).toBeNull();
  expect(parseMac("zz:1A:2B:3C:4D:5E")).toBeNull();
  expect(parseMac(undefined)).toBeNull();
});

test("the magic packet is six FF bytes and sixteen MACs", () => {
  const mac = [1, 2, 3, 4, 5, 6];
  const p = magicPacket(mac);
  expect(p).toHaveLength(102);
  expect(p.slice(0, 6)).toEqual([255, 255, 255, 255, 255, 255]);
  expect(p.slice(6, 12)).toEqual(mac);
  expect(p.slice(96)).toEqual(mac);
  expect(toBase64([255, 0, 1])).toBe("/wAB");
});

test("broadcast address from the phone ip", () => {
  expect(broadcastFor("192.168.1.42")).toBe("192.168.1.255");
  expect(broadcastFor("10.4.7.9")).toBe("10.4.7.255");
  expect(broadcastFor("172.20.3.4")).toBe("172.20.3.255");
  expect(broadcastFor("172.40.3.4")).toBeNull();
  expect(broadcastFor("8.8.8.8")).toBeNull();
  expect(broadcastFor("192.168.1.42", "255.255.0.0")).toBe("192.168.255.255");
  expect(broadcastFor("192.168.1.42", "255.255.255.128")).toBe("192.168.1.127");
  expect(broadcastFor(null)).toBeNull();
  expect(broadcastFor("nope")).toBeNull();
});

test("a host's own broadcast address wins when it is valid", () => {
  const set = (v: unknown) => ({
    pluginSettings: { "wake-on-lan": { broadcastAddress: v } },
  });
  expect(hostBroadcast(set(" 192.168.5.255 "))).toBe("192.168.5.255");
  expect(hostBroadcast(set("not an ip"))).toBeNull();
  expect(hostBroadcast({})).toBeNull();
});

test("wakeFromDevice sends to the subnet and the limited broadcast", async () => {
  const net = fakeNet();
  net.tcpProbe = jest.fn();
  net.udpSend = jest.fn().mockResolvedValue(undefined);
  (Network.getIpAddressAsync as jest.Mock).mockResolvedValue("192.168.1.42");
  await wakeFromDevice({ macAddress: "00:11:22:33:44:55" });
  const calls = (net.udpSend as jest.Mock).mock.calls;
  expect(calls.map((c) => c[0])).toEqual(["192.168.1.255", "255.255.255.255"]);
  expect(calls[0][1]).toBe(9);
  expect(calls[0][2]).toBe(
    toBase64(magicPacket([0, 0x11, 0x22, 0x33, 0x44, 0x55])),
  );
});

test("a host broadcast replaces the guessed subnet", async () => {
  const net = fakeNet();
  net.tcpProbe = jest.fn();
  net.udpSend = jest.fn().mockResolvedValue(undefined);
  (Network.getIpAddressAsync as jest.Mock).mockResolvedValue("192.168.1.42");
  await wakeFromDevice({
    macAddress: "00:11:22:33:44:55",
    pluginSettings: { "wake-on-lan": { broadcastAddress: "10.0.0.255" } },
  });
  expect((net.udpSend as jest.Mock).mock.calls.map((c) => c[0])).toEqual([
    "10.0.0.255",
    "255.255.255.255",
  ]);
});

test("one failing target is fine, all failing is an error", async () => {
  const net = fakeNet();
  net.tcpProbe = jest.fn();
  net.udpSend = jest
    .fn()
    .mockRejectedValueOnce(new Error("no route"))
    .mockResolvedValueOnce(undefined);
  (Network.getIpAddressAsync as jest.Mock).mockResolvedValue("192.168.1.42");
  await expect(
    wakeFromDevice({ macAddress: "00:11:22:33:44:55" }),
  ).resolves.toBeUndefined();

  net.udpSend = jest.fn().mockRejectedValue(new Error("no route"));
  await expect(
    wakeFromDevice({ macAddress: "00:11:22:33:44:55" }),
  ).rejects.toThrow("no route");
});

test("bad mac and missing module give plain errors", async () => {
  await expect(wakeFromDevice({ macAddress: "x" })).rejects.toThrow(WakeError);
  await expect(
    wakeFromDevice({ macAddress: "00:11:22:33:44:55" }),
  ).rejects.toThrow("can't send Wake-on-LAN");
});
