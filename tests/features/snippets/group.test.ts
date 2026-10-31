import { groupSnippets } from "@/features/snippets/group";
import type { Snippet, SnippetFolder } from "@/types";

const s = (id: number, name: string, folder?: string, order = 0): Snippet =>
  ({ id, name, content: `echo ${name}`, folder, order }) as Snippet;

test("loose snippets first, then folders by name, each by order", () => {
  const groups = groupSnippets(
    [s(1, "b", "Ops", 2), s(2, "a", "Ops", 1), s(3, "c"), s(4, "d", "Apps")],
    [{ id: 1, name: "Ops", color: "#f00" } as SnippetFolder],
  );
  expect(groups.map((g) => g.label)).toEqual(["No folder", "Apps", "Ops"]);
  expect(groups[2].items.map((i) => i.name)).toEqual(["a", "b"]);
  expect(groups[2].color).toBe("#f00");
});

test("search matches name, command and description, and hides empty groups", () => {
  const groups = groupSnippets(
    [s(1, "deploy", "Ops"), s(2, "logs")],
    [],
    "DEPLOY",
  );
  expect(groups).toHaveLength(1);
  expect(groups[0].items[0].name).toBe("deploy");
  expect(groupSnippets([s(1, "x")], [], "echo x")).toHaveLength(1);
});
