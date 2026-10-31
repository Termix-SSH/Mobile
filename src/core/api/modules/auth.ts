import { Platform } from "react-native";
import type { AccountClient } from "../AccountClient";
import { ApiError } from "../errors";
import { authLogger } from "@/core/log/logger";
import type {
  AuthResponse,
  UserInfo,
  UserCount,
  OIDCAuthorize,
} from "@/types/index";

export function createAuthApi(c: AccountClient) {
  async function registerUser(
    username: string,
    password: string,
  ): Promise<any> {
    try {
      const response = await c.http.auth.post("/users/create", {
        username,
        password,
      });
      return response.data;
    } catch (error: any) {
      if (error?.response?.status === 404) {
        try {
          const alt = c.rawAxios({
            baseURL: c.sshBase(),
            headers: { "Content-Type": "application/json" },
          });
          const response = await alt.post("/users/create", {
            username,
            password,
          });
          return response.data;
        } catch (e) {
          c.fail(e, "register user");
        }
      }
      c.fail(error, "register user");
    }
  }

  function extractJwtFromSetCookie(headers: any): string | null {
    const cookieHeader = headers["set-cookie"];
    if (cookieHeader) {
      const cookies = Array.isArray(cookieHeader)
        ? cookieHeader
        : [cookieHeader];
      for (const cookie of cookies) {
        if (cookie.startsWith("jwt=")) {
          return cookie.split("jwt=")[1].split(";")[0];
        }
      }
    }
    return null;
  }

  function isLocalNetworkHttpsUrl(url: string): boolean {
    if (!url.startsWith("https://")) return false;

    try {
      const host = new URL(url).hostname.replace(/^\[|\]$/g, "");
      if (host === "localhost" || host === "::1") return true;

      const parts = host.split(".").map((part) => Number(part));
      if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part))) {
        return false;
      }

      const [first, second] = parts;
      return (
        first === 10 ||
        first === 127 ||
        (first === 169 && second === 254) ||
        (first === 172 && second >= 16 && second <= 31) ||
        (first === 192 && second === 168)
      );
    } catch {
      return false;
    }
  }

  function isNativeNetworkFailure(error: unknown): boolean {
    return (
      error instanceof Error && error.message.includes("Network request failed")
    );
  }

  /**
   * Detects whether the server URL sits behind a reverse-proxy authentication
   * gate (Cloudflare Access, Authelia, etc.) that intercepts requests and serves
   * its own HTML login page instead of forwarding them to Termix. In that case a
   * native login form cannot work - the user must authenticate to the proxy in a
   * browser context (the WebView/SSO flow).
   *
   * Returns true when a known JSON endpoint responds with HTML (or otherwise
   * non-JSON) content, which is the tell-tale sign of an interposing auth proxy.
   */
  async function isReverseProxyAuthGate(): Promise<boolean> {
    const probe = async (base: string): Promise<boolean | null> => {
      try {
        const url = `${base.replace(/\/$/, "")}/users/registration-allowed`;
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);
        let res: Response;
        try {
          res = await c.fetch(url, {
            method: "GET",
            signal: controller.signal,
            headers: {
              Accept: "application/json",
              "User-Agent": `Termix-Mobile/${Platform.OS === "android" ? "Android" : "iOS"}`,
            },
          });
        } finally {
          clearTimeout(timeoutId);
        }
        const contentType = (
          res.headers.get("content-type") || ""
        ).toLowerCase();
        const body = await res.text();
        // A genuine Termix API endpoint returns JSON. An auth proxy returns its
        // login HTML (often with a 200 or a redirect-resolved 200).
        if (contentType.includes("application/json")) return false;
        const looksHtml =
          contentType.includes("text/html") ||
          /^\s*<(?:!doctype|html)/i.test(body);
        if (looksHtml) return true;
        // Unknown content-type but valid JSON body → treat as real API.
        try {
          JSON.parse(body);
          return false;
        } catch {
          return looksHtml ? true : null;
        }
      } catch {
        return null;
      }
    };

    const rootResult = await probe(c.rootBase());
    if (rootResult !== null) return rootResult;
    const sshResult = await probe(c.sshBase());
    return sshResult === true;
  }

  async function loginWithFetch(
    baseUrl: string,
    username: string,
    password: string,
  ): Promise<{ data: any; token: string | null }> {
    const url = `${baseUrl.replace(/\/$/, "")}/users/login`;
    let fetchResponse: Response;
    try {
      fetchResponse = await c.fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // Mobile has no "remember me" toggle; staying signed in is the expected
        // default. Without this the server issues a 24h token and users get
        // logged out after about a day.
        body: JSON.stringify({ username, password, rememberMe: true }),
      });
    } catch (error) {
      if (isLocalNetworkHttpsUrl(url) && isNativeNetworkFailure(error)) {
        throw new ApiError(
          "The app could not trust HTTPS for this local IP. Pin the server's key under Proxy and client certificate, use a certificate the phone trusts, or HTTP on a trusted local or VPN network.",
          0,
          "LOCAL_IP_HTTPS_CERTIFICATE_ERROR",
        );
      }
      throw error;
    }

    const contentType = (
      fetchResponse.headers.get("content-type") || ""
    ).toLowerCase();
    const rawBody = await fetchResponse.text();

    // A reverse-proxy auth gate intercepts the request and returns its HTML login
    // page instead of Termix JSON. Surface a clear, actionable error rather than
    // crashing on JSON.parse of "<!DOCTYPE html>…".
    const looksHtml =
      contentType.includes("text/html") ||
      /^\s*<(?:!doctype|html)/i.test(rawBody);
    if (looksHtml) {
      const err: any = new Error(
        "This server is behind a login proxy. Use the external sign-in option instead.",
      );
      err.code = "PROXY_AUTH_GATE";
      err.response = { status: fetchResponse.status, data: {} };
      throw err;
    }

    if (!fetchResponse.ok) {
      let errData: any = {};
      try {
        errData = rawBody ? JSON.parse(rawBody) : {};
      } catch {
        errData = {};
      }
      const err: any = new Error(errData?.error || "Login failed");
      err.response = { status: fetchResponse.status, data: errData };
      throw err;
    }

    const data = JSON.parse(rawBody);

    let token: string | null = data.token || null;
    const setCookie = fetchResponse.headers.get("set-cookie");
    if (!token && setCookie) {
      const match = setCookie.match(/(?:^|,\s*)jwt=([^;]+)/);
      if (match) token = match[1];
    }

    return { data, token };
  }

  async function loginUser(
    username: string,
    password: string,
  ): Promise<AuthResponse> {
    try {
      const baseUrl = c.rootBase();
      const { data, token } = await loginWithFetch(baseUrl, username, password);

      if (data.requires_totp) {
        return { ...data, token: data.temp_token || "" };
      }

      let finalToken = token;
      if (!finalToken) {
        try {
          const axiosResponse = await c.http.auth.post("/users/login", {
            username,
            password,
            rememberMe: true,
          });
          finalToken =
            extractJwtFromSetCookie(axiosResponse.headers) ||
            axiosResponse.data.token ||
            null;
        } catch {
          // ignore, we already have data
        }
      }

      if (finalToken) {
        await c.setToken(finalToken);
      }

      return { ...data, token: finalToken || "" };
    } catch (error: any) {
      if (error?.code === "PROXY_AUTH_GATE") {
        throw new ApiError(error.message, 0, "PROXY_AUTH_GATE");
      }
      if (error?.response?.status === 404) {
        try {
          const altBase = c.sshBase();
          const { data, token } = await loginWithFetch(
            altBase,
            username,
            password,
          );

          if (data.requires_totp) {
            return { ...data, token: data.temp_token || "" };
          }

          if (token) {
            await c.setToken(token);
          }

          return { ...data, token: token || "" };
        } catch (e: any) {
          if (e?.code === "PROXY_AUTH_GATE") {
            throw new ApiError(e.message, 0, "PROXY_AUTH_GATE");
          }
          c.fail(e, "login user");
        }
      }
      c.fail(error, "login user");
    }
  }

  async function logoutUser(): Promise<{
    success: boolean;
    message: string;
  }> {
    try {
      const response = await c.http.auth.post("/users/logout");
      return response.data;
    } catch (error) {
      c.fail(error, "logout user");
    }
  }

  async function getUserInfo(): Promise<UserInfo> {
    try {
      const response = await c.http.auth.get("/users/me");
      return response.data;
    } catch (error: any) {
      if (error?.response?.status === 404) {
        try {
          const alt = c.rawAxios({
            baseURL: c.sshBase(),
            headers: { "Content-Type": "application/json" },
          });
          const response = await alt.get("/users/me");
          return response.data;
        } catch (e) {
          c.fail(e, "fetch user info");
        }
      }
      c.fail(error, "fetch user info");
    }
  }

  async function unlockUserData(
    password: string,
  ): Promise<{ success: boolean; message: string }> {
    try {
      const response = await c.http.auth.post("/users/unlock-data", {
        password,
      });
      return response.data;
    } catch (error) {
      c.fail(error, "unlock user data");
    }
  }

  async function getRegistrationAllowed(): Promise<{ allowed: boolean }> {
    try {
      const response = await c.http.auth.get("/users/registration-allowed");
      return response.data;
    } catch (error: any) {
      if (error?.response?.status === 404) {
        try {
          const alt = c.rawAxios({
            baseURL: c.sshBase(),
            headers: { "Content-Type": "application/json" },
          });
          const response = await alt.get("/users/registration-allowed");
          return response.data;
        } catch (e) {
          c.fail(e, "check registration status");
        }
      }
      c.fail(error, "check registration status");
    }
  }

  async function getPasswordLoginAllowed(): Promise<{ allowed: boolean }> {
    try {
      const response = await c.http.auth.get("/users/password-login-allowed");
      return response.data;
    } catch (error) {
      c.fail(error, "check password login status");
    }
  }

  async function getOIDCConfig(): Promise<any> {
    try {
      const response = await c.http.auth.get("/users/oidc-config");
      return response.data;
    } catch (error: any) {
      authLogger.warn("Failed to fetch OIDC config", {
        operation: "get_oidc_config",
        error: error.response?.data?.error || error.message,
      });
      return null;
    }
  }

  async function getSetupRequired(): Promise<{ setup_required: boolean }> {
    try {
      const response = await c.http.auth.get("/users/setup-required");
      return response.data;
    } catch (error) {
      c.fail(error, "check setup status");
    }
  }

  async function getUserCount(): Promise<UserCount> {
    try {
      const response = await c.http.auth.get("/users/count");
      return response.data;
    } catch (error) {
      c.fail(error, "fetch user count");
    }
  }

  async function initiatePasswordReset(username: string): Promise<any> {
    try {
      const response = await c.http.auth.post("/users/initiate-reset", {
        username,
      });
      return response.data;
    } catch (error) {
      c.fail(error, "initiate password reset");
    }
  }

  async function verifyPasswordResetCode(
    username: string,
    resetCode: string,
  ): Promise<any> {
    try {
      const response = await c.http.auth.post("/users/verify-reset-code", {
        username,
        resetCode,
      });
      return response.data;
    } catch (error) {
      c.fail(error, "verify reset code");
    }
  }

  async function completePasswordReset(
    username: string,
    tempToken: string,
    newPassword: string,
  ): Promise<any> {
    try {
      const response = await c.http.auth.post("/users/complete-reset", {
        username,
        tempToken,
        newPassword,
      });
      return response.data;
    } catch (error) {
      c.fail(error, "complete password reset");
    }
  }

  async function getOIDCAuthorizeUrl(
    appCallbackUrl?: string,
  ): Promise<OIDCAuthorize> {
    try {
      const response = await c.http.auth.get("/users/oidc/authorize", {
        params: appCallbackUrl ? { appCallbackUrl } : undefined,
      });
      return response.data;
    } catch (error) {
      c.fail(error, "get OIDC authorize URL");
    }
  }

  async function linkOIDCToPasswordAccount(
    externalUserId: string,
    targetUsername: string,
  ): Promise<{ success: boolean; message: string }> {
    try {
      const response = await c.http.auth.post(
        "/users/link-external-to-password",
        {
          externalUserId,
          targetUsername,
        },
      );
      return response.data;
    } catch (error) {
      c.fail(error, "link OIDC account to password account");
      throw error;
    }
  }

  async function unlinkOIDCFromPasswordAccount(
    userId: string,
  ): Promise<{ success: boolean; message: string }> {
    try {
      const response = await c.http.auth.post(
        "/users/unlink-external-from-password",
        {
          userId,
        },
      );
      return response.data;
    } catch (error) {
      c.fail(error, "unlink OIDC from password account");
      throw error;
    }
  }

  return {
    registerUser,
    isReverseProxyAuthGate,
    loginUser,
    logoutUser,
    getUserInfo,
    unlockUserData,
    getRegistrationAllowed,
    getPasswordLoginAllowed,
    getOIDCConfig,
    getSetupRequired,
    getUserCount,
    initiatePasswordReset,
    verifyPasswordResetCode,
    completePasswordReset,
    getOIDCAuthorizeUrl,
    linkOIDCToPasswordAccount,
    unlinkOIDCFromPasswordAccount,
  };
}

export type AuthApi = ReturnType<typeof createAuthApi>;
