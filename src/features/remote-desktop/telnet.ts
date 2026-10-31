import type { NeedsResult } from "@/core/transport";

export const TELNET_TAB = "telnet";
export const REMOTE_DESKTOP_TAB = "remoteDesktop";

/**
 * Which tab a Telnet host opens: the phone's own terminal when the phone can
 * reach it, else the server's remote desktop view. With neither, the terminal
 * tab shows why.
 */
export function telnetTabFor(check: NeedsResult): string {
  const first = check.attempts[0];
  return first && first.kind === "relay" ? REMOTE_DESKTOP_TAB : TELNET_TAB;
}
