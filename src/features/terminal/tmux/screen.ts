/**
 * GNU screen, for hosts with no tmux. Used the same way as tmux: auto attach
 * when the shell opens, and reattach after a reconnect.
 */

import { shellQuote } from "../startup";
import { PATH_PREFIX } from "./tmux";

export interface ScreenSession {
  /** "pid.name", what `screen -r` takes. */
  id: string;
  name: string;
  attached: boolean;
}

/** Exit 127 when screen is missing, else `screen -ls` output. */
export function listScreensCommand(): string {
  return `${PATH_PREFIX}; export PATH; if command -v screen >/dev/null 2>&1; then screen -ls 2>/dev/null; exit 0; else exit 127; fi`;
}

const LINE =
  /^\s+(\d+)\.(\S+)\s.*\((attached|detached|multi, attached|multi, detached)\)/i;

export function parseScreens(stdout: string): ScreenSession[] {
  const out: ScreenSession[] = [];
  for (const line of stdout.split("\n")) {
    const m = LINE.exec(line);
    if (!m) continue;
    out.push({
      id: `${m[1]}.${m[2]}`,
      name: m[2],
      attached: /attached/i.test(m[3]),
    });
  }
  return out;
}

/** Reattach to the first detached session, else start a new one. */
export function planScreen(
  sessions: ScreenSession[],
  newName: string,
): { create: boolean; target: string } {
  const free = sessions.find((s) => !s.attached);
  return free
    ? { create: false, target: free.id }
    : { create: true, target: newName };
}

/** Finds a session again by name or id after a reconnect. */
export function findScreen(
  sessions: ScreenSession[],
  target: string,
): ScreenSession | undefined {
  return sessions.find((s) => s.id === target || s.name === target);
}

/** Typed into the shell. `-d -r` takes it over from a dead connection. */
export function screenAttachLine(target: string, create: boolean): string {
  const t = shellQuote(target);
  return create
    ? `${PATH_PREFIX} exec screen -S ${t}`
    : `${PATH_PREFIX} exec screen -d -r ${t}`;
}
