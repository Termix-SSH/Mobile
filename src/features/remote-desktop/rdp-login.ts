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
    { authType?: string; fields?: { domain?: string } } | undefined;
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

// Guacamole's CLIENT_UNAUTHORIZED and CLIENT_FORBIDDEN.
const AUTH_CODES = new Set([0x0301, 0x0303]);

export interface RemoteError {
  code?: number;
  message?: string;
}

export function isAuthFailure(error: RemoteError): boolean {
  if (error.code != null && AUTH_CODES.has(error.code)) return true;
  return /authentication fail|logon fail|invalid credentials/i.test(
    error.message ?? "",
  );
}

/**
 * What to do when the remote refused the login. The server only takes a
 * typed login for hosts set to ask, so a saved login gets a message instead.
 */
export function afterAuthFailure(
  protocol: string,
  prompts: boolean,
  error: RemoteError,
): "prompt" | "saved-login" | null {
  if (protocol !== "rdp" || !isAuthFailure(error)) return null;
  return prompts ? "prompt" : "saved-login";
}
