import type { AxiosRequestConfig } from "axios";
import type { AccountClient } from "@/core/api/AccountClient";
import { USER_AGENT } from "@/core/api/http";
import { classifyRemoteError, isWebPage, SyncError } from "./errors";
import {
  PAGE_LIMIT,
  SUPPORTED_PROTOCOL,
  type ChangesPage,
  type LinkResult,
  type PushOp,
  type PushResult,
  type ServerInfo,
} from "./protocol";

/** What sync needs from an account's client. */
export type SyncClient = Pick<
  AccountClient,
  | "rootBase"
  | "rawAxios"
  | "sessionHeaders"
  | "token"
  | "requestHeaders"
  | "usesNativeNetwork"
  | "getProxy"
>;

const DEFAULT_TIMEOUT = 60_000;
const LONG_TIMEOUT = 120_000;

/** The /sync/v2 routes of one linked server. */
export class SyncRemote {
  constructor(private readonly client: SyncClient) {}

  private async call<T>(
    config: AxiosRequestConfig & { session?: Record<string, string> | null },
  ): Promise<T> {
    const { session, ...rest } = config;
    const http = this.client.rawAxios({
      baseURL: this.client.rootBase(),
      timeout: DEFAULT_TIMEOUT,
      headers: { "User-Agent": USER_AGENT },
    });
    let response;
    try {
      response = await http.request({
        ...rest,
        headers: {
          "Content-Type": "application/json",
          ...(session === null
            ? {}
            : (session ?? this.client.sessionHeaders())),
          ...(rest.headers as Record<string, string> | undefined),
        },
        // Proxies answer with a login page; see it rather than follow it blind.
        responseType: "json",
      });
    } catch (error) {
      throw classifyRemoteError(error);
    }
    const type = String(response.headers?.["content-type"] ?? "");
    if (isWebPage(response.data, type)) {
      // A web app answering on the same address is an old Termix or another
      // site. A proxy login sends us somewhere else first.
      const landed = (response.request as { responseURL?: string } | undefined)
        ?.responseURL;
      if (rest.url === "/sync/v2/info" && sameRoute(landed, rest.url)) {
        throw new SyncError("not_termix", "This is not a Termix server.");
      }
      throw new SyncError("proxy_login", "The proxy wants you to sign in.", {
        status: response.status,
      });
    }
    return response.data as T;
  }

  /** Public. Stops when the server is not Termix or speaks a newer protocol. */
  async info(): Promise<ServerInfo> {
    let info: Partial<ServerInfo> | null;
    try {
      info = await this.call<Partial<ServerInfo>>({
        method: "GET",
        url: "/sync/v2/info",
        params: { clientType: "mobile" },
        session: null,
        timeout: 15_000,
      });
    } catch (error) {
      const sync = classifyRemoteError(error);
      // Termix answers 404 here when its sync plugin is off.
      throw sync;
    }
    if (!info || info.termix !== true || typeof info.protocol !== "number") {
      throw new SyncError("not_termix", "This is not a Termix server.");
    }
    if (info.protocol !== SUPPORTED_PROTOCOL) {
      throw new SyncError(
        "version_mismatch",
        "This server uses a newer sync version. Update the app.",
      );
    }
    return info as ServerInfo;
  }

  /** Trades a fresh login for a long lived device session. */
  link(
    loginToken: string,
    body: { deviceName: string; deviceId: string },
  ): Promise<LinkResult> {
    return this.call<LinkResult>({
      method: "POST",
      url: "/sync/v2/link",
      data: { ...body, clientType: "mobile" },
      session: this.sessionFor(loginToken),
    });
  }

  changes(
    cursor: number,
    options: { limit?: number; types?: string[] } = {},
  ): Promise<ChangesPage> {
    return this.call<ChangesPage>({
      method: "GET",
      url: "/sync/v2/changes",
      timeout: LONG_TIMEOUT,
      params: {
        cursor: String(cursor),
        limit: String(options.limit ?? PAGE_LIMIT),
        ...(options.types?.length ? { types: options.types.join(",") } : {}),
      },
    });
  }

  async push(ops: PushOp[]): Promise<PushResult[]> {
    const res = await this.call<{ results: PushResult[] }>({
      method: "POST",
      url: "/sync/v2/push",
      timeout: LONG_TIMEOUT,
      data: { ops },
    });
    return Array.isArray(res?.results) ? res.results : [];
  }

  /** A new device session when the current one ends within 60 days, else null. */
  async refresh(): Promise<string | null> {
    const res = await this.call<{ token: string | null }>({
      method: "POST",
      url: "/sync/v2/session/refresh",
    });
    return typeof res?.token === "string" && res.token ? res.token : null;
  }

  async unlink(token?: string): Promise<void> {
    await this.call({
      method: "POST",
      url: "/sync/v2/unlink",
      timeout: 10_000,
      session: token ? this.sessionFor(token) : undefined,
    });
  }

  /** The server's own id for a host, null when this account can't reach it. */
  async hostId(syncId: string): Promise<number | null> {
    try {
      const res = await this.call<{ id?: unknown }>({
        method: "GET",
        url: `/sync/v2/hosts/${encodeURIComponent(syncId)}`,
        timeout: 15_000,
      });
      return typeof res?.id === "number" ? res.id : null;
    } catch (error) {
      if (error instanceof SyncError && error.kind === "no_sync") return null;
      throw error;
    }
  }

  /** Host status entries keyed by host syncId. */
  async hostStatus<T>(): Promise<Record<string, T>> {
    const res = await this.call<Record<string, T>>({
      method: "GET",
      url: "/sync/v2/host-status",
      timeout: 15_000,
    });
    return res && typeof res === "object" ? res : {};
  }

  /** Where and how to open the change event stream. */
  eventsRequest(): { url: string; headers: Record<string, string> } {
    return {
      url: `${this.client.rootBase()}/sync/v2/events`,
      headers: {
        ...this.client.requestHeaders(),
        Accept: "text/event-stream",
      },
    };
  }

  private sessionFor(token: string): Record<string, string> {
    // Same rule as AccountClient.sessionHeaders: a cookie behind basic auth.
    return this.client.getProxy().basicAuth
      ? { Cookie: `jwt=${token}` }
      : { Authorization: `Bearer ${token}` };
  }
}

function sameRoute(landed: string | undefined, path: string): boolean {
  if (!landed) return true;
  try {
    return new URL(landed).pathname.endsWith(path);
  } catch {
    return true;
  }
}
