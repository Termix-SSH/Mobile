import {
  useState,
  useEffect,
  useRef,
  useCallback,
  forwardRef,
  useImperativeHandle,
} from "react";
import {
  View,
  Alert,
  TextInput,
  Modal,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Server } from "lucide-react-native";
import { SSHHost } from "@/types";
import { useOrientation } from "@/app/utils/orientation";
import { getResponsivePadding, getTabBarHeight } from "@/app/utils/responsive";
import {
  BORDERS,
  BORDER_COLORS,
  RADIUS,
  BACKGROUNDS,
} from "@/app/constants/designTokens";
import {
  connectSSH,
  listSSHFiles,
  readSSHFile,
  writeSSHFile,
  createSSHFile,
  createSSHFolder,
  deleteSSHItem,
  renameSSHItem,
  copySSHItem,
  moveSSHItem,
  verifySSHTOTP,
  keepSSHAlive,
  identifySSHSymlink,
} from "@/app/main-axios";
import { FileList } from "@/app/tabs/sessions/file-manager/FileList";
import { FileManagerHeader } from "@/app/tabs/sessions/file-manager/FileManagerHeader";
import { FileManagerToolbar } from "@/app/tabs/sessions/file-manager/FileManagerToolbar";
import { ContextMenu } from "@/app/tabs/sessions/file-manager/ContextMenu";
import { FileViewer } from "@/app/tabs/sessions/file-manager/FileViewer";
import {
  joinPath,
  isTextFile,
  isArchiveFile,
} from "@/app/tabs/sessions/file-manager/utils/fileUtils";
import { showToast } from "@/app/utils/toast";
import { TOTPDialog } from "@/app/tabs/dialogs";

interface FileManagerProps {
  host: SSHHost;
  sessionId: string;
  isVisible: boolean;
}

interface FileItem {
  name: string;
  path: string;
  type: "file" | "directory" | "link";
  size?: number;
  modified?: string;
  permissions?: string;
}

export interface FileManagerHandle {
  handleDisconnect: () => void;
}

export const FileManager = forwardRef<FileManagerHandle, FileManagerProps>(
  ({ host, sessionId, isVisible }, ref) => {
    const insets = useSafeAreaInsets();
    const { width, isLandscape } = useOrientation();
    const [currentPath, setCurrentPath] = useState("/");
    const [files, setFiles] = useState<FileItem[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [isConnected, setIsConnected] = useState(false);
    const [sshSessionId, setSshSessionId] = useState<string | null>(null);

    const [selectionMode, setSelectionMode] = useState(false);
    const [selectedFiles, setSelectedFiles] = useState<string[]>([]);
    const [clipboard, setClipboard] = useState<{
      files: string[];
      operation: "copy" | "cut" | null;
    }>({ files: [], operation: null });

    const [contextMenu, setContextMenu] = useState<{
      visible: boolean;
      file: FileItem | null;
    }>({ visible: false, file: null });
    const [totpDialog, setTotpDialog] = useState(false);
    const [totpCode, setTotpCode] = useState("");
    const [createDialog, setCreateDialog] = useState<{
      visible: boolean;
      type: "file" | "folder" | null;
    }>({ visible: false, type: null });
    const [createName, setCreateName] = useState("");
    const [renameDialog, setRenameDialog] = useState<{
      visible: boolean;
      file: FileItem | null;
    }>({ visible: false, file: null });
    const [renameName, setRenameName] = useState("");
    const [fileViewer, setFileViewer] = useState<{
      visible: boolean;
      file: FileItem | null;
      content: string;
    }>({ visible: false, file: null, content: "" });

    const keepaliveInterval = useRef<NodeJS.Timeout | null>(null);

    const connectToSSH = useCallback(async () => {
      try {
        setIsLoading(true);
        const response = await connectSSH(sessionId, {
          hostId: host.id,
          ip: host.ip,
          port: host.port,
          username: host.username,
          password: host.authType === "password" ? host.password : undefined,
          sshKey: host.authType === "key" ? host.key : undefined,
          keyPassword: host.keyPassword,
          authType: host.authType,
          credentialId: host.credentialId,
          userId: host.userId,
          forceKeyboardInteractive: host.forceKeyboardInteractive,
          overrideCredentialUsername: host.overrideCredentialUsername,
          jumpHosts: host.jumpHosts,
        });

        if (response.requires_totp) {
          setTotpDialog(true);
          return;
        }

        setSshSessionId(sessionId);
        setIsConnected(true);

        keepaliveInterval.current = setInterval(() => {
          keepSSHAlive(sessionId).catch(() => {});
        }, 30000);

        await loadDirectory(host.defaultPath || "/");
      } catch (error: any) {
        showToast.error(error.message || "Failed to connect to SSH");
      } finally {
        setIsLoading(false);
      }
    }, [host, sessionId]);

    const handleTOTPVerify = async (code: string) => {
      try {
        await verifySSHTOTP(sessionId, code);
        setTotpDialog(false);
        setTotpCode("");
        setSshSessionId(sessionId);
        setIsConnected(true);

        keepaliveInterval.current = setInterval(() => {
          keepSSHAlive(sessionId).catch(() => {});
        }, 30000);

        await loadDirectory(host.defaultPath || "/");
      } catch (error: any) {
        showToast.error(error.message || "Invalid TOTP code");
      }
    };

    const loadDirectory = useCallback(
      async (path: string) => {
        if (!sessionId) return;

        try {
          setIsLoading(true);
          const response = await listSSHFiles(sessionId, path);
          setFiles(response.files || []);
          setCurrentPath(response.path || path);
        } catch (error: any) {
          showToast.error(error.message || "Failed to load directory");
        } finally {
          setIsLoading(false);
        }
      },
      [sessionId],
    );

    const handleFilePress = async (file: FileItem) => {
      if (file.type === "link") {
        try {
          setIsLoading(true);
          const symlinkInfo = await identifySSHSymlink(sessionId!, file.path);

          if (symlinkInfo.type === "directory") {
            await loadDirectory(symlinkInfo.target);
          } else if (isTextFile(symlinkInfo.target)) {
            const targetFile: FileItem = {
              name: file.name,
              path: symlinkInfo.target,
              type: "file",
            };
            await handleViewFile(targetFile);
          } else {
            showToast.info("File type not supported for viewing");
          }
        } catch (error: any) {
          showToast.error(error.message || "Failed to follow symlink");
        } finally {
          setIsLoading(false);
        }
        return;
      }

      if (file.type === "directory") {
        loadDirectory(file.path);
      } else {
        handleViewFile(file);
      }
    };

    const handleFileLongPress = (file: FileItem) => {
      setContextMenu({ visible: true, file });
    };

    const handleViewFile = async (file: FileItem) => {
      try {
        setIsLoading(true);
        const response = await readSSHFile(sessionId!, file.path);
        setFileViewer({ visible: true, file, content: response.content });
      } catch (error: any) {
        showToast.error(error.message || "Failed to read file");
      } finally {
        setIsLoading(false);
      }
    };

    const handleSaveFile = async (content: string) => {
      if (!fileViewer.file) return;

      try {
        await writeSSHFile(sessionId!, fileViewer.file.path, content, host.id);
        showToast.success("File saved successfully");
        await loadDirectory(currentPath);
      } catch (error: any) {
        throw new Error(error.message || "Failed to save file");
      }
    };

    const handleCreateFolder = () => {
      setCreateDialog({ visible: true, type: "folder" });
      setCreateName("");
    };

    const handleCreateFile = () => {
      setCreateDialog({ visible: true, type: "file" });
      setCreateName("");
    };

    const handleCreateConfirm = async () => {
      if (!createDialog.type || !createName.trim()) return;

      try {
        setIsLoading(true);
        if (createDialog.type === "folder") {
          await createSSHFolder(sessionId!, currentPath, createName, host.id);
          showToast.success("Folder created successfully");
        } else {
          await createSSHFile(sessionId!, currentPath, createName, "", host.id);
          showToast.success("File created successfully");
        }
        setCreateDialog({ visible: false, type: null });
        setCreateName("");
        await loadDirectory(currentPath);
      } catch (error: any) {
        showToast.error(error.message || "Failed to create item");
      } finally {
        setIsLoading(false);
      }
    };

    const handleRename = (file: FileItem) => {
      setRenameDialog({ visible: true, file });
      setRenameName(file.name);
    };

    const handleRenameConfirm = async () => {
      if (!renameDialog.file || !renameName.trim()) return;

      try {
        setIsLoading(true);
        await renameSSHItem(
          sessionId!,
          renameDialog.file.path,
          renameName,
          host.id,
        );
        showToast.success("Item renamed successfully");
        setRenameDialog({ visible: false, file: null });
        setRenameName("");
        await loadDirectory(currentPath);
      } catch (error: any) {
        showToast.error(error.message || "Failed to rename item");
      } finally {
        setIsLoading(false);
      }
    };

    const handleCopy = (file?: FileItem) => {
      const filesToCopy = file ? [file.path] : selectedFiles;
      setClipboard({ files: filesToCopy, operation: "copy" });
      setSelectionMode(false);
      setSelectedFiles([]);
      showToast.success(`${filesToCopy.length} item(s) copied`);
    };

    const handleCut = (file?: FileItem) => {
      const filesToCut = file ? [file.path] : selectedFiles;
      setClipboard({ files: filesToCut, operation: "cut" });
      setSelectionMode(false);
      setSelectedFiles([]);
      showToast.success(`${filesToCut.length} item(s) cut`);
    };

    const handlePaste = async () => {
      if (clipboard.files.length === 0 || !clipboard.operation) return;

      try {
        setIsLoading(true);
        for (const filePath of clipboard.files) {
          if (clipboard.operation === "copy") {
            await copySSHItem(sessionId!, filePath, currentPath, host.id);
          } else {
            await moveSSHItem(
              sessionId!,
              filePath,
              joinPath(currentPath, filePath.split("/").pop()!),
              host.id,
            );
          }
        }
        showToast.success(`${clipboard.files.length} item(s) pasted`);
        setClipboard({ files: [], operation: null });
        await loadDirectory(currentPath);
      } catch (error: any) {
        showToast.error(error.message || "Failed to paste items");
      } finally {
        setIsLoading(false);
      }
    };

    const handleDelete = async (file?: FileItem) => {
      const filesToDelete = file
        ? [file]
        : files.filter((f) => selectedFiles.includes(f.path));

      Alert.alert(
        "Confirm Delete",
        `Are you sure you want to delete ${filesToDelete.length} item(s)?`,
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Delete",
            style: "destructive",
            onPress: async () => {
              try {
                setIsLoading(true);
                for (const fileItem of filesToDelete) {
                  await deleteSSHItem(
                    sessionId!,
                    fileItem.path,
                    fileItem.type === "directory",
                    host.id,
                  );
                }
                showToast.success(`${filesToDelete.length} item(s) deleted`);
                setSelectionMode(false);
                setSelectedFiles([]);
                await loadDirectory(currentPath);
              } catch (error: any) {
                showToast.error(error.message || "Failed to delete items");
              } finally {
                setIsLoading(false);
              }
            },
          },
        ],
      );
    };

    const handleSelectToggle = (path: string) => {
      setSelectedFiles((prev) =>
        prev.includes(path) ? prev.filter((p) => p !== path) : [...prev, path],
      );
    };

    const handleCancelSelection = () => {
      setSelectionMode(false);
      setSelectedFiles([]);
    };

    useEffect(() => {
      connectToSSH();

      return () => {
        if (keepaliveInterval.current) {
          clearInterval(keepaliveInterval.current);
        }
      };
    }, [connectToSSH]);

    useImperativeHandle(ref, () => ({
      handleDisconnect: () => {
        if (keepaliveInterval.current) {
          clearInterval(keepaliveInterval.current);
        }
        setIsConnected(false);
      },
    }));

    if (!host.enableFileManager) {
      return (
        <View
          style={{
            flex: 1,
            justifyContent: "center",
            alignItems: "center",
            backgroundColor: BACKGROUNDS.DARKEST,
          }}
        >
          <Server size={48} color="#EF4444" />
          <Text
            style={{
              color: "#ffffff",
              fontSize: 18,
              fontWeight: "600",
              marginTop: 16,
            }}
          >
            File Manager Disabled
          </Text>
          <Text
            style={{
              color: "#9CA3AF",
              fontSize: 14,
              marginTop: 8,
              textAlign: "center",
              paddingHorizontal: 24,
            }}
          >
            File Manager is not enabled for this host. Contact your
            administrator to enable it.
          </Text>
        </View>
      );
    }

    if (!isConnected) {
      return (
        <View className="flex-1 bg-dark-bg items-center justify-center">
          <ActivityIndicator size="large" color="#22C55E" />
          <Text className="text-white mt-4">Connecting to {host.name}...</Text>

          <TOTPDialog
            visible={totpDialog}
            onSubmit={handleTOTPVerify}
            onCancel={() => {
              setTotpDialog(false);
              setTotpCode("");
            }}
            prompt="Two-Factor Authentication"
            isPasswordPrompt={false}
          />
        </View>
      );
    }

    const padding = getResponsivePadding(isLandscape);
    const tabBarHeight = getTabBarHeight(isLandscape);

    const toolbarPaddingVertical = isLandscape ? 8 : 12;
    const toolbarContentHeight = isLandscape ? 34 : 44;
    const toolbarBorderHeight = 2;
    const effectiveToolbarHeight =
      selectionMode || clipboard.files.length > 0
        ? toolbarPaddingVertical * 2 +
          toolbarContentHeight +
          toolbarBorderHeight
        : 0;

    return (
      <View
        className="flex-1"
        style={{
          opacity: isVisible ? 1 : 0,
          display: isVisible ? "flex" : "none",
          backgroundColor: BACKGROUNDS.HEADER,
        }}
      >
        <FileManagerHeader
          currentPath={currentPath}
          onNavigateToPath={loadDirectory}
          onRefresh={() => loadDirectory(currentPath)}
          onCreateFolder={handleCreateFolder}
          onCreateFile={handleCreateFile}
          onMenuPress={() => setSelectionMode(true)}
          isLoading={isLoading}
          isLandscape={isLandscape}
        />

        <FileList
          files={files}
          onFilePress={handleFilePress}
          onFileLongPress={handleFileLongPress}
          selectedFiles={selectedFiles}
          onSelectToggle={handleSelectToggle}
          selectionMode={selectionMode}
          isLoading={isLoading}
          onRefresh={() => loadDirectory(currentPath)}
          isLandscape={isLandscape}
          width={width}
          toolbarHeight={effectiveToolbarHeight}
        />

        <FileManagerToolbar
          selectionMode={selectionMode}
          selectedCount={selectedFiles.length}
          onCopy={() => handleCopy()}
          onCut={() => handleCut()}
          onPaste={handlePaste}
          onDelete={() => handleDelete()}
          onCancelSelection={handleCancelSelection}
          onCancelClipboard={() => setClipboard({ files: [], operation: null })}
          clipboardCount={clipboard.files.length}
          clipboardOperation={clipboard.operation}
          isLandscape={isLandscape}
          bottomInset={insets.bottom}
          tabBarHeight={tabBarHeight}
        />

        {contextMenu.file && (
          <ContextMenu
            visible={contextMenu.visible}
            onClose={() => setContextMenu({ visible: false, file: null })}
            fileName={contextMenu.file.name}
            fileType={contextMenu.file.type}
            onView={
              contextMenu.file.type === "file"
                ? () => handleViewFile(contextMenu.file!)
                : undefined
            }
            onEdit={
              contextMenu.file.type === "file"
                ? () => handleViewFile(contextMenu.file!)
                : undefined
            }
            onRename={() => handleRename(contextMenu.file!)}
            onCopy={() => handleCopy(contextMenu.file!)}
            onCut={() => handleCut(contextMenu.file!)}
            onDelete={() => handleDelete(contextMenu.file!)}
            isArchive={isArchiveFile(contextMenu.file.name)}
          />
        )}

        <Modal
          visible={createDialog.visible}
          transparent
          animationType="fade"
          supportedOrientations={["portrait", "landscape"]}
        >
          <KeyboardAvoidingView
            behavior={Platform.OS === "ios" ? "padding" : undefined}
            className="flex-1"
          >
            <View className="flex-1 bg-black/50 items-center justify-center p-4">
              <View
                className="p-6 w-full max-w-sm"
                style={{
                  backgroundColor: BACKGROUNDS.CARD,
                  borderWidth: BORDERS.MAJOR,
                  borderColor: BORDER_COLORS.PRIMARY,
                  borderRadius: RADIUS.CARD,
                  marginBottom: isLandscape ? 0 : insets.bottom,
                }}
              >
                <Text className="text-white text-lg font-semibold mb-4">
                  Create New{" "}
                  {createDialog.type === "folder" ? "Folder" : "File"}
                </Text>
                <TextInput
                  className="px-4 py-3 text-white mb-4"
                  style={{
                    backgroundColor: BACKGROUNDS.DARKER,
                    borderWidth: BORDERS.MAJOR,
                    borderColor: BORDER_COLORS.PRIMARY,
                    borderRadius: RADIUS.BUTTON,
                  }}
                  value={createName}
                  onChangeText={setCreateName}
                  placeholder="Name"
                  placeholderTextColor="#6B7280"
                  autoFocus
                />
                <View className="flex-row gap-2">
                  <TouchableOpacity
                    onPress={() => {
                      setCreateDialog({ visible: false, type: null });
                      setCreateName("");
                    }}
                    className="flex-1 py-3"
                    style={{
                      backgroundColor: BACKGROUNDS.BUTTON,
                      borderWidth: BORDERS.MAJOR,
                      borderColor: BORDER_COLORS.BUTTON,
                      borderRadius: RADIUS.BUTTON,
                    }}
                    activeOpacity={0.7}
                  >
                    <Text className="text-white text-center font-semibold">
                      Cancel
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={handleCreateConfirm}
                    className="flex-1 bg-green-600 py-3"
                    style={{
                      borderWidth: 2,
                      borderColor: "#16a34a",
                      borderRadius: 8,
                    }}
                    activeOpacity={0.7}
                  >
                    <Text className="text-white text-center font-semibold">
                      Create
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          </KeyboardAvoidingView>
        </Modal>

        <Modal
          visible={renameDialog.visible}
          transparent
          animationType="fade"
          supportedOrientations={["portrait", "landscape"]}
        >
          <KeyboardAvoidingView
            behavior={Platform.OS === "ios" ? "padding" : undefined}
            className="flex-1"
          >
            <View className="flex-1 bg-black/50 items-center justify-center p-4">
              <View
                className="p-6 w-full max-w-sm"
                style={{
                  backgroundColor: BACKGROUNDS.CARD,
                  borderWidth: BORDERS.MAJOR,
                  borderColor: BORDER_COLORS.PRIMARY,
                  borderRadius: RADIUS.CARD,
                  marginBottom: isLandscape ? 0 : insets.bottom,
                }}
              >
                <Text className="text-white text-lg font-semibold mb-4">
                  Rename Item
                </Text>
                <TextInput
                  className="px-4 py-3 text-white mb-4"
                  style={{
                    backgroundColor: BACKGROUNDS.DARKER,
                    borderWidth: BORDERS.MAJOR,
                    borderColor: BORDER_COLORS.PRIMARY,
                    borderRadius: RADIUS.BUTTON,
                  }}
                  value={renameName}
                  onChangeText={setRenameName}
                  placeholder="New name"
                  placeholderTextColor="#6B7280"
                  autoFocus
                />
                <View className="flex-row gap-2">
                  <TouchableOpacity
                    onPress={() => {
                      setRenameDialog({ visible: false, file: null });
                      setRenameName("");
                    }}
                    className="flex-1 py-3"
                    style={{
                      backgroundColor: BACKGROUNDS.BUTTON,
                      borderWidth: BORDERS.MAJOR,
                      borderColor: BORDER_COLORS.BUTTON,
                      borderRadius: RADIUS.BUTTON,
                    }}
                    activeOpacity={0.7}
                  >
                    <Text className="text-white text-center font-semibold">
                      Cancel
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={handleRenameConfirm}
                    className="flex-1 bg-green-600 py-3"
                    style={{
                      borderWidth: 2,
                      borderColor: "#16a34a",
                      borderRadius: 8,
                    }}
                    activeOpacity={0.7}
                  >
                    <Text className="text-white text-center font-semibold">
                      Rename
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          </KeyboardAvoidingView>
        </Modal>

        {fileViewer.file && (
          <FileViewer
            visible={fileViewer.visible}
            onClose={() =>
              setFileViewer({ visible: false, file: null, content: "" })
            }
            fileName={fileViewer.file.name}
            filePath={fileViewer.file.path}
            initialContent={fileViewer.content}
            onSave={handleSaveFile}
          />
        )}
      </View>
    );
  },
);

FileManager.displayName = "FileManager";
