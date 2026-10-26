import {
  AxiosError,
  type AxiosAdapter,
  type AxiosInstance,
  type CreateAxiosDefaults,
} from "axios";
import {
  clearCookie,
  importClientCert,
  nativeRequest,
  NativeSocket,
  needsNativeRequests,
  readJarCookies,
  removeClientCert,
  setServerPins,
  setCookies,
  type NetCookie,
} from "@/modules/termix-net";
import {
  type ApiGeneration,
  buildTerminalWebSocketUrl,
  hasSavedTunnels,
  isVersionAtLeast,
  toPluginRequest,
  toWebSocketBase,
} from "@/core/api/compat/api-compat";
import {
  parseServerPlugins,
  type ServerPlugin,
} from "@/core/api/compat/server-features";
import { handleApiError } from "@/core/api/errors";
import {
  createHttp,
  createRawHttp,
  isHtmlPayload,
  USER_AGENT,
  type HttpOwner,
} from "@/core/api/http";
import { createModules, type ApiModules } from "@/core/api/modules";
import { nativeAdapter, toFetchResponse } from "@/core/api/native-adapter";
import {
  hasExpiredCookie,
  mergeJarCookies,
  missingFromJar,
} from "@/core/api/proxy-cookies";
import { toBase64, utf8Encode } from "@/core/db/bytes";
import { systemLogger } from "@/core/log/logger";
import type { AccountStorage } from "@/core/storage/kv";

export interface ProxyHeader {
  name: string;
  value: string;
}

export interface BasicAuth {
  username: string;
  password: string;
}

/**
 * What the app shows about the client certificate. The certificate and its
 * key live in the iOS Keychain or Android Keystore, not here.
 */
export interface ClientCert {
  name: string | null;
  subject: string | null;
  notAfter: number | null;
}

/** Anything with the WebSocket calls the app's sockets use. */
export type SocketLike = Pick<
  WebSocket,
  | "send"
  | "close"
  | "readyState"
  | "onopen"
  | "onmessage"
  | "onclose"
  | "onerror"
>;

export interface AccountClientOptions {
  accountId: string;
  serverUrl: string;
  storage: AccountStorage;
}

/** Every secret an account keeps in SecureStore. */
export const SECRET_KEYS = [
  "session",
  "customHeaders",
  "basicAuth",
  "clientCert",
  "proxyCookies",
  // The Face ID sign in, see core/accounts/saved-login.
  "savedLogin",
];
const DATA_KEYS = [
  "apiGeneration",
  "serverPlugins",
  "enabledPlugins",
  "hostOrigins",
  "savedLoginOn",
  "savedLoginAsked",
  "certPins",
];

/**
 * Everything needed to talk to one Termix server as one user: base URLs,
 * session token, proxy headers, client certificate, which API generation the
 * server speaks and which plugins it runs. There is one per linked account.
 */
export class AccountClient implements HttpOwner {
  readonly accountId: string;
  readonly serverUrl: string;
  readonly storage: AccountStorage;

  apiGeneration: ApiGeneration = "legacy";
  /** Plugins that are on and running. Null when unknown. */
  enabledPlugins: ServerPlugin[] | null = null;
  /** Every plugin the server lists, on or off. Null when unknown. */
  serverPlugins: ServerPlugin[] | null = null;

  /** Axios instances per area. Legacy servers may move some of them. */
  http!: {
    host: AxiosInstance;
    tunnel: AxiosInstance;
    files: AxiosInstance;
    stats: AxiosInstance;
    auth: AxiosInstance;
  };

  readonly api: ApiModules;

  private sessionToken: string | null = null;
  private customHeaders: ProxyHeader[] = [];
  private basic: BasicAuth | null = null;
  private cert: ClientCert | null = null;
  private pins: string[] = [];
  private cookies: NetCookie[] = [];
  private loaded: Promise<void> | null = null;
  private ready = false;
  private listeners = new Set<() => void>();
  private authLostListeners = new Set<() => void>();

  constructor(options: AccountClientOptions) {
    this.accountId = options.accountId;
    this.serverUrl = options.serverUrl.replace(/\/+$/, "");
    this.storage = options.storage;
    this.buildHttp();
    this.api = createModules(this);
  }

  /** Reads the saved session and caches. Safe to call more than once. */
  load(): Promise<void> {
    this.loaded ??= (async () => {
      const { data, secrets } = this.storage;
      const [
        token,
        headers,
        basic,
        cert,
        cookies,
        generation,
        plugins,
        oldPlugins,
        pins,
      ] = await Promise.all([
        secrets.get("session"),
        secrets.getJson<ProxyHeader[]>("customHeaders"),
        secrets.getJson<BasicAuth>("basicAuth"),
        secrets.getJson<ClientCert>("clientCert"),
        secrets.getJson<NetCookie[]>("proxyCookies"),
        data.get("apiGeneration"),
        data.getJson<unknown>("serverPlugins"),
        // Builds before 2.0 kept only the plugins that were on.
        data.getJson<unknown>("enabledPlugins"),
        data.getJson<string[]>("certPins"),
      ]);
      this.sessionToken = token;
      this.customHeaders = Array.isArray(headers) ? headers : [];
      this.basic = basic;
      // Older builds saved the certificate file itself here; it never worked.
      this.cert = cert && !("pfx" in cert) ? cert : null;
      this.cookies = Array.isArray(cookies) ? cookies : [];
      this.pins = Array.isArray(pins) ? pins : [];
      // The native store keeps pins too; put them back in case it lost them.
      if (this.pins.length) {
        await setServerPins(this.pinHost(), this.pins).catch(() => {});
      }
      // Session cookies are gone after a restart, so put them back, but never
      // over a newer value the proxy set meanwhile.
      await this.syncCookieJar().catch(() => {});
      if (generation === "plugin" || generation === "legacy") {
        this.apiGeneration = generation;
      }
      this.applyPlugins(
        this.apiGeneration === "plugin"
          ? parseServerPlugins(plugins ?? oldPlugins)
          : null,
      );
      this.buildHttp();
      this.ready = true;
      this.emit();
    })();
    return this.loaded;
  }

  /** True once load() read the saved session and proxy settings. */
  isLoaded(): boolean {
    return this.ready;
  }

  // Session

  token(): string | null {
    return this.sessionToken;
  }

  isAuthenticated(): boolean {
    return !!this.sessionToken;
  }

  async setToken(token: string | null): Promise<void> {
    const changed = (token || null) !== this.sessionToken;
    this.sessionToken = token || null;
    // A login response leaves its token as a jwt cookie in the shared jar. The
    // server reads that cookie before the Bearer header, so once the login
    // session ends it would turn every request into a 401.
    if (changed) await clearCookie(this.rootBase(), "jwt");
    if (this.sessionToken) {
      await this.storage.secrets.set("session", this.sessionToken);
    } else {
      await this.storage.secrets.remove("session").catch(() => {});
    }
    this.emit();
  }

  clearToken(): Promise<void> {
    return this.setToken(null);
  }

  /** Called on a 401 from a critical endpoint. */
  onAuthLost(listener: () => void): () => void {
    this.authLostListeners.add(listener);
    return () => this.authLostListeners.delete(listener);
  }

  /**
   * Ends the session after a 401, unless it still works. A jwt cookie that a
   * WebView or another route left in the shared jar beats the Bearer token,
   * so that cookie goes first and the server is asked once more.
   */
  notifyAuthLost(): Promise<void> {
    this.authCheck ??= this.endSessionIfDead().finally(() => {
      this.authCheck = null;
    });
    return this.authCheck;
  }

  private authCheck: Promise<void> | null = null;

  /** Waits for a running 401 check, if any. */
  authChecked(): Promise<void> {
    return this.authCheck ?? Promise.resolve();
  }

  private async endSessionIfDead(): Promise<void> {
    const token = this.sessionToken;
    if (token && (await this.sessionWorks())) return;
    // Linking for sync may have swapped the token while this ran.
    if (this.sessionToken !== token) return;
    // Drop the dead token too, otherwise it keeps getting sent on every
    // request and socket connect until the next cold start.
    await this.clearToken();
    this.authLostListeners.forEach((listener) => listener());
  }

  private async sessionWorks(): Promise<boolean> {
    await clearCookie(this.rootBase(), "jwt").catch(() => {});
    const http = this.rawAxios({
      timeout: 10000,
      headers: this.sessionHeaders(),
      validateStatus: () => true,
    });
    try {
      let res = await http.get(`${this.rootBase()}/users/me`);
      // Old servers keep it under the ssh base.
      if (res.status === 404)
        res = await http.get(`${this.sshBase()}/users/me`);
      return res.status >= 200 && res.status < 300;
    } catch {
      return false;
    }
  }

  // Proxy and TLS

  proxyHeaders(): Record<string, string> {
    const out: Record<string, string> = {};
    for (const h of this.customHeaders) {
      if (h?.name) out[h.name] = h.value ?? "";
    }
    if (this.basic) {
      const pair = `${this.basic.username}:${this.basic.password}`;
      out.Authorization = `Basic ${toBase64(utf8Encode(pair))}`;
    }
    return out;
  }

  /**
   * The session for a request. Basic auth needs the Authorization header, so
   * then the session goes as the jwt cookie instead, like the desktop app.
   */
  sessionHeaders(): Record<string, string> {
    const token = this.sessionToken;
    if (!token) return {};
    return this.basic
      ? { Cookie: `jwt=${token}` }
      : { Authorization: `Bearer ${token}` };
  }

  /** Proxy headers plus the session, for sockets and streams. */
  requestHeaders(): Record<string, string> {
    const out: Record<string, string> = {
      ...this.proxyHeaders(),
      "User-Agent": USER_AGENT,
    };
    for (const [name, value] of Object.entries(this.sessionHeaders())) {
      out[name] = value;
    }
    return out;
  }

  getProxy(): { customHeaders: ProxyHeader[]; basicAuth: BasicAuth | null } {
    return { customHeaders: [...this.customHeaders], basicAuth: this.basic };
  }

  async setProxy(next: {
    customHeaders?: ProxyHeader[];
    basicAuth?: BasicAuth | null;
  }): Promise<void> {
    if (next.customHeaders) {
      this.customHeaders = next.customHeaders.filter((h) => h.name.trim());
      await this.storage.secrets.setJson("customHeaders", this.customHeaders);
    }
    if (next.basicAuth !== undefined) {
      this.basic = next.basicAuth;
      if (next.basicAuth) {
        await this.storage.secrets.setJson("basicAuth", next.basicAuth);
      } else {
        await this.storage.secrets.remove("basicAuth").catch(() => {});
      }
    }
    this.emit();
  }

  clientCert(): ClientCert | null {
    return this.cert;
  }

  /** Imports a PFX or P12 file. The key goes into the Keychain or Keystore. */
  async setClientCert(file: {
    base64: string;
    passphrase: string;
    name: string | null;
  }): Promise<ClientCert> {
    const info = await importClientCert(
      this.accountId,
      new URL(this.rootBase()).hostname,
      file.base64,
      file.passphrase,
    );
    this.cert = {
      name: file.name,
      subject: info.subject,
      notAfter: info.notAfter,
    };
    await this.storage.secrets.setJson("clientCert", this.cert);
    this.emit();
    return this.cert;
  }

  async removeClientCert(): Promise<void> {
    this.cert = null;
    await removeClientCert(this.accountId);
    await this.storage.secrets.remove("clientCert").catch(() => {});
    this.emit();
  }

  /** Pinned public keys of this server, base64 sha256. Empty when not pinned. */
  certPins(): string[] {
    return [...this.pins];
  }

  /**
   * Trusts this server only by these keys, for API calls, sockets and web
   * views. A self-signed server works once pinned. Empty turns pinning off.
   */
  async setCertPins(pins: string[]): Promise<void> {
    await setServerPins(this.pinHost(), pins);
    this.pins = [...pins];
    if (pins.length) await this.storage.data.setJson("certPins", this.pins);
    else await this.storage.data.remove("certPins").catch(() => {});
    this.emit();
  }

  private pinHost(): string {
    return new URL(this.rootBase()).hostname;
  }

  /** Cookies from a proxy sign in (Cloudflare Access, Authelia, ...). */
  proxyCookies(): NetCookie[] {
    return [...this.cookies];
  }

  async setProxyCookies(cookies: NetCookie[]): Promise<void> {
    // Never keep a jwt cookie: it would beat the session token.
    this.cookies = cookies.filter((c) => c.name && c.name !== "jwt");
    if (this.cookies.length) {
      await this.storage.secrets.setJson("proxyCookies", this.cookies);
      await this.syncCookieJar();
    } else {
      await this.storage.secrets.remove("proxyCookies").catch(() => {});
    }
    this.emit();
  }

  /**
   * Puts back saved cookies the jar lost and saves values the proxy renewed.
   * Run on start and when the app goes to the background.
   */
  async syncCookieJar(): Promise<void> {
    if (!this.cookies.length) return;
    const root = this.rootBase();
    const jar = await readJarCookies(root);
    const missing = missingFromJar(this.cookies, jar);
    if (missing.length) await setCookies(root, missing);
    const renewed = mergeJarCookies(this.cookies, jar);
    if (renewed) {
      this.cookies = renewed;
      await this.storage.secrets.setJson("proxyCookies", renewed);
    }
  }

  /** True when a saved proxy cookie ran out, so the proxy will ask again. */
  proxyCookiesExpired(now = Date.now()): boolean {
    return hasExpiredCookie(this.cookies, now);
  }

  /**
   * True when requests must go through the module: to send the client
   * certificate, or for the pin to be checked (iOS).
   */
  usesNativeNetwork(): boolean {
    return (!!this.cert || this.pins.length > 0) && needsNativeRequests();
  }

  adapter(): AxiosAdapter | undefined {
    return this.usesNativeNetwork() ? nativeAdapter : undefined;
  }

  /** A WebSocket to this server, with the certificate and proxy headers. */
  openSocket(url: string, protocols: string[] = []): SocketLike {
    const headers = { ...this.proxyHeaders(), "User-Agent": USER_AGENT };
    if (this.usesNativeNetwork()) {
      return new NativeSocket(url, protocols, headers) as unknown as SocketLike;
    }
    const Socket = WebSocket as unknown as new (
      url: string,
      protocols: string[],
      options: { headers: Record<string, string> },
    ) => WebSocket;
    return new Socket(url, protocols, { headers });
  }

  /** Removes every key this account wrote. */
  async wipe(): Promise<void> {
    this.sessionToken = null;
    await removeClientCert(this.accountId);
    if (this.pins.length)
      await setServerPins(this.pinHost(), []).catch(() => {});
    this.pins = [];
    await clearCookie(this.rootBase(), "jwt");
    await this.storage.wipe({ data: DATA_KEYS, secrets: SECRET_KEYS });
  }

  // Requests

  createHttp(baseURL: string, serviceName?: string): AxiosInstance {
    return createHttp(this, baseURL, serviceName);
  }

  /** Axios without the token, for probes and fallbacks. Keeps proxy headers. */
  rawAxios(config: CreateAxiosDefaults = {}): AxiosInstance {
    return createRawHttp(this, config);
  }

  /** fetch with the proxy headers added. */
  async fetch(input: string, init: RequestInit = {}): Promise<Response> {
    const headers = {
      ...this.proxyHeaders(),
      ...(init.headers as Record<string, string> | undefined),
    };
    if (this.usesNativeNetwork()) {
      return toFetchResponse(
        await nativeRequest({
          url: input,
          method: init.method ?? "GET",
          headers,
          body: typeof init.body === "string" ? init.body : null,
        }),
      );
    }
    return fetch(input, { ...init, headers });
  }

  /**
   * Whether a failed request carried the session this client holds now. A
   * request sent with a token that was swapped meanwhile (linking for sync,
   * a refresh) must not end the new session.
   */
  sentCurrentSession(error: unknown): boolean {
    const token = this.sessionToken;
    if (!token) return true;
    const headers = (
      error as { config?: { headers?: Record<string, unknown> } }
    )?.config?.headers;
    const auth = String(headers?.Authorization ?? headers?.authorization ?? "");
    const cookie = String(headers?.Cookie ?? headers?.cookie ?? "");
    if (!auth && !cookie) return true;
    return auth.includes(token) || cookie.includes(token);
  }

  /** Turns a failed request into an ApiError and reacts to auth loss. */
  fail(error: unknown, operation: string): never {
    return handleApiError(
      {
        onAuthLost: () => {
          if (this.sentCurrentSession(error)) this.notifyAuthLost();
        },
        refreshEnabledPlugins: () => this.refreshEnabledPlugins(),
      },
      error,
      operation,
    );
  }

  rewrite(config: { baseURL?: string; url?: string; method?: string }): void {
    if (this.apiGeneration !== "plugin") return;
    const root = this.rootBase();
    const url = config.url || "";
    const full = /^https?:\/\//i.test(url)
      ? url
      : `${config.baseURL || ""}${url}`;
    if (!full.startsWith(root)) return;
    const rel = full.slice(root.length) || "/";
    const next = toPluginRequest(config.method || "get", rel);
    if (next === rel) return;
    config.baseURL = root;
    config.url = next;
  }

  // Base URLs. A saved URL may end in /ssh from old setups.

  rootBase(): string {
    return this.serverUrl.replace(/\/ssh$/, "") || this.serverUrl;
  }

  sshBase(): string {
    return /\/ssh$/.test(this.serverUrl)
      ? this.serverUrl
      : `${this.serverUrl}/ssh`;
  }

  hostBase(): string {
    if (/\/host$/.test(this.serverUrl)) return this.serverUrl;
    return `${this.serverUrl.replace(/\/ssh$/, "")}/host`;
  }

  apiUrl(path: string): string {
    return `${this.serverUrl}${path}`;
  }

  hostBaseCandidates(): string[] {
    return [this.hostBase(), this.sshBase(), this.rootBase()].filter(
      (base, index, all) => all.indexOf(base) === index,
    );
  }

  private buildHttp(): void {
    if (this.apiGeneration === "plugin") {
      // Legacy style bases on the root; rewrite() maps the paths.
      const root = this.rootBase();
      this.http = {
        host: this.createHttp(`${root}/host`, "SSH_HOST"),
        tunnel: this.createHttp(`${root}/ssh`, "TUNNEL"),
        files: this.createHttp(`${root}/ssh/file_manager`, "FILE_MANAGER"),
        stats: this.createHttp(root, "STATS"),
        auth: this.createHttp(root, "AUTH"),
      };
      return;
    }
    this.http = {
      host: this.createHttp(this.hostBase(), "SSH_HOST"),
      tunnel: this.createHttp(this.apiUrl("/ssh"), "TUNNEL"),
      files: this.createHttp(this.apiUrl("/ssh/file_manager"), "FILE_MANAGER"),
      stats: this.createHttp(this.apiUrl(""), "STATS"),
      auth: this.createHttp(this.rootBase(), "AUTH"),
    };
  }

  // Server features

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Goes up on every change, for useSyncExternalStore. */
  version = 0;

  private emit(): void {
    this.version++;
    this.listeners.forEach((listener) => listener());
  }

  isPluginApi(): boolean {
    return this.apiGeneration === "plugin";
  }

  /**
   * Whether the server can serve something that needs this plugin, and for
   * protocol plugins this protocol. Same rules as isPluginEnabled.
   */
  supports(req: {
    plugin: string;
    protocol?: string;
    pluginApiOnly?: boolean;
  }): boolean {
    if (this.apiGeneration !== "plugin") return !req.pluginApiOnly;
    if (!this.enabledPlugins) return true;
    const plugin = this.enabledPlugins.find((p) => p.id === req.plugin);
    if (!plugin) return false;
    if (req.protocol && plugin.protocols) {
      return plugin.protocols.includes(req.protocol);
    }
    return true;
  }

  /**
   * True when the plugin is on. Pre 2.9 servers have everything built in,
   * and before the list has loaded this says true, so nothing flickers off.
   */
  supportsSavedTunnels(): boolean {
    if (this.apiGeneration !== "plugin") return false;
    if (!this.enabledPlugins) return true;
    return hasSavedTunnels(this.enabledPlugins.find((p) => p.id === "tunnels"));
  }

  isPluginEnabled(pluginId: string): boolean {
    if (this.apiGeneration !== "plugin" || !this.enabledPlugins) return true;
    return this.enabledPlugins.some((p) => p.id === pluginId);
  }

  private applyPlugins(all: ServerPlugin[] | null): void {
    this.serverPlugins = all;
    this.enabledPlugins = all ? all.filter((p) => p.active) : null;
  }

  private setServerPlugins(next: ServerPlugin[] | null): void {
    this.applyPlugins(next);
    this.emit();
  }

  private async setApiGeneration(generation: ApiGeneration): Promise<void> {
    const changed = generation !== this.apiGeneration;
    this.apiGeneration = generation;
    if (changed) {
      systemLogger.info(`Server API generation: ${generation}`, {
        operation: "api_generation",
      });
      this.buildHttp();
      this.emit();
    }
    await this.storage.data.set("apiGeneration", generation).catch(() => {});
  }

  /**
   * Works out whether the server is 2.9+ (plugin API) or older. The public
   * plugin manifest only exists on 2.9+, and older servers answer it with
   * their web UI's HTML.
   */
  async detectApiGeneration(): Promise<ApiGeneration> {
    const root = this.rootBase();
    // Without any answer from the server, keep the cached generation.
    let reached = false;
    try {
      const res = await this.rawAxios({ timeout: 5000 }).get(
        `${root}/plugins/public-manifest`,
      );
      reached = true;
      if (
        !isHtmlPayload(res.data) &&
        res.data &&
        typeof res.data === "object"
      ) {
        await this.setApiGeneration("plugin");
        return this.apiGeneration;
      }
    } catch (error) {
      if (error instanceof AxiosError && error.response) reached = true;
    }

    try {
      if (this.sessionToken) {
        const res = await this.rawAxios({
          timeout: 5000,
          headers: { Authorization: `Bearer ${this.sessionToken}` },
        }).get(`${root}/version?checkRemote=false`);
        if (!isHtmlPayload(res.data)) {
          const version = res.data?.localVersion ?? res.data?.version;
          await this.setApiGeneration(
            isVersionAtLeast(version, "2.9.0") ? "plugin" : "legacy",
          );
          return this.apiGeneration;
        }
      }
    } catch (error) {
      if (error instanceof AxiosError && error.response) reached = true;
    }

    if (reached) await this.setApiGeneration("legacy");
    return this.apiGeneration;
  }

  /** Loads which plugins are on. Needs a signed in user. */
  async refreshEnabledPlugins(): Promise<void> {
    if (this.apiGeneration !== "plugin") {
      this.setServerPlugins(null);
      return;
    }
    try {
      const res = await this.http.auth.get("/plugins");
      const list = parseServerPlugins(
        Array.isArray(res.data) ? res.data : res.data?.plugins,
      );
      if (list) {
        this.setServerPlugins(list);
        await this.storage.data.setJson("serverPlugins", list).catch(() => {});
      }
    } catch {
      // Keep whatever we had; features stay visible rather than vanishing.
    }
  }

  /**
   * Re-checks the server API and the enabled plugins. Run after sign in, since
   * the plugin list and the /version fallback both need a token.
   */
  async refreshServerApi(): Promise<void> {
    await this.load();
    await this.detectApiGeneration();
    if (this.apiGeneration === "plugin") {
      await this.refreshEnabledPlugins();
    } else {
      this.setServerPlugins(null);
      await this.detectLegacyBases();
    }
  }

  /** Pre 2.9 servers may serve stats and auth from the root or from /ssh. */
  private async detectLegacyBases(): Promise<void> {
    const headers = {
      "Content-Type": "application/json",
      ...(this.sessionToken
        ? { Authorization: `Bearer ${this.sessionToken}` }
        : {}),
    };
    const ok = async (base: string, path: string) => {
      try {
        await this.rawAxios({ baseURL: base, timeout: 5000, headers }).head(
          path,
        );
        return true;
      } catch {
        return false;
      }
    };
    try {
      const [statsRoot, statsSsh, authRoot, authSsh] = await Promise.all([
        ok(this.rootBase(), "/status"),
        ok(this.sshBase(), "/status"),
        ok(this.rootBase(), "/users/registration-allowed"),
        ok(this.sshBase(), "/users/registration-allowed"),
      ]);
      if (statsRoot)
        this.http.stats = this.createHttp(this.rootBase(), "STATS");
      else if (statsSsh)
        this.http.stats = this.createHttp(this.sshBase(), "STATS");
      if (authRoot) this.http.auth = this.createHttp(this.rootBase(), "AUTH");
      else if (authSsh)
        this.http.auth = this.createHttp(this.sshBase(), "AUTH");
    } catch {}
  }

  // Sockets

  /** Terminal socket URL for the detected server API. */
  terminalWebSocketUrl(token: string): string {
    return buildTerminalWebSocketUrl(this.serverUrl, token, this.apiGeneration);
  }

  /**
   * WebSocket URL for the Docker exec console. Open it with the
   * `termix.jwt.<token>` subprotocol: 2.9 only reads the token from there,
   * older servers read the `?token=` query. The console speaks JSON messages:
   * connect/input/resize/disconnect.
   */
  dockerConsoleWebSocketUrl(token: string): string {
    if (this.apiGeneration === "plugin") {
      return `${toWebSocketBase(this.serverUrl)}/plugin-ws/docker/console`;
    }
    const params = new URLSearchParams({ token });
    return `${toWebSocketBase(this.rootBase())}/docker/console/?${params.toString()}`;
  }

  /**
   * A plugin socket on 2.9+, like `pluginWebSocketUrl("service-manager", "follow")`.
   * Open it with the `termix.jwt.<token>` subprotocol.
   */
  pluginWebSocketUrl(pluginId: string, path: string): string {
    return `${toWebSocketBase(this.serverUrl)}/plugin-ws/${pluginId}/${path}`;
  }

  remoteDesktopWebSocketUrl(
    token: string,
    width?: number,
    height?: number,
    dpi?: number,
  ): string {
    const params = new URLSearchParams({ token });
    if (width) params.set("width", String(width));
    if (height) params.set("height", String(height));
    if (dpi) params.set("dpi", String(dpi));
    const base = toWebSocketBase(this.rootBase());
    if (this.apiGeneration === "plugin") {
      return `${base}/plugin-ws/remote-desktop/display?${params.toString()}`;
    }
    return `${base}/guacamole/websocket/?${params.toString()}`;
  }

  userAgent(): string {
    return USER_AGENT;
  }
}
