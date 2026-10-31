import { act, renderHook } from "@testing-library/react-native";
import { useLocalStatuses } from "@/core/status";
import { clearFakeNet, fakeNet } from "../../helpers/net";

jest.mock("@/core/sessions", () => ({
  sessionLifecycle: { isActive: true, watch: () => () => {} },
}));

afterEach(clearFakeNet);

const hosts = [{ id: 1, ip: "10.0.0.1", port: 22 }] as any;

test("does nothing when a server reports status", async () => {
  const net = fakeNet();
  net.tcpProbe = jest.fn().mockResolvedValue(true);
  net.udpSend = jest.fn();
  const { result } = await renderHook(() => useLocalStatuses(hosts, false));
  await act(async () => {});
  expect(net.tcpProbe).not.toHaveBeenCalled();
  expect(result.current).toEqual({});
});

test("does nothing in a build without the native module", async () => {
  const { result } = await renderHook(() => useLocalStatuses(hosts, true));
  await act(async () => {});
  expect(result.current).toEqual({});
});

test("probes and reports online", async () => {
  const net = fakeNet();
  net.tcpProbe = jest.fn().mockResolvedValue(true);
  net.udpSend = jest.fn();
  const { result, unmount } = await renderHook(() =>
    useLocalStatuses(hosts, true),
  );
  await act(async () => {});
  expect(net.tcpProbe).toHaveBeenCalledWith("10.0.0.1", 22, expect.any(Number));
  expect(result.current).toEqual({ 1: "online" });
  unmount();
});
