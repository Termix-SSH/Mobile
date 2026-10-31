import type { AccountClient } from "../AccountClient";

export function createCredentialsApi(c: AccountClient) {
  async function getCredentials(): Promise<any> {
    try {
      const response = await c.http.auth.get("/credentials");
      return response.data;
    } catch (error) {
      c.fail(error, "fetch credentials");
    }
  }

  async function getCredentialDetails(credentialId: number): Promise<any> {
    try {
      const response = await c.http.auth.get(`/credentials/${credentialId}`);
      return response.data;
    } catch (error) {
      c.fail(error, "fetch credential details");
    }
  }

  async function createCredential(credentialData: any): Promise<any> {
    try {
      const response = await c.http.auth.post("/credentials", credentialData);
      return response.data;
    } catch (error) {
      c.fail(error, "create credential");
    }
  }

  async function updateCredential(
    credentialId: number,
    credentialData: any,
  ): Promise<any> {
    try {
      const response = await c.http.auth.put(
        `/credentials/${credentialId}`,
        credentialData,
      );
      return response.data;
    } catch (error) {
      c.fail(error, "update credential");
    }
  }

  async function deleteCredential(credentialId: number): Promise<any> {
    try {
      const response = await c.http.auth.delete(`/credentials/${credentialId}`);
      return response.data;
    } catch (error) {
      c.fail(error, "delete credential");
    }
  }

  async function getCredentialHosts(credentialId: number): Promise<any> {
    try {
      const response = await c.http.auth.get(
        `/credentials/${credentialId}/hosts`,
      );
      return response.data;
    } catch (error) {
      c.fail(error, "fetch credential hosts");
    }
  }

  async function getCredentialFolders(): Promise<any> {
    try {
      const response = await c.http.auth.get("/credentials/folders");
      return response.data;
    } catch (error) {
      c.fail(error, "fetch credential folders");
    }
  }

  // Get SSH host with resolved credentials
  const HOST_SECRET_FIELDS = [
    "password",
    "key",
    "keyPassword",
    "rdpPassword",
    "vncPassword",
    "telnetPassword",
  ] as const;

  /**
   * The host plus its saved secrets, for prefilling the edit form. Both 2.8 and
   * 2.9 hand out one secret per call; a 404 just means that one is not set.
   */
  async function getSSHHostWithCredentials(hostId: number): Promise<any> {
    try {
      const response = await c.http.host.get(`/db/host/${hostId}`);
      const host = c.api.hosts.normalizeSSHHost(response.data);
      const secrets = await Promise.all(
        HOST_SECRET_FIELDS.map(async (field) => {
          try {
            const res = await c.http.host.get(`/db/host/${hostId}/password`, {
              params: { field },
            });
            return [field, res.data?.value] as const;
          } catch {
            return [field, undefined] as const;
          }
        }),
      );
      for (const [field, value] of secrets) {
        if (typeof value === "string" && value) {
          (host as unknown as Record<string, unknown>)[field] = value;
        }
      }
      return host;
    } catch (error) {
      c.fail(error, "fetch SSH host with credentials");
    }
  }

  // Apply credential to SSH host
  async function applyCredentialToHost(
    hostId: number,
    credentialId: number,
  ): Promise<any> {
    try {
      const response = await c.http.host.post(
        `/db/host/${hostId}/apply-credential`,
        { credentialId },
      );
      return response.data;
    } catch (error) {
      c.fail(error, "apply credential to host");
    }
  }

  // Migrate host to managed credential
  async function migrateHostToCredential(
    hostId: number,
    credentialName: string,
  ): Promise<any> {
    try {
      const response = await c.http.host.post(
        `/db/host/${hostId}/migrate-to-credential`,
        { credentialName },
      );
      return response.data;
    } catch (error) {
      c.fail(error, "migrate host to credential");
    }
  }

  async function renameCredentialFolder(
    oldName: string,
    newName: string,
  ): Promise<any> {
    try {
      const response = await c.http.auth.put("/credentials/folders/rename", {
        oldName,
        newName,
      });
      return response.data;
    } catch (error) {
      c.fail(error, "rename credential folder");
      throw error;
    }
  }

  return {
    getCredentials,
    getCredentialDetails,
    createCredential,
    updateCredential,
    deleteCredential,
    getCredentialHosts,
    getCredentialFolders,
    getSSHHostWithCredentials,
    applyCredentialToHost,
    migrateHostToCredential,
    renameCredentialFolder,
  };
}

export type CredentialsApi = ReturnType<typeof createCredentialsApi>;
