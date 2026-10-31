import * as FS from "expo-file-system";
import { nameForPayload, toSharedFiles } from "@/screens/share/incoming";

jest.mock("expo-file-system", () =>
  require("../../helpers/fakeFileSystem").fakeFileSystem(),
);
jest.mock("expo-sharing", () => ({ shareAsync: jest.fn() }));

const fs = FS as unknown as { __files: Map<string, Uint8Array> };

const payload = (over: object) =>
  ({
    value: "",
    shareType: "file",
    contentUri: null,
    contentType: "file",
    contentMimeType: null,
    originalName: null,
    contentSize: null,
    ...over,
  }) as any;

test("shared items get names from their name, uri or type", () => {
  expect(nameForPayload(payload({ originalName: "a b.pdf" }), 0)).toBe(
    "a b.pdf",
  );
  expect(
    nameForPayload(payload({ contentUri: "file:///g/IMG%201.HEIC?x=1" }), 0),
  ).toBe("IMG 1.HEIC");
  expect(
    nameForPayload(
      payload({
        contentUri: "content://media/42",
        contentMimeType: "image/jpeg",
      }),
      2,
    ),
  ).toBe("42.jpg");
  expect(
    nameForPayload(payload({ contentType: "text", shareType: "text" }), 0),
  ).toBe("shared-1.txt");
});

test("shared files and text are copied into the cache", async () => {
  fs.__files.set("file:///group/photo.png", new Uint8Array([1, 2, 3]));
  const out = await toSharedFiles([
    payload({
      contentUri: "file:///group/photo.png",
      originalName: "photo.png",
    }),
    payload({ contentType: "text", shareType: "text", value: "hello" }),
    payload({ contentType: "text", shareType: "text", value: "" }),
  ]);
  expect(out.map((f) => [f.name, f.size])).toEqual([
    ["photo.png", 3],
    ["shared-2.txt", 5],
  ]);
  expect(out[0].path.startsWith("file:///cache/termix-share/")).toBe(true);
});
