import type { AccountClient } from "../AccountClient";
import type { UserInfo } from "@/types/index";

export function createUsersApi(c: AccountClient) {
  async function getUserList(): Promise<{ users: UserInfo[] }> {
    try {
      const response = await c.http.auth.get("/users/list");
      return response.data;
    } catch (error) {
      c.fail(error, "fetch user list");
    }
  }

  async function getSessions(): Promise<{
    sessions: {
      id: string;
      userId: string;
      username?: string;
      deviceType: string;
      deviceInfo: string;
      createdAt: string;
      expiresAt: string;
      lastActiveAt: string;
      jwtToken: string;
      isRevoked?: boolean;
    }[];
  }> {
    try {
      const response = await c.http.auth.get("/users/sessions");
      return response.data;
    } catch (error) {
      c.fail(error, "fetch sessions");
    }
  }

  async function revokeSession(
    sessionId: string,
  ): Promise<{ success: boolean; message: string }> {
    try {
      const response = await c.http.auth.delete(`/users/sessions/${sessionId}`);
      return response.data;
    } catch (error) {
      c.fail(error, "revoke session");
    }
  }

  async function revokeAllUserSessions(
    userId: string,
  ): Promise<{ success: boolean; message: string }> {
    try {
      const response = await c.http.auth.post("/users/sessions/revoke-all", {
        targetUserId: userId,
        exceptCurrent: false,
      });
      return response.data;
    } catch (error) {
      c.fail(error, "revoke all user sessions");
    }
  }

  async function makeUserAdmin(username: string): Promise<any> {
    try {
      const response = await c.http.auth.post("/users/make-admin", {
        username,
      });
      return response.data;
    } catch (error) {
      c.fail(error, "make user admin");
    }
  }

  async function removeAdminStatus(username: string): Promise<any> {
    try {
      const response = await c.http.auth.post("/users/remove-admin", {
        username,
      });
      return response.data;
    } catch (error) {
      c.fail(error, "remove admin status");
    }
  }

  async function deleteUser(username: string): Promise<any> {
    try {
      const response = await c.http.auth.delete("/users/delete-user", {
        data: { username },
      });
      return response.data;
    } catch (error) {
      c.fail(error, "delete user");
    }
  }

  async function changePassword(
    oldPassword: string,
    newPassword: string,
  ): Promise<any> {
    try {
      const response = await c.http.auth.post("/users/change-password", {
        oldPassword,
        newPassword,
      });
      return response.data;
    } catch (error) {
      c.fail(error, "change password");
      throw error;
    }
  }

  async function deleteAccount(password: string): Promise<any> {
    try {
      const response = await c.http.auth.delete("/users/delete-account", {
        data: { password },
      });
      return response.data;
    } catch (error) {
      c.fail(error, "delete account");
    }
  }

  async function updateRegistrationAllowed(allowed: boolean): Promise<any> {
    try {
      const response = await c.http.auth.patch("/users/registration-allowed", {
        allowed,
      });
      return response.data;
    } catch (error) {
      c.fail(error, "update registration allowed");
    }
  }

  async function updatePasswordLoginAllowed(
    allowed: boolean,
  ): Promise<{ allowed: boolean }> {
    try {
      const response = await c.http.auth.patch(
        "/users/password-login-allowed",
        {
          allowed,
        },
      );
      return response.data;
    } catch (error) {
      c.fail(error, "update password login allowed");
    }
  }

  return {
    getUserList,
    getSessions,
    revokeSession,
    revokeAllUserSessions,
    makeUserAdmin,
    removeAdminStatus,
    deleteUser,
    changePassword,
    deleteAccount,
    updateRegistrationAllowed,
    updatePasswordLoginAllowed,
  };
}

export type UsersApi = ReturnType<typeof createUsersApi>;
