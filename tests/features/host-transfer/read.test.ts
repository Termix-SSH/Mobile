import { localRepositories } from "@/core/data/local";
import { encodeHostShare } from "@/core/hosts/transfer/share";
import { hostTransferFeature } from "@/features/host-transfer/register";
import { qrMatrix, qrPath } from "@/features/host-transfer/QrCode";
import {
  describeSource,
  readImportText,
  runImport,
  sharedToFile,
} from "@/features/host-transfer/read";
import type { SSHHost } from "@/types";
import { resetStorage } from "../../helpers/http";
import { testStores } from "../../helpers/db";

beforeEach(resetStorage);

const host: SSHHost = {
  id: 1,
  name: "box",
  ip: "10.0.0.4",
  port: 22,
  username: "me",
  folder: "",
  tags: [],
  pin: false,
  authType: "password",
  password: "pw",
  enableTerminal: true,
  enableTunnel: false,
  enableFileManager: true,
  defaultPath: "/",
  tunnelConnections: [],
  createdAt: "",
  updatedAt: "",
};

test("text is sorted into link, Termix file or SSH config", () => {
  expect(readImportText(encodeHostShare(host)).kind).toBe("link");
  expect(
    readImportText('[{"ip":"h","port":22,"username":"u","password":"p"}]').kind,
  ).toBe("termix");
  expect(readImportText("Host a\n HostName 1.2.3.4\n").kind).toBe("ssh-config");
});

test("text that is nothing useful says why", () => {
  expect(() => readImportText("  ")).toThrow("nothing to import");
  expect(() => readImportText("termix://host?d=@@")).toThrow("not a Termix");
  expect(() => readImportText("{")).toThrow("valid JSON");
  expect(() => readImportText("just words")).toThrow("No valid Host");
});

test("a source is described in a few words", () => {
  expect(describeSource(readImportText(encodeHostShare(host)))).toBe(
    "1 host: box",
  );
  expect(
    describeSource(
      readImportText(
        '[{"ip":"a","port":22,"username":"u"},{"ip":"b","port":22,"username":"u"}]',
      ),
    ),
  ).toBe("Termix file with 2 hosts");
  expect(describeSource(readImportText("Host a\n HostName 1.2.3.4\n"))).toBe(
    "SSH config with 1 host",
  );
});

test("a link makes one host through the importer", async () => {
  const { stores } = testStores();
  const repos = localRepositories("local", stores);
  const source = readImportText(encodeHostShare(host, { password: true }));
  const result = await runImport(repos, source);
  expect(result.created).toBe(1);
  expect(await repos.hosts.list()).toEqual([
    expect.objectContaining({ ip: "10.0.0.4", username: "me", password: "pw" }),
  ]);
  expect((await runImport(repos, source)).skipped).toBe(1);
});

test("a shared host that cannot be a row is reported", () => {
  const file = sharedToFile({
    v: 1,
    name: "x",
    ip: "",
    port: 22,
    username: "",
    authType: "none",
  });
  expect(file.rows).toEqual([]);
  expect(file.errors).toHaveLength(1);
});

test("a QR code is a square matrix and a path of its dark squares", () => {
  const matrix = qrMatrix("termix://host?d=abc");
  expect(matrix.length).toBeGreaterThan(20);
  expect(matrix.every((row) => row.length === matrix.length)).toBe(true);
  expect(
    qrPath([
      [true, false],
      [false, true],
    ]),
  ).toBe("M0 0h1v1h-1zM1 1h1v1h-1z");
});

test("the share action is only for own ssh hosts", () => {
  const action = hostTransferFeature.hostActions![0];
  const ctx = {} as never;
  expect(action.isAvailable(host, ctx)).toBe(true);
  expect(
    action.isAvailable(
      { ...host, shared: { owner: "a", permissionLevel: "view" } },
      ctx,
    ),
  ).toBe(false);
  expect(action.isAvailable({ ...host, connectionType: "rdp" }, ctx)).toBe(
    false,
  );
});
