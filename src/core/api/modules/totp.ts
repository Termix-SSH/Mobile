import type { AccountClient } from "../AccountClient";
import type { AuthResponse } from "@/types/index";

export function createTotpApi(c: AccountClient) {
  async function setupTOTP(): Promise<{
    secret: string;
    qr_code: string;
  }> {
    try {
      const response = await c.http.auth.post("/users/totp/setup");
      return response.data;
    } catch (error) {
      c.fail(error, "setup TOTP");
      throw error;
    }
  }

  async function enableTOTP(
    totp_code: string,
  ): Promise<{ message: string; backup_codes: string[] }> {
    try {
      const response = await c.http.auth.post("/users/totp/enable", {
        totp_code,
      });
      return response.data;
    } catch (error) {
      c.fail(error, "enable TOTP");
      throw error;
    }
  }

  async function disableTOTP(
    password?: string,
    totp_code?: string,
  ): Promise<{ message: string }> {
    try {
      // 2.9 only takes an authenticator code here.
      const response = await c.http.auth.post(
        "/users/totp/disable",
        c.apiGeneration === "plugin"
          ? { totp_code: totp_code ?? password }
          : { password, totp_code },
      );
      return response.data;
    } catch (error) {
      c.fail(error, "disable TOTP");
      throw error;
    }
  }

  async function verifyTOTPLogin(
    temp_token: string,
    totp_code: string,
  ): Promise<AuthResponse> {
    try {
      const response = await c.http.auth.post("/users/totp/verify-login", {
        temp_token,
        totp_code,
        rememberMe: true,
      });

      let token = null;
      const cookieHeader = response.headers["set-cookie"];
      if (cookieHeader && Array.isArray(cookieHeader)) {
        for (const cookie of cookieHeader) {
          if (cookie.startsWith("jwt=")) {
            token = cookie.split("jwt=")[1].split(";")[0];
            break;
          }
        }
      }

      const result = {
        ...response.data,
        token: token || response.data.token,
      };

      if (result.token) {
        await c.setToken(result.token);
      }

      return result;
    } catch (error: any) {
      if (error?.response?.status === 404 || error?.response?.status === 500) {
        try {
          const alt = c.rawAxios({
            baseURL: c.sshBase(),
            headers: { "Content-Type": "application/json" },
          });

          const token = c.token();
          if (token) {
            alt.defaults.headers.common["Authorization"] = `Bearer ${token}`;
          }

          const response = await alt.post("/users/totp/verify-login", {
            temp_token,
            totp_code,
            rememberMe: true,
          });

          let extractedToken = null;
          const cookieHeader = response.headers["set-cookie"];
          if (cookieHeader && Array.isArray(cookieHeader)) {
            for (const cookie of cookieHeader) {
              if (cookie.startsWith("jwt=")) {
                extractedToken = cookie.split("jwt=")[1].split(";")[0];
                break;
              }
            }
          }

          const result = {
            ...response.data,
            token: extractedToken || response.data.token,
          };

          if (result.token) {
            await c.setToken(result.token);
          }

          return result;
        } catch (e) {
          c.fail(e, "verify TOTP login");
          throw e;
        }
      }
      c.fail(error, "verify TOTP login");
      throw error;
    }
  }

  async function generateBackupCodes(
    password?: string,
    totp_code?: string,
  ): Promise<{ backup_codes: string[] }> {
    try {
      const response = await c.http.auth.post("/users/totp/backup-codes", {
        password,
        totp_code,
      });
      return response.data;
    } catch (error) {
      c.fail(error, "generate backup codes");
      throw error;
    }
  }

  async function getTOTPBackupCodes(): Promise<{
    backup_codes: string[];
  }> {
    try {
      const response = await c.http.auth.get("/users/totp/backup-codes");
      return response.data;
    } catch (error) {
      c.fail(error, "fetch TOTP backup codes");
    }
  }

  return {
    setupTOTP,
    enableTOTP,
    disableTOTP,
    verifyTOTPLogin,
    generateBackupCodes,
    getTOTPBackupCodes,
  };
}

export type TotpApi = ReturnType<typeof createTotpApi>;
