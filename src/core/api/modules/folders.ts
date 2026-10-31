import type { AccountClient } from "../AccountClient";
import { sshLogger } from "@/core/log/logger";

export function createFoldersApi(c: AccountClient) {
  async function getFoldersWithStats(): Promise<any> {
    try {
      const token = c.token();

      const tryFetch = async (baseUrl: string) => {
        const cleanBase = baseUrl.replace(/\/$/, "");
        const tempInstance = c.rawAxios({
          baseURL: cleanBase,
          timeout: 10000,
          headers: {
            Accept: "application/json",
            "User-Agent": "Termix-Mobile",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
        });

        try {
          const response = await tempInstance.get("/host/folders");
          return response.data;
        } catch (err: any) {
          if (err.response?.status === 404) {
            return null;
          }
          throw err;
        }
      };

      const sshBase = c.sshBase();
      let data = await tryFetch(sshBase);

      if (data === null) {
        const rootBase = c.rootBase();
        data = await tryFetch(rootBase);
      }
      return data || [];
    } catch (error) {
      return [];
    }
  }

  async function renameFolder(oldName: string, newName: string): Promise<any> {
    try {
      const response = await c.http.auth.put("/host/folders/rename", {
        oldName,
        newName,
      });
      return response.data;
    } catch (error) {
      c.fail(error, "rename folder");
    }
  }

  async function getSSHFolders(): Promise<any[]> {
    try {
      sshLogger.info("Fetching SSH folders", {
        operation: "fetch_ssh_folders",
      });

      const response = await c.http.auth.get("/host/folders");

      sshLogger.success("SSH folders fetched successfully", {
        operation: "fetch_ssh_folders",
        count: response.data.length,
      });

      return response.data;
    } catch (error) {
      sshLogger.error("Failed to fetch SSH folders", error, {
        operation: "fetch_ssh_folders",
      });
      c.fail(error, "fetch SSH folders");
      throw error;
    }
  }

  async function updateFolderMetadata(
    name: string,
    color?: string,
    icon?: string,
  ): Promise<void> {
    try {
      sshLogger.info("Updating folder metadata", {
        operation: "update_folder_metadata",
        name,
        color,
        icon,
      });

      await c.http.auth.put("/host/folders/metadata", {
        name,
        color,
        icon,
      });

      sshLogger.success("Folder metadata updated successfully", {
        operation: "update_folder_metadata",
        name,
      });
    } catch (error) {
      sshLogger.error("Failed to update folder metadata", error, {
        operation: "update_folder_metadata",
        name,
      });
      c.fail(error, "update folder metadata");
      throw error;
    }
  }

  async function deleteAllHostsInFolder(
    folderName: string,
  ): Promise<{ deletedCount: number }> {
    try {
      sshLogger.info("Deleting all hosts in folder", {
        operation: "delete_folder_hosts",
        folderName,
      });

      const response = await c.http.auth.delete(
        `/host/folders/${encodeURIComponent(folderName)}/hosts`,
      );

      sshLogger.success("All hosts in folder deleted successfully", {
        operation: "delete_folder_hosts",
        folderName,
        deletedCount: response.data.deletedCount,
      });

      return response.data;
    } catch (error) {
      sshLogger.error("Failed to delete hosts in folder", error, {
        operation: "delete_folder_hosts",
        folderName,
      });
      c.fail(error, "delete hosts in folder");
      throw error;
    }
  }

  return {
    getFoldersWithStats,
    renameFolder,
    getSSHFolders,
    updateFolderMetadata,
    deleteAllHostsInFolder,
  };
}

export type FoldersApi = ReturnType<typeof createFoldersApi>;
