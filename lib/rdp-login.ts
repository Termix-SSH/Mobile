export interface RdpLoginHost {
  rdpAuthType?: string;
  rdpDomain?: string;
  domain?: string;
  protocolAuth?: Record<string, unknown>;
  authOverrides?: Record<string, { credentialId?: number | string | null }>;
}

export interface RdpCredentials {
  username: string;
  password: string;
  domain: string;
}

export function rdpLogin(host: RdpLoginHost, protocol: string) {
  const login = host.protocolAuth?.rdp as
    | { authType?: string; fields?: { domain?: string } }
    | undefined;
  return {
    prompt:
      protocol === "rdp" &&
      (login?.authType ?? host.rdpAuthType) === "none" &&
      !host.authOverrides?.rdp?.credentialId,
    domain: login?.fields?.domain ?? host.rdpDomain ?? host.domain ?? "",
  };
}

export function remoteDesktopConnectBody(
  protocol?: "rdp" | "vnc" | "telnet",
  credentials?: RdpCredentials,
) {
  return {
    ...(protocol ? { protocol } : {}),
    ...(credentials
      ? {
          promptedUsername: credentials.username,
          promptedPassword: credentials.password,
          promptedDomain: credentials.domain,
        }
      : {}),
  };
}
