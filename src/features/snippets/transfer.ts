// Snippet files, in the same JSON Plugin-Snippets exports and imports.
import type { DataRepositories } from "@/core/data/types";
import type { Snippet, SnippetFolder } from "@/types";

export interface SnippetEntry {
  name: string;
  content: string;
  description?: string | null;
  folder?: string | null;
  order?: number;
  hostFilter?: string | null;
  isNote?: boolean;
}

export interface FolderEntry {
  name: string;
  color?: string | null;
  icon?: string | null;
}

export interface SnippetFile {
  snippets: SnippetEntry[];
  folders: FolderEntry[];
  /** Entries that were left out, with why. */
  errors: string[];
}

export interface SnippetImportResult {
  imported: number;
  updated: number;
  skipped: number;
  failed: number;
  foldersCreated: number;
  errors: string[];
}

export function buildSnippetExport(
  snippets: Snippet[],
  folders: SnippetFolder[],
): { snippets: SnippetEntry[]; folders: FolderEntry[] } {
  return {
    snippets: snippets.map((s) => ({
      name: s.name,
      content: s.content,
      description: s.description ?? null,
      folder: s.folder ?? null,
      order: s.order ?? 0,
      hostFilter: s.hostFilter ?? null,
      isNote: !!s.isNote,
    })),
    folders: folders.map((f) => ({
      name: f.name,
      color: f.color ?? null,
      icon: f.icon ?? null,
    })),
  };
}

const str = (value: unknown): string | undefined =>
  typeof value === "string" && value.trim() ? value.trim() : undefined;

/** Reads the text of a snippet file. Throws a plain message when it can't. */
export function parseSnippetFile(source: string): SnippetFile {
  let data: any;
  try {
    data = JSON.parse(source);
  } catch {
    throw new Error("That is not a valid JSON file");
  }
  const rawSnippets = Array.isArray(data) ? data : data?.snippets;
  const rawFolders = Array.isArray(data) ? [] : data?.folders;
  if (!Array.isArray(rawSnippets) && !Array.isArray(rawFolders)) {
    throw new Error("The file needs a snippets or folders list");
  }
  const out: SnippetFile = { snippets: [], folders: [], errors: [] };
  (Array.isArray(rawSnippets) ? rawSnippets : []).forEach(
    (raw: any, i: number) => {
      const name = str(raw?.name);
      const content =
        typeof raw?.content === "string" ? raw.content.trim() : "";
      if (!name || !content) {
        out.errors.push(`Snippet ${i + 1}: name and content are required`);
        return;
      }
      out.snippets.push({
        name,
        content,
        description: str(raw.description) ?? null,
        folder: str(raw.folder) ?? null,
        order: typeof raw.order === "number" ? raw.order : undefined,
        hostFilter: str(raw.hostFilter) ?? null,
        isNote: raw.isNote === true,
      });
    },
  );
  (Array.isArray(rawFolders) ? rawFolders : []).forEach((raw: any) => {
    const name = str(raw?.name);
    if (name) {
      out.folders.push({
        name,
        color: str(raw.color) ?? null,
        icon: str(raw.icon) ?? null,
      });
    }
  });
  return out;
}

const keyOf = (name: string, folder?: string | null) =>
  `${folder ?? ""}\u0000${name}`;

/**
 * Adds a file's folders and snippets. A snippet with the same name in the
 * same folder is skipped, or updated when `overwrite` is set. A folder that
 * exists is left alone.
 */
export async function importSnippetFile(
  repos: DataRepositories,
  file: SnippetFile,
  options: { overwrite?: boolean } = {},
): Promise<SnippetImportResult> {
  const result: SnippetImportResult = {
    imported: 0,
    updated: 0,
    skipped: 0,
    failed: file.errors.length,
    foldersCreated: 0,
    errors: [...file.errors],
  };
  const existingFolders = new Set(
    (await repos.snippetFolders.list()).map((f) => f.name),
  );
  const wanted = new Map(file.folders.map((f) => [f.name, f]));
  // A snippet's folder gets made too, even when the file lists no folder.
  for (const s of file.snippets) {
    if (s.folder && !wanted.has(s.folder))
      wanted.set(s.folder, { name: s.folder });
  }
  for (const folder of wanted.values()) {
    if (existingFolders.has(folder.name)) continue;
    try {
      await repos.snippetFolders.create({
        name: folder.name,
        color: folder.color ?? undefined,
        icon: folder.icon ?? undefined,
      });
      result.foldersCreated++;
    } catch (error) {
      result.errors.push(
        `Folder ${folder.name}: ${error instanceof Error ? error.message : error}`,
      );
    }
  }

  const existing = new Map(
    (await repos.snippets.list()).map((s) => [keyOf(s.name, s.folder), s]),
  );
  for (const entry of file.snippets) {
    const match = existing.get(keyOf(entry.name, entry.folder));
    try {
      if (match && !options.overwrite) {
        result.skipped++;
        continue;
      }
      const draft: Partial<Snippet> = {
        name: entry.name,
        content: entry.content,
        description: entry.description ?? undefined,
        folder: entry.folder ?? undefined,
        order: entry.order,
        hostFilter: entry.hostFilter ?? null,
        isNote: entry.isNote,
      };
      if (match) {
        await repos.snippets.update(match.id, draft);
        result.updated++;
      } else {
        const made = await repos.snippets.create(draft);
        existing.set(keyOf(entry.name, entry.folder), made);
        result.imported++;
      }
    } catch (error) {
      result.failed++;
      result.errors.push(
        `${entry.name}: ${error instanceof Error ? error.message : error}`,
      );
    }
  }
  return result;
}

export function snippetImportSummary(r: SnippetImportResult): string {
  return `${r.imported} added, ${r.updated} updated, ${r.skipped} skipped, ${r.failed} failed`;
}
