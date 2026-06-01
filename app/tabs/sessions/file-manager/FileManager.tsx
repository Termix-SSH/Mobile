import {
  useState,
  useCallback,
  useMemo,
  forwardRef,
  useImperativeHandle,
  useRef,
} from "react";
import {
  View,
  ScrollView,
  Pressable,
  RefreshControl,
  Alert,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  Animated,
  ActivityIndicator,
} from "react-native";
import { Swipeable } from "react-native-gesture-handler";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Clipboard from "expo-clipboard";
import * as DocumentPicker from "expo-document-picker";
import {
  ChevronRight,
  File as FileIcon,
  Folder,
  Link as LinkIcon,
  Search,
  RefreshCw,
  FolderPlus,
  FilePlus,
  ClipboardPaste,
  Eye,
  Pencil,
  Copy,
  Scissors,
  Trash2,
  Lock,
  ClipboardCopy,
  MoreVertical,
  ChevronLeft,
  ArrowUpDown,
  Upload,
  Archive,
  CheckSquare,
  Square,
  X,
} from "lucide-react-native";
import { SSHHost, SessionAuthOverrides } from "@/types";
import {
  connectSSH,
  verifySSHTOTP,
  verifySSHWarpgate,
  keepSSHAlive,
  disconnectSSH,
  listSSHFiles,
  readSSHFile,
  writeSSHFile,
  createSSHFile,
  createSSHFolder,
  deleteSSHItem,
  renameSSHItem,
  copySSHItem,
  moveSSHItem,
  changeSSHPermissions,
  identifySSHSymlink,
  uploadSSHFile,
  extractSSHArchive,
} from "@/app/main-axios";
import { Text, Input, Button } from "@/app/components/ui";
import { useThemeColor } from "@/app/contexts/ThemeContext";
import { toast } from "@/app/utils/toast";
import {
  SessionFrame,
  useSessionConnect,
  AuthDialogs,
  ContextSheet,
  type ContextAction,
} from "@/app/tabs/sessions/_shared";
import { FileViewer } from "./FileViewer";
import { PermissionsDialog } from "./PermissionsDialog";
import {
  joinPath,
  isTextFile,
  isArchiveFile,
  formatFileSize,
  formatDate,
  getFileIconColor,
  breadcrumbsFromPath,
  getBreadcrumbLabel,
  getParentPath,
  sortFiles,
} from "./utils/fileUtils";

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
  owner?: string;
  group?: string;
}

export interface FileManagerHandle {
  handleDisconnect: () => void;
}

type SortBy = "name" | "size" | "modified";

export const FileManager = forwardRef<FileManagerHandle, FileManagerProps>(
  ({ host, isVisible }, ref) => {
    const color = useThemeColor();
    const insets = useSafeAreaInsets();

    const [currentPath, setCurrentPath] = useState("/");
    const [files, setFiles] = useState<FileItem[]>([]);
    const [loadingDir, setLoadingDir] = useState(false);
    const [, setBusy] = useState(false);
    const [refreshing, setRefreshing] = useState(false);
    const [query, setQuery] = useState("");

    const [sortBy, setSortBy] = useState<SortBy>("name");
    const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");

    const [clipboard, setClipboard] = useState<{
      files: string[];
      operation: "copy" | "cut" | null;
    }>({ files: [], operation: null });

    const [selectionMode, setSelectionMode] = useState(false);
    const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set());

    const [menuFile, setMenuFile] = useState<FileItem | null>(null);
    const [moreMenuVisible, setMoreMenuVisible] = useState(false);
    const [permsFile, setPermsFile] = useState<FileItem | null>(null);
    const [createDialog, setCreateDialog] = useState<"file" | "folder" | null>(null);
    const [createName, setCreateName] = useState("");
    const [renameTarget, setRenameTarget] = useState<FileItem | null>(null);
    const [renameName, setRenameName] = useState("");
    const [viewer, setViewer] = useState<{
      file: FileItem;
      content: string;
    } | null>(null);

    // --- Transport ---
    const transport = useMemo(
      () => ({
        prefix: "fm",
        connect: (
          sid: string,
          h: SSHHost,
          userId: string | undefined,
          overrides: SessionAuthOverrides,
        ) =>
          connectSSH(sid, {
            hostId: h.id,
            ip: h.ip,
            port: h.port,
            username: h.username,
            password:
              overrides.userProvidedPassword ??
              (h.authType === "password" ? h.password : undefined),
            sshKey:
              overrides.userProvidedSshKey ??
              (h.authType === "key" ? h.key : undefined),
            keyPassword: overrides.userProvidedKeyPassword ?? h.keyPassword,
            authType: h.authType,
            credentialId: h.credentialId,
            userId,
            forceKeyboardInteractive: h.forceKeyboardInteractive,
            overrideCredentialUsername: h.overrideCredentialUsername,
            jumpHosts: h.jumpHosts,
          }),
        submitTotp: (sid: string, code: string) => verifySSHTOTP(sid, code),
        submitWarpgate: (sid: string, url: string, key?: string) =>
          verifySSHWarpgate(sid, url, key),
        keepAlive: (sid: string) => keepSSHAlive(sid),
        disconnect: (sid: string) => disconnectSSH(sid),
      }),
      [],
    );

    const loadDirectory = useCallback(
      async (path: string, sid?: string) => {
        const session = sid || conn.sessionId.current;
        if (!session) return;
        setBusy(true);
        setLoadingDir(true);
        try {
          const response = await listSSHFiles(session, path);
          setFiles((response.files as FileItem[]) || []);
          setCurrentPath(response.path || path);
          setSelectedFiles(new Set());
          setSelectionMode(false);
        } catch (e: any) {
          toast.error(e?.message || "Failed to load directory");
        } finally {
          setBusy(false);
          setLoadingDir(false);
        }
      },
      // eslint-disable-next-line react-hooks/exhaustive-deps
      [],
    );

    const onConnected = useCallback(
      (sid: string) => loadDirectory(host.defaultPath || "/", sid),
      [host.defaultPath, loadDirectory],
    );

    const conn = useSessionConnect(
      isVisible && host.enableFileManager ? host : null,
      transport,
      onConnected,
      { autoConnect: true, keepAliveMs: 30000 },
    );

    useImperativeHandle(ref, () => ({
      handleDisconnect: () => conn.disconnect(),
    }));

    // --- File interactions ---
    const openFile = async (file: FileItem) => {
      if (selectionMode) {
        toggleSelect(file.path);
        return;
      }
      if (file.type === "link") {
        try {
          setBusy(true);
          const info = await identifySSHSymlink(conn.sessionId.current, file.path);
          if (info.type === "directory") {
            await loadDirectory(info.target);
          } else if (isTextFile(info.target)) {
            await viewFile({ ...file, path: info.target, type: "file" });
          } else {
            toast.info("File type not supported for viewing");
          }
        } catch (e: any) {
          toast.error(e?.message || "Failed to follow symlink");
        } finally {
          setBusy(false);
        }
        return;
      }
      if (file.type === "directory") {
        loadDirectory(file.path);
      } else {
        viewFile(file);
      }
    };

    const viewFile = async (file: FileItem) => {
      try {
        setBusy(true);
        const response = await readSSHFile(conn.sessionId.current, file.path);
        setViewer({ file, content: response.content });
      } catch (e: any) {
        toast.error(e?.message || "Failed to read file");
      } finally {
        setBusy(false);
      }
    };

    const saveFile = async (content: string) => {
      if (!viewer) return;
      await writeSSHFile(conn.sessionId.current, viewer.file.path, content, host.id);
      toast.success("File saved");
      await loadDirectory(currentPath);
    };

    const confirmCreate = async () => {
      if (!createDialog || !createName.trim()) return;
      try {
        setBusy(true);
        if (createDialog === "folder") {
          await createSSHFolder(conn.sessionId.current, currentPath, createName, host.id);
        } else {
          await createSSHFile(conn.sessionId.current, currentPath, createName, "", host.id);
        }
        toast.success(`${createDialog === "folder" ? "Folder" : "File"} created`);
        setCreateDialog(null);
        setCreateName("");
        await loadDirectory(currentPath);
      } catch (e: any) {
        toast.error(e?.message || "Failed to create");
      } finally {
        setBusy(false);
      }
    };

    const confirmRename = async () => {
      if (!renameTarget || !renameName.trim()) return;
      try {
        setBusy(true);
        await renameSSHItem(conn.sessionId.current, renameTarget.path, renameName, host.id);
        toast.success("Renamed");
        setRenameTarget(null);
        setRenameName("");
        await loadDirectory(currentPath);
      } catch (e: any) {
        toast.error(e?.message || "Failed to rename");
      } finally {
        setBusy(false);
      }
    };

    const doDelete = (file: FileItem) => {
      Alert.alert("Delete", `Delete "${file.name}"?`, [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              setBusy(true);
              await deleteSSHItem(
                conn.sessionId.current,
                file.path,
                file.type === "directory",
                host.id,
              );
              toast.success("Deleted");
              await loadDirectory(currentPath);
            } catch (e: any) {
              toast.error(e?.message || "Failed to delete");
            } finally {
              setBusy(false);
            }
          },
        },
      ]);
    };

    const doDeleteSelected = () => {
      const count = selectedFiles.size;
      Alert.alert("Delete", `Delete ${count} item${count !== 1 ? "s" : ""}?`, [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              setBusy(true);
              for (const path of selectedFiles) {
                const file = files.find((f) => f.path === path);
                await deleteSSHItem(
                  conn.sessionId.current,
                  path,
                  file?.type === "directory",
                  host.id,
                );
              }
              toast.success(`${count} item${count !== 1 ? "s" : ""} deleted`);
              setSelectionMode(false);
              setSelectedFiles(new Set());
              await loadDirectory(currentPath);
            } catch (e: any) {
              toast.error(e?.message || "Failed to delete");
            } finally {
              setBusy(false);
            }
          },
        },
      ]);
    };

    const doPaste = async () => {
      if (!clipboard.files.length || !clipboard.operation) return;
      try {
        setBusy(true);
        for (const p of clipboard.files) {
          if (clipboard.operation === "copy") {
            await copySSHItem(conn.sessionId.current, p, currentPath, host.id);
          } else {
            await moveSSHItem(
              conn.sessionId.current,
              p,
              joinPath(currentPath, p.split("/").pop()!),
              host.id,
            );
          }
        }
        toast.success(`${clipboard.files.length} item(s) pasted`);
        setClipboard({ files: [], operation: null });
        await loadDirectory(currentPath);
      } catch (e: any) {
        toast.error(e?.message || "Failed to paste");
      } finally {
        setBusy(false);
      }
    };

    const applyPermissions = async (octal: string) => {
      if (!permsFile) return;
      try {
        await changeSSHPermissions(conn.sessionId.current, permsFile.path, octal, host.id);
        toast.success(`Permissions set to ${octal}`);
        setPermsFile(null);
        await loadDirectory(currentPath);
      } catch (e: any) {
        toast.error(e?.message || "Failed to change permissions");
      }
    };

    const doUpload = async () => {
      try {
        const result = await DocumentPicker.getDocumentAsync({
          copyToCacheDirectory: true,
          multiple: false,
        });
        if (result.canceled || !result.assets?.[0]) return;
        const asset = result.assets[0];
        setBusy(true);
        const response = await fetch(asset.uri);
        const buffer = await response.arrayBuffer();
        const base64 = btoa(
          String.fromCharCode(...new Uint8Array(buffer)),
        );
        await uploadSSHFile(conn.sessionId.current, currentPath, asset.name, base64, host.id);
        toast.success(`Uploaded ${asset.name}`);
        await loadDirectory(currentPath);
      } catch (e: any) {
        toast.error(e?.message || "Failed to upload file");
      } finally {
        setBusy(false);
      }
    };

    const doExtract = async (file: FileItem) => {
      try {
        setBusy(true);
        await extractSSHArchive(conn.sessionId.current, file.path, currentPath, host.id);
        toast.success("Extracted successfully");
        await loadDirectory(currentPath);
      } catch (e: any) {
        toast.error(e?.message || "Failed to extract archive");
      } finally {
        setBusy(false);
      }
    };

    // --- Selection helpers ---
    const toggleSelect = (path: string) => {
      setSelectedFiles((prev) => {
        const next = new Set(prev);
        if (next.has(path)) next.delete(path);
        else next.add(path);
        return next;
      });
    };

    const activateSelection = (file: FileItem) => {
      setSelectionMode(true);
      setSelectedFiles(new Set([file.path]));
    };

    const cancelSelection = () => {
      setSelectionMode(false);
      setSelectedFiles(new Set());
    };

    const copySelected = () => {
      setClipboard({ files: Array.from(selectedFiles), operation: "copy" });
      cancelSelection();
      toast.success(`${selectedFiles.size} item(s) copied`);
    };

    const cutSelected = () => {
      setClipboard({ files: Array.from(selectedFiles), operation: "cut" });
      cancelSelection();
      toast.success(`${selectedFiles.size} item(s) cut`);
    };

    // --- Sort cycling: tap once to switch field, tap again to flip order ---
    const SORT_FIELDS: SortBy[] = ["name", "size", "modified"];
    const cycleSortBy = () => {
      setSortBy((prevField) => {
        setSortOrder((prevOrder) => {
          if (prevOrder === "asc") return "desc";
          // was desc → advance to next field, reset to asc
          return "asc";
        });
        // Only advance field when flipping from desc back to asc
        // We do this by reading sortOrder directly (stale closure is fine here —
        // we just need the value at the moment of the press)
        if (sortOrder === "desc") {
          const idx = SORT_FIELDS.indexOf(prevField);
          return SORT_FIELDS[(idx + 1) % SORT_FIELDS.length];
        }
        return prevField;
      });
    };

    const sortLabel: Record<SortBy, string> = { name: "Name", size: "Size", modified: "Date" };

    // --- Filtered + sorted files ---
    const filtered = useMemo(() => {
      const q = query.trim().toLowerCase();
      const list = q ? files.filter((f) => f.name.toLowerCase().includes(q)) : files;
      return sortFiles(list, sortBy, sortOrder);
    }, [files, query, sortBy, sortOrder]);

    if (!isVisible) return null;

    if (!host.enableFileManager) {
      return (
        <SessionFrame
          title={host.name}
          subtitle="File Manager"
          status="empty"
          emptyMessage="File Manager is not enabled for this host."
        />
      );
    }

    const frameStatus =
      conn.state === "connecting" || conn.state === "idle"
        ? "loading"
        : conn.state === "error"
          ? "error"
          : "ready";

    const breadcrumbs = breadcrumbsFromPath(currentPath);
    const isConnected = conn.state === "connected";

    // More-menu actions
    const moreActions: (ContextAction | null)[] = [
      {
        key: "new-folder",
        icon: <FolderPlus size={18} color={color("foreground")} />,
        label: "New Folder",
        onPress: () => setCreateDialog("folder"),
      },
      {
        key: "new-file",
        icon: <FilePlus size={18} color={color("foreground")} />,
        label: "New File",
        onPress: () => setCreateDialog("file"),
      },
      {
        key: "upload",
        icon: <Upload size={18} color={color("foreground")} />,
        label: "Upload File",
        onPress: doUpload,
      },
      clipboard.files.length > 0
        ? {
            key: "paste",
            icon: <ClipboardPaste size={18} color={color("accent-brand")} />,
            label: `Paste ${clipboard.files.length} item${clipboard.files.length !== 1 ? "s" : ""}`,
            onPress: doPaste,
          }
        : null,
      {
        key: "refresh",
        icon: <RefreshCw size={18} color={color("foreground")} />,
        label: "Refresh",
        onPress: () => loadDirectory(currentPath),
      },
    ];

    return (
      <>
        <SessionFrame
          title={host.name}
          subtitle="File Manager"
          status={frameStatus}
          loadingLabel={`Connecting to ${host.name}…`}
          errorMessage={conn.errorMessage}
          onRetry={conn.state === "error" ? conn.retry : undefined}
          logEntries={conn.logEntries}
          isConnecting={conn.state === "connecting" || conn.state === "idle"}
          isConnected={isConnected}
          hasConnectionError={conn.state === "error"}
          onLogClear={conn.logClear}
          toolbar={
            isConnected ? (
              <View>
                {/* Nav row */}
                <View className="flex-row items-center gap-1 px-2 py-1.5 border-b border-border/40">
                  {/* Back / up */}
                  <Pressable
                    onPress={() => loadDirectory(getParentPath(currentPath))}
                    hitSlop={8}
                    className="p-1.5 rounded active:bg-muted/40"
                    disabled={currentPath === "/"}
                    style={{ opacity: currentPath === "/" ? 0.35 : 1 }}
                  >
                    <ChevronLeft size={18} color={color("foreground")} />
                  </Pressable>

                  {/* Breadcrumb scroll */}
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={{ alignItems: "center", flexGrow: 1 }}
                    style={{ flex: 1 }}
                  >
                    {breadcrumbs.map((bc, i) => (
                      <View key={bc} className="flex-row items-center">
                        {i > 0 ? (
                          <ChevronRight size={12} color={color("muted-foreground", 0.5)} />
                        ) : null}
                        <Pressable
                          onPress={() => loadDirectory(bc)}
                          className="px-1 py-1 rounded active:bg-muted/40"
                          hitSlop={4}
                        >
                          <Text
                            className={`text-xs ${
                              i === breadcrumbs.length - 1
                                ? "text-foreground"
                                : "text-muted-foreground"
                            }`}
                            weight={i === breadcrumbs.length - 1 ? "medium" : "regular"}
                          >
                            {getBreadcrumbLabel(bc)}
                          </Text>
                        </Pressable>
                      </View>
                    ))}
                  </ScrollView>

                  {/* Sort toggle */}
                  <Pressable
                    onPress={cycleSortBy}
                    hitSlop={8}
                    className="flex-row items-center gap-0.5 px-1.5 py-1 rounded active:bg-muted/40"
                  >
                    <ArrowUpDown size={13} color={color("muted-foreground")} />
                    <Text className="text-[10px] text-muted-foreground">
                      {sortLabel[sortBy]} {sortOrder === "asc" ? "↑" : "↓"}
                    </Text>
                  </Pressable>

                  {/* More menu */}
                  <Pressable
                    onPress={() => setMoreMenuVisible(true)}
                    hitSlop={8}
                    className="p-1.5 rounded active:bg-muted/40"
                  >
                    <MoreVertical size={16} color={color("muted-foreground")} />
                  </Pressable>
                </View>

                {/* Search row */}
                <View className="px-3 py-1.5">
                  <Input
                    value={query}
                    onChangeText={setQuery}
                    placeholder="Search…"
                    autoCapitalize="none"
                    autoCorrect={false}
                    leading={<Search size={13} color={color("muted-foreground")} />}
                    className="h-8 text-xs"
                  />
                </View>
              </View>
            ) : undefined
          }
        >
          <ScrollView
            contentContainerStyle={{ paddingBottom: selectionMode || clipboard.files.length > 0 ? 80 : 16 }}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                tintColor={color("accent-brand")}
                onRefresh={async () => {
                  setRefreshing(true);
                  await loadDirectory(currentPath);
                  setRefreshing(false);
                }}
              />
            }
          >
            {loadingDir && !refreshing ? (
              <View className="flex-1 items-center justify-center mt-16">
                <ActivityIndicator size="small" color={color("accent-brand")} />
              </View>
            ) : filtered.length === 0 ? (
              <Text className="text-sm text-muted-foreground text-center mt-16">
                {query ? "No matching files" : "Empty folder"}
              </Text>
            ) : (
              filtered.map((file) => (
                <FileRow
                  key={file.path}
                  file={file}
                  selected={selectedFiles.has(file.path)}
                  selectionMode={selectionMode}
                  onPress={() => openFile(file)}
                  onLongPress={() => {
                    if (selectionMode) {
                      toggleSelect(file.path);
                    } else {
                      activateSelection(file);
                    }
                  }}
                  onMenu={() => setMenuFile(file)}
                  onDelete={() => doDelete(file)}
                  color={color}
                />
              ))
            )}
          </ScrollView>

          {/* Bottom action bar — selection or clipboard */}
          {(selectionMode || clipboard.files.length > 0) && (
            <View
              className="absolute left-0 right-0 bottom-0 bg-card border-t border-border"
            >
            <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 12, gap: 8, height: 48 }}>
              {selectionMode ? (
                <>
                  <Text className="text-sm text-muted-foreground flex-1">
                    {selectedFiles.size} selected
                  </Text>
                  <Pressable
                    onPress={copySelected}
                    disabled={selectedFiles.size === 0}
                    hitSlop={6}
                    className="p-2 rounded border border-border active:bg-muted/40"
                    style={{ opacity: selectedFiles.size === 0 ? 0.4 : 1 }}
                  >
                    <Copy size={16} color={color("foreground")} />
                  </Pressable>
                  <Pressable
                    onPress={cutSelected}
                    disabled={selectedFiles.size === 0}
                    hitSlop={6}
                    className="p-2 rounded border border-border active:bg-muted/40"
                    style={{ opacity: selectedFiles.size === 0 ? 0.4 : 1 }}
                  >
                    <Scissors size={16} color={color("foreground")} />
                  </Pressable>
                  <Pressable
                    onPress={doDeleteSelected}
                    disabled={selectedFiles.size === 0}
                    hitSlop={6}
                    className="p-2 rounded border border-destructive/40 active:bg-destructive/10"
                    style={{ opacity: selectedFiles.size === 0 ? 0.4 : 1 }}
                  >
                    <Trash2 size={16} color={color("destructive")} />
                  </Pressable>
                  <Pressable
                    onPress={cancelSelection}
                    hitSlop={6}
                    className="p-2 rounded border border-border active:bg-muted/40 ml-1"
                  >
                    <X size={16} color={color("muted-foreground")} />
                  </Pressable>
                </>
              ) : clipboard.files.length > 0 ? (
                <>
                  <Text className="text-sm text-muted-foreground flex-1">
                    {clipboard.files.length} item{clipboard.files.length !== 1 ? "s" : ""}{" "}
                    {clipboard.operation === "copy" ? "copied" : "cut"}
                  </Text>
                  <Pressable
                    onPress={doPaste}
                    hitSlop={6}
                    className="flex-row items-center gap-1.5 px-3 py-2 rounded bg-accent-brand/10 border border-accent-brand/30 active:bg-accent-brand/20"
                  >
                    <ClipboardPaste size={15} color={color("accent-brand")} />
                    <Text className="text-sm text-accent-brand" weight="medium">Paste</Text>
                  </Pressable>
                  <Pressable
                    onPress={() => setClipboard({ files: [], operation: null })}
                    hitSlop={6}
                    className="p-2 rounded border border-border active:bg-muted/40"
                  >
                    <X size={16} color={color("muted-foreground")} />
                  </Pressable>
                </>
              ) : null}
            </View>
            </View>
          )}
        </SessionFrame>

        {/* Per-file action menu */}
        <ContextSheet
          visible={menuFile !== null}
          onClose={() => setMenuFile(null)}
          title={menuFile?.name}
          subtitle={menuFile?.path}
          actions={buildFileActions(menuFile, color, {
            view: viewFile,
            rename: (f) => {
              setRenameTarget(f);
              setRenameName(f.name);
            },
            copy: (f) => setClipboard({ files: [f.path], operation: "copy" }),
            cut: (f) => setClipboard({ files: [f.path], operation: "cut" }),
            perms: (f) => setPermsFile(f),
            copyPath: async (f) => {
              await Clipboard.setStringAsync(f.path);
              toast.success("Path copied");
            },
            del: doDelete,
            extract: doExtract,
          })}
        />

        {/* More / overflow menu */}
        <ContextSheet
          visible={moreMenuVisible}
          onClose={() => setMoreMenuVisible(false)}
          title="Actions"
          actions={moreActions}
        />

        {/* Permissions editor */}
        <PermissionsDialog
          visible={permsFile !== null}
          fileName={permsFile?.name || ""}
          permissions={permsFile?.permissions}
          onClose={() => setPermsFile(null)}
          onApply={applyPermissions}
        />

        {/* Create / rename dialogs */}
        <NameDialog
          visible={createDialog !== null}
          title={`New ${createDialog === "folder" ? "Folder" : "File"}`}
          value={createName}
          onChange={setCreateName}
          onClose={() => {
            setCreateDialog(null);
            setCreateName("");
          }}
          onConfirm={confirmCreate}
          confirmLabel="Create"
          insetBottom={insets.bottom}
        />
        <NameDialog
          visible={renameTarget !== null}
          title="Rename"
          value={renameName}
          onChange={setRenameName}
          onClose={() => {
            setRenameTarget(null);
            setRenameName("");
          }}
          onConfirm={confirmRename}
          confirmLabel="Rename"
          insetBottom={insets.bottom}
        />

        {/* Text/code viewer + editor */}
        {viewer ? (
          <FileViewer
            visible
            onClose={() => setViewer(null)}
            fileName={viewer.file.name}
            filePath={viewer.file.path}
            initialContent={viewer.content}
            onSave={saveFile}
          />
        ) : null}

        {/* Shared auth dialogs */}
        <AuthDialogs
          state={conn.state}
          errorMessage={conn.errorMessage}
          onSubmitTotp={conn.submitTotp}
          onSubmitWarpgate={conn.submitWarpgate}
          onSubmitAuth={conn.submitAuth}
          onCancel={conn.cancelAuth}
        />
      </>
    );
  },
);

FileManager.displayName = "FileManager";

// ─── buildFileActions ────────────────────────────────────────────────────────

function buildFileActions(
  file: FileItem | null,
  color: ReturnType<typeof useThemeColor>,
  handlers: {
    view: (f: FileItem) => void;
    rename: (f: FileItem) => void;
    copy: (f: FileItem) => void;
    cut: (f: FileItem) => void;
    perms: (f: FileItem) => void;
    copyPath: (f: FileItem) => void;
    del: (f: FileItem) => void;
    extract: (f: FileItem) => void;
  },
): (ContextAction | null)[] {
  if (!file) return [];
  const fg = color("foreground") ?? "#fafafa";
  const isFile = file.type === "file";
  return [
    isFile && isTextFile(file.name)
      ? {
          key: "view",
          icon: <Eye size={18} color={fg} />,
          label: "View / Edit",
          onPress: () => handlers.view(file),
        }
      : null,
    {
      key: "rename",
      icon: <Pencil size={18} color={fg} />,
      label: "Rename",
      onPress: () => handlers.rename(file),
    },
    {
      key: "copy",
      icon: <Copy size={18} color={fg} />,
      label: "Copy",
      onPress: () => handlers.copy(file),
    },
    {
      key: "cut",
      icon: <Scissors size={18} color={fg} />,
      label: "Cut",
      onPress: () => handlers.cut(file),
    },
    isFile && isArchiveFile(file.name)
      ? {
          key: "extract",
          icon: <Archive size={18} color={fg} />,
          label: "Extract Here",
          onPress: () => handlers.extract(file),
        }
      : null,
    {
      key: "perms",
      icon: <Lock size={18} color={fg} />,
      label: "Permissions",
      onPress: () => handlers.perms(file),
    },
    {
      key: "copyPath",
      icon: <ClipboardCopy size={18} color={fg} />,
      label: "Copy Path",
      onPress: () => handlers.copyPath(file),
    },
    {
      key: "delete",
      icon: <Trash2 size={18} color={color("destructive")} />,
      label: "Delete",
      destructive: true,
      onPress: () => handlers.del(file),
    },
  ];
}

// ─── FileRow ─────────────────────────────────────────────────────────────────

function FileRow({
  file,
  selected,
  selectionMode,
  onPress,
  onLongPress,
  onMenu,
  onDelete,
  color,
}: {
  file: FileItem;
  selected: boolean;
  selectionMode: boolean;
  onPress: () => void;
  onLongPress: () => void;
  onMenu: () => void;
  onDelete: () => void;
  color: ReturnType<typeof useThemeColor>;
}) {
  const swipeableRef = useRef<Swipeable>(null);
  const iconColor = getFileIconColor(file.name, file.type);
  const Icon =
    file.type === "directory" ? Folder : file.type === "link" ? LinkIcon : FileIcon;
  const isDir = file.type === "directory";

  const renderRightActions = (
    progress: Animated.AnimatedInterpolation<number>,
    dragX: Animated.AnimatedInterpolation<number>,
  ) => {
    const scale = dragX.interpolate({
      inputRange: [-80, 0],
      outputRange: [1, 0.85],
      extrapolate: "clamp",
    });
    return (
      <Animated.View
        style={{
          transform: [{ scale }],
          justifyContent: "center",
          alignItems: "center",
          width: 72,
          backgroundColor: "#ef4444",
        }}
      >
        <Pressable
          onPress={() => {
            swipeableRef.current?.close();
            onDelete();
          }}
          style={{ flex: 1, justifyContent: "center", alignItems: "center", width: "100%" }}
        >
          <Trash2 size={20} color="#fff" />
        </Pressable>
      </Animated.View>
    );
  };

  const rowContent = (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      className={`flex-row items-center gap-3 px-4 py-3.5 border-b border-border/50 ${
        selected ? "bg-accent-brand/8" : "active:bg-muted/30"
      }`}
    >
      {/* Selection checkbox */}
      {selectionMode ? (
        <View className="mr-0.5">
          {selected ? (
            <CheckSquare size={20} color={color("accent-brand")} />
          ) : (
            <Square size={20} color={color("muted-foreground", 0.6)} />
          )}
        </View>
      ) : null}

      {/* File icon */}
      <Icon size={20} color={iconColor} />

      {/* Name + meta */}
      <View className="flex-1 min-w-0">
        <Text
          className="text-[15px] text-foreground"
          weight="medium"
          numberOfLines={1}
        >
          {file.name}
        </Text>
        <View className="flex-row items-center gap-1.5 mt-0.5 flex-wrap">
          {isDir ? (
            <Text className="text-[11px] text-muted-foreground">Folder</Text>
          ) : (
            <>
              {file.size !== undefined ? (
                <Text className="text-[11px] text-muted-foreground">
                  {formatFileSize(file.size)}
                </Text>
              ) : null}
              {file.modified ? (
                <>
                  {file.size !== undefined ? (
                    <Text className="text-[11px] text-muted-foreground">·</Text>
                  ) : null}
                  <Text className="text-[11px] text-muted-foreground">
                    {formatDate(file.modified)}
                  </Text>
                </>
              ) : null}
            </>
          )}
          {file.permissions ? (
            <>
              <Text className="text-[11px] text-muted-foreground">·</Text>
              <Text className="text-[11px] text-muted-foreground/70 font-mono">
                {file.permissions}
              </Text>
            </>
          ) : null}
        </View>
      </View>

      {/* Right indicator */}
      {isDir ? (
        <ChevronRight size={16} color={color("muted-foreground", 0.4)} />
      ) : !selectionMode ? (
        <Pressable onPress={onMenu} hitSlop={8} className="p-1">
          <MoreVertical size={15} color={color("muted-foreground", 0.5)} />
        </Pressable>
      ) : null}
    </Pressable>
  );

  // In selection mode, disable swipe
  if (selectionMode) {
    return rowContent;
  }

  return (
    <Swipeable
      ref={swipeableRef}
      renderRightActions={renderRightActions}
      rightThreshold={40}
      overshootRight={false}
      friction={2}
    >
      {rowContent}
    </Swipeable>
  );
}

// ─── NameDialog ──────────────────────────────────────────────────────────────

function NameDialog({
  visible,
  title,
  value,
  onChange,
  onClose,
  onConfirm,
  confirmLabel,
  insetBottom,
}: {
  visible: boolean;
  title: string;
  value: string;
  onChange: (v: string) => void;
  onClose: () => void;
  onConfirm: () => void;
  confirmLabel: string;
  insetBottom: number;
}) {
  const color = useThemeColor();
  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        className="flex-1"
      >
        <Pressable
          className="flex-1 bg-black/50 items-center justify-center px-5"
          onPress={onClose}
        >
          <Pressable
            className="w-full max-w-md bg-popover border border-border p-4"
            style={{ marginBottom: insetBottom }}
            onPress={(e) => e.stopPropagation()}
          >
            <Text weight="bold" className="text-base text-foreground mb-3">
              {title}
            </Text>
            <TextInput
              value={value}
              onChangeText={onChange}
              placeholder="Name"
              placeholderTextColor={color("muted-foreground", 0.7)}
              autoFocus
              autoCapitalize="none"
              className="text-sm text-foreground bg-card border border-input px-2.5 h-10 mb-3"
            />
            <View className="flex-row gap-2">
              <Button variant="outline" className="flex-1" onPress={onClose}>
                Cancel
              </Button>
              <Button
                variant="accent"
                className="flex-1"
                onPress={onConfirm}
                disabled={!value.trim()}
              >
                {confirmLabel}
              </Button>
            </View>
          </Pressable>
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
}
