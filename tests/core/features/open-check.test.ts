import { checkOpen, deviceDialOnly } from "@/core/features/open-check";
import { features } from "@/core/features/registry";
import { localStores } from "@/core/db/stores";
import { localRepositories } from "@/core/data/local";
import { registerBuiltInFeatures } from "@/features";
import { resetStorage } from "../../helpers/http";
import { testDriver } from "../../helpers/db";

jest.mock("@/modules/termix-ssh", () => ({
  ...jest.requireActual("@/modules/termix-ssh"),
  isSshEngineAvailable: true,
}));

beforeAll(() => registerBuiltInFeatures());

beforeEach(async () => {
  await resetStorage();
  localStores.setDriver(testDriver());
  localStores.unlock();
});

test("a This device host opens a terminal from the phone", async () => {
  const check = await checkOpen("local", { id: 1 }, true, "terminal");
  expect(check.blocked).toBeUndefined();
  expect(check.attempts.map((t) => t.kind)).toEqual(["local"]);
});

test("server features on a This device host say what they need", async () => {
  // No built in tab needs a server alone any more, so a plugin like one.
  const off = features.register({
    id: "test-server-only",
    title: "Server thing",
    source: "native",
    availableOn: ["local", "server"],
    sessionTabs: [
      {
        type: "serverThing",
        icon: (() => null) as never,
        titleSuffix: () => "",
        shortLabel: () => "",
        needs: ["server"],
        serverTabTypes: [],
        toServerTabType: () => "serverThing",
        component: () => null,
      },
    ],
  });
  try {
    const check = await checkOpen("local", { id: 1 }, true, "serverThing");
    expect(check.attempts).toEqual([]);
    expect(check.blocked?.reason).toMatch(/needs a Termix server/);
    expect(check.blocked?.fix).toBeUndefined();
  } finally {
    off();
  }
});

test("RDP and VNC on a This device host open from the phone, even with SSH off", async () => {
  const check = await checkOpen("local", { id: 1 }, false, "remoteDesktop");
  expect(check.blocked).toBeUndefined();
  expect(check.attempts.map((t) => t.kind)).toEqual(["local"]);
});

test("docker on a This device host runs over the phone's SSH", async () => {
  const check = await checkOpen("local", { id: 1 }, true, "docker");
  expect(check.blocked).toBeUndefined();
  expect(check.attempts.map((t) => t.kind)).toEqual(["local"]);
});

test("files on a This device host open over the phone's SFTP", async () => {
  const check = await checkOpen("local", { id: 1 }, true, "filemanager");
  expect(check.blocked).toBeUndefined();
  expect(check.attempts.map((t) => t.kind)).toEqual(["local"]);
});

test("the saved origin is read from the account's store", async () => {
  const repos = localRepositories("local");
  const host = await repos.hosts.create({
    name: "b",
    ip: "b.lan",
    port: 22,
    username: "u",
    authType: "password",
  } as never);
  await repos.origins.set(host.id, "server");
  // This device ignores it: it has no server to go through.
  const check = await checkOpen("local", host, true, "terminal");
  expect(check.plan.origin).toBe("device");
  expect(features.sessionNeeds("terminal")).toEqual([["shell"]]);
});

test("a This device telnet host opens from the phone, even with SSH off", async () => {
  const check = await checkOpen("local", { id: 1 }, false, "telnet");
  expect(check.blocked).toBeUndefined();
  expect(check.attempts.map((t) => t.kind)).toEqual(["local"]);
});

test("telnet in the terminal keeps only the phone's way", () => {
  const local = { kind: "local", provides: ["shell", "tcp"] } as never;
  const relay = { kind: "relay", provides: ["shell", "guacd"] } as never;
  const plan = { origin: "auto" as const, attempts: [local, relay] };
  expect(deviceDialOnly({ plan, attempts: [local, relay] }).attempts).toEqual([
    local,
  ]);
  const onlyServer = deviceDialOnly({ plan, attempts: [relay] });
  expect(onlyServer.attempts).toEqual([]);
  expect(onlyServer.blocked?.fix).toBe("device");
  const blocked = { reason: "signed out" };
  expect(deviceDialOnly({ plan, attempts: [], blocked }).blocked).toBe(blocked);
});
