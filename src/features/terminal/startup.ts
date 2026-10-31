import type { TransportKind } from "@/core/transport";
import {
  hasSnippetInputs,
  resolveSnippetContent,
  type SnippetHostContext,
} from "@/features/snippets/variables";

type EnvVar = { key?: unknown; value?: unknown };

const ENV_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;

/** A value in single quotes, safe for any POSIX shell. */
export function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

function envList(...sources: unknown[]): { key: string; value: string }[] {
  const out = new Map<string, string>();
  for (const list of sources) {
    if (!Array.isArray(list)) continue;
    for (const item of list as EnvVar[]) {
      const key = typeof item?.key === "string" ? item.key.trim() : "";
      if (ENV_NAME.test(key)) out.set(key, String(item?.value ?? ""));
    }
  }
  return [...out].map(([key, value]) => ({ key, value }));
}

/** The startup snippet by a server id or a synced copy's syncId. */
export function findStartupSnippet<
  T extends { id: number; syncId?: string | null },
>(snippets: T[], id: number | string | null | undefined): T | null {
  if (id == null || id === "") return null;
  if (typeof id === "string") {
    return snippets.find((s) => s.syncId === id) ?? null;
  }
  return snippets.find((s) => s.id === id) ?? null;
}

export interface StartupInput {
  transport: TransportKind | null;
  /** The host's SSH options (2.9 and newer). */
  sshOptions?: Record<string, unknown>;
  /** A 2.8 host's variables, kept in its terminalConfig. */
  legacyEnv?: unknown;
  snippet?: { content: string } | null;
  host: SnippetHostContext;
  mosh?: string | null;
  /**
   * A tmux attach typed first. `fresh` is a new session, which then gets the
   * startup snippet and mosh; an existing one keeps its own state.
   */
  tmux?: { line: string; fresh: boolean } | null;
}

export interface StartupLine {
  text: string;
  /** Wait before the next line, for tmux to take the terminal. */
  waitAfterMs?: number;
}

/**
 * Lines typed into a new shell, in order. A phone shell already got its
 * variables when it opened, so only a relay shell gets export lines, like
 * the web terminal. Snippets that ask for input are skipped.
 */
export function startupLines(input: StartupInput): StartupLine[] {
  const lines: StartupLine[] = [];
  if (input.transport === "relay") {
    for (const { key, value } of envList(
      input.legacyEnv,
      input.sshOptions?.environmentVariables,
    )) {
      lines.push({ text: `export ${key}=${shellQuote(value)}` });
    }
  }
  if (input.tmux) {
    lines.push({ text: input.tmux.line, waitAfterMs: 800 });
    if (!input.tmux.fresh) return lines;
  }
  const content = input.snippet?.content?.trim();
  if (content && !hasSnippetInputs(content)) {
    lines.push({ text: resolveSnippetContent(content, input.host) });
  }
  if (input.mosh?.trim()) lines.push({ text: input.mosh.trim() });
  return lines;
}
