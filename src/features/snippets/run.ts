import type { TerminalInputHandle } from "@/core/features/types";
import type { Snippet, SSHHost } from "@/types";
import {
  extractSnippetInputs,
  resolveSnippetContent,
  type SnippetHostContext,
  type SnippetInput,
} from "./variables";

export type SnippetMode = "run" | "insert";

/** Same rule as the plugin: a note is pasted, a command runs unless told not to. */
export function snippetMode(
  snippet: Pick<Snippet, "isNote">,
  pressEnter = true,
): SnippetMode {
  return !snippet.isNote && pressEnter ? "run" : "insert";
}

export function hostContext(host?: SSHHost | null): SnippetHostContext | null {
  if (!host) return null;
  return {
    ip: host.ip,
    username: host.username,
    port: host.port,
    name: host.name,
  };
}

/** The inputs a snippet asks for before it can be sent. */
export function inputsOf(snippet: Pick<Snippet, "content">): SnippetInput[] {
  return extractSnippetInputs(snippet.content);
}

export function resolveSnippet(
  snippet: Pick<Snippet, "content">,
  host: SnippetHostContext | null,
  values: Record<string, string> = {},
): string {
  return resolveSnippetContent(snippet.content, host, values);
}

/**
 * Sends resolved text to a terminal. Insert pastes it (bracketed, so nothing
 * runs) through the native view when there is one; run types it and Enter.
 */
export function sendToTerminal(
  terminal: TerminalInputHandle | null | undefined,
  text: string,
  mode: SnippetMode,
): boolean {
  if (!terminal) return false;
  if (mode === "run") {
    terminal.sendInput(`${text}\r`);
    return true;
  }
  const target = terminal.keyTarget?.();
  if (target) target.paste(text);
  else terminal.sendInput(text);
  return true;
}
