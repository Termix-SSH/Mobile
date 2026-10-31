import type { SSHHost } from "@/types";

/** Host pref set to "always" once the user picks Always fill. */
export const PASSWORD_FILL_PREF = "passwordFill";

/**
 * Whether the phone could have a password to fill. Hosts shared with you
 * never carry the owner's secrets, so they are never offered one.
 */
export function hostCanFill(host: SSHHost): boolean {
  if (host.shared) return false;
  const flags = host as SSHHost & {
    hasPassword?: boolean;
    hasSudoPassword?: boolean;
  };
  return Boolean(
    host.password ||
    host.sudoPassword ||
    flags.hasPassword ||
    flags.hasSudoPassword,
  );
}
