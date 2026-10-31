import type { AccountClient } from "../AccountClient";
import { fileLogger } from "@/core/log/logger";
import type {
  FileManagerFile,
  FileManagerShortcut,
  FileManagerOperation,
} from "@/types/index";
import type { TrashItem } from "../types";
import { toPluginPath } from "../compat/api-compat";
import { ApiError } from "../errors";
import { nativeStreamResponse, toFetchResponse } from "../native-adapter";
import { toBase64 } from "@/core/db/bytes";
import { nativeRequest } from "@/modules/termix-net";

export function createFilesApi(c: AccountClient) {
  async function getFileManagerRecent(
    hostId: number,
  ): Promise<FileManagerFile[]> {
    try {
      const response = await c.http.host.get(
        `/file_manager/recent?hostId=${hostId}`,
      );
      return response.data || [];
    } catch (error) {
      return [];
    }
  }

  async function addFileManagerRecent(
    file: FileManagerOperation,
  ): Promise<any> {
    try {
      const response = await c.http.host.post("/file_manager/recent", file);
      return response.data;
    } catch (error) {
      c.fail(error, "add recent file");
    }
  }

  async function removeFileManagerRecent(
    file: FileManagerOperation,
  ): Promise<any> {
    try {
      const response = await c.http.host.delete("/file_manager/recent", {
        data: file,
      });
      return response.data;
    } catch (error) {
      c.fail(error, "remove recent file");
    }
  }

  async function getFileManagerPinned(
    hostId: number,
  ): Promise<FileManagerFile[]> {
    try {
      const response = await c.http.host.get(
        `/file_manager/pinned?hostId=${hostId}`,
      );
      return response.data || [];
    } catch (error) {
      return [];
    }
  }

  async function addFileManagerPinned(
    file: FileManagerOperation,
  ): Promise<any> {
    try {
      const response = await c.http.host.post("/file_manager/pinned", file);
      return response.data;
    } catch (error) {
      c.fail(error, "add pinned file");
    }
  }

  async function removeFileManagerPinned(
    file: FileManagerOperation,
  ): Promise<any> {
    try {
      const response = await c.http.host.delete("/file_manager/pinned", {
        data: file,
      });
      return response.data;
    } catch (error) {
      c.fail(error, "remove pinned file");
    }
  }

  async function getFileManagerShortcuts(
    hostId: number,
  ): Promise<FileManagerShortcut[]> {
    try {
      const response = await c.http.host.get(
        `/file_manager/shortcuts?hostId=${hostId}`,
      );
      return response.data || [];
    } catch (error) {
      return [];
    }
  }

  async function addFileManagerShortcut(
    shortcut: FileManagerOperation,
  ): Promise<any> {
    try {
      const response = await c.http.host.post(
        "/file_manager/shortcuts",
        shortcut,
      );
      return response.data;
    } catch (error) {
      c.fail(error, "add shortcut");
    }
  }

  async function removeFileManagerShortcut(
    shortcut: FileManagerOperation,
  ): Promise<any> {
    try {
      const response = await c.http.host.delete("/file_manager/shortcuts", {
        data: shortcut,
      });
      return response.data;
    } catch (error) {
      c.fail(error, "remove shortcut");
    }
  }

  async function connectSSH(
    sessionId: string,
    config: {
      hostId?: number;
      syncId?: string;
      ip: string;
      port: number;
      username: string;
      password?: string;
      sshKey?: string;
      keyPassword?: string;
      authType?: string;
      credentialId?: number;
      userId?: string;
      forceKeyboardInteractive?: boolean;
      overrideCredentialUsername?: boolean;
      jumpHosts?: { hostId: number }[];
    },
  ): Promise<any> {
    try {
      const response = await c.http.files.post("/ssh/connect", {
        sessionId,
        ...config,
      });
      return response.data;
    } catch (error) {
      c.fail(error, "connect SSH");
    }
  }

  async function verifySSHWarpgate(
    sessionId: string,
    warpgateUrl: string,
    securityKey?: string,
  ): Promise<any> {
    try {
      const response = await c.http.files.post("/ssh/connect-warpgate", {
        sessionId,
        warpgateUrl,
        securityKey,
      });
      return response.data;
    } catch (error) {
      c.fail(error, "verify SSH Warpgate");
    }
  }

  async function disconnectSSH(sessionId: string): Promise<any> {
    try {
      const response = await c.http.files.post("/ssh/disconnect", {
        sessionId,
      });
      return response.data;
    } catch (error) {
      c.fail(error, "disconnect SSH");
    }
  }

  async function getSSHStatus(
    sessionId: string,
  ): Promise<{ connected: boolean }> {
    try {
      const response = await c.http.files.get("/ssh/status", {
        params: { sessionId },
      });
      return response.data;
    } catch (error) {
      c.fail(error, "get SSH status");
    }
  }

  async function verifySSHTOTP(
    sessionId: string,
    totpCode: string,
  ): Promise<any> {
    try {
      const response = await c.http.files.post("/ssh/connect-totp", {
        sessionId,
        totpCode,
      });
      return response.data;
    } catch (error) {
      c.fail(error, "verify SSH TOTP");
    }
  }

  async function keepSSHAlive(sessionId: string): Promise<any> {
    try {
      const response = await c.http.files.post("/ssh/keepalive", {
        sessionId,
      });
      return response.data;
    } catch (error) {
      c.fail(error, "SSH keepalive");
    }
  }

  async function listSSHFiles(
    sessionId: string,
    path: string,
  ): Promise<{ files: any[]; path: string }> {
    try {
      const response = await c.http.files.get("/ssh/listFiles", {
        params: { sessionId, path },
      });
      return response.data || { files: [], path };
    } catch (error) {
      c.fail(error, "list SSH files");
      return { files: [], path };
    }
  }

  async function identifySSHSymlink(
    sessionId: string,
    path: string,
  ): Promise<{ path: string; target: string; type: "directory" | "file" }> {
    try {
      const response = await c.http.files.get("/ssh/identifySymlink", {
        params: { sessionId, path },
      });
      return response.data;
    } catch (error) {
      c.fail(error, "identify SSH symlink");
    }
  }

  async function readSSHFile(
    sessionId: string,
    path: string,
  ): Promise<{ content: string; path: string; encoding?: "utf8" | "base64" }> {
    try {
      const response = await c.http.files.get("/ssh/readFile", {
        params: { sessionId, path },
      });
      return response.data;
    } catch (error: any) {
      if (error?.response?.status === 404) {
        const customError: any = new Error("File not found");
        customError.response = error.response;
        customError.isFileNotFound = error.response.data?.fileNotFound || true;
        throw customError;
      }
      c.fail(error, "read SSH file");
    }
  }

  async function writeSSHFile(
    sessionId: string,
    path: string,
    content: string,
    hostId?: number,
    userId?: string,
  ): Promise<any> {
    try {
      const response = await c.http.files.post("/ssh/writeFile", {
        sessionId,
        path,
        content,
        hostId,
        userId,
      });

      if (
        response.data &&
        (response.data.message === "File written successfully" ||
          response.status === 200)
      ) {
        return response.data;
      } else {
        throw new Error("File write operation did not return success status");
      }
    } catch (error) {
      c.fail(error, "write SSH file");
    }
  }

  async function uploadSSHFile(
    sessionId: string,
    path: string,
    fileName: string,
    content: string,
    hostId?: number,
    userId?: string,
  ): Promise<any> {
    try {
      const response = await c.http.files.post("/ssh/uploadFile", {
        sessionId,
        path,
        fileName,
        content,
        hostId,
        userId,
      });
      return response.data;
    } catch (error) {
      c.fail(error, "upload SSH file");
    }
  }

  async function createSSHFile(
    sessionId: string,
    path: string,
    fileName: string,
    content: string = "",
    hostId?: number,
    userId?: string,
  ): Promise<any> {
    try {
      const response = await c.http.files.post("/ssh/createFile", {
        sessionId,
        path,
        fileName,
        content,
        hostId,
        userId,
      });
      return response.data;
    } catch (error) {
      c.fail(error, "create SSH file");
    }
  }

  async function createSSHFolder(
    sessionId: string,
    path: string,
    folderName: string,
    hostId?: number,
    userId?: string,
  ): Promise<any> {
    try {
      const response = await c.http.files.post("/ssh/createFolder", {
        sessionId,
        path,
        folderName,
        hostId,
        userId,
      });
      return response.data;
    } catch (error) {
      c.fail(error, "create SSH folder");
    }
  }

  async function deleteSSHItem(
    sessionId: string,
    path: string,
    isDirectory: boolean,
    hostId?: number,
    userId?: string,
    permanent?: boolean,
  ): Promise<any> {
    try {
      const response = await c.http.files.delete("/ssh/deleteItem", {
        data: {
          sessionId,
          path,
          isDirectory,
          hostId,
          userId,
          permanent,
        },
      });
      return response.data;
    } catch (error) {
      c.fail(error, "delete SSH item");
    }
  }

  async function listSSHTrash(
    sessionId: string,
  ): Promise<{ items: TrashItem[]; retentionDays: number }> {
    try {
      const response = await c.http.files.get("/ssh/trash", {
        params: { sessionId },
      });
      return {
        items: response.data?.items ?? [],
        retentionDays: response.data?.retentionDays ?? 0,
      };
    } catch (error) {
      c.fail(error, "list SSH trash");
      throw error;
    }
  }

  async function restoreSSHTrashItem(
    sessionId: string,
    id: string,
  ): Promise<any> {
    try {
      const response = await c.http.files.post(`/ssh/trash/${id}/restore`, {
        sessionId,
      });
      return response.data;
    } catch (error) {
      c.fail(error, "restore SSH trash item");
      throw error;
    }
  }

  async function deleteSSHTrashItem(
    sessionId: string,
    id: string,
  ): Promise<any> {
    try {
      const response = await c.http.files.delete(`/ssh/trash/${id}`, {
        data: { sessionId },
      });
      return response.data;
    } catch (error) {
      c.fail(error, "delete SSH trash item");
      throw error;
    }
  }

  async function emptySSHTrash(sessionId: string): Promise<any> {
    try {
      const response = await c.http.files.delete("/ssh/trash", {
        data: { sessionId },
      });
      return response.data;
    } catch (error) {
      c.fail(error, "empty SSH trash");
      throw error;
    }
  }

  async function renameSSHItem(
    sessionId: string,
    oldPath: string,
    newName: string,
    hostId?: number,
    userId?: string,
  ): Promise<any> {
    try {
      const response = await c.http.files.put("/ssh/renameItem", {
        sessionId,
        oldPath,
        newName,
        hostId,
        userId,
      });
      return response.data;
    } catch (error) {
      c.fail(error, "rename SSH item");
      throw error;
    }
  }

  async function downloadSSHFile(
    sessionId: string,
    filePath: string,
    hostId?: number,
    userId?: string,
  ): Promise<any> {
    try {
      const response = await c.http.files.post("/ssh/downloadFile", {
        sessionId,
        path: filePath,
        hostId,
        userId,
      });
      return response.data;
    } catch (error) {
      c.fail(error, "download SSH file");
    }
  }

  async function copySSHItem(
    sessionId: string,
    sourcePath: string,
    targetDir: string,
    hostId?: number,
    userId?: string,
  ): Promise<any> {
    try {
      const response = await c.http.files.post(
        "/ssh/copyItem",
        {
          sessionId,
          sourcePath,
          targetDir,
          hostId,
          userId,
        },
        {
          timeout: 60000,
        },
      );
      return response.data;
    } catch (error) {
      c.fail(error, "copy SSH item");
      throw error;
    }
  }

  async function moveSSHItem(
    sessionId: string,
    oldPath: string,
    newPath: string,
    hostId?: number,
    userId?: string,
  ): Promise<any> {
    try {
      const response = await c.http.files.put(
        "/ssh/moveItem",
        {
          sessionId,
          oldPath,
          newPath,
          hostId,
          userId,
        },
        {
          timeout: 60000,
        },
      );
      return response.data;
    } catch (error) {
      c.fail(error, "move SSH item");
      throw error;
    }
  }

  async function changeSSHPermissions(
    sessionId: string,
    path: string,
    permissions: string,
    hostId?: number,
    userId?: string,
  ): Promise<{ success: boolean; message: string }> {
    try {
      fileLogger.info("Changing SSH file permissions", {
        operation: "change_permissions",
        sessionId,
        path,
        permissions,
        hostId,
        userId,
      });

      const response = await c.http.files.post("/ssh/changePermissions", {
        sessionId,
        path,
        permissions,
        hostId,
        userId,
      });

      fileLogger.success("SSH file permissions changed successfully", {
        operation: "change_permissions",
        sessionId,
        path,
        permissions,
      });

      return response.data;
    } catch (error) {
      fileLogger.error("Failed to change SSH file permissions", error, {
        operation: "change_permissions",
        sessionId,
        path,
        permissions,
      });
      c.fail(error, "change SSH permissions");
      throw error;
    }
  }

  async function extractSSHArchive(
    sessionId: string,
    archivePath: string,
    extractPath?: string,
    hostId?: number,
    userId?: string,
  ): Promise<{ success: boolean; message: string; extractPath: string }> {
    try {
      fileLogger.info("Extracting archive", {
        operation: "extract_archive",
        sessionId,
        archivePath,
        extractPath,
        hostId,
        userId,
      });

      const response = await c.http.files.post("/ssh/extractArchive", {
        sessionId,
        archivePath,
        extractPath,
        hostId,
        userId,
      });

      fileLogger.success("Archive extracted successfully", {
        operation: "extract_archive",
        sessionId,
        archivePath,
        extractPath: response.data.extractPath,
      });

      return response.data;
    } catch (error) {
      fileLogger.error("Failed to extract archive", error, {
        operation: "extract_archive",
        sessionId,
        archivePath,
        extractPath,
      });
      c.fail(error, "extract archive");
      throw error;
    }
  }

  async function compressSSHFiles(
    sessionId: string,
    paths: string[],
    archiveName: string,
    format?: string,
    hostId?: number,
    userId?: string,
  ): Promise<{ success: boolean; message: string; archivePath: string }> {
    try {
      fileLogger.info("Compressing files", {
        operation: "compress_files",
        sessionId,
        paths,
        archiveName,
        format,
        hostId,
        userId,
      });

      const response = await c.http.files.post("/ssh/compressFiles", {
        sessionId,
        paths,
        archiveName,
        format: format || "zip",
        hostId,
        userId,
      });

      fileLogger.success("Files compressed successfully", {
        operation: "compress_files",
        sessionId,
        paths,
        archivePath: response.data.archivePath,
      });

      return response.data;
    } catch (error) {
      fileLogger.error("Failed to compress files", error, {
        operation: "compress_files",
        sessionId,
        paths,
        archiveName,
        format,
      });
      c.fail(error, "compress files");
      throw error;
    }
  }

  async function resolveSSHPath(
    sessionId: string,
    path: string,
  ): Promise<{ resolved: string }> {
    try {
      const response = await c.http.files.get("/ssh/resolvePath", {
        params: { sessionId, path },
      });
      return response.data;
    } catch (error) {
      c.fail(error, "resolve SSH path");
    }
  }

  async function executeSSHFile(
    sessionId: string,
    path: string,
    hostId?: number,
    userId?: string,
  ): Promise<any> {
    try {
      const response = await c.http.files.post("/ssh/executeFile", {
        sessionId,
        path,
        hostId,
        userId,
      });
      return response.data;
    } catch (error) {
      c.fail(error, "execute SSH file");
    }
  }

  /**
   * Store a sudo password for a session so the backend can satisfy sudo prompts
   * during file operations (mirrors the web file-manager sudo flow).
   */
  async function setSSHSudoPassword(
    sessionId: string,
    password: string,
  ): Promise<any> {
    try {
      const response = await c.http.files.post("/sudo-password", {
        sessionId,
        password,
      });
      return response.data;
    } catch (error) {
      c.fail(error, "set sudo password");
    }
  }

  async function getRecentFiles(hostId: number): Promise<any> {
    try {
      const response = await c.http.auth.get("/host/file_manager/recent", {
        params: { hostId },
      });
      return response.data;
    } catch (error) {
      c.fail(error, "get recent files");
      throw error;
    }
  }

  async function addRecentFile(
    hostId: number,
    path: string,
    name?: string,
  ): Promise<any> {
    try {
      const response = await c.http.auth.post("/host/file_manager/recent", {
        hostId,
        path,
        name,
      });
      return response.data;
    } catch (error) {
      c.fail(error, "add recent file");
      throw error;
    }
  }

  async function removeRecentFile(hostId: number, path: string): Promise<any> {
    try {
      const response = await c.http.auth.delete("/host/file_manager/recent", {
        data: { hostId, path },
      });
      return response.data;
    } catch (error) {
      c.fail(error, "remove recent file");
      throw error;
    }
  }

  async function getPinnedFiles(hostId: number): Promise<any> {
    try {
      const response = await c.http.auth.get("/host/file_manager/pinned", {
        params: { hostId },
      });
      return response.data;
    } catch (error) {
      c.fail(error, "get pinned files");
      throw error;
    }
  }

  async function addPinnedFile(
    hostId: number,
    path: string,
    name?: string,
  ): Promise<any> {
    try {
      const response = await c.http.auth.post("/host/file_manager/pinned", {
        hostId,
        path,
        name,
      });
      return response.data;
    } catch (error) {
      c.fail(error, "add pinned file");
      throw error;
    }
  }

  async function removePinnedFile(hostId: number, path: string): Promise<any> {
    try {
      const response = await c.http.auth.delete("/host/file_manager/pinned", {
        data: { hostId, path },
      });
      return response.data;
    } catch (error) {
      c.fail(error, "remove pinned file");
      throw error;
    }
  }

  async function getFolderShortcuts(hostId: number): Promise<any> {
    try {
      const response = await c.http.auth.get("/host/file_manager/shortcuts", {
        params: { hostId },
      });
      return response.data;
    } catch (error) {
      c.fail(error, "get folder shortcuts");
      throw error;
    }
  }

  async function addFolderShortcut(
    hostId: number,
    path: string,
    name?: string,
  ): Promise<any> {
    try {
      const response = await c.http.auth.post("/host/file_manager/shortcuts", {
        hostId,
        path,
        name,
      });
      return response.data;
    } catch (error) {
      c.fail(error, "add folder shortcut");
      throw error;
    }
  }

  async function removeFolderShortcut(
    hostId: number,
    path: string,
  ): Promise<any> {
    try {
      const response = await c.http.auth.delete(
        "/host/file_manager/shortcuts",
        {
          data: { hostId, path },
        },
      );
      return response.data;
    } catch (error) {
      c.fail(error, "remove folder shortcut");
      throw error;
    }
  }

  /** Full URL of a file manager route that streams a body. */
  function streamUrl(route: string): string {
    const path = `/ssh/file_manager/ssh/${route}`;
    return c.apiGeneration === "plugin"
      ? `${c.rootBase()}${toPluginPath(path)}`
      : c.apiUrl(path);
  }

  /** Streams a file from `offset` on. A 206 means the server resumed, a 200 sends it all. */
  async function downloadStream(
    sessionId: string,
    path: string,
    offset: number,
    signal?: AbortSignal,
  ): Promise<Response> {
    const headers: Record<string, string> = {
      ...c.requestHeaders(),
      "Content-Type": "application/json",
    };
    if (offset > 0) headers.Range = `bytes=${offset}-`;
    const body = JSON.stringify({ sessionId, path });
    // iOS sends a client certificate only from the native module.
    const response = c.usesNativeNetwork()
      ? await nativeStreamResponse(
          {
            url: streamUrl("downloadFileStream"),
            method: "POST",
            headers,
            body,
          },
          signal,
        )
      : await fetch(streamUrl("downloadFileStream"), {
          method: "POST",
          headers,
          body,
          signal,
        });
    if (!response.ok) await failStream(response, "download file");
    return response;
  }

  /** Writes one raw chunk at `offset`. Returns where the next chunk starts. */
  async function uploadChunk(
    sessionId: string,
    dir: string,
    fileName: string,
    offset: number,
    totalSize: number,
    bytes: Uint8Array,
    signal?: AbortSignal,
  ): Promise<{ nextOffset: number; complete: boolean }> {
    const query = new URLSearchParams({
      sessionId,
      path: dir,
      fileName,
      offset: String(offset),
      totalSize: String(totalSize),
    });
    const url = `${streamUrl("uploadFileChunk")}?${query.toString()}`;
    const headers = {
      ...c.requestHeaders(),
      "Content-Type": "application/octet-stream",
    };
    const response = c.usesNativeNetwork()
      ? toFetchResponse(
          await nativeRequest({
            url,
            method: "POST",
            headers,
            bodyBase64: toBase64(bytes),
            timeoutMs: 120000,
          }),
        )
      : await fetch(url, {
          method: "POST",
          headers,
          // expo/fetch sends typed arrays as is; the DOM types just don't list them.
          body: bytes as unknown as BodyInit,
          signal,
        });
    if (!response.ok) await failStream(response, "upload file");
    const data = (await response.json()) as {
      nextOffset?: number;
      complete?: boolean;
    };
    return {
      nextOffset: data.nextOffset ?? offset + bytes.length,
      complete: data.complete ?? offset + bytes.length >= totalSize,
    };
  }

  async function failStream(
    response: Response,
    operation: string,
  ): Promise<never> {
    let data: { error?: string } | null = null;
    try {
      data = (await response.json()) as { error?: string };
    } catch {
      // Not JSON, keep the status alone.
    }
    const status = response.status;
    throw new ApiError(
      data?.error ?? `Could not ${operation} (${status})`,
      status,
      status === 416 ? "RANGE_NOT_SATISFIABLE" : undefined,
    );
  }

  return {
    streamUrl,
    downloadStream,
    uploadChunk,
    getFileManagerRecent,
    addFileManagerRecent,
    removeFileManagerRecent,
    getFileManagerPinned,
    addFileManagerPinned,
    removeFileManagerPinned,
    getFileManagerShortcuts,
    addFileManagerShortcut,
    removeFileManagerShortcut,
    connectSSH,
    verifySSHWarpgate,
    disconnectSSH,
    getSSHStatus,
    verifySSHTOTP,
    keepSSHAlive,
    listSSHFiles,
    identifySSHSymlink,
    readSSHFile,
    writeSSHFile,
    uploadSSHFile,
    createSSHFile,
    createSSHFolder,
    deleteSSHItem,
    listSSHTrash,
    restoreSSHTrashItem,
    deleteSSHTrashItem,
    emptySSHTrash,
    renameSSHItem,
    downloadSSHFile,
    copySSHItem,
    moveSSHItem,
    changeSSHPermissions,
    extractSSHArchive,
    compressSSHFiles,
    resolveSSHPath,
    executeSSHFile,
    setSSHSudoPassword,
    getRecentFiles,
    addRecentFile,
    removeRecentFile,
    getPinnedFiles,
    addPinnedFile,
    removePinnedFile,
    getFolderShortcuts,
    addFolderShortcut,
    removeFolderShortcut,
  };
}

export type FilesApi = ReturnType<typeof createFilesApi>;
