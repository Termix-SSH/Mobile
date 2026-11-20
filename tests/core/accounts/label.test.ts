import { accountLabelAmong, type ServerAccount } from "@/core/accounts/types";

const server = (
  id: string,
  serverUrl: string,
  serverName: string | null,
  username: string | null = "luke",
): ServerAccount => ({
  id,
  kind: "server",
  serverUrl,
  serverName,
  serverVersion: null,
  username,
  remoteUserId: null,
  isAdmin: false,
  status: "idle",
  lastError: null,
  linkedAt: "",
  lastSyncAt: null,
  disabledTypes: [],
  options: {},
});

const main = server("a", "https://termix.example.com", "Termix");
const dev = server("b", "https://termix-dev.example.com:2100", "Termix");

test("a server with its own name shows that name", () => {
  expect(accountLabelAmong(main, [main])).toBe("Termix");
  expect(
    accountLabelAmong(main, [main, server("c", "https://x.test", "Lab")]),
  ).toBe("Termix");
});

test("two servers with the same name show their hosts", () => {
  expect(accountLabelAmong(main, [main, dev])).toBe("termix.example.com");
  expect(accountLabelAmong(dev, [main, dev])).toBe(
    "termix-dev.example.com:2100",
  );
  const shout = server("c", "https://other.test", " termix ");
  expect(accountLabelAmong(shout, [main, shout])).toBe("other.test");
});

test("two accounts on the same server show the user name too", () => {
  const other = server("c", "https://termix.example.com", "Termix", "sam");
  expect(accountLabelAmong(main, [main, other])).toBe(
    "luke@termix.example.com",
  );
  expect(accountLabelAmong(other, [main, other])).toBe(
    "sam@termix.example.com",
  );
});

test("a server without a name shows its host", () => {
  const bare = server("c", "https://bare.test", null);
  expect(accountLabelAmong(bare, [bare, main])).toBe("bare.test");
});
