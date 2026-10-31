import {
  findLinkAccount,
  findLinkHost,
  parseOpenLink,
} from "@/core/links/open-link";
import type { Account, ServerAccount } from "@/core/accounts";
import type { SSHHost } from "@/types";

const server = (id: string, serverUrl: string, extra = {}): ServerAccount =>
  ({
    id,
    kind: "server",
    serverUrl,
    status: "idle",
    ...extra,
  }) as ServerAccount;

const list: Account[] = [
  { id: "local", kind: "local" },
  server("a", "https://termix.example"),
  server("b", "https://termix.example/team/"),
  server("p", "https://pending.example", { pending: true }),
];

test("reads the server, view and host", () => {
  expect(
    parseOpenLink(
      "termix-mobile://open?server=https%3A%2F%2Ftermix.example%2F&view=terminal&hostId=12",
    ),
  ).toEqual({ server: "https://termix.example", hostId: 12, type: "terminal" });
  expect(
    parseOpenLink("termix-mobile://open/?view=file-manager&hostId=3"),
  ).toEqual({ server: null, hostId: 3, type: "filemanager" });
  expect(parseOpenLink("termix-mobile://open")).toEqual({
    server: null,
    hostId: null,
    type: null,
  });
});

test("takes a whole Termix web link", () => {
  const web = "https://termix.example/team/?view=server-stats&hostId=7";
  expect(
    parseOpenLink(`termix-mobile://open?url=${encodeURIComponent(web)}`),
  ).toEqual({
    server: "https://termix.example/team",
    hostId: 7,
    type: "stats",
  });
});

test("refuses links that aren't ours or are broken", () => {
  expect(parseOpenLink("termix-mobile://opener?hostId=1")).toBeNull();
  expect(parseOpenLink("termix-mobile://widget/open")).toBeNull();
  expect(parseOpenLink("termix-mobile://open?hostId=-1")).toBeNull();
  expect(parseOpenLink("termix-mobile://open?hostId=1.5")).toBeNull();
  expect(
    parseOpenLink("termix-mobile://open?server=javascript:alert(1)"),
  ).toBeNull();
  expect(parseOpenLink("termix-mobile://open?view=nope&hostId=2")).toEqual({
    server: null,
    hostId: 2,
    type: null,
  });
});

test("picks the account by address, the longest match wins", () => {
  expect(findLinkAccount(list, null)?.id).toBe("local");
  expect(findLinkAccount(list, "https://TERMIX.example")?.id).toBe("a");
  expect(findLinkAccount(list, "https://termix.example/team")?.id).toBe("b");
  expect(findLinkAccount(list, "https://termix.example/other")?.id).toBe("a");
  expect(findLinkAccount(list, "https://pending.example")).toBeNull();
  expect(findLinkAccount(list, "https://termix.example.evil")).toBeNull();
});

test("finds a synced host by its server id", () => {
  const hosts = [
    { id: 1, serverId: 12 },
    { id: 12, serverId: 99 },
    { id: 5, serverId: null },
  ] as unknown as SSHHost[];
  expect(findLinkHost(hosts, 12, true)?.id).toBe(1);
  expect(findLinkHost(hosts, 5, true)?.id).toBe(5);
  expect(findLinkHost(hosts, 12, false)?.id).toBe(12);
  expect(findLinkHost(hosts, 404, true)).toBeNull();
});
