import { pickRoute } from "@/features/remote-desktop/route";

const local = {
  kind: "local",
  provides: ["shell", "tcp"],
  openDisplay: jest.fn(),
} as never;
const oldLocal = { kind: "local", provides: ["shell", "tcp"] } as never;
const relay = { kind: "relay", provides: ["shell", "guacd"] } as never;
const plan = { origin: "auto" as const, attempts: [] };
const both = ["vnc", "rdp"] as const;

test("the phone goes first when it can dial the protocol", () => {
  const route = pickRoute({ plan, attempts: [local, relay] }, "rdp", [...both]);
  expect(route).toEqual({ via: "device", transport: local, serverToo: true });
});

test("the server is used when it comes first or the engine lacks the protocol", () => {
  expect(
    pickRoute({ plan, attempts: [relay, local] }, "vnc", [...both]),
  ).toEqual({ via: "server" });
  expect(pickRoute({ plan, attempts: [local, relay] }, "rdp", ["vnc"])).toEqual(
    { via: "server" },
  );
  expect(
    pickRoute({ plan, attempts: [oldLocal, relay] }, "rdp", [...both]),
  ).toEqual({ via: "server" });
});

test("telnet only needs a phone connection", () => {
  expect(pickRoute({ plan, attempts: [oldLocal] }, "telnet", [])).toMatchObject(
    { via: "device", serverToo: false },
  );
});

test("with no way it says why and what would work", () => {
  expect(
    pickRoute(
      { plan, attempts: [], blocked: { reason: "signed out", fix: "device" } },
      "rdp",
      [...both],
    ),
  ).toEqual({ via: "blocked", reason: "signed out", fix: "device" });
  expect(
    pickRoute({ plan, attempts: [oldLocal] }, "rdp", [...both]),
  ).toMatchObject({ via: "blocked" });
});
