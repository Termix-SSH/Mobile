import { serverAddress } from "@/screens/settings/controls/PushControls";

test("servers show their address, not the shared Termix name", () => {
  const account = (serverUrl: string) =>
    ({ id: "a", kind: "server", serverUrl, serverName: "Termix" }) as never;
  expect(serverAddress(account("http://100.117.24.100:2100"))).toBe(
    "100.117.24.100:2100",
  );
  expect(serverAddress(account("https://termix.example.com/"))).toBe(
    "termix.example.com",
  );
});
