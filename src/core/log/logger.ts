import { pushLog } from "./buffer";

export type LogLevel = "debug" | "info" | "warn" | "error" | "success";

export interface LogContext {
  operation?: string;
  userId?: string;
  hostId?: number;
  tunnelName?: string;
  sessionId?: string;
  requestId?: string;
  duration?: number;
  method?: string;
  url?: string;
  status?: number;
  statusText?: string;
  responseTime?: number;
  retryCount?: number;
  errorCode?: string;
  errorMessage?: string;

  [key: string]: any;
}

const SECRET_KEY = /pass|token|secret|authorization|cookie|jwt|pfx|key$/i;

/** Copies a log context with anything that looks like a secret masked. */
export function redact<T>(value: T, depth = 0): T {
  if (depth > 4 || value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) {
    return value.map((v) => redact(v, depth + 1)) as unknown as T;
  }
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    out[k] =
      SECRET_KEY.test(k) && v != null ? "[hidden]" : redact(v, depth + 1);
  }
  return out as T;
}

const URL_IN_TEXT =
  /\b(https?|wss?):\/\/[^\s/?#"'<>]+([^\s?#"'<>]*)(?:[?#][^\s"'<>]*)?/gi;
const IPV4 = /\b(?:\d{1,3}\.){3}\d{1,3}\b/g;
const JWT = /\beyJ[\w-]{8,}\.[\w-]{8,}\.[\w-]{8,}/g;
const BEARER = /\b(Bearer|Basic)\s+[\w\-.~+/=]{8,}/gi;
const SECRET_PAIR =
  /\b(password|passwd|pass|token|secret|jwt|key)(["']?\s*[:=]\s*["']?)[^\s"',&;]+/gi;

/**
 * Hides what a log line must not carry: server and host addresses, query
 * strings, tokens and passwords. Paths stay, since they say what failed.
 */
export function redactText(text: string): string {
  return text
    .replace(
      URL_IN_TEXT,
      (_m, scheme: string, rest: string) => `${scheme}://<server>${rest}`,
    )
    .replace(IPV4, "<ip>")
    .replace(JWT, "[hidden]")
    .replace(BEARER, "$1 [hidden]")
    .replace(SECRET_PAIR, "$1$2[hidden]");
}

/** Keeps request errors short and never prints request headers. */
export function describeError(error: unknown): unknown {
  if (error && typeof error === "object" && "isAxiosError" in error) {
    const e = error as {
      message?: string;
      code?: string;
      response?: { status?: number; data?: unknown };
    };
    return {
      message: e.message,
      code: e.code,
      status: e.response?.status,
      data: redact(e.response?.data),
    };
  }
  return error;
}

/** One line of text for an error, for the log buffer. */
function errorText(error: unknown): string {
  const e = describeError(error);
  if (e instanceof Error) return redactText(`${e.name}: ${e.message}`);
  if (typeof e === "string") return redactText(e);
  try {
    return redactText(JSON.stringify(e) ?? String(e));
  } catch {
    return redactText(String(e));
  }
}

class FrontendLogger {
  private serviceName: string;
  private serviceIcon: string;
  private serviceColor: string;
  private isDevelopment: boolean;

  constructor(serviceName: string, serviceIcon: string, serviceColor: string) {
    this.serviceName = serviceName;
    this.serviceIcon = serviceIcon;
    this.serviceColor = serviceColor;
    this.isDevelopment = __DEV__ || process.env.NODE_ENV === "development";
  }

  private getTimeStamp(): string {
    const now = new Date();
    return `[${now.toLocaleTimeString()}.${now.getMilliseconds().toString().padStart(3, "0")}]`;
  }

  private formatMessage(
    level: LogLevel,
    message: string,
    context?: LogContext,
  ): string {
    const timestamp = this.getTimeStamp();
    const levelTag = this.getLevelTag(level);
    const serviceTag = this.getServiceTag();

    let contextStr = "";
    if (context && this.isDevelopment) {
      const contextParts = [];
      if (context.operation) contextParts.push(context.operation);
      if (context.userId) contextParts.push(`user:${context.userId}`);
      if (context.hostId) contextParts.push(`host:${context.hostId}`);
      if (context.tunnelName) contextParts.push(`tunnel:${context.tunnelName}`);
      if (context.sessionId) contextParts.push(`session:${context.sessionId}`);
      if (context.responseTime) contextParts.push(`${context.responseTime}ms`);
      if (context.status) contextParts.push(`status:${context.status}`);
      if (context.errorCode) contextParts.push(`code:${context.errorCode}`);

      if (contextParts.length > 0) {
        contextStr = ` (${contextParts.join(", ")})`;
      }
    }

    return `${timestamp} ${levelTag} ${serviceTag} ${message}${contextStr}`;
  }

  private getLevelTag(level: LogLevel): string {
    const symbols = {
      debug: "🔍",
      info: "ℹ️",
      warn: "⚠️",
      error: "❌",
      success: "✅",
    };
    return `${symbols[level]} [${level.toUpperCase()}]`;
  }

  private getServiceTag(): string {
    return `${this.serviceIcon} [${this.serviceName}]`;
  }

  private shouldLog(level: LogLevel): boolean {
    if (level === "debug" && !this.isDevelopment) {
      return false;
    }
    return true;
  }

  private log(
    level: LogLevel,
    message: string,
    context?: LogContext,
    error?: unknown,
  ): void {
    if (!this.shouldLog(level)) return;

    const formattedMessage = this.formatMessage(
      level,
      redactText(message),
      redact(context),
    );

    pushLog(
      level,
      error ? `${formattedMessage} ${errorText(error)}` : formattedMessage,
    );

    switch (level) {
      case "debug":
        console.debug(formattedMessage);
        break;
      case "info":
        console.log(formattedMessage);
        break;
      case "warn":
        console.warn(formattedMessage);
        break;
      case "error":
        console.error(formattedMessage);
        if (error) {
          console.error("Error details:", errorText(error));
        }
        break;
      case "success":
        console.log(formattedMessage);
        break;
    }
  }

  debug(message: string, context?: LogContext): void {
    this.log("debug", message, context);
  }

  info(message: string, context?: LogContext): void {
    this.log("info", message, context);
  }

  warn(message: string, context?: LogContext): void {
    this.log("warn", message, context);
  }

  error(message: string, error?: unknown, context?: LogContext): void {
    this.log("error", message, context, error);
  }

  success(message: string, context?: LogContext): void {
    this.log("success", message, context);
  }

  api(message: string, context?: LogContext): void {
    this.info(`API: ${message}`, { ...context, operation: "api" });
  }

  request(message: string, context?: LogContext): void {
    this.info(`REQUEST: ${message}`, { ...context, operation: "request" });
  }

  response(message: string, context?: LogContext): void {
    this.info(`RESPONSE: ${message}`, { ...context, operation: "response" });
  }

  auth(message: string, context?: LogContext): void {
    this.info(`AUTH: ${message}`, { ...context, operation: "auth" });
  }

  ssh(message: string, context?: LogContext): void {
    this.info(`SSH: ${message}`, { ...context, operation: "ssh" });
  }

  tunnel(message: string, context?: LogContext): void {
    this.info(`TUNNEL: ${message}`, { ...context, operation: "tunnel" });
  }

  file(message: string, context?: LogContext): void {
    this.info(`FILE: ${message}`, { ...context, operation: "file" });
  }

  connection(message: string, context?: LogContext): void {
    this.info(`CONNECTION: ${message}`, {
      ...context,
      operation: "connection",
    });
  }

  disconnect(message: string, context?: LogContext): void {
    this.info(`DISCONNECT: ${message}`, {
      ...context,
      operation: "disconnect",
    });
  }

  retry(message: string, context?: LogContext): void {
    this.warn(`RETRY: ${message}`, { ...context, operation: "retry" });
  }

  performance(message: string, context?: LogContext): void {
    this.info(`PERFORMANCE: ${message}`, {
      ...context,
      operation: "performance",
    });
  }

  security(message: string, context?: LogContext): void {
    this.warn(`SECURITY: ${message}`, { ...context, operation: "security" });
  }

  requestStart(method: string, url: string, context?: LogContext): void {
    const cleanUrl = this.sanitizeUrl(url);
    const shortUrl = this.getShortUrl(cleanUrl);

    console.group(`🚀 ${method.toUpperCase()} ${shortUrl}`);
    this.request(`→ Starting request to ${cleanUrl}`, {
      ...context,
      method: method.toUpperCase(),
      url: cleanUrl,
    });
  }

  requestSuccess(
    method: string,
    url: string,
    status: number,
    responseTime: number,
    context?: LogContext,
  ): void {
    const cleanUrl = this.sanitizeUrl(url);
    const shortUrl = this.getShortUrl(cleanUrl);
    const statusIcon = this.getStatusIcon(status);
    const performanceIcon = this.getPerformanceIcon(responseTime);

    this.response(
      `← ${statusIcon} ${status} ${performanceIcon} ${responseTime}ms`,
      {
        ...context,
        method: method.toUpperCase(),
        url: cleanUrl,
        status,
        responseTime,
      },
    );
    console.groupEnd();
  }

  requestError(
    method: string,
    url: string,
    status: number,
    errorMessage: string,
    responseTime?: number,
    context?: LogContext,
  ): void {
    const cleanUrl = this.sanitizeUrl(url);
    const shortUrl = this.getShortUrl(cleanUrl);
    const statusIcon = this.getStatusIcon(status);

    this.error(`← ${statusIcon} ${status} ${errorMessage}`, undefined, {
      ...context,
      method: method.toUpperCase(),
      url: cleanUrl,
      status,
      errorMessage,
      responseTime,
    });
    console.groupEnd();
  }

  networkError(
    method: string,
    url: string,
    errorMessage: string,
    context?: LogContext,
  ): void {
    const cleanUrl = this.sanitizeUrl(url);
    const shortUrl = this.getShortUrl(cleanUrl);

    this.error(`🌐 Network Error: ${errorMessage}`, undefined, {
      ...context,
      method: method.toUpperCase(),
      url: cleanUrl,
      errorMessage,
      errorCode: "NETWORK_ERROR",
    });
    console.groupEnd();
  }

  authError(method: string, url: string, context?: LogContext): void {
    const cleanUrl = this.sanitizeUrl(url);
    const shortUrl = this.getShortUrl(cleanUrl);

    this.security(`🔐 Authentication Required`, {
      ...context,
      method: method.toUpperCase(),
      url: cleanUrl,
      errorCode: "AUTH_REQUIRED",
    });
    console.groupEnd();
  }

  retryAttempt(
    method: string,
    url: string,
    attempt: number,
    maxAttempts: number,
    context?: LogContext,
  ): void {
    const cleanUrl = this.sanitizeUrl(url);
    const shortUrl = this.getShortUrl(cleanUrl);

    this.retry(`🔄 Retry ${attempt}/${maxAttempts}`, {
      ...context,
      method: method.toUpperCase(),
      url: cleanUrl,
      retryCount: attempt,
    });
  }

  apiOperation(operation: string, details: string, context?: LogContext): void {
    this.info(`🔧 ${operation}: ${details}`, {
      ...context,
      operation: "api_operation",
    });
  }

  private getShortUrl(url: string): string {
    try {
      return new URL(url).pathname;
    } catch {
      return url.length > 50 ? url.substring(0, 47) + "..." : url;
    }
  }

  private getStatusIcon(status: number): string {
    if (status >= 200 && status < 300) return "✅";
    if (status >= 300 && status < 400) return "↩️";
    if (status >= 400 && status < 500) return "⚠️";
    if (status >= 500) return "❌";
    return "❓";
  }

  private getPerformanceIcon(responseTime: number): string {
    if (responseTime < 100) return "⚡";
    if (responseTime < 500) return "🚀";
    if (responseTime < 1000) return "🏃";
    if (responseTime < 3000) return "🚶";
    return "🐌";
  }

  // The server and the query never go in the log; the path says what it was.
  private sanitizeUrl(url: string): string {
    return redactText(url);
  }
}

export const apiLogger = new FrontendLogger("API", "🌐", "#3b82f6");
export const authLogger = new FrontendLogger("AUTH", "🔐", "#dc2626");
export const sshLogger = new FrontendLogger("SSH", "🖥️", "#1e3a8a");
export const tunnelLogger = new FrontendLogger("TUNNEL", "📡", "#1e3a8a");
export const fileLogger = new FrontendLogger("FILE", "📁", "#1e3a8a");
export const statsLogger = new FrontendLogger("STATS", "📊", "#22c55e");
export const systemLogger = new FrontendLogger("SYSTEM", "🚀", "#1e3a8a");

export const logger = systemLogger;

export type Logger = FrontendLogger;

/** A logger for one area of the app, shown as its tag in the console. */
export function createLogger(scope: string, icon = "•"): Logger {
  return new FrontendLogger(scope.toUpperCase(), icon, "#1e3a8a");
}
