import { localRepositories } from "@/core/data/local";
import {
  buildSnippetExport,
  importSnippetFile,
  parseSnippetFile,
  snippetImportSummary,
} from "@/features/snippets/transfer";
import type { Snippet, SnippetFolder } from "@/types";
import { resetStorage } from "../../helpers/http";
import { testStores } from "../../helpers/db";

beforeEach(resetStorage);

function setup() {
  const { stores } = testStores();
  return localRepositories("local", stores);
}

const snippet = (over: Partial<Snippet>): Snippet => ({
  id: 1,
  userId: "",
  name: "restart",
  content: "sudo systemctl restart nginx",
  createdAt: "",
  updatedAt: "",
  ...over,
});

test("an export has the fields the web app writes", () => {
  const out = buildSnippetExport(
    [snippet({ folder: "Web", order: 2, hostFilter: "[1,2]", isNote: true })],
    [{ id: 1, userId: "", name: "Web", color: "#fff" } as SnippetFolder],
  );
  expect(out.snippets[0]).toEqual({
    name: "restart",
    content: "sudo systemctl restart nginx",
    description: null,
    folder: "Web",
    order: 2,
    hostFilter: "[1,2]",
    isNote: true,
  });
  expect(out.folders).toEqual([{ name: "Web", color: "#fff", icon: null }]);
});

test("a file from the web app reads", () => {
  const file = parseSnippetFile(
    JSON.stringify({
      snippets: [
        {
          name: " Restart ",
          content: "x",
          description: "d",
          folder: "Web",
          order: 0,
        },
        { name: "", content: "x" },
        { name: "no content" },
      ],
      folders: [{ name: "Web", color: "#3b82f6", icon: "folder" }, {}],
    }),
  );
  expect(file.snippets).toHaveLength(1);
  expect(file.snippets[0]).toMatchObject({ name: "Restart", folder: "Web" });
  expect(file.folders).toEqual([
    { name: "Web", color: "#3b82f6", icon: "folder" },
  ]);
  expect(file.errors).toHaveLength(2);
});

test("a plain list of snippets reads too", () => {
  expect(
    parseSnippetFile('[{"name":"a","content":"b"}]').snippets,
  ).toHaveLength(1);
});

test("a file that is not usable says why", () => {
  expect(() => parseSnippetFile("{")).toThrow("valid JSON");
  expect(() => parseSnippetFile("{}")).toThrow("snippets or folders");
});

test("import makes folders and snippets, then skips repeats", async () => {
  const repos = setup();
  const file = parseSnippetFile(
    JSON.stringify({
      snippets: [
        { name: "a", content: "echo a", folder: "Web", hostFilter: "[3]" },
        { name: "b", content: "echo b", isNote: true },
      ],
      folders: [{ name: "Web", color: "#fff" }],
    }),
  );
  const first = await importSnippetFile(repos, file);
  expect(first).toMatchObject({ imported: 2, foldersCreated: 1, skipped: 0 });
  const list = await repos.snippets.list();
  expect(list.find((s) => s.name === "a")).toMatchObject({
    folder: "Web",
    hostFilter: "[3]",
  });
  expect(list.find((s) => s.name === "b")!.isNote).toBe(true);
  const second = await importSnippetFile(repos, file);
  expect(second).toMatchObject({ imported: 0, skipped: 2, foldersCreated: 0 });
  expect(snippetImportSummary(second)).toBe(
    "0 added, 0 updated, 2 skipped, 0 failed",
  );
});

test("a snippet's folder is made even when the file lists none", async () => {
  const repos = setup();
  await importSnippetFile(
    repos,
    parseSnippetFile('[{"name":"a","content":"b","folder":"New"}]'),
  );
  expect((await repos.snippetFolders.list()).map((f) => f.name)).toEqual([
    "New",
  ]);
});

test("overwrite updates by name and folder", async () => {
  const repos = setup();
  await importSnippetFile(
    repos,
    parseSnippetFile('[{"name":"a","content":"old","folder":"F"}]'),
  );
  const res = await importSnippetFile(
    repos,
    parseSnippetFile(
      '[{"name":"a","content":"new","folder":"F","hostFilter":"[9]"}]',
    ),
    { overwrite: true },
  );
  expect(res).toMatchObject({ updated: 1, imported: 0 });
  const [saved] = await repos.snippets.list();
  expect(saved).toMatchObject({ content: "new", hostFilter: "[9]" });
});

test("the same name in another folder is a new snippet", async () => {
  const repos = setup();
  await importSnippetFile(
    repos,
    parseSnippetFile('[{"name":"a","content":"1"}]'),
  );
  const res = await importSnippetFile(
    repos,
    parseSnippetFile('[{"name":"a","content":"2","folder":"F"}]'),
  );
  expect(res.imported).toBe(1);
});

test("a failing save is counted and the rest go on", async () => {
  const repos = setup();
  const original = repos.snippets.create.bind(repos.snippets);
  let calls = 0;
  repos.snippets.create = async (draft) => {
    if (++calls === 1) throw new Error("disk full");
    return original(draft);
  };
  const res = await importSnippetFile(
    repos,
    parseSnippetFile('[{"name":"a","content":"1"},{"name":"b","content":"2"}]'),
  );
  expect(res).toMatchObject({ imported: 1, failed: 1 });
  expect(res.errors[0]).toContain("disk full");
});

test("an export imports back into an empty store", async () => {
  const repos = setup();
  await importSnippetFile(
    repos,
    parseSnippetFile(
      '{"snippets":[{"name":"a","content":"1","folder":"F"}],"folders":[{"name":"F","color":"#000"}]}',
    ),
  );
  const out = buildSnippetExport(
    await repos.snippets.list(),
    await repos.snippetFolders.list(),
  );
  const other = setup();
  const res = await importSnippetFile(
    other,
    parseSnippetFile(JSON.stringify(out)),
  );
  expect(res.imported).toBe(1);
});
