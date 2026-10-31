// Which core keys a host form or import left out, so a new host inherits them.
import type { SSHHostData } from "@/types";

const SSH_OPTION_KEYS = [
  "keepaliveInterval",
  "keepaliveCountMax",
  "allowLegacyAlgorithms",
  "agentForwarding",
  "environmentVariables",
] as const;

/** Core keys the draft says nothing about. */
export function leftOutKeys(draft: Partial<SSHHostData>): Set<string> {
  const out = new Set<string>();
  if (!draft.username?.trim()) out.add("username");
  if (!draft.port) out.add("sshPort");
  if (!draft.authType) out.add("auth");
  if (draft.forceKeyboardInteractive === undefined) {
    out.add("forceKeyboardInteractive");
  }
  for (const key of SSH_OPTION_KEYS) {
    if (draft.sshOptions?.[key] === undefined) out.add(key);
  }
  // The phone's host form has no fields for these.
  out.add("socks5");
  out.add("portKnockSequence");
  if (!draft.jumpHosts?.length) out.add("jumpHosts");
  if (draft.statsConfig === undefined) {
    out.add("statusCheckEnabled");
    out.add("statusCheckInterval");
  }
  return out;
}
