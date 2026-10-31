import type { AccountClient } from "../AccountClient";

export function createSnippetsApi(c: AccountClient) {
  async function getSnippets(): Promise<any> {
    if (!c.isPluginEnabled("snippets")) return [];
    try {
      const response = await c.http.auth.get("/snippets");
      return response.data;
    } catch (error) {
      c.fail(error, "fetch snippets");
      throw error;
    }
  }

  async function createSnippet(snippetData: any): Promise<any> {
    try {
      const response = await c.http.auth.post("/snippets", snippetData);
      return response.data;
    } catch (error) {
      c.fail(error, "create snippet");
      throw error;
    }
  }

  async function updateSnippet(
    snippetId: number,
    snippetData: any,
  ): Promise<any> {
    try {
      const response = await c.http.auth.put(
        `/snippets/${snippetId}`,
        snippetData,
      );
      return response.data;
    } catch (error) {
      c.fail(error, "update snippet");
      throw error;
    }
  }

  async function deleteSnippet(snippetId: number): Promise<any> {
    try {
      const response = await c.http.auth.delete(`/snippets/${snippetId}`);
      return response.data;
    } catch (error) {
      c.fail(error, "delete snippet");
      throw error;
    }
  }

  async function executeSnippet(
    snippetId: number,
    hostId: number,
    inputValues?: Record<string, string>,
  ): Promise<{ success: boolean; output: string; error?: string }> {
    try {
      const response = await c.http.auth.post("/snippets/execute", {
        snippetId,
        hostId,
        ...(inputValues ? { inputValues } : {}),
      });
      return response.data;
    } catch (error) {
      c.fail(error, "execute snippet");
      throw error;
    }
  }

  async function reorderSnippets(
    snippets: { id: number; order: number; folder?: string }[],
  ): Promise<{ success: boolean; updated: number }> {
    try {
      const response = await c.http.auth.put("/snippets/reorder", { snippets });
      return response.data;
    } catch (error) {
      c.fail(error, "reorder snippets");
      throw error;
    }
  }

  async function getSnippetFolders(): Promise<any> {
    try {
      const response = await c.http.auth.get("/snippets/folders");
      return response.data;
    } catch (error) {
      c.fail(error, "fetch snippet folders");
      throw error;
    }
  }

  async function createSnippetFolder(folderData: {
    name: string;
    color?: string;
    icon?: string;
  }): Promise<any> {
    try {
      const response = await c.http.auth.post("/snippets/folders", folderData);
      return response.data;
    } catch (error) {
      c.fail(error, "create snippet folder");
      throw error;
    }
  }

  async function updateSnippetFolderMetadata(
    folderName: string,
    metadata: { color?: string; icon?: string },
  ): Promise<any> {
    try {
      const response = await c.http.auth.put(
        `/snippets/folders/${encodeURIComponent(folderName)}/metadata`,
        metadata,
      );
      return response.data;
    } catch (error) {
      c.fail(error, "update snippet folder metadata");
      throw error;
    }
  }

  async function renameSnippetFolder(
    oldName: string,
    newName: string,
  ): Promise<{ success: boolean; oldName: string; newName: string }> {
    try {
      const response = await c.http.auth.put("/snippets/folders/rename", {
        oldName,
        newName,
      });
      return response.data;
    } catch (error) {
      c.fail(error, "rename snippet folder");
      throw error;
    }
  }

  async function deleteSnippetFolder(
    folderName: string,
  ): Promise<{ success: boolean }> {
    try {
      const response = await c.http.auth.delete(
        `/snippets/folders/${encodeURIComponent(folderName)}`,
      );
      return response.data;
    } catch (error) {
      c.fail(error, "delete snippet folder");
      throw error;
    }
  }

  return {
    getSnippets,
    createSnippet,
    updateSnippet,
    deleteSnippet,
    executeSnippet,
    reorderSnippets,
    getSnippetFolders,
    createSnippetFolder,
    updateSnippetFolderMetadata,
    renameSnippetFolder,
    deleteSnippetFolder,
  };
}

export type SnippetsApi = ReturnType<typeof createSnippetsApi>;
