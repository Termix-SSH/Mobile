import * as FS from "expo-file-system";
import * as Sharing from "expo-sharing";
import { plainStore } from "@/core/storage/kv";
import {
  downloadsDir,
  freeName,
  localTarget,
  mimeFor,
  safeName,
  saveToFolder,
  shareFile,
} from "@/features/file-manager/transfers/device";
import {
  localSize,
  openReader,
  openWriter,
  removeLocal,
} from "@/features/file-manager/backend/local-io";
import { resetStorage } from "../../../helpers/http";

jest.mock("expo-file-system", () =>
  require("../../../helpers/fakeFileSystem").fakeFileSystem(),
);
jest.mock("expo-sharing", () => ({ shareAsync: jest.fn(async () => {}) }));

const fs = FS as unknown as {
  __files: Map<string, Uint8Array>;
  __picks: string[];
};

beforeEach(async () => {
  await resetStorage();
  fs.__files.clear();
  fs.__picks.length = 0;
});

test("names are made safe and never overwrite", () => {
  expect(safeName("a/b:c?.txt")).toBe("a_b_c_.txt");
  expect(safeName("..")).toBe("file");
  const taken = new Set(["a.txt", "a (2).txt"]);
  expect(freeName("a.txt", (n) => taken.has(n))).toBe("a (3).txt");
  expect(freeName("Makefile", () => false)).toBe("Makefile");
  expect(mimeFor("photo.JPG")).toBe("image/jpeg");
  expect(mimeFor("x.unknown")).toBe("application/octet-stream");
});

test("downloads land in Documents/Termix/<host> with free names", () => {
  const dir = downloadsDir("web 1", "srv");
  expect(dir.uri).toBe("file:///doc/Termix/web 1/srv");
  fs.__files.set("file:///doc/Termix/web 1/srv/a.txt", new Uint8Array(1));
  const reserved = new Set<string>();
  expect(localTarget(dir, "a.txt", reserved)).toBe(
    "/doc/Termix/web 1/srv/a (2).txt",
  );
  expect(localTarget(dir, "a.txt", reserved)).toBe(
    "/doc/Termix/web 1/srv/a (3).txt",
  );
});

test("phone files are read and written in slices", () => {
  const w = openWriter("/cache/x", false);
  w.write(new Uint8Array([1, 2]));
  w.close();
  const a = openWriter("/cache/x", true);
  a.write(new Uint8Array([3]));
  a.close();
  expect(localSize("/cache/x")).toBe(3);
  const r = openReader("/cache/x", 1);
  expect(r.size).toBe(3);
  expect([...r.read(5)]).toEqual([2, 3]);
  removeLocal("/cache/x");
  expect(localSize("/cache/x")).toBe(0);
});

test("saving to a folder asks once, keeps the layout and the name free", async () => {
  fs.__files.set("file:///doc/Termix/h/a.txt", new Uint8Array([7]));
  fs.__picks.push("content://tree/Downloads");
  expect(
    await saveToFolder([
      { path: "/doc/Termix/h/a.txt", relative: ["site", "css"] },
    ]),
  ).toBe(1);
  expect(fs.__files.get("content://tree/Downloads/site/css/a.txt")).toEqual(
    new Uint8Array([7]),
  );
  expect(await plainStore.get("files.saveDir")).toBe(
    "content://tree/Downloads",
  );
  // The second time it uses the saved folder and picks a free name.
  expect(
    await saveToFolder([
      { path: "/doc/Termix/h/a.txt", relative: ["site", "css"] },
    ]),
  ).toBe(1);
  expect(fs.__files.has("content://tree/Downloads/site/css/a (2).txt")).toBe(
    true,
  );
});

test("no folder picked saves nothing", async () => {
  await plainStore.remove("files.saveDir");
  expect(await saveToFolder([{ path: "/x", relative: [] }])).toBeNull();
});

test("share opens the sheet with the file uri and type", async () => {
  await shareFile("/doc/a.pdf", "a.pdf");
  expect(Sharing.shareAsync).toHaveBeenCalledWith("file:///doc/a.pdf", {
    mimeType: "application/pdf",
    dialogTitle: "a.pdf",
  });
});
