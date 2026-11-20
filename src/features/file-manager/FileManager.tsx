import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  TextInput,
  View,
} from "react-native";
import * as Clipboard from "expo-clipboard";
import * as DocumentPicker from "expo-document-picker";
import {
  ArrowDownToLine,
  ArrowUpDown,
  CheckSquare,
  ClipboardCopy,
  ClipboardPaste,
  Copy,
  Eye,
  EyeOff,
  ExternalLink,
  FilePlus,
  FolderInput,
  FolderPlus,
  Info,
  Link as LinkIcon,
  Lock,
  MoreVertical,
  Pencil,
  RefreshCw,
  Scissors,
  Search,
  Share2,
  Trash2,
  Upload,
  X,
} from "lucide-react-native";
import { EmptyState, PromptSheet, Text, useConfirm } from "@/ui";
import { useUiColors } from "@/contexts/ThemeContext";
import { toUserMessage } from "@/core/errors";
import type { ConnectionOrigin } from "@/core/transport";
import { ConnectionError, ContextSheet } from "@/screens/sessions/shared";
import type { SSHHost } from "@/types";
import { toast } from "@/utils/toast";
import {
  EDITOR_HARD_LIMIT,
  openPlan,
  validName,
  visibleFiles,
  walkFolder,
} from "./actions";
import { remoteName, toLocalPath } from "./backend/paths";
import { TrashUnavailableError } from "./backend/sftp";
import type { FileBackend, FileEntry } from "./backend/types";
import { RelayConnector } from "./connection/RelayConnector";
import { useFileBackend } from "./connection/useFileBackend";
import { DestinationPicker } from "./DestinationPicker";
import { FileViewer } from "./FileViewer";
import { Breadcrumbs } from "./list/Breadcrumbs";
import { FileList } from "./list/FileList";
import { isFolderLike } from "./list/FileRow";
import { PermissionsDialog } from "./PermissionsDialog";
import { PreviewView, previewKind, type PreviewKind } from "./PreviewView";
import { PropertiesView } from "./PropertiesView";
import {
  getFileSettings,
  updateFileSettings,
  useFileSettings,
} from "./settings";
import { TrashView } from "./TrashView";
import {
  canSaveToFolder,
  downloadsDir,
  localTarget,
  openWith,
  previewTarget,
  saveToFolder,
  shareFile,
} from "./transfers/device";
import { TransferManager, type TransferInput } from "./transfers/manager";
import { summarize, type Transfer } from "./transfers/queue";
import { TransfersPanel, useTransfers } from "./transfers/TransfersPanel";
import { isTextFile, modeText, sortEntries } from "./utils/fileUtils";
import { useDebouncedValue, useStableCallback } from "@/utils/hooks";
import { deviceWord, isTablet } from "@/utils/device-word";
import { t as tr } from "@/i18n";

export interface FileManagerHandle {
  /** The folder on screen. */
  currentPath: () => string;
  /** Opens a folder, like the terminal's when following it. */
  navigate: (path: string) => void;
  /** Queues phone files to upload into the folder on screen. */
  uploadLocal: (files: { path: string; name: string }[]) => void;
  /** Transfers still running or waiting. They stop when this unmounts. */
  activeTransfers: () => number;
}

type Dialog =
  | { kind: "newFolder" }
  | { kind: "newFile" }
  | { kind: "rename"; entry: FileEntry }
  | { kind: "link"; entry: FileEntry }
  | null;

type Pick = { mode: "move" | "copy"; entries: FileEntry[] } | null;

function ToolButton({
  label,
  onPress,
  active,
  badge,
  children,
}: {
  label: string;
  onPress: () => void;
  active?: boolean;
  badge?: number;
  children: React.ReactNode;
}) {
  return (
    <Pressable
      onPress={onPress}
      hitSlop={4}
      accessibilityRole="button"
      accessibilityLabel={label}
      className={`h-10 w-10 items-center justify-center active:bg-muted ${active ? "bg-accent-brand/10" : ""}`}
    >
      {children}
      {badge ? (
        <View className="absolute right-0.5 top-0.5 min-w-4 items-center bg-accent-brand px-0.5">
          <Text weight="bold" className="text-[9px] text-white">
            {badge}
          </Text>
        </View>
      ) : null}
    </Pressable>
  );
}

const SORT_LABEL = {
  name: tr("fileManager.name"),
  size: tr("fileManager.size"),
  modified: tr("fileManager.date"),
} as const;

/**
 * The files of one host, over the phone's SFTP or the server's File Manager.
 * `followPath` moves it to that folder when it changes (the files panel).
 */
export const FileManager = forwardRef<
  FileManagerHandle,
  {
    host: SSHHost;
    type: string;
    isVisible: boolean;
    origin?: ConnectionOrigin;
    compact?: boolean;
    followPath?: string | null;
    onPathChange?: (path: string) => void;
    toolbarExtra?: React.ReactNode;
    onClose?: () => void;
  }
>(function FileManager(
  {
    host,
    type,
    isVisible,
    origin,
    compact,
    followPath,
    onPathChange,
    toolbarExtra,
    onClose,
  },
  ref,
) {
  const colors = useUiColors();
  const confirm = useConfirm();
  const settings = useFileSettings();
  const conn = useFileBackend(host, type, isVisible, origin);
  const backend = conn.state.phase === "ready" ? conn.state.backend : null;

  const [path, setPath] = useState<string>("");
  const [files, setFiles] = useState<FileEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [listError, setListError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  // Each keystroke would sort a big folder again.
  const searchText = useDebouncedValue(query, 150);
  const [searching, setSearching] = useState(false);
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [clipboard, setClipboard] = useState<{
    mode: "copy" | "move";
    entries: FileEntry[];
  } | null>(null);
  const [menu, setMenu] = useState<FileEntry | null>(null);
  const [moreOpen, setMoreOpen] = useState(false);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [perms, setPerms] = useState<FileEntry | null>(null);
  const [props, setProps] = useState<FileEntry | null>(null);
  const [trashOpen, setTrashOpen] = useState(false);
  const [transfersOpen, setTransfersOpen] = useState(false);
  const [pick, setPick] = useState<Pick>(null);
  const [editor, setEditor] = useState<{
    entry: FileEntry;
    text: string;
  } | null>(null);
  const [preview, setPreview] = useState<{
    name: string;
    localPath: string;
    kind: PreviewKind;
  } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const pathRef = useRef(path);
  pathRef.current = path;

  const load = useCallback(
    async (target: string, b: FileBackend | null = backend) => {
      if (!b) return;
      setLoading(true);
      setListError(null);
      try {
        const res = await b.list(target);
        setFiles(res.files);
        setPath(res.path);
        onPathChange?.(res.path);
        setSelected(new Set());
        setSelecting(false);
      } catch (e) {
        setListError(
          toUserMessage(e, tr("fileManager.couldNotOpenThisFolder")),
        );
        if (!pathRef.current) setPath(target);
      } finally {
        setLoading(false);
      }
    },
    [backend, onPathChange],
  );

  // Open the start folder once connected: the followed one, the host's default, then home.
  useEffect(() => {
    if (!backend) return;
    let alive = true;
    void (async () => {
      const start =
        followPath ||
        (host.defaultPath && host.defaultPath !== "/"
          ? host.defaultPath
          : "") ||
        (await backend.home().catch(() => "/"));
      if (alive) await load(start, backend);
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [backend]);

  useEffect(() => {
    if (backend && followPath && followPath !== pathRef.current) {
      void load(followPath);
    }
  }, [followPath, backend, load]);

  const refreshSoon = useRef<ReturnType<typeof setTimeout> | null>(null);
  const refresh = useCallback(() => {
    if (refreshSoon.current) clearTimeout(refreshSoon.current);
    refreshSoon.current = setTimeout(() => {
      if (pathRef.current) void load(pathRef.current);
    }, 400);
  }, [load]);

  // One transfer queue per connection.
  const manager = useMemo(
    () =>
      backend
        ? new TransferManager(backend, {
            concurrency: () => getFileSettings().transferConcurrency,
            onUploaded: () => refresh(),
            onDownloaded: async (t: Transfer) => {
              if (!canSaveToFolder) return;
              try {
                await saveToFolder([
                  { path: t.localPath, relative: t.relative ?? [] },
                ]);
              } catch (e) {
                toast.error(
                  toUserMessage(e, tr("fileManager.couldNotSaveToThe")),
                );
              }
            },
          })
        : null,
    [backend, refresh],
  );
  const transfers = useTransfers(manager);
  const transferSum = summarize(transfers);

  useEffect(() => () => manager?.cancelAll(), [manager]);

  const shown = useMemo(
    () =>
      sortEntries(
        visibleFiles(files, searchText, settings.showHidden),
        settings.sortBy,
        settings.sortOrder,
      ),
    [
      files,
      searchText,
      settings.showHidden,
      settings.sortBy,
      settings.sortOrder,
    ],
  );

  const run = async (label: string, fn: () => Promise<unknown>) => {
    setBusy(label);
    try {
      await fn();
      return true;
    } catch (e) {
      toast.error(toUserMessage(e, tr("fileManager.failed", { label })));
      return false;
    } finally {
      setBusy(null);
    }
  };

  // Transfers

  const queueUploads = useCallback(
    (items: { path: string; name: string }[], dir = pathRef.current) => {
      if (!manager || !dir) return;
      manager.add(
        items.map((item): TransferInput => ({
          kind: "upload",
          name: item.name,
          remotePath: dir,
          localPath: toLocalPath(item.path),
          total: -1,
        })),
      );
      toast.success(
        items.length === 1
          ? tr("fileManager.uploading", { name: items[0].name })
          : tr("fileManager.uploadingFiles", { count: items.length }),
      );
    },
    [manager],
  );

  const pickUploads = async () => {
    const result = await DocumentPicker.getDocumentAsync({
      multiple: true,
      copyToCacheDirectory: true,
    });
    if (result.canceled) return;
    queueUploads(result.assets.map((a) => ({ path: a.uri, name: a.name })));
  };

  const download = async (entries: FileEntry[]) => {
    if (!manager) return;
    const reserved = new Set<string>();
    const inputs: TransferInput[] = [];
    await run("Download", async () => {
      for (const entry of entries) {
        if (isFolderLike(entry)) {
          const walked = await walkFolder(backend!, entry);
          for (const w of walked) {
            const dir = downloadsDir(host.name, ...w.relative);
            inputs.push({
              kind: "download",
              name: w.entry.name,
              remotePath: w.entry.path,
              localPath: localTarget(dir, w.entry.name, reserved),
              total: w.entry.size,
              group: entry.path,
              relative: w.relative,
            });
          }
        } else {
          inputs.push({
            kind: "download",
            name: entry.name,
            remotePath: entry.path,
            localPath: localTarget(
              downloadsDir(host.name),
              entry.name,
              reserved,
            ),
            total: entry.size,
          });
        }
      }
    });
    if (!inputs.length) return;
    manager.add(inputs);
    toast.success(
      Platform.OS === "ios"
        ? tr(
            isTablet()
              ? "fileManager.downloadingToFilesOnMyIpad"
              : "fileManager.downloadingToFilesOnMy",
          )
        : inputs.length === 1
          ? tr("fileManager.downloading", { name: inputs[0].name })
          : tr("fileManager.downloadingFiles", { count: inputs.length }),
    );
  };

  /** Fetches one file to the cache, for share, open with and previews. */
  const fetchToCache = async (entry: FileEntry) => {
    const local = previewTarget(entry.name);
    setBusy(tr("fileManager.getting", { name: entry.name }));
    try {
      await backend!.download(entry.path, local);
      return local;
    } finally {
      setBusy(null);
    }
  };

  const shareEntry = (entry: FileEntry) =>
    run("Share", async () => shareFile(await fetchToCache(entry), entry.name));

  const openWithEntry = (entry: FileEntry) =>
    run("Open", async () => openWith(await fetchToCache(entry), entry.name));

  // Opening

  const openText = async (entry: FileEntry, ask: boolean) => {
    if (
      ask &&
      !(await confirm({
        title: tr("fileManager.openALargeFile"),
        description: tr("fileManager.isBigForAEditor", {
          name: entry.name,
          deviceWord,
        }),
        confirmLabel: tr("fileManager.open"),
        destructive: false,
      }))
    ) {
      return;
    }
    await run("Open", async () => {
      const res = await backend!.readText(entry.path, EDITOR_HARD_LIMIT);
      if (res.text == null) {
        if (
          await confirm({
            title: tr("fileManager.thisLooksLikeABinary"),
            description: tr("fileManager.openItInAnotherApp"),
            confirmLabel: tr("fileManager.openWith"),
            destructive: false,
          })
        ) {
          await openWith(await fetchToCache(entry), entry.name);
        }
        return;
      }
      setEditor({ entry, text: res.text });
    });
  };

  const open = async (entry: FileEntry) => {
    if (selecting) {
      toggle(entry);
      return;
    }
    let target = entry;
    if (entry.type === "link" && entry.targetType == null && backend) {
      target = {
        ...entry,
        ...(await backend.stat(entry.path).catch(() => entry)),
      };
    }
    const kind = previewKind(target.name);
    const plan = openPlan(target, isTextFile(target.name), !!kind);
    switch (plan.kind) {
      case "folder":
        return load(target.path);
      case "text":
        return openText(target, plan.ask);
      case "preview":
        return run("Open", async () => {
          const local = await fetchToCache(target);
          setPreview({ name: target.name, localPath: local, kind: kind! });
        });
      case "tooBig":
        if (
          await confirm({
            title: tr("fileManager.tooBigForTheEditor"),
            description: tr("fileManager.isOver10MbDownload", {
              name: target.name,
            }),
            confirmLabel: tr("fileManager.download"),
            destructive: false,
          })
        ) {
          await download([target]);
        }
        return;
      case "other":
        return openWithEntry(target);
    }
  };

  // Changes

  const removeEntries = async (entries: FileEntry[]) => {
    if (!backend || !entries.length) return;
    const what =
      entries.length === 1
        ? entries[0].name
        : tr("fileManager.itemCount", { count: entries.length });
    const permanent = !backend.trash;
    if (
      (permanent || settings.confirmBeforeTrash) &&
      !(await confirm({
        title: permanent
          ? tr("fileManager.delete", { what })
          : tr("fileManager.moveToTheTrash", { what }),
        description: permanent
          ? tr("fileManager.thisCanTBeUndone")
          : tr("fileManager.youCanRestoreItFrom"),
        confirmLabel: permanent
          ? tr("fileManager.delete2")
          : tr("fileManager.moveToTrash"),
      }))
    ) {
      return;
    }
    setBusy("Deleting");
    try {
      await backend.remove(entries, permanent);
    } catch (e) {
      if (e instanceof TrashUnavailableError) {
        const ok = await confirm({
          title: tr("fileManager.deleteForGood"),
          description: tr("fileManager.deleteItForGoodInstead", {
            message: e.message,
          }),
          confirmLabel: tr("fileManager.delete2"),
        });
        if (ok) {
          await backend
            .remove(entries, true)
            .catch((err) =>
              toast.error(toUserMessage(err, tr("fileManager.deleteFailed"))),
            );
        }
      } else {
        toast.error(toUserMessage(e, tr("fileManager.deleteFailed")));
      }
    } finally {
      setBusy(null);
      refresh();
    }
  };

  const relocate = async (
    mode: "copy" | "move",
    entries: FileEntry[],
    dir: string,
  ) => {
    if (!backend) return;
    const ok = await run(mode === "copy" ? "Copy" : "Move", async () => {
      for (const entry of entries) {
        if (mode === "copy") await backend.copy(entry.path, dir);
        else await backend.move(entry.path, dir);
      }
    });
    if (ok) {
      toast.success(
        tr(
          mode === "copy" ? "fileManager.copiedWhat" : "fileManager.movedWhat",
          {
            what:
              entries.length === 1
                ? entries[0].name
                : tr("fileManager.itemCount", { count: entries.length }),
          },
        ),
      );
    }
    refresh();
  };

  const submitDialog = async (value: string) => {
    const d = dialog;
    setDialog(null);
    if (!d || !backend) return;
    const name = value.trim();
    if (d.kind === "newFolder")
      await run(tr("fileManager.newFolder"), () => backend.mkdir(path, name));
    else if (d.kind === "newFile")
      await run(tr("fileManager.newFile"), () =>
        backend.createFile(path, name),
      );
    else if (d.kind === "rename")
      await run("Rename", () => backend.rename(d.entry.path, name));
    else if (d.kind === "link" && backend.symlink) {
      const link = backend.symlink;
      await run(tr("fileManager.newLink"), () =>
        link(`${path.replace(/\/$/, "")}/${name}`, d.entry.path),
      );
    }
    refresh();
  };

  // Selection

  const toggle = (entry: FileEntry) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(entry.path)) next.delete(entry.path);
      else next.add(entry.path);
      return next;
    });

  const selectedEntries = () => files.filter((f) => selected.has(f.path));

  const endSelect = () => {
    setSelecting(false);
    setSelected(new Set());
  };

  // Stable, so the memoized rows only re-render when their own file changes.
  const onRefreshList = useStableCallback(() => void load(pathRef.current));
  const onPressRow = useStableCallback((f: FileEntry) => void open(f));
  const onLongPressRow = useStableCallback((f: FileEntry) => {
    if (compact) {
      setMenu(f);
      return;
    }
    setSelecting(true);
    toggle(f);
  });

  useImperativeHandle(ref, () => ({
    currentPath: () => pathRef.current,
    navigate: (p) => void load(p),
    uploadLocal: (items) => queueUploads(items),
    activeTransfers: () => transferSum.active,
  }));

  // Connection states

  if (conn.state.phase !== "ready") {
    if (conn.state.phase === "failed") {
      return (
        <ConnectionError
          failure={conn.state.failure}
          switchTo={conn.state.fix}
          onRetry={() => void conn.retry()}
          onSwitch={(o) => conn.switchOrigin(o)}
          onClose={onClose}
        />
      );
    }
    return (
      <View className="flex-1 items-center justify-center gap-3 bg-background">
        <ActivityIndicator color={colors.brand} />
        <Text className="text-sm text-muted-foreground">
          {conn.state.phase === "relay"
            ? tr("fileManager.connectingThroughTheServer")
            : conn.state.phase === "connecting" && conn.state.via === "local"
              ? tr("fileManager.connectingFromThis", { deviceWord })
              : tr("fileManager.connecting")}
        </Text>
        {conn.state.phase === "relay" ? (
          <RelayConnector
            host={conn.state.host}
            onReady={conn.relayReady}
            onStatus={(s) => s.failure && conn.relayFailed(s.failure)}
          />
        ) : null}
      </View>
    );
  }

  const b = conn.state.backend;
  const sortNext = () => {
    const order = ["name", "modified", "size"] as const;
    if (settings.sortOrder === "asc") {
      void updateFileSettings({ sortOrder: "desc" });
    } else {
      const i = order.indexOf(settings.sortBy);
      void updateFileSettings({
        sortBy: order[(i + 1) % order.length],
        sortOrder: "asc",
      });
    }
  };

  const itemActions = (entry: FileEntry) => {
    const folder = isFolderLike(entry);
    const text = !folder && isTextFile(entry.name);
    return [
      {
        key: "open",
        icon: <Eye size={16} color={colors.text} />,
        label: folder
          ? tr("fileManager.open")
          : text
            ? tr("fileManager.edit")
            : tr("fileManager.open"),
        onPress: () => void open(entry),
      },
      !folder && {
        key: "openWith",
        icon: <ExternalLink size={16} color={colors.text} />,
        label: tr("fileManager.openWith"),
        onPress: () => void openWithEntry(entry),
      },
      {
        key: "download",
        icon: <ArrowDownToLine size={16} color={colors.text} />,
        label: folder
          ? tr("fileManager.downloadFolder")
          : tr("fileManager.download"),
        onPress: () => void download([entry]),
      },
      !folder && {
        key: "share",
        icon: <Share2 size={16} color={colors.text} />,
        label: tr("fileManager.share"),
        onPress: () => void shareEntry(entry),
      },
      {
        key: "rename",
        icon: <Pencil size={16} color={colors.text} />,
        label: tr("fileManager.rename"),
        onPress: () => setDialog({ kind: "rename", entry }),
      },
      {
        key: "copy",
        icon: <Copy size={16} color={colors.text} />,
        label: tr("fileManager.copyTo"),
        onPress: () => setPick({ mode: "copy", entries: [entry] }),
      },
      {
        key: "move",
        icon: <FolderInput size={16} color={colors.text} />,
        label: tr("fileManager.moveTo"),
        onPress: () => setPick({ mode: "move", entries: [entry] }),
      },
      {
        key: "cut",
        icon: <Scissors size={16} color={colors.text} />,
        label: tr("fileManager.cut"),
        onPress: () => setClipboard({ mode: "move", entries: [entry] }),
      },
      {
        key: "clip",
        icon: <ClipboardCopy size={16} color={colors.text} />,
        label: tr("fileManager.copy"),
        onPress: () => setClipboard({ mode: "copy", entries: [entry] }),
      },
      {
        key: "perms",
        icon: <Lock size={16} color={colors.text} />,
        label: tr("fileManager.permissions"),
        onPress: () => setPerms(entry),
      },
      {
        key: "props",
        icon: <Info size={16} color={colors.text} />,
        label: tr("fileManager.properties"),
        onPress: () => setProps(entry),
      },
      b.symlink && {
        key: "link",
        icon: <LinkIcon size={16} color={colors.text} />,
        label: tr("fileManager.makeALinkHere"),
        onPress: () => setDialog({ kind: "link", entry }),
      },
      {
        key: "path",
        icon: <ClipboardCopy size={16} color={colors.text} />,
        label: tr("fileManager.copyPath"),
        onPress: () => {
          void Clipboard.setStringAsync(entry.path);
          toast.success(tr("fileManager.pathCopied"));
        },
      },
      {
        key: "delete",
        icon: <Trash2 size={16} color={colors.destructive} />,
        label: b.trash
          ? tr("fileManager.moveToTrash")
          : tr("fileManager.delete2"),
        destructive: true,
        onPress: () => void removeEntries([entry]),
      },
    ];
  };

  const toolbar = selecting ? (
    <View className="h-11 flex-row items-center border-b border-border px-1">
      <ToolButton label={tr("fileManager.done")} onPress={endSelect}>
        <X size={17} color={colors.text} />
      </ToolButton>
      <Text weight="bold" className="flex-1 text-sm text-foreground">
        {`${selected.size} selected`}
      </Text>
      <ToolButton
        label={tr("fileManager.selectAll")}
        onPress={() => setSelected(new Set(shown.map((f) => f.path)))}
      >
        <CheckSquare size={17} color={colors.text} />
      </ToolButton>
      <ToolButton
        label={tr("fileManager.download")}
        onPress={() => {
          void download(selectedEntries());
          endSelect();
        }}
      >
        <ArrowDownToLine size={17} color={colors.text} />
      </ToolButton>
      <ToolButton
        label={tr("fileManager.copyTo")}
        onPress={() => setPick({ mode: "copy", entries: selectedEntries() })}
      >
        <Copy size={17} color={colors.text} />
      </ToolButton>
      <ToolButton
        label={tr("fileManager.moveTo")}
        onPress={() => setPick({ mode: "move", entries: selectedEntries() })}
      >
        <FolderInput size={17} color={colors.text} />
      </ToolButton>
      <ToolButton
        label={tr("fileManager.delete2")}
        onPress={() => {
          const entries = selectedEntries();
          endSelect();
          void removeEntries(entries);
        }}
      >
        <Trash2 size={17} color={colors.destructive} />
      </ToolButton>
    </View>
  ) : searching ? (
    <View className="h-11 flex-row items-center gap-1 border-b border-border px-2">
      <Search size={15} color={colors.textMuted} />
      <TextInput
        autoFocus
        value={query}
        onChangeText={setQuery}
        placeholder={tr("fileManager.filterByName")}
        placeholderTextColor={colors.textFaint}
        autoCapitalize="none"
        autoCorrect={false}
        className="h-10 flex-1 px-1 text-foreground"
        style={{ fontSize: 14 }}
      />
      <ToolButton
        label={tr("fileManager.closeSearch")}
        onPress={() => {
          setQuery("");
          setSearching(false);
        }}
      >
        <X size={17} color={colors.text} />
      </ToolButton>
    </View>
  ) : (
    <View className="h-11 flex-row items-center border-b border-border px-1">
      {toolbarExtra}
      <ToolButton
        label={tr("fileManager.search")}
        onPress={() => setSearching(true)}
      >
        <Search size={17} color={colors.text} />
      </ToolButton>
      <Pressable
        onPress={sortNext}
        accessibilityRole="button"
        accessibilityLabel={tr("fileManager.changeSort")}
        className="h-10 flex-row items-center gap-1 px-2 active:bg-muted"
      >
        <ArrowUpDown size={15} color={colors.text} />
        <Text className="text-xs text-foreground">
          {`${SORT_LABEL[settings.sortBy]} ${settings.sortOrder === "asc" ? "up" : "down"}`}
        </Text>
      </Pressable>
      <View className="flex-1" />
      {clipboard ? (
        <ToolButton
          label={tr("fileManager.paste", { count: clipboard.entries.length })}
          onPress={() => {
            const c = clipboard;
            setClipboard(null);
            void relocate(c.mode, c.entries, path);
          }}
        >
          <ClipboardPaste size={17} color={colors.brand} />
        </ToolButton>
      ) : null}
      <ToolButton
        label={tr("fileManager.upload")}
        onPress={() => void pickUploads()}
      >
        <Upload size={17} color={colors.text} />
      </ToolButton>
      <ToolButton
        label={tr("fileManager.transfers2")}
        onPress={() => setTransfersOpen(true)}
        badge={transferSum.active || undefined}
      >
        <ArrowDownToLine size={17} color={colors.text} />
      </ToolButton>
      <ToolButton
        label={tr("fileManager.more")}
        onPress={() => setMoreOpen(true)}
      >
        <MoreVertical size={17} color={colors.text} />
      </ToolButton>
    </View>
  );

  return (
    <View className="flex-1 bg-background">
      {toolbar}
      <Breadcrumbs path={path} onNavigate={(p) => void load(p)} />
      {busy ? (
        <View className="flex-row items-center gap-2 border-b border-border bg-muted/30 px-3 py-1.5">
          <ActivityIndicator size="small" color={colors.textMuted} />
          <Text className="text-xs text-muted-foreground">{busy}</Text>
        </View>
      ) : null}
      {listError ? (
        <View className="border-b border-border px-3 py-2">
          <Text className="text-xs text-destructive-text">{listError}</Text>
        </View>
      ) : null}
      <FileList
        path={path}
        files={shown}
        selected={selected}
        selecting={selecting}
        refreshing={loading && !!files.length}
        onRefresh={onRefreshList}
        onPress={onPressRow}
        onLongPress={onLongPressRow}
        onMenu={setMenu}
        empty={
          loading ? (
            <View className="flex-1 items-center justify-center">
              <ActivityIndicator color={colors.textMuted} />
            </View>
          ) : (
            <EmptyState
              title={
                query
                  ? tr("fileManager.nothingMatches")
                  : tr("fileManager.emptyFolder")
              }
              hint={query ? undefined : tr("fileManager.uploadFilesOrMakeA")}
            />
          )
        }
      />

      <ContextSheet
        visible={!!menu}
        onClose={() => setMenu(null)}
        title={menu?.name}
        subtitle={
          menu ? `${menu.path} | ${modeText(menu.mode).symbolic}` : undefined
        }
        actions={menu ? itemActions(menu) : []}
      />

      <ContextSheet
        visible={moreOpen}
        onClose={() => setMoreOpen(false)}
        title={remoteName(path)}
        subtitle={path}
        actions={[
          {
            key: "newFolder",
            icon: <FolderPlus size={16} color={colors.text} />,
            label: tr("fileManager.newFolder"),
            onPress: () => setDialog({ kind: "newFolder" }),
          },
          {
            key: "newFile",
            icon: <FilePlus size={16} color={colors.text} />,
            label: tr("fileManager.newFile"),
            onPress: () => setDialog({ kind: "newFile" }),
          },
          {
            key: "select",
            icon: <CheckSquare size={16} color={colors.text} />,
            label: tr("fileManager.select"),
            onPress: () => setSelecting(true),
          },
          {
            key: "hidden",
            icon: settings.showHidden ? (
              <EyeOff size={16} color={colors.text} />
            ) : (
              <Eye size={16} color={colors.text} />
            ),
            label: settings.showHidden
              ? tr("fileManager.hideHiddenFiles")
              : tr("fileManager.showHiddenFiles"),
            onPress: () =>
              void updateFileSettings({ showHidden: !settings.showHidden }),
          },
          !!b.trash && {
            key: "trash",
            icon: <Trash2 size={16} color={colors.text} />,
            label: tr("fileManager.trash"),
            onPress: () => setTrashOpen(true),
          },
          {
            key: "folderProps",
            icon: <Info size={16} color={colors.text} />,
            label: tr("fileManager.folderProperties"),
            onPress: () =>
              setProps({
                name: remoteName(path),
                path,
                type: "directory",
                size: 0,
                mtime: null,
                mode: null,
              }),
          },
          {
            key: "refresh",
            icon: <RefreshCw size={16} color={colors.text} />,
            label: tr("fileManager.refresh"),
            onPress: () => void load(path),
          },
        ]}
      />

      <PromptSheet
        visible={!!dialog}
        title={
          dialog?.kind === "newFolder"
            ? tr("fileManager.newFolder")
            : dialog?.kind === "newFile"
              ? tr("fileManager.newFile")
              : dialog?.kind === "rename"
                ? tr("fileManager.rename2", { name: dialog.entry.name })
                : tr("fileManager.newLink")
        }
        description={
          dialog?.kind === "link"
            ? tr("fileManager.aLinkInThatPoints", {
                path,
                path2: dialog.entry.path,
              })
            : undefined
        }
        placeholder={tr("fileManager.name")}
        defaultValue={
          dialog?.kind === "rename"
            ? dialog.entry.name
            : dialog?.kind === "link"
              ? `${dialog.entry.name}-link`
              : ""
        }
        confirmLabel={
          dialog?.kind === "rename"
            ? tr("fileManager.rename")
            : tr("fileManager.create")
        }
        validate={validName}
        onSubmit={(v) => void submitDialog(v)}
        onCancel={() => setDialog(null)}
      />

      <PermissionsDialog
        visible={!!perms}
        fileName={perms?.name ?? ""}
        permissions={perms ? modeText(perms.mode).octal : undefined}
        onClose={() => setPerms(null)}
        onApply={(octal) => {
          const entry = perms;
          setPerms(null);
          if (!entry) return;
          void run("Permissions", () =>
            b.chmod(entry.path, parseInt(octal, 8)),
          ).then(refresh);
        }}
      />

      <PropertiesView
        open={!!props}
        entry={props}
        backend={b}
        onClose={() => setProps(null)}
        onPermissions={(e) => setPerms(e)}
      />

      {b.trash ? (
        <TrashView
          visible={trashOpen}
          trash={b.trash}
          onClose={() => setTrashOpen(false)}
          onRestored={refresh}
        />
      ) : null}

      {manager ? (
        <TransfersPanel
          open={transfersOpen}
          manager={manager}
          onClose={() => setTransfersOpen(false)}
          onOpen={(t) => void openWith(t.localPath, t.name).catch(() => {})}
        />
      ) : null}

      <DestinationPicker
        open={!!pick}
        title={
          pick?.mode === "copy"
            ? tr("fileManager.copyTo")
            : tr("fileManager.moveTo")
        }
        confirmLabel={
          pick?.mode === "copy"
            ? tr("fileManager.copyHere")
            : tr("fileManager.moveHere")
        }
        backend={b}
        startPath={path || "/"}
        onClose={() => setPick(null)}
        onPick={(dir) => {
          const p = pick;
          setPick(null);
          endSelect();
          if (p) void relocate(p.mode, p.entries, dir);
        }}
      />

      {editor ? (
        <FileViewer
          open
          name={editor.entry.name}
          path={editor.entry.path}
          text={editor.text}
          onClose={() => setEditor(null)}
          onSave={(text) => b.writeText(editor.entry.path, text)}
        />
      ) : null}

      {preview ? (
        <PreviewView
          open
          name={preview.name}
          localPath={preview.localPath}
          kind={preview.kind}
          onClose={() => setPreview(null)}
        />
      ) : null}
    </View>
  );
});
