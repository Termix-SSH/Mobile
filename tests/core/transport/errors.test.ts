import { AppError } from "@/core/errors";
import {
  failureTitle,
  fromError,
  fromRelayMessage,
  hintFor,
  isTailnetAddress,
  type FailureStage,
} from "@/core/transport/errors";
import { SshError, type SshErrorKind } from "@/modules/termix-ssh";

test("every engine error kind maps to a stage with a hint", () => {
  const expected: Record<SshErrorKind, FailureStage> = {
    connect: "network",
    timeout: "network",
    io: "network",
    hostKeyRejected: "hostKey",
    passphraseRequired: "auth",
    badPassphrase: "auth",
    invalidKey: "auth",
    auth: "auth",
    authMethodNotAvailable: "auth",
    authCancelled: "cancelled",
    cancelled: "cancelled",
    channel: "session",
    sftp: "session",
    disconnected: "session",
    unavailable: "unavailable",
  };
  for (const [kind, stage] of Object.entries(expected)) {
    const f = fromError(new SshError(kind as SshErrorKind, "boom"));
    expect([kind, f.stage]).toEqual([kind, stage]);
    expect(f.message).toBe("boom");
    expect(f.hint.length).toBeGreaterThan(0);
  }
});

test("proxy trouble is told apart from an unreachable host", () => {
  expect(
    fromError(new SshError("connect", "SOCKS5 proxy refused the connection"))
      .stage,
  ).toBe("proxy");
});

test("a key that can't be read says to paste it again", () => {
  expect(fromError(new SshError("invalidKey", "bad")).hint).toMatch(
    /Paste it again/,
  );
});

test("app errors keep their meaning", () => {
  expect(
    fromError(new AppError("no engine", "TRANSPORT_UNAVAILABLE")),
  ).toMatchObject({ stage: "unavailable", message: "no engine" });
  expect(
    fromError(new AppError("needs server", "AUTH_NEEDS_SERVER")),
  ).toMatchObject({
    stage: "unavailable",
    hint: expect.stringMatching(/server/),
  });
  expect(fromError(new AppError("gone", "JUMP_HOST_MISSING")).hint).toMatch(
    /jump hosts/,
  );
  expect(fromError("weird").stage).toBe("network");
});

test("relay messages map to what went wrong", () => {
  const cases: [string, FailureStage][] = [
    ["Signed out of this server. Log in again.", "server"],
    ["No server URL found. Link the server again.", "server"],
    ["Authentication failed: Permission denied", "auth"],
    ["Host key changed but no handler is registered", "hostKey"],
    ["Connection timeout - server not responding", "server"],
    ["Maximum reconnection attempts reached", "server"],
    ["SSH connection failed: connect ECONNREFUSED 10.0.0.5:22", "network"],
    ["getaddrinfo ENOTFOUND box.lan", "network"],
    ["SOCKS proxy: connect ETIMEDOUT", "proxy"],
    ["This host needs a sign-in that only the web app supports", "unavailable"],
    ["Connection closed", "session"],
    ["something odd", "server"],
  ];
  for (const [message, stage] of cases) {
    expect([message, fromRelayMessage(message).stage]).toEqual([
      message,
      stage,
    ]);
  }
});

test("hints change with the way it was tried", () => {
  expect(hintFor("network", "local")).toMatch(/this phone/);
  expect(hintFor("network", "relay")).toMatch(/the server/);
  expect(failureTitle("auth")).toBe("The login was refused");
});

test("Tailscale addresses are spotted", () => {
  for (const a of [
    "100.64.0.1",
    "100.78.68.100",
    "100.127.255.254",
    "box.tail1234.ts.net",
    "fd7a:115c:a1e0::1",
  ])
    expect([a, isTailnetAddress(a)]).toEqual([a, true]);
  for (const a of ["100.63.0.1", "100.128.0.1", "10.0.0.5", "example.net"])
    expect([a, isTailnetAddress(a)]).toEqual([a, false]);
});
