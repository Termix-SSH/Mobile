import {
  REMOTE_DESKTOP_TAB,
  TELNET_TAB,
  telnetTabFor,
} from "@/features/remote-desktop/telnet";

const local = { kind: "local" } as never;
const relay = { kind: "relay" } as never;

test("telnet opens in the terminal when the phone can reach the host", () => {
  expect(telnetTabFor({ attempts: [local, relay] })).toBe(TELNET_TAB);
  expect(telnetTabFor({ attempts: [relay, local] })).toBe(REMOTE_DESKTOP_TAB);
  expect(telnetTabFor({ attempts: [relay] })).toBe(REMOTE_DESKTOP_TAB);
  // With no way at all the terminal tab says why.
  expect(telnetTabFor({ attempts: [], blocked: { reason: "x" } })).toBe(
    TELNET_TAB,
  );
});
