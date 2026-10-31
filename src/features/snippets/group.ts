import type { Snippet, SnippetFolder } from "@/types";

export interface SnippetGroup {
  /** The folder name, or "" for snippets in no folder. */
  key: string;
  label: string;
  color?: string;
  items: Snippet[];
}

function matches(snippet: Snippet, query: string): boolean {
  if (!query) return true;
  const q = query.toLowerCase();
  return (
    snippet.name.toLowerCase().includes(q) ||
    snippet.content.toLowerCase().includes(q) ||
    (snippet.description ?? "").toLowerCase().includes(q)
  );
}

/**
 * Snippets by folder in folder name order, loose ones first, each sorted by
 * their saved order. Empty groups are left out. Folders a snippet names but
 * the folder list lacks still show.
 */
export function groupSnippets(
  snippets: Snippet[],
  folders: SnippetFolder[],
  query = "",
): SnippetGroup[] {
  const q = query.trim();
  const byFolder = new Map<string, Snippet[]>();
  for (const s of snippets) {
    if (!matches(s, q)) continue;
    const key = s.folder || "";
    byFolder.set(key, [...(byFolder.get(key) ?? []), s]);
  }
  const known = new Map(folders.map((f) => [f.name, f]));
  const names = [...byFolder.keys()]
    .filter((k) => k)
    .sort((a, b) => a.localeCompare(b));
  const keys = byFolder.has("") ? ["", ...names] : names;
  return keys.map((key) => ({
    key,
    label: key || "No folder",
    color: known.get(key)?.color,
    items: (byFolder.get(key) ?? []).sort(
      (a, b) => (a.order ?? 0) - (b.order ?? 0),
    ),
  }));
}
