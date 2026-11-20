import axios from "axios";
import { AppError } from "@/core/errors";
import { apiLogger, authLogger, type LogContext } from "@/core/log/logger";
import { t } from "@/i18n";

export class ApiError extends AppError {
  constructor(message: string, status?: number, code?: string) {
    super(message, code ?? "UNKNOWN_ERROR", status);
    this.name = "ApiError";
  }
}

/** What error handling needs from the client that made the request. */
export interface ErrorHooks {
  /** The session is gone on this server. */
  onAuthLost(): void;
  /** A plugin answered that it is off, so the feature list is stale. */
  refreshEnabledPlugins(): Promise<void>;
}

/**
 * Pulls a `connectionLogs` array off a connect response (or an axios error's
 * response body). Session connect endpoints return these on both success and
 * failure so the UI can surface a connection log. Returns [] when absent.
 */
export function extractConnectionLogs(
  source: unknown,
): { type: string; stage?: string; message: string }[] {
  const data = axios.isAxiosError(source)
    ? (source.response?.data as any)
    : (source as any);
  const logs = data?.connectionLogs;
  return Array.isArray(logs) ? logs : [];
}

function isJsonBody(data: unknown): boolean {
  return !!data && typeof data === "object";
}

export function handleApiError(
  hooks: ErrorHooks,
  error: unknown,
  operation: string,
): never {
  const context: LogContext = {
    operation: "error_handling",
    errorOperation: operation,
  };

  if (axios.isAxiosError(error)) {
    const status = error.response?.status;
    const message = error.response?.data?.error || error.message;
    const code = error.response?.data?.code;
    const url = error.config?.url || "UNKNOWN";
    const method = error.config?.method?.toUpperCase() || "UNKNOWN";

    const errorContext: LogContext = {
      ...context,
      method,
      url,
      status,
      errorCode: code,
      errorMessage: message,
    };

    if (status === 401 && !isJsonBody(error.response?.data)) {
      // A proxy in front of the server answered, not Termix. The session is
      // fine, so never sign out over it.
      authLogger.warn(`Proxy asked to sign in: ${method} ${url}`, errorContext);
      throw new ApiError(t("api.errors.theProxyInFrontOf"), 401, "PROXY_LOGIN");
    } else if (status === 401) {
      authLogger.warn(
        `Auth failed: ${method} ${url} - ${message}`,
        errorContext,
      );

      const isCriticalEndpoint =
        url.includes("/db/host") ||
        url.includes("/users/me") ||
        url.includes("/login") ||
        url.includes("/websocket");

      if (isCriticalEndpoint) hooks.onAuthLost();

      throw new ApiError(
        t("api.errors.authenticationRequiredPleaseLogIn"),
        401,
        "AUTH_REQUIRED",
      );
    } else if (status === 403) {
      authLogger.warn(`Access denied: ${method} ${url}`, errorContext);
      throw new ApiError(
        t("api.errors.accessDeniedYouDoNot"),
        403,
        "ACCESS_DENIED",
      );
    } else if (status === 503 && error.response?.data?.pluginId) {
      apiLogger.warn(`Feature disabled: ${method} ${url}`, errorContext);
      void hooks.refreshEnabledPlugins();
      throw new ApiError(
        t("api.errors.thisFeatureIsTurnedOff"),
        503,
        "FEATURE_DISABLED",
      );
    } else if (status === 404 && code === "UNSUPPORTED_ENDPOINT") {
      apiLogger.warn(`Unsupported endpoint: ${method} ${url}`, errorContext);
      throw new ApiError(
        t("api.errors.thisServerDoesNotSupport"),
        404,
        "UNSUPPORTED_ENDPOINT",
      );
    } else if (status === 404) {
      apiLogger.warn(`Not found: ${method} ${url}`, errorContext);
      throw new ApiError(
        t("api.errors.resourceNotFoundTheRequested"),
        404,
        "NOT_FOUND",
      );
    } else if (status === 409) {
      apiLogger.warn(`Conflict: ${method} ${url}`, errorContext);
      throw new ApiError(
        t("api.errors.conflictTheResourceAlreadyExists"),
        409,
        "CONFLICT",
      );
    } else if (status === 422) {
      apiLogger.warn(
        `Validation error: ${method} ${url} - ${message}`,
        errorContext,
      );
      throw new ApiError(
        t("api.errors.validationErrorPleaseCheckYour"),
        422,
        "VALIDATION_ERROR",
      );
    } else if (status && status >= 500) {
      apiLogger.error(
        `Server error: ${method} ${url} - ${message}`,
        error,
        errorContext,
      );
      throw new ApiError(
        t("api.errors.serverErrorOccurredPleaseTry"),
        status,
        "SERVER_ERROR",
      );
    } else if (status === 0) {
      if (
        url.startsWith("https://") &&
        (message?.includes("Network request failed") ||
          message?.includes("SSL") ||
          message?.includes("certificate") ||
          message?.includes("handshake") ||
          message?.includes("untrusted"))
      ) {
        apiLogger.error(
          `SSL certificate error: ${method} ${url} - ${message}`,
          error,
          errorContext,
        );
        throw new ApiError(
          t("api.errors.sslCertificateVerificationFailed"),
          0,
          "SSL_CERTIFICATE_ERROR",
        );
      }

      apiLogger.error(
        `Network error: ${method} ${url} - ${message}`,
        error,
        errorContext,
      );
      throw new ApiError(
        t("api.errors.networkErrorPleaseCheckYour"),
        0,
        "NETWORK_ERROR",
      );
    } else {
      apiLogger.error(
        `Request failed: ${method} ${url} - ${message}`,
        error,
        errorContext,
      );
      throw new ApiError(
        message || t("api.errors.failedTo", { operation }),
        status,
        code,
      );
    }
  }

  if (error instanceof AppError) {
    throw error;
  }

  const errorMessage =
    error instanceof Error ? error.message : t("api.errors.unknownError");
  apiLogger.error(
    `Unexpected error during ${operation}: ${errorMessage}`,
    error,
    context,
  );
  throw new ApiError(
    t("api.errors.unexpectedErrorDuring", { operation, errorMessage }),
    undefined,
    "UNKNOWN_ERROR",
  );
}
