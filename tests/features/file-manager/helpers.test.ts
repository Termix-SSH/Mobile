import {
  copyName,
  crumbs,
  joinRemote,
  remoteName,
  remoteParent,
  shellQuote,
  toLocalPath,
} from "@/features/file-manager/backend/paths";
import {
  formatDate,
  modeText,
  sortEntries,
} from "@/features/file-manager/utils/fileUtils";
import {
  DEFAULT_FILE_SETTINGS,
  normalizeFileSettings,
} from "@/features/file-manager/settings";
import {
  recordVisit,
  splitHistory,
} from "@/features/file-manager/path-history";
import { languageFor } from "@/features/file-manager/editor/language";
import type { FileEntry } from "@/features/file-manager/backend/types";

const entry = (over: Partial<FileEntry>): FileEntry => ({
  name: "a",
  path: "/a",
  type: "file",
  size: 0,
  mtime: null,
  mode: null,
  ...over,
});

describe("paths", () => {
  test("join, parent and name keep single slashes", () => {
    expect(joinRemote("/", "etc")).toBe("/etc");
    expect(joinRemote("/var/log/", "/syslog")).toBe("/var/log/syslog");
    expect(remoteParent("/var/log/syslog")).toBe("/var/log");
    expect(remoteParent("/etc")).toBe("/");
    expect(remoteName("/var/log/")).toBe("log");
    expect(remoteName("/")).toBe("/");
  });

  test("shell quoting survives single quotes", () => {
    expect(shellQuote("it's here")).toBe(`'it'\\''s here'`);
  });

  test("copy names keep the extension", () => {
    expect(copyName("notes.txt", 5)).toBe("notes_copy_5.txt");
    expect(copyName("Makefile", 5)).toBe("Makefile_copy_5");
    expect(copyName(".bashrc", 5)).toBe(".bashrc_copy_5");
  });

  test("file uris become plain decoded paths for the engine", () => {
    expect(toLocalPath("file:///data/My%20Files/a.txt")).toBe(
      "/data/My Files/a.txt",
    );
    expect(toLocalPath("/already/plain")).toBe("/already/plain");
  });

  test("crumbs start at the root", () => {
    expect(crumbs("/home/u")).toEqual([
      { name: "/", path: "/" },
      { name: "home", path: "/home" },
      { name: "u", path: "/home/u" },
    ]);
  });
});

describe("file utils", () => {
  test("folders and links to folders come first, then the field", () => {
    const files = [
      entry({ name: "b.txt", size: 5, mtime: 2 }),
      entry({ name: "z", type: "directory" }),
      entry({ name: "a.txt", size: 9, mtime: 1 }),
      entry({ name: "l", type: "link", targetType: "directory" }),
      entry({ name: "file10" }),
      entry({ name: "file2" }),
    ];
    expect(sortEntries(files).map((f) => f.name)).toEqual([
      "l",
      "z",
      "a.txt",
      "b.txt",
      "file2",
      "file10",
    ]);
    expect(sortEntries(files, "size", "desc").map((f) => f.name)[2]).toBe(
      "a.txt",
    );
    expect(sortEntries(files, "modified", "desc").map((f) => f.name)[2]).toBe(
      "b.txt",
    );
  });

  test("dates take seconds and ISO strings", () => {
    const now = new Date("2026-10-24T12:00:00Z");
    const secs = now.getTime() / 1000;
    expect(formatDate(secs - 30, now)).toBe("Just now");
    expect(formatDate(secs - 600, now)).toBe("10m ago");
    expect(formatDate(secs - 7200, now)).toBe("2h ago");
    expect(formatDate("2026-10-21T12:00:00Z", now)).toBe("3d ago");
    expect(formatDate(null, now)).toBe("");
  });

  test("older dates show the day, and the year when it is another year", () => {
    const now = new Date("2026-10-24T12:00:00Z");
    expect(formatDate("2026-03-04T12:00:00Z", now)).toBe("Mar 4");
    expect(formatDate("2025-03-04T12:00:00Z", now)).toBe("Mar 4, 2025");
  });

  test("sorting ignores case and keeps the input as it was", () => {
    const files = [entry({ name: "B.txt" }), entry({ name: "a.txt" })];
    const before = files.map((f) => f.name);
    expect(sortEntries(files).map((f) => f.name)).toEqual(["a.txt", "B.txt"]);
    expect(sortEntries(files, "name", "desc").map((f) => f.name)).toEqual([
      "B.txt",
      "a.txt",
    ]);
    expect(files.map((f) => f.name)).toEqual(before);
  });

  test("mode text gives octal and rwx", () => {
    expect(modeText(0o755)).toEqual({ octal: "755", symbolic: "rwxr-xr-x" });
    expect(modeText(0o4644).octal).toBe("4644");
    expect(modeText(null)).toEqual({ octal: "", symbolic: "" });
  });
});

describe("settings", () => {
  test("defaults fill in and numbers stay in range", () => {
    expect(normalizeFileSettings(null)).toEqual(DEFAULT_FILE_SETTINGS);
    const s = normalizeFileSettings({
      transferConcurrency: 99,
      companionSize: 10,
      sortBy: "weird",
      companionSide: "left",
      showHidden: false,
    });
    expect(s.transferConcurrency).toBe(4);
    expect(s.companionSize).toBe(240);
    expect(s.sortBy).toBe("name");
    expect(s.companionSide).toBe("left");
    expect(s.showHidden).toBe(false);
  });
});

describe("path history", () => {
  test("visits count up and keep the newest", () => {
    let e = recordVisit([], "/a", 3, 1);
    e = recordVisit(e, "/b", 3, 2);
    e = recordVisit(e, "/a", 3, 3);
    e = recordVisit(e, "/c", 3, 4);
    e = recordVisit(e, "/d", 3, 5);
    expect(e.map((x) => x.path)).toEqual(["/d", "/c", "/a"]);
    expect(splitHistory(e)).toEqual({ frequent: ["/a"], recent: ["/d", "/c"] });
    expect(recordVisit(e, ".", 3)).toBe(e);
  });
});

describe("editor languages", () => {
  test("by name, by extension, and plain text", () => {
    expect(languageFor("Dockerfile")).toBe("dockerfile");
    expect(languageFor("app.tsx")).toBe("typescript");
    expect(languageFor("site.conf", "/etc/nginx/sites/site.conf")).toBe(
      "nginx",
    );
    expect(languageFor("docker-compose.yml")).toBe("yaml");
    expect(languageFor(".bashrc")).toBe("shell");
    expect(languageFor("README")).toBe("");
  });
});

describe("file row height", () => {
  const { fileRowHeight, ROW_HEIGHT } = jest.requireActual(
    "@/features/file-manager/list/FileRow",
  );
  test("grows with large text and stops at the cap", () => {
    expect(fileRowHeight(1)).toBe(ROW_HEIGHT);
    expect(fileRowHeight(0.8)).toBe(ROW_HEIGHT);
    expect(fileRowHeight(1.5)).toBe(73);
    expect(fileRowHeight(5)).toBe(fileRowHeight(2));
    expect(fileRowHeight(1, 1.15)).toBeGreaterThan(ROW_HEIGHT);
  });
});
