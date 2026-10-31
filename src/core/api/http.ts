import axios, {
  AxiosError,
  type AxiosAdapter,
  type AxiosInstance,
  type CreateAxiosDefaults,
} from "axios";
import { Platform } from "react-native";
import {
  apiLogger,
  authLogger,
  fileLogger,
  sshLogger,
  statsLogger,
  tunnelLogger,
  type LogContext,
} from "@/core/log/logger";

/** What an axios instance needs from the account that owns it. */
export interface HttpOwner {
  token(): string | null;
  /** Headers a reverse proxy in front of the server expects. */
  proxyHeaders(): Record<string, string>;
  /** The session as a Bearer header, or as the jwt cookie behind basic auth. */
  sessionHeaders(): Record<string, string>;
  /** A transport other than the default one, for client certificates. */
  adapter?(): AxiosAdapter | undefined;
  /** Maps pre 2.9 paths onto plugin routes when the server needs it. */
  rewrite(config: { baseURL?: string; url?: string; method?: string }): void;
}

export const USER_AGENT =
  Platform.OS === "android"
    ? "Termix-Mobile/Android"
    : Platform.OS === "ios"
      ? "Termix-Mobile/iOS"
      : `Termix-Mobile/${Platform.OS}`;

export function isHtmlPayload(data: unknown): boolean {
  return typeof data === "string" && /^\s*<(!doctype|html)/i.test(data);
}

/** True when a redirect took the request to another host. */
export function leftServer(
  config: { baseURL?: string; url?: string },
  responseURL: unknown,
): boolean {
  if (typeof responseURL !== "string" || !responseURL) return false;
  const asked = /^https?:\/\//i.test(config.url ?? "")
    ? config.url!
    : `${config.baseURL ?? ""}${config.url ?? ""}`;
  try {
    return new URL(responseURL).host !== new URL(asked).host;
  } catch {
    return false;
  }
}

function loggerFor(serviceName: string) {
  const name = serviceName.toLowerCase();
  if (name.includes("ssh")) return sshLogger;
  if (name.includes("tunnel")) return tunnelLogger;
  if (name.includes("file")) return fileLogger;
  if (name.includes("stats")) return statsLogger;
  if (name.includes("auth")) return authLogger;
  return apiLogger;
}

/** Adds headers without dropping cookies that are already there. */
export function mergeHeaders(
  target: { [name: string]: unknown },
  extra: Record<string, string>,
  overwrite: boolean,
): void {
  for (const [name, value] of Object.entries(extra)) {
    const current = target[name];
    if (
      name.toLowerCase() === "cookie" &&
      typeof current === "string" &&
      current
    ) {
      target[name] = `${current}; ${value}`;
    } else if (overwrite || current === undefined) {
      target[name] = value;
    }
  }
}

/** A bare instance with only the proxy headers, for probes and fallbacks. */
export function createRawHttp(
  owner: Pick<HttpOwner, "proxyHeaders" | "adapter">,
  config: CreateAxiosDefaults = {},
): AxiosInstance {
  return axios.create({
    ...config,
    adapter: config.adapter ?? owner.adapter?.(),
    headers: { ...owner.proxyHeaders(), ...(config.headers as object) },
  });
}

export function createHttp(
  owner: HttpOwner,
  baseURL: string,
  serviceName: string = "API",
): AxiosInstance {
  const instance = axios.create({
    baseURL,
    headers: { "Content-Type": "application/json" },
    timeout: 30000,
  });
  const logger = loggerFor(serviceName);

  instance.interceptors.request.use(async (config) => {
    const startTime = performance.now();
    const requestId = `req_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;

    (config as any).startTime = startTime;
    (config as any).requestId = requestId;

    const method = config.method?.toUpperCase() || "UNKNOWN";
    const fullUrl = `${config.baseURL}${config.url || "UNKNOWN"}`;
    const context: LogContext = {
      requestId,
      method,
      url: fullUrl,
      operation: "request_start",
    };

    logger.requestStart(method, fullUrl, context);

    mergeHeaders(config.headers, owner.proxyHeaders(), false);
    const session = owner.sessionHeaders();
    if (Object.keys(session).length) {
      mergeHeaders(config.headers, session, true);
    } else {
      authLogger.warn(
        "No JWT token found, request will be unauthenticated",
        context,
      );
    }
    config.headers["User-Agent"] = USER_AGENT;

    owner.rewrite(config);
    const adapter = owner.adapter?.();
    if (adapter) config.adapter = adapter;

    return config;
  });

  instance.interceptors.response.use(
    (response) => {
      // A login proxy (Cloudflare Access, Authelia) sends requests without
      // its cookie to its own login page. That is a sign in, not a page.
      if (
        isHtmlPayload(response.data) &&
        leftServer(response.config, response.request?.responseURL)
      ) {
        return Promise.reject(
          new AxiosError(
            "The proxy wants you to sign in",
            "ERR_BAD_RESPONSE",
            response.config,
            response.request,
            { ...response, status: 401 },
          ),
        );
      }
      // Routes a server no longer has fall through to its web UI and answer
      // 200 with index.html. Treat that as a missing endpoint, not data.
      if (isHtmlPayload(response.data)) {
        return Promise.reject(
          new AxiosError(
            "Endpoint not available on this server",
            "ERR_BAD_RESPONSE",
            response.config,
            response.request,
            {
              ...response,
              status: 404,
              data: {
                error: "This server does not support this feature",
                code: "UNSUPPORTED_ENDPOINT",
              },
            },
          ),
        );
      }

      const responseTime = Math.round(
        performance.now() - (response.config as any).startTime,
      );
      const method = response.config.method?.toUpperCase() || "UNKNOWN";
      const fullUrl = `${response.config.baseURL}${response.config.url || "UNKNOWN"}`;
      const context: LogContext = {
        requestId: (response.config as any).requestId,
        method,
        url: fullUrl,
        status: response.status,
        statusText: response.statusText,
        responseTime,
        operation: "request_success",
      };

      logger.requestSuccess(
        method,
        fullUrl,
        response.status,
        responseTime,
        context,
      );

      if (responseTime > 3000) {
        logger.warn(`Slow request: ${responseTime}ms`, context);
      }

      return response;
    },
    (error: AxiosError) => {
      const startTime = (error.config as any)?.startTime;
      const responseTime = startTime
        ? Math.round(performance.now() - startTime)
        : undefined;

      const method = error.config?.method?.toUpperCase() || "UNKNOWN";
      const url = error.config?.url || "UNKNOWN";
      const fullUrl = error.config?.baseURL
        ? `${error.config.baseURL}${url}`
        : url;
      const status = error.response?.status;
      const message =
        (error.response?.data as any)?.error ||
        (error as Error).message ||
        "Unknown error";
      const errorCode = (error.response?.data as any)?.code || error.code;

      const context: LogContext = {
        requestId: (error.config as any)?.requestId,
        method,
        url: fullUrl,
        status,
        responseTime,
        errorCode,
        errorMessage: message,
        operation: "request_error",
      };

      if (status === 401) {
        logger.authError(method, fullUrl, context);
      } else if (status === 0 || !status) {
        if (
          fullUrl.startsWith("https://") &&
          (message?.includes("Network request failed") ||
            message?.includes("SSL") ||
            message?.includes("certificate") ||
            message?.includes("handshake") ||
            message?.includes("untrusted"))
        ) {
          logger.warn(
            `SSL certificate error: ${method} ${fullUrl} - ${message}`,
            context,
          );
        } else {
          logger.networkError(method, fullUrl, message, context);
        }
      } else if (
        status === 404 &&
        serviceName === "STATS" &&
        url.includes("/metrics/")
      ) {
        // 404 on metrics means data isn't ready yet - suppress as debug noise.
        logger.debug(`Metrics not yet available: ${method} ${url}`, context);
      } else if (status === 404 && url.includes("/activity/log")) {
        // Servers without the Homepage plugin keep no activity feed.
        logger.debug(`Activity not recorded: ${method} ${url}`, context);
      } else {
        logger.requestError(
          method,
          fullUrl,
          status || 0,
          message,
          responseTime,
          context,
        );
      }

      return Promise.reject(error);
    },
  );

  return instance;
}
