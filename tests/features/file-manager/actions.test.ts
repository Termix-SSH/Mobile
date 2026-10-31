import {
  EDITOR_HARD_LIMIT,
  EDITOR_SOFT_LIMIT,
  openPlan,
  validName,
  visibleFiles,
  walkFolder,
} from "@/features/file-manager/actions";
import type {
  FileBackend,
  FileEntry,
} from "@/features/file-manager/backend/types";

const entry = (over: Partial<FileEntry>): FileEntry => ({
  name: "a",
  path: "/a",
  type: "file",
  size: 0,
  mtime: null,
  mode: null,
  ...over,
});

function tree(dirs: Record<string, FileEntry[]>): FileBackend {
  return {
    list: jest.fn(async (path: string) => ({ path, files: dirs[path] ?? [] })),
  } as unknown as FileBackend;
}

test("a folder walk keeps the layout and skips links to folders", async () => {
  const backend = tree({
    "/srv": [
      entry({ name: "a.txt", path: "/srv/a.txt" }),
      entry({ name: "sub", path: "/srv/sub", type: "directory" }),
      entry({
        name: "loop",
        path: "/srv/loop",
        type: "link",
        targetType: "directory",
      }),
      entry({
        name: "ln",
        path: "/srv/ln",
        type: "link",
        targetType: "file",
      }),
    ],
    "/srv/sub": [entry({ name: "b.txt", path: "/srv/sub/b.txt" })],
  });
  const files = await walkFolder(
    backend,
    entry({ name: "srv", path: "/srv", type: "directory" }),
  );
  expect(files.map((f) => [f.entry.path, f.relative])).toEqual([
    ["/srv/a.txt", ["srv"]],
    ["/srv/ln", ["srv"]],
    ["/srv/sub/b.txt", ["srv", "sub"]],
  ]);
});

test("a folder walk stops past the limit", async () => {
  const backend = tree({
    "/big": [1, 2, 3].map((i) => entry({ name: `${i}`, path: `/big/${i}` })),
  });
  await expect(
    walkFolder(
      backend,
      entry({ name: "big", path: "/big", type: "directory" }),
      2,
    ),
  ).rejects.toThrow(/more than 2 files/);
});

test("hidden files and search filter the list", () => {
  const files = [
    entry({ name: ".env" }),
    entry({ name: "App.ts" }),
    entry({ name: "notes" }),
  ];
  expect(visibleFiles(files, "", false).map((f) => f.name)).toEqual([
    "App.ts",
    "notes",
  ]);
  expect(visibleFiles(files, "app", true).map((f) => f.name)).toEqual([
    "App.ts",
  ]);
});

test("names can't be empty, dots or have slashes", () => {
  expect(validName("ok.txt")).toBe(true);
  expect(validName("  ")).toBe(false);
  expect(validName("..")).toBe(false);
  expect(validName("a/b")).toBe(false);
});

test("how a tap opens a file", () => {
  expect(openPlan(entry({ type: "directory" }), false, false)).toEqual({
    kind: "folder",
  });
  expect(
    openPlan(entry({ type: "link", targetType: "directory" }), true, false),
  ).toEqual({ kind: "folder" });
  expect(openPlan(entry({ size: 10 }), true, false)).toEqual({
    kind: "text",
    ask: false,
  });
  expect(openPlan(entry({ size: EDITOR_SOFT_LIMIT + 1 }), true, false)).toEqual(
    { kind: "text", ask: true },
  );
  expect(openPlan(entry({ size: EDITOR_HARD_LIMIT + 1 }), true, false)).toEqual(
    { kind: "tooBig" },
  );
  expect(openPlan(entry({}), false, true)).toEqual({ kind: "preview" });
  expect(openPlan(entry({}), false, false)).toEqual({ kind: "other" });
});
