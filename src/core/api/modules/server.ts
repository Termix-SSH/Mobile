import type { AccountClient } from "../AccountClient";

export function createServerApi(c: AccountClient) {
  async function getReleasesRSS(perPage: number = 100): Promise<any> {
    try {
      const response = await c.http.auth.get(
        `/releases/rss?per_page=${perPage}`,
      );
      return response.data;
    } catch (error) {
      c.fail(error, "fetch releases RSS");
    }
  }

  async function getVersionInfo(): Promise<any> {
    try {
      const response = await c.http.auth.get("/version");
      return response.data;
    } catch (error) {
      c.fail(error, "fetch version info");
    }
  }

  async function getDatabaseHealth(): Promise<any> {
    try {
      const response = await c.http.auth.get("/users/db-health");
      return response.data;
    } catch (error) {
      c.fail(error, "check database health");
    }
  }

  return {
    getReleasesRSS,
    getVersionInfo,
    getDatabaseHealth,
  };
}

export type ServerApi = ReturnType<typeof createServerApi>;
