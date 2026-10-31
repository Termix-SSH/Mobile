import { AccountClient } from "@/core/api/AccountClient";
import { accountStorage } from "@/core/storage/kv";
import { AppError } from "@/core/errors";
import { transportsFor } from "@/core/transport";
import {
  createLocalTransport,
  NO_ENGINE,
  NO_SERVER_COPY,
} from "@/core/transport/local";
import { createRelayTransport } from "@/core/transport/relay";
import { RelayShell } from "@/core/transport/relay/RelayShell";
import { resetStorage } from "../../helpers/http";

beforeEach(resetStorage);

const shellOptions = {
  hostConfig: { id: 1, name: "h" } as any,
  onStateChange: () => {},
  onData: () => {},
  onTotpRequired: () => {},
  onAuthDialogNeeded: () => {},
  onPostConnectionSetup: () => {},
  onDisconnected: () => {},
  onConnectionFailed: () => {},
};

const repo = {
  profile: async () => null,
  saveHostKey: async () => {},
  touchHostKey: async () => {},
};

test("This device connects from the phone, off when the build has no engine", () => {
  const { account, local, relay } = transportsFor("local");
  expect(account.kind).toBe("local");
  expect(relay).toBeNull();
  expect(local.kind).toBe("local");
  // Jest has no native module, like Expo Go and web.
  expect(local.available).toBe(false);
  expect(local.unavailableReason).toBe(NO_ENGINE);
  expect(() => local.openShell(shellOptions)).toThrow(AppError);
});

test("the phone needs the engine and the account's local copy", () => {
  expect(createLocalTransport(false, () => repo).unavailableReason).toBe(
    NO_ENGINE,
  );
  const noCopy = createLocalTransport(true, () => undefined, NO_SERVER_COPY);
  expect(noCopy.available).toBe(false);
  expect(noCopy.unavailableReason).toBe(NO_SERVER_COPY);
  const ready = createLocalTransport(true, () => repo);
  expect(ready.available).toBe(true);
  expect(ready.provides).toEqual(["shell", "exec", "sftp", "forward", "tcp"]);
});

test("the relay works while signed in and opens server shells", async () => {
  const client = new AccountClient({
    accountId: "a",
    serverUrl: "https://t.example",
    storage: accountStorage("a"),
  });
  const t = createRelayTransport(client);
  expect(t.kind).toBe("relay");
  expect(t.provides).toEqual(["shell", "server", "guacd"]);
  expect(t.available).toBe(false);
  expect(t.unavailableReason).toMatch(/signed out/);

  await client.setToken("jwt");
  expect(t.available).toBe(true);
  const shell = t.openShell(shellOptions);
  expect(shell).toBeInstanceOf(RelayShell);
  shell.destroy();
});
