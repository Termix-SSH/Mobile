import { useState, useEffect, useCallback } from "react";
import { View, ScrollView, Pressable, RefreshControl } from "react-native";
import * as Clipboard from "expo-clipboard";
import {
  ChevronRight,
  Copy,
  FolderOpen,
  FileText,
  ChevronDown,
  ChevronUp,
  Pencil,
  Trash2,
  Check,
  Play,
  ArrowDownUp,
} from "lucide-react-native";
import { useRouter } from "expo-router";
import { Snippet, SnippetFolder } from "@/types";
import { publishSnippetSnapshot } from "@/widgets";
import { useThemeColor } from "@/contexts/ThemeContext";
import { Screen } from "@/components/Screen";
import {
  Text,
  Button,
  Input,
  Label,
  Sheet,
  SheetBody,
  EmptyState,
  FakeSwitch,
  SettingRow,
  ContextMenu,
  isSecondaryClick,
} from "@/ui";
import { useTerminalCustomization } from "@/contexts/TerminalCustomizationContext";
import { toast } from "@/utils/toast";
import { useRepositories } from "@/core/data/hooks";
import { useActiveAccount } from "@/core/accounts";
import { HostPicker } from "@/features/snippets/HostPicker";
import { RunOnHostsSheet } from "@/features/snippets/RunOnHostsSheet";
import { SnippetTransferSheet } from "@/features/snippets/SnippetTransferSheet";
import {
  filterIdOf,
  parseHostFilter,
  serializeHostFilter,
} from "@/features/snippets/targets";
import { isSshActive } from "@/utils/hosts";
import { groupSnippets } from "@/features/snippets/group";
import type { SSHHost } from "@/types";

type SnippetFormData = {
  name: string;
  content: string;
  description: string;
  folder: string;
  isNote: boolean;
};

export default function Snippets() {
  const color = useThemeColor();
  const repos = useRepositories();
  const router = useRouter();
  const { config, updateConfig } = useTerminalCustomization();
  const account = useActiveAccount();
  const [hostList, setHostList] = useState<SSHHost[]>([]);
  const [targetIds, setTargetIds] = useState<Set<number>>(new Set());
  const [unknownTargets, setUnknownTargets] = useState<number[]>([]);
  const [targetsOpen, setTargetsOpen] = useState(false);
  const [runTarget, setRunTarget] = useState<Snippet | null>(null);
  const [menu, setMenu] = useState<{
    snippet: Snippet;
    at: { x: number; y: number };
  } | null>(null);
  const [transferOpen, setTransferOpen] = useState(false);

  const [snippets, setSnippets] = useState<Snippet[]>([]);
  const [folders, setFolders] = useState<SnippetFolder[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [collapsedFolders, setCollapsedFolders] = useState<Set<string | null>>(
    new Set(),
  );

  // Create/edit dialog
  const [editDialog, setEditDialog] = useState(false);
  const [editingSnippet, setEditingSnippet] = useState<Snippet | null>(null);
  const [form, setForm] = useState<SnippetFormData>({
    name: "",
    content: "",
    description: "",
    folder: "",
    isNote: false,
  });
  const [saving, setSaving] = useState(false);

  // Folder picker (inside edit dialog)
  const [folderPickerOpen, setFolderPickerOpen] = useState(false);

  // Delete snippet confirm
  const [deleteTarget, setDeleteTarget] = useState<Snippet | null>(null);
  const [deleting, setDeleting] = useState(false);

  // New folder dialog
  const [folderDialog, setFolderDialog] = useState(false);
  const [folderName, setFolderName] = useState("");
  const [creatingFolder, setCreatingFolder] = useState(false);

  // Delete folder confirm
  const [deleteFolderTarget, setDeleteFolderTarget] =
    useState<SnippetFolder | null>(null);
  const [deletingFolder, setDeletingFolder] = useState(false);
  const [renameFolderTarget, setRenameFolderTarget] = useState<string | null>(
    null,
  );
  const [renameFolderName, setRenameFolderName] = useState("");
  const [renamingFolder, setRenamingFolder] = useState(false);

  const load = useCallback(async () => {
    try {
      const [s, f] = await Promise.all([
        repos.snippets.list(),
        repos.snippetFolders.list().catch(() => []),
      ]);
      setLoadFailed(false);
      const ordered = Array.isArray(s)
        ? s.sort((a: Snippet, b: Snippet) => (a.order ?? 0) - (b.order ?? 0))
        : [];
      setSnippets(ordered);
      setFolders(Array.isArray(f) ? f : []);
      // Mirror the list onto the home-screen Snippets widget.
      void publishSnippetSnapshot(ordered);
    } catch {
      setLoadFailed(true);
      toast.error("Failed to load snippets");
    }
  }, [repos]);

  useEffect(() => {
    const loadHosts = () =>
      repos.hosts
        .list()
        .then((list) =>
          setHostList(list.filter((h) => isSshActive(h) && !h.shared)),
        )
        .catch(() => {});
    void loadHosts();
    const stopHosts = repos.hosts.subscribe(() => void loadHosts());
    load().finally(() => setLoading(false));
    const reload = () => void load();
    const stops = [
      repos.snippets.subscribe(reload),
      repos.snippetFolders.subscribe(reload),
    ];
    return () => {
      stopHosts();
      stops.forEach((stop) => stop());
    };
  }, [load, repos]);

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const toggleFolder = (key: string | null) => {
    setCollapsedFolders((prev) => {
      const next = new Set(prev);
      const id = key ?? "__unfoldered__";
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const isFolderCollapsed = (key: string | null) =>
    collapsedFolders.has(key ?? "__unfoldered__");

  const handleCopy = async (snippet: Snippet) => {
    await Clipboard.setStringAsync(snippet.content);
    toast.success(`Copied: ${snippet.name}`);
  };

  const openCreate = () => {
    setEditingSnippet(null);
    setForm({
      name: "",
      content: "",
      description: "",
      folder: "",
      isNote: false,
    });
    setTargetIds(new Set());
    setUnknownTargets([]);
    setEditDialog(true);
  };

  const openEdit = (snippet: Snippet) => {
    setEditingSnippet(snippet);
    setForm({
      name: snippet.name,
      content: snippet.content,
      description: snippet.description ?? "",
      folder: snippet.folder ?? "",
      isNote: !!snippet.isNote,
    });
    const saved = parseHostFilter(snippet.hostFilter);
    const known = new Map(
      hostList.map((h) => [filterIdOf(h, account.kind), h.id]),
    );
    setTargetIds(
      new Set(saved.flatMap((id) => (known.has(id) ? [known.get(id)!] : []))),
    );
    setUnknownTargets(saved.filter((id) => !known.has(id)));
    setEditDialog(true);
  };

  const handleSave = async () => {
    if (!form.name.trim()) {
      toast.error("Name is required");
      return;
    }
    if (!form.content.trim()) {
      toast.error("Content is required");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        content: form.content.trim(),
        description: form.description.trim() || undefined,
        folder: form.folder.trim() || undefined,
        isNote: form.isNote,
        hostFilter: serializeHostFilter([
          ...unknownTargets,
          ...hostList
            .filter((h) => targetIds.has(h.id))
            .map((h) => filterIdOf(h, account.kind)),
        ]),
      };
      if (editingSnippet) {
        await repos.snippets.update(editingSnippet.id, payload);
        toast.success("Snippet updated");
      } else {
        await repos.snippets.create(payload);
        toast.success("Snippet created");
      }
      await load();
      setEditDialog(false);
    } catch {
      toast.error("Failed to save snippet");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await repos.snippets.remove(deleteTarget.id);
      toast.success("Snippet deleted");
      setDeleteTarget(null);
      await load();
    } catch {
      toast.error("Failed to delete snippet");
    } finally {
      setDeleting(false);
    }
  };

  const handleCreateFolder = async () => {
    if (!folderName.trim()) {
      toast.error("Folder name is required");
      return;
    }
    setCreatingFolder(true);
    try {
      await repos.snippetFolders.create({ name: folderName.trim() });
      toast.success("Folder created");
      setFolderDialog(false);
      setFolderName("");
      await load();
    } catch {
      toast.error("Failed to create folder");
    } finally {
      setCreatingFolder(false);
    }
  };

  const handleDeleteFolder = async () => {
    if (!deleteFolderTarget) return;
    setDeletingFolder(true);
    try {
      await repos.snippetFolders.remove(deleteFolderTarget.name);
      toast.success("Folder deleted");
      setDeleteFolderTarget(null);
      await load();
    } catch {
      toast.error("Failed to delete folder");
    } finally {
      setDeletingFolder(false);
    }
  };

  // Saved folders show even when empty, so a new folder can be filled.
  const filled = groupSnippets(snippets, folders);
  const unfoldered = filled.find((g) => g.key === "")?.items ?? [];
  const groups = [
    ...filled.filter((g) => g.key !== ""),
    ...folders
      .filter((f) => !filled.some((g) => g.key === f.name))
      .map((f) => ({
        key: f.name,
        label: f.name,
        color: f.color ?? undefined,
        items: [] as Snippet[],
      })),
  ].sort((a, b) => a.key.localeCompare(b.key));

  const submitFolderRename = async () => {
    const oldName = renameFolderTarget;
    const newName = renameFolderName.trim();
    if (!oldName || !newName || newName === oldName) {
      setRenameFolderTarget(null);
      return;
    }
    setRenamingFolder(true);
    try {
      await repos.snippetFolders.rename(oldName, newName);
      setRenameFolderTarget(null);
      setRenameFolderName("");
      await load();
      toast.success("Folder renamed");
    } catch (e: any) {
      toast.error(e?.message || "Failed to rename folder");
    } finally {
      setRenamingFolder(false);
    }
  };

  // Reordering is persisted per folder, matching how the backend stores order.
  const moveSnippet = async (list: Snippet[], index: number, delta: number) => {
    const target = index + delta;
    if (target < 0 || target >= list.length) return;

    const reordered = [...list];
    const [moved] = reordered.splice(index, 1);
    reordered.splice(target, 0, moved);

    const orderById = new Map(reordered.map((sn, i) => [sn.id, i]));
    setSnippets((prev) =>
      [...prev]
        .map((sn) =>
          orderById.has(sn.id)
            ? { ...sn, order: orderById.get(sn.id) as number }
            : sn,
        )
        .sort((a, b) => (a.order ?? 0) - (b.order ?? 0)),
    );

    try {
      await repos.snippets.reorder(
        reordered.map((sn, i) => ({
          id: sn.id,
          order: i,
          folder: sn.folder ?? undefined,
        })),
      );
    } catch {
      toast.error("Failed to save order");
      load();
    }
  };

  const renderSnippet = (snippet: Snippet, index: number, list: Snippet[]) => (
    <View
      key={snippet.id}
      className="flex-row items-center gap-2 border-b border-border px-3 py-3 hover:bg-muted/20"
      onPointerDown={(e) => {
        const n = e.nativeEvent;
        if (isSecondaryClick(n)) {
          setMenu({ snippet, at: { x: n.pageX ?? 0, y: n.pageY ?? 0 } });
        }
      }}
    >
      <FileText size={14} color={color("muted-foreground")} />
      <Pressable
        onPress={() => handleCopy(snippet)}
        onLongPress={snippet.isShared ? undefined : () => openEdit(snippet)}
        className="flex-1 active:opacity-60"
      >
        <Text
          weight="medium"
          className="text-sm text-foreground"
          numberOfLines={1}
        >
          {snippet.name}
        </Text>
        <Text
          className="mt-0.5 text-xs text-muted-foreground"
          numberOfLines={1}
        >
          {snippet.description || snippet.content}
        </Text>
      </Pressable>
      {snippet.isShared ? null : (
        <>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Move up"
            onPress={() => moveSnippet(list, index, -1)}
            disabled={index === 0}
            hitSlop={8}
            className="p-1 active:opacity-60"
            style={{ opacity: index === 0 ? 0.3 : 1 }}
          >
            <ChevronUp size={14} color={color("muted-foreground")} />
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Move down"
            onPress={() => moveSnippet(list, index, 1)}
            disabled={index === list.length - 1}
            hitSlop={8}
            className="p-1 active:opacity-60"
            style={{ opacity: index === list.length - 1 ? 0.3 : 1 }}
          >
            <ChevronDown size={14} color={color("muted-foreground")} />
          </Pressable>
        </>
      )}
      {!snippet.isNote && hostList.length > 0 ? (
        <Pressable
          onPress={() => setRunTarget(snippet)}
          accessibilityRole="button"
          accessibilityLabel={`Run ${snippet.name} on hosts`}
          hitSlop={8}
          className="p-1 active:opacity-60"
        >
          <Play size={14} color={color("muted-foreground")} />
        </Pressable>
      ) : null}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Copy ${snippet.name}`}
        onPress={() => handleCopy(snippet)}
        hitSlop={8}
        className="p-1 active:opacity-60"
      >
        <Copy size={14} color={color("muted-foreground")} />
      </Pressable>
      {snippet.isShared ? null : (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Delete ${snippet.name}`}
          onPress={() => setDeleteTarget(snippet)}
          hitSlop={8}
          className="p-1 active:opacity-60"
        >
          <Trash2 size={14} color={color("destructive")} />
        </Pressable>
      )}
    </View>
  );

  const renderFolderSection = (
    label: string,
    folderKey: string | null,
    items: Snippet[],
    accentColor?: string,
  ) => {
    const collapsed = isFolderCollapsed(folderKey);
    return (
      <View key={folderKey ?? "__unfoldered__"}>
        <Pressable
          onPress={() => toggleFolder(folderKey)}
          className="flex-row items-center gap-2 border-b border-border bg-muted/20 px-3 py-2.5 active:bg-muted/40"
        >
          <FolderOpen
            size={13}
            color={accentColor ?? color("muted-foreground")}
          />
          <Text
            weight="medium"
            className="flex-1 text-xs text-foreground"
            style={accentColor ? { color: accentColor } : undefined}
          >
            {label}
          </Text>
          <Text className="text-xs text-muted-foreground">{items.length}</Text>
          {folderKey !== null && (
            <>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Rename folder"
                onPress={() => {
                  setRenameFolderTarget(folderKey);
                  setRenameFolderName(folderKey);
                }}
                hitSlop={8}
                className="p-1"
              >
                <Pencil size={12} color={color("muted-foreground")} />
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Delete folder"
                onPress={() => {
                  const f = folders.find((x) => x.name === folderKey);
                  if (f) setDeleteFolderTarget(f);
                }}
                hitSlop={8}
                className="p-1"
              >
                <Trash2 size={12} color={color("muted-foreground")} />
              </Pressable>
            </>
          )}
          <ChevronDown
            size={13}
            color={color("muted-foreground")}
            style={{ transform: [{ rotate: collapsed ? "-90deg" : "0deg" }] }}
          />
        </Pressable>
        {!collapsed &&
          (items.length === 0 ? (
            <View className="border-b border-border px-3 py-3">
              <Text className="text-xs italic text-muted-foreground">
                No snippets in this folder
              </Text>
            </View>
          ) : (
            items.map((sn, i) => renderSnippet(sn, i, items))
          ))}
      </View>
    );
  };

  return (
    <Screen
      title="Snippets"
      onBack={() => router.back()}
      headerRight={
        <View className="flex-row gap-2">
          <Button
            variant="ghost"
            size="icon"
            accessibilityLabel="Import and export"
            onPress={() => setTransferOpen(true)}
            icon={<ArrowDownUp size={18} color={color("muted-foreground")} />}
          />
          <Button
            variant="ghost"
            size="sm"
            onPress={() => setFolderDialog(true)}
          >
            Folder
          </Button>
          <Button variant="default" size="sm" onPress={openCreate}>
            New
          </Button>
        </View>
      }
    >
      {loading ? (
        <View className="flex-1 items-center justify-center">
          <Text className="text-sm text-muted-foreground">Loading…</Text>
        </View>
      ) : loadFailed && snippets.length === 0 ? (
        <View className="flex-1 justify-center">
          <EmptyState
            icon={FileText}
            title="Could not load snippets"
            hint="Check the connection to your server and try again."
            action={
              <Button variant="default" size="lg" onPress={onRefresh}>
                Try again
              </Button>
            }
          />
        </View>
      ) : snippets.length === 0 && folders.length === 0 ? (
        <View className="flex-1 justify-center">
          <EmptyState
            icon={FileText}
            title="No snippets yet"
            hint="Create your first snippet, or add snippets from the Termix web or desktop app."
            action={
              <Button variant="default" size="lg" onPress={openCreate}>
                Create snippet
              </Button>
            }
          />
        </View>
      ) : (
        <ScrollView
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={color("muted-foreground")}
              colors={[color("muted-foreground")]}
            />
          }
        >
          <View className="border-b border-border px-3">
            <SettingRow
              label="Ask before running"
              description="Confirm before a snippet runs in the terminal"
              last
            >
              <FakeSwitch
                checked={!!config.confirmSnippetRun}
                onChange={(v) =>
                  void updateConfig({ confirmSnippetRun: v }).catch(() => {})
                }
              />
            </SettingRow>
          </View>
          {unfoldered.length > 0 &&
            renderFolderSection("Uncategorized", null, unfoldered)}
          {groups.map((group) =>
            renderFolderSection(
              group.label,
              group.key,
              group.items,
              group.color,
            ),
          )}
        </ScrollView>
      )}

      {/* Create / Edit dialog */}
      <Sheet
        scroll
        visible={editDialog}
        onClose={() => setEditDialog(false)}
        title={editingSnippet ? "Edit Snippet" : "New Snippet"}
        footer={
          <View className="flex-row gap-2">
            <Button
              variant="muted"
              className="flex-1"
              onPress={() => setEditDialog(false)}
            >
              Cancel
            </Button>
            <Button
              variant="default"
              className="flex-1"
              loading={saving}
              onPress={handleSave}
            >
              {editingSnippet ? "Save" : "Create"}
            </Button>
          </View>
        }
      >
        <SheetBody>
          <View className="gap-3">
            <View className="gap-1">
              <Label>Name</Label>
              <Input
                value={form.name}
                onChangeText={(v) => setForm((f) => ({ ...f, name: v }))}
                placeholder="e.g. Update packages"
                autoCapitalize="none"
              />
            </View>
            <View className="gap-1">
              <Label>Content</Label>
              <Input
                value={form.content}
                onChangeText={(v) => setForm((f) => ({ ...f, content: v }))}
                placeholder="e.g. sudo apt update && sudo apt upgrade -y"
                autoCapitalize="none"
                autoCorrect={false}
                multiline
                numberOfLines={3}
                className="min-h-[72px]"
              />
            </View>
            <View className="gap-1">
              <Label>Description (optional)</Label>
              <Input
                value={form.description}
                onChangeText={(v) => setForm((f) => ({ ...f, description: v }))}
                placeholder="Short description"
                autoCapitalize="sentences"
              />
            </View>
            <View className="gap-1">
              <Label>Folder (optional)</Label>
              <Pressable
                onPress={() => setFolderPickerOpen(true)}
                className="h-10 flex-row items-center gap-2 border border-input bg-card px-2.5 active:opacity-70"
              >
                <FolderOpen size={14} color={color("muted-foreground")} />
                <Text
                  className={`flex-1 text-sm ${form.folder ? "text-foreground" : "text-muted-foreground"}`}
                >
                  {form.folder || "No folder"}
                </Text>
                <ChevronRight size={14} color={color("muted-foreground")} />
              </Pressable>
            </View>
            {!form.isNote ? (
              <View className="gap-1">
                <Label>Target hosts (optional)</Label>
                <Pressable
                  onPress={() => setTargetsOpen(true)}
                  className="h-10 flex-row items-center gap-2 border border-input bg-card px-2.5 active:opacity-70"
                >
                  <Text
                    className={`flex-1 text-sm ${targetIds.size ? "text-foreground" : "text-muted-foreground"}`}
                  >
                    {targetIds.size
                      ? `${targetIds.size} ${targetIds.size === 1 ? "host" : "hosts"}`
                      : "None"}
                  </Text>
                  <ChevronRight size={14} color={color("muted-foreground")} />
                </Pressable>
              </View>
            ) : null}
            <SettingRow
              label="Note"
              description="Pasted into the terminal without running"
              last
            >
              <FakeSwitch
                checked={form.isNote}
                onChange={(v) => setForm((f) => ({ ...f, isNote: v }))}
              />
            </SettingRow>
          </View>
        </SheetBody>
      </Sheet>

      <HostPicker
        visible={targetsOpen}
        title="Target hosts"
        hosts={hostList}
        selected={targetIds}
        onChange={setTargetIds}
        onClose={() => setTargetsOpen(false)}
      />
      <RunOnHostsSheet snippet={runTarget} onClose={() => setRunTarget(null)} />
      <ContextMenu
        at={menu?.at ?? null}
        onClose={() => setMenu(null)}
        items={
          menu
            ? [
                {
                  id: "copy",
                  label: "Copy",
                  onPress: () => handleCopy(menu.snippet),
                },
                ...(menu.snippet.isShared
                  ? []
                  : [
                      {
                        id: "edit",
                        label: "Edit",
                        onPress: () => openEdit(menu.snippet),
                      },
                    ]),
                ...(!menu.snippet.isNote && hostList.length > 0
                  ? [
                      {
                        id: "run",
                        label: "Run on hosts",
                        onPress: () => setRunTarget(menu.snippet),
                      },
                    ]
                  : []),
                ...(menu.snippet.isShared
                  ? []
                  : [
                      {
                        id: "delete",
                        label: "Delete",
                        destructive: true,
                        onPress: () => setDeleteTarget(menu.snippet),
                      },
                    ]),
              ]
            : []
        }
      />
      <SnippetTransferSheet
        visible={transferOpen}
        onClose={() => setTransferOpen(false)}
      />

      {/* Folder picker */}
      <Sheet
        scroll
        visible={folderPickerOpen}
        onClose={() => setFolderPickerOpen(false)}
        title="Select Folder"
      >
        <SheetBody>
          <View className="-mx-4 -mb-4">
            <Pressable
              onPress={() => {
                setForm((f) => ({ ...f, folder: "" }));
                setFolderPickerOpen(false);
              }}
              className="flex-row items-center gap-3 border-b border-border px-4 py-3 active:bg-muted/30"
            >
              <FolderOpen size={14} color={color("muted-foreground")} />
              <Text className="flex-1 text-sm text-foreground">No folder</Text>
              {!form.folder && <Check size={14} color={color("primary")} />}
            </Pressable>
            {folders.map((folder) => (
              <Pressable
                key={folder.id}
                onPress={() => {
                  setForm((f) => ({ ...f, folder: folder.name }));
                  setFolderPickerOpen(false);
                }}
                className="flex-row items-center gap-3 border-b border-border px-4 py-3 active:bg-muted/30"
              >
                <FolderOpen
                  size={14}
                  color={folder.color ?? color("muted-foreground")}
                />
                <Text className="flex-1 text-sm text-foreground">
                  {folder.name}
                </Text>
                {form.folder === folder.name && (
                  <Check size={14} color={color("primary")} />
                )}
              </Pressable>
            ))}
          </View>
        </SheetBody>
      </Sheet>

      {/* Delete snippet confirm */}
      <Sheet
        scroll
        visible={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        title="Delete Snippet"
        description={`Delete "${deleteTarget?.name}"? This cannot be undone.`}
        footer={
          <View className="flex-row gap-2">
            <Button
              variant="muted"
              className="flex-1"
              onPress={() => setDeleteTarget(null)}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              className="flex-1"
              loading={deleting}
              onPress={handleDelete}
            >
              Delete
            </Button>
          </View>
        }
      />

      {/* Rename folder dialog */}
      <Sheet
        scroll
        visible={renameFolderTarget !== null}
        onClose={() => setRenameFolderTarget(null)}
        title="Rename Folder"
        footer={
          <View className="flex-row gap-2">
            <Button
              variant="muted"
              className="flex-1"
              onPress={() => setRenameFolderTarget(null)}
            >
              Cancel
            </Button>
            <Button
              variant="default"
              className="flex-1"
              loading={renamingFolder}
              onPress={submitFolderRename}
            >
              Rename
            </Button>
          </View>
        }
      >
        <SheetBody>
          <View className="gap-1">
            <Label>Folder name</Label>
            <Input
              value={renameFolderName}
              onChangeText={setRenameFolderName}
              placeholder="e.g. System"
              autoCapitalize="words"
            />
          </View>
        </SheetBody>
      </Sheet>

      {/* New folder dialog */}
      <Sheet
        scroll
        visible={folderDialog}
        onClose={() => setFolderDialog(false)}
        title="New Folder"
        footer={
          <View className="flex-row gap-2">
            <Button
              variant="muted"
              className="flex-1"
              onPress={() => setFolderDialog(false)}
            >
              Cancel
            </Button>
            <Button
              variant="default"
              className="flex-1"
              loading={creatingFolder}
              onPress={handleCreateFolder}
            >
              Create
            </Button>
          </View>
        }
      >
        <SheetBody>
          <View className="gap-1">
            <Label>Folder name</Label>
            <Input
              value={folderName}
              onChangeText={setFolderName}
              placeholder="e.g. System"
              autoCapitalize="words"
            />
          </View>
        </SheetBody>
      </Sheet>

      {/* Delete folder confirm */}
      <Sheet
        scroll
        visible={!!deleteFolderTarget}
        onClose={() => setDeleteFolderTarget(null)}
        title="Delete Folder"
        description={`Delete "${deleteFolderTarget?.name}"? Snippets in this folder will become uncategorized.`}
        footer={
          <View className="flex-row gap-2">
            <Button
              variant="muted"
              className="flex-1"
              onPress={() => setDeleteFolderTarget(null)}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              className="flex-1"
              loading={deletingFolder}
              onPress={handleDeleteFolder}
            >
              Delete
            </Button>
          </View>
        }
      />
    </Screen>
  );
}
