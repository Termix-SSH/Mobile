import type { SSHHost } from "@/types";

/**
 * Whether the host speaks SSH. The multi-protocol backend sets `enableSsh`;
 * legacy SSH-only hosts omit it, so undefined means SSH (matches the web).
 */
export function isSshHost(host: SSHHost): boolean {
  if (host.enableSsh != null) return host.enableSsh;
  return !host.enableRdp && !host.enableVnc && !host.enableTelnet;
}

/** SSH is on and the host is not set to open another protocol by default. */
export function isSshActive(host: SSHHost): boolean {
  return (
    host.enableSsh !== false &&
    host.connectionType !== "rdp" &&
    host.connectionType !== "vnc" &&
    host.connectionType !== "telnet"
  );
}

/** Terminal config the shell needs, from a saved host. */
export function toTerminalHostConfig(host: SSHHost) {
  return {
    id: parseInt(host.id.toString()),
    syncId: host.syncId ?? undefined,
    name: host.name,
    ip: host.ip,
    port: parseInt(host.port.toString()),
    username: host.username,
    authType: host.authType,
    password: host.password,
    key: host.key,
    keyPassword: host.keyPassword,
    keyType: host.keyType,
    credentialId: host.credentialId
      ? parseInt(host.credentialId.toString())
      : undefined,
    jumpHosts: host.jumpHosts,
    forceKeyboardInteractive: host.forceKeyboardInteractive,
    overrideCredentialUsername: host.overrideCredentialUsername,
    terminalConfig: host.terminalConfig,
  };
}
