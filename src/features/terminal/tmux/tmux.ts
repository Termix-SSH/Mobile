/**
 * tmux on a host the phone connects to itself. The checks run on their own
 * exec channel of the same SSH connection; the attach is typed into the shell
 * so tmux gets the terminal. Same plan as Plugin-SSH-Terminal's auto tmux.
 */

import { shellQuote } from "../startup";

const SEP = "|~|";
// Where tmux lives on hosts whose non login PATH misses it, like Tmux Monitor.
export const PATH_PREFIX =
  'PATH=/opt/homebrew/bin:/usr/local/bin:/opt/bin:/usr/pkg/bin:"$PATH"';

export interface TmuxSession {
  name: string;
  windows: number;
  attached: number;
  /** Unix seconds. */
  activity: number;
}

export interface TmuxWindow {
  session: string;
  index: number;
  name: string;
  active: boolean;
}

export type TmuxAttachPlan = "create" | "attach" | "pick";

/** Start one when there is none, reattach to the only one, ask when there is a choice. */
export function planTmuxAttach(count: number): TmuxAttachPlan {
  if (count === 0) return "create";
  return count === 1 ? "attach" : "pick";
}

/** Exit 127 when tmux is missing, else the session list (empty when none). */
export function listSessionsCommand(): string {
  const format = [
    "#{session_name}",
    "#{session_windows}",
    "#{session_attached}",
    "#{session_activity}",
  ].join(SEP);
  return `${PATH_PREFIX}; export PATH; if command -v tmux >/dev/null 2>&1; then tmux list-sessions -F ${shellQuote(format)} 2>/dev/null; exit 0; else exit 127; fi`;
}

export function parseSessions(stdout: string): TmuxSession[] {
  return stdout
    .split("\n")
    .map((line) => line.split(SEP))
    .filter((parts) => parts.length >= 4 && parts[0])
    .map(([name, windows, attached, activity]) => ({
      name,
      windows: Number(windows) || 0,
      attached: Number(attached) || 0,
      activity: Number(activity) || 0,
    }));
}

export function listWindowsCommand(): string {
  const format = [
    "#{session_name}",
    "#{window_index}",
    "#{window_name}",
    "#{window_active}",
  ].join(SEP);
  return `${PATH_PREFIX}; export PATH; tmux list-windows -a -F ${shellQuote(format)} 2>/dev/null`;
}

export function parseWindows(stdout: string): TmuxWindow[] {
  return stdout
    .split("\n")
    .map((line) => line.split(SEP))
    .filter((parts) => parts.length >= 4 && parts[0])
    .map(([session, index, name, active]) => ({
      session,
      index: Number(index) || 0,
      name,
      active: active === "1",
    }));
}

/** A new session name like the web terminal's: termix-<host>-<4 chars>. */
export function newSessionName(hostKey: string, now = Date.now()): string {
  const host = hostKey.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 8) || "host";
  return `termix-${host}-${now.toString(36).slice(-4)}`;
}

/** The line typed into the shell. `exec` replaces the shell, so leaving tmux ends the tab like on the web. */
export function attachLine(name: string, create: boolean): string {
  const target = shellQuote(create ? name : `=${name}`);
  return create
    ? `${PATH_PREFIX} exec tmux new-session -s ${target}`
    : `${PATH_PREFIX} exec tmux attach-session -t ${target}`;
}

/** Keys after the prefix that select a window: its digit, or the index prompt for 10 and up. */
export function selectWindowKeys(index: number): string {
  if (index >= 0 && index <= 9) return String(index);
  return `'${index}\r`;
}
