import {
  importClientCert,
  isLanAvailable,
  isNetAvailable,
  NativeSocket,
  nativeStream,
  peekServerKey,
  setServerPins,
  tcpProbe,
  udpSend,
} from "@/modules/termix-net";
import { clearFakeNet, fakeNet } from "../../helpers/net";

afterEach(clearFakeNet);

test("without the module nothing is available and imports say why", async () => {
  clearFakeNet();
  expect(isNetAvailable()).toBe(false);
  expect(() => importClientCert("a", "h", "x", "y")).toThrow(
    "This build can't use client certificates.",
  );
});

test("a native socket acts like a WebSocket", () => {
  const net = fakeNet({ nativeRequests: true });
  const socket = new NativeSocket("wss://h/x", ["termix.jwt.t"], { A: "1" });
  const [id, url, protocols, headers] = (net.openSocket as jest.Mock).mock
    .calls[0];
  expect([url, protocols, headers]).toEqual([
    "wss://h/x",
    ["termix.jwt.t"],
    { A: "1" },
  ]);

  const events: string[] = [];
  socket.onopen = () => events.push("open");
  socket.onmessage = (e) => events.push(`msg:${e.data}`);
  socket.onclose = (e) => events.push(`close:${e.code}`);

  socket.send("early");
  expect(net.sendSocket).not.toHaveBeenCalled();
  net.emit("onSocket", { id, type: "open", protocol: "termix.jwt.t" });
  expect(socket.readyState).toBe(NativeSocket.OPEN);
  socket.send("hi");
  expect(net.sendSocket).toHaveBeenCalledWith(id, "hi", null);
  net.emit("onSocket", { id, type: "message", data: "out", binary: false });
  net.emit("onSocket", { id: "other", type: "message", data: "no" });
  socket.close();
  expect(net.closeSocket).toHaveBeenCalledWith(id, 1000, "");
  net.emit("onSocket", { id, type: "close", code: 1000, reason: "" });
  expect(events).toEqual(["open", "msg:out", "close:1000"]);
  expect(socket.readyState).toBe(NativeSocket.CLOSED);
});

test("a native stream passes chunks and ends once", () => {
  const net = fakeNet({ nativeRequests: true });
  const chunks: string[] = [];
  const ends: (string | undefined)[] = [];
  const stop = nativeStream(
    { url: "https://h/events", headers: { A: "1" } },
    { onData: (c) => chunks.push(c), onEnd: (e) => ends.push(e) },
  );
  const [id, request] = (net.startStream as jest.Mock).mock.calls[0];
  expect(request).toMatchObject({ url: "https://h/events", method: "GET" });
  net.emit("onStream", { id, type: "data", chunk: "event: ready\n\n" });
  net.emit("onStream", { id, type: "error", message: "lost" });
  net.emit("onStream", { id, type: "data", chunk: "late" });
  expect(chunks).toEqual(["event: ready\n\n"]);
  expect(ends).toEqual(["lost"]);
  stop();
  expect(net.cancelStream).not.toHaveBeenCalled();
});

test("local network helpers need the native module", async () => {
  clearFakeNet();
  expect(isLanAvailable()).toBe(false);
  await expect(tcpProbe("h", 22)).rejects.toThrow("can't check ports");
  expect(() => udpSend("255.255.255.255", 9, "AA==")).toThrow("can't send UDP");
});

test("tcpProbe and udpSend call the module", async () => {
  const net = fakeNet();
  net.tcpProbe = jest.fn().mockResolvedValueOnce(true).mockRejectedValue("x");
  net.udpSend = jest.fn().mockResolvedValue(undefined);
  expect(isLanAvailable()).toBe(true);
  expect(await tcpProbe("h", 22, 1000)).toBe(true);
  expect(net.tcpProbe).toHaveBeenCalledWith("h", 22, 1000);
  expect(await tcpProbe("h", 22)).toBe(false);
  await udpSend("10.0.0.255", 9, "AA==");
  expect(net.udpSend).toHaveBeenCalledWith("10.0.0.255", 9, "AA==");
});

test("pins go to the native store and a server key can be read", async () => {
  const net = fakeNet();
  const pin = "P".repeat(43) + "=";
  await setServerPins("t.example", [pin]);
  expect(net.pins.get("t.example")).toEqual([pin]);
  await setServerPins("t.example", []);
  expect(net.pins.has("t.example")).toBe(false);
  await expect(peekServerKey("t.example", 443)).resolves.toMatchObject({
    pin: net.serverKey,
  });
});

test("without the module, pins do nothing and reading a key says why", async () => {
  clearFakeNet();
  await expect(setServerPins("t.example", ["x"])).resolves.toBeUndefined();
  expect(() => peekServerKey("t.example", 443)).toThrow(
    "This build can't use client certificates.",
  );
});
