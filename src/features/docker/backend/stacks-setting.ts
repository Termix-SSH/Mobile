import type { SSHHost } from "@/types";

/** The Docker plugin's per host stacks switch. Off by default, like the plugin. */
export function hostStacksOn(host: SSHHost): boolean {
  return host.pluginSettings?.docker?.enableStacks === true;
}
