import { withSharedSnippets } from "@/core/data/shared-snippets";
import type { SnippetRepository } from "@/core/data/types";
import type { Snippet } from "@/types";

const snippet = (id: number, name: string, isShared?: boolean): Snippet =>
  ({ id, name, content: name, isShared }) as Snippet;

function localRepo() {
  const removed: number[] = [];
  const repo: SnippetRepository = {
    subscribe: () => () => {},
    list: async () => [snippet(1, "mine")],
    get: async (id) => (id === 1 ? snippet(1, "mine") : null),
    create: async () => snippet(2, "new"),
    update: async (id) => snippet(id, "edited"),
    remove: async (id) => {
      removed.push(id);
    },
    reorder: async () => {},
  };
  return { repo, removed };
}

function fakeClient(list: unknown, enabled = true) {
  const getSnippets = jest.fn(async () => list);
  return {
    getSnippets,
    client: {
      isPluginEnabled: () => enabled,
      api: { snippets: { getSnippets } },
    } as never,
  };
}

const settle = () => new Promise((r) => setTimeout(r, 0));

test("adds snippets shared with the user, read only and with negative ids", async () => {
  const { repo, removed } = localRepo();
  const { client } = fakeClient([
    snippet(1, "mine on server"),
    snippet(7, "theirs", true),
  ]);
  const repos = withSharedSnippets(repo, () => client);
  const changed = jest.fn();
  repos.subscribe(changed);

  await repos.list();
  await settle();
  expect(changed).toHaveBeenCalled();

  const list = await repos.list();
  expect(list.map((s) => [s.id, s.name, !!s.isShared])).toEqual([
    [1, "mine", false],
    [-7, "theirs", true],
  ]);
  expect((await repos.get(-7))?.name).toBe("theirs");
  await expect(repos.remove(-7)).rejects.toThrow();
  await expect(repos.update(-7, {})).rejects.toThrow();
  await repos.remove(1);
  expect(removed).toEqual([1]);
});

test("does not ask the server when the plugin is off or offline", async () => {
  const { repo } = localRepo();
  const off = fakeClient([], false);
  await withSharedSnippets(repo, () => off.client).list();
  expect(off.getSnippets).not.toHaveBeenCalled();
  expect(
    (await withSharedSnippets(repo, () => null).list()).map((s) => s.id),
  ).toEqual([1]);
});

test("a failed fetch keeps the local list and tries again next time", async () => {
  const { repo } = localRepo();
  const getSnippets = jest
    .fn()
    .mockRejectedValueOnce(new Error("offline"))
    .mockResolvedValueOnce([snippet(3, "theirs", true)]);
  const client = {
    isPluginEnabled: () => true,
    api: { snippets: { getSnippets } },
  } as never;
  const repos = withSharedSnippets(repo, () => client);
  expect(await repos.list()).toHaveLength(1);
  await settle();
  await repos.list();
  await settle();
  expect((await repos.list()).map((s) => s.id)).toEqual([1, -3]);
});
