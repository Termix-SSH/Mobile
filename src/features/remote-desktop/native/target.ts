// What the phone needs to open a host's VNC or RDP itself: port, login and size.
import type { ConfirmOptions } from "@/ui/Confirm";
import type { DisplayTarget } from "@/core/transport";
import type { DisplayProtocol } from "@/modules/termix-ssh";
import type { Credential, SSHHost } from "@/types";
import { rdpLogin, type RdpCredentials } from "../rdp-login";
import { resolveRemoteDesktopSize } from "../remoteDesktopSize";

export const DISPLAY_PORTS: Record<DisplayProtocol, number> = {
  rdp: 3389,
  vnc: 5900,
};

type ProtocolLogin = {
  authType?: string;
  username?: string;
  password?: string;
  credentialId?: number | string | null;
};

/** The saved login (credential) a host points to for this protocol, if any. */
export function displayCredentialId(
  host: SSHHost,
  protocol: DisplayProtocol,
): number | null {
  const login = host.protocolAuth?.[protocol] as ProtocolLogin | undefined;
  const id =
    host.authOverrides?.[protocol]?.credentialId ?? login?.credentialId ?? null;
  const n = Number(id);
  return id != null && Number.isFinite(n) && n > 0 ? n : null;
}

export interface DisplayLogin {
  username?: string;
  password?: string;
  domain?: string;
  /** RDP hosts set to ask: nothing is saved, so the user types it. */
  prompt: boolean;
}

/** The host's login for a protocol, from its own fields or its linked credential. */
export function displayLogin(
  host: SSHHost,
  protocol: DisplayProtocol,
  credential: Credential | null,
): DisplayLogin {
  const domain = rdpLogin(host, protocol).domain || undefined;
  if (credential) {
    return {
      username: credential.username || undefined,
      password: credential.password || undefined,
      domain: protocol === "rdp" ? domain : undefined,
      prompt: false,
    };
  }
  if (protocol === "rdp") {
    return {
      username: host.rdpUser || undefined,
      password: host.rdpPassword || undefined,
      domain,
      prompt: rdpLogin(host, "rdp").prompt,
    };
  }
  return {
    username: host.vncUser || undefined,
    password: host.vncPassword || undefined,
    prompt: false,
  };
}

/**
 * Everything to open the session, for a view of `w` x `h` points. RDP asks
 * for the view's pixels and the matching desktop scale; VNC servers keep
 * their own size.
 */
export function displayTarget(
  host: SSHHost,
  protocol: DisplayProtocol,
  login: DisplayLogin | RdpCredentials,
  w: number,
  h: number,
  pixelRatio: number,
): DisplayTarget {
  const size = resolveRemoteDesktopSize(
    host.guacamoleConfig,
    w,
    h,
    protocol === "rdp" ? pixelRatio : 1,
  );
  const port = Number(protocol === "rdp" ? host.rdpPort : host.vncPort);
  return {
    protocol,
    port: Number.isFinite(port) && port > 0 ? port : DISPLAY_PORTS[protocol],
    username: login.username || undefined,
    password: login.password || undefined,
    domain: protocol === "rdp" ? login.domain || undefined : undefined,
    width: size.width,
    height: size.height,
    scale:
      protocol === "rdp" && size.dpi ? Math.round((size.dpi * 100) / 96) : 0,
    security: protocol === "rdp" ? (host.rdpSecurity ?? "") : "",
    connectTimeoutSecs: 15,
  };
}

/** The question when an RDP server shows a certificate the user hasn't trusted. */
export function certPrompt(
  hostName: string,
  problem: { kind: "new" | "changed"; fingerprint: string },
): ConfirmOptions {
  if (problem.kind === "new") {
    return {
      title: "Trust this computer?",
      description: `The phone can't check ${hostName}'s certificate. Make sure this fingerprint matches the one on the computer before you go on.\n\n${problem.fingerprint}`,
      confirmLabel: "Trust and connect",
      destructive: false,
    };
  }
  return {
    title: "Certificate changed",
    description: `${hostName} shows another certificate than last time. That happens after the computer makes a new one, or when someone is listening in between.\n\nNew fingerprint:\n${problem.fingerprint}`,
    confirmLabel: "Trust the new one",
    destructive: true,
  };
}

/** The host pref that keeps the RDP certificate fingerprint the user trusted. */
export const RDP_CERT_PREF = "rdpCert";
