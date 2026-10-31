import type { AccountClient } from "../AccountClient";

export type SharePermission = "read-only" | "read-write";

export interface CreatedShare {
  shareId: string;
  linkToken: string | null;
  expiresAt: string | null;
}

/** The session-sharing plugin's share links for live terminal sessions. */
export function createSessionSharingApi(c: AccountClient) {
  const base = () => ({ baseURL: c.rootBase() });

  async function createLink(input: {
    hostId: number;
    sessionId: string;
    tabInstanceId?: string;
    permissionLevel: SharePermission;
    /** Unset never expires. */
    expiryHours?: number;
  }): Promise<CreatedShare> {
    const response = await c.http.auth.post(
      "/plugin-api/session-sharing/create",
      {
        hostId: input.hostId,
        sessionId: input.sessionId,
        tabInstanceId: input.tabInstanceId,
        protocol: "ssh",
        shareType: "link",
        permissionLevel: input.permissionLevel,
        expiryHours: input.expiryHours,
      },
      base(),
    );
    return response.data as CreatedShare;
  }

  /** The admin's public address for guest links, or the server's own. */
  async function publicUrl(): Promise<string> {
    try {
      const response = await c.http.auth.get(
        "/plugin-api/session-sharing/public-url",
        base(),
      );
      const url = (response.data as { url?: unknown })?.url;
      if (typeof url === "string" && url) return url;
    } catch {}
    return c.rootBase();
  }

  async function revoke(shareId: string): Promise<void> {
    await c.http.auth.delete(
      `/plugin-api/session-sharing/${encodeURIComponent(shareId)}`,
      base(),
    );
  }

  return { createLink, publicUrl, revoke };
}

/** Same link as the web app's guestViewUrl: ?view=shared&token=. */
export function guestLink(publicUrl: string, token: string): string | null {
  let url: URL;
  try {
    url = new URL(publicUrl);
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  url.search = "";
  url.hash = "";
  url.searchParams.set("view", "shared");
  url.searchParams.set("token", token);
  return url.toString();
}

export type SessionSharingApi = ReturnType<typeof createSessionSharingApi>;
