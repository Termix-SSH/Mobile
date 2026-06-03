import { useState, useEffect, useCallback } from "react";
import {
  View,
  ScrollView,
  Pressable,
  RefreshControl,
} from "react-native";
import * as Clipboard from "expo-clipboard";
import {
  ChevronRight,
  Copy,
  FolderOpen,
  FileText,
  ChevronDown,
  Trash2,
  Check,
} from "lucide-react-native";
import {
  getSnippets,
  getSnippetFolders,
  createSnippet,
  updateSnippet,
  deleteSnippet,
  createSnippetFolder,
  deleteSnippetFolder,
} from "@/app/main-axios";
import { Snippet, SnippetFolder } from "@/types";
import { useThemeColor } from "@/app/contexts/ThemeContext";
import { Screen } from "@/app/components/Screen";
import {
  Text,
  Button,
  Input,
  Label,
  Dialog,
} from "@/app/components/ui";
import { toast } from "@/app/utils/toast";

type SnippetFormData = {
  name: string;
  content: string;
  description: string;
  folder: string;
};

export default function Snippets() {
  const color = useThemeColor();

  const [snippets, setSnippets] = useState<Snippet[]>([]);
  const [folders, setFolders] = useState<SnippetFolder[]>([]);
  const [loading, setLoading] = useState(true);
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
  const [deleteFolderTarget, setDeleteFolderTarget] = useState<SnippetFolder | null>(null);
  const [deletingFolder, setDeletingFolder] = useState(false);

  const load = useCallback(async () => {
    try {
      const [s, f] = await Promise.all([
        getSnippets().catch(() => []),
        getSnippetFolders().catch(() => []),
      ]);
      setSnippets(Array.isArray(s) ? s.sort((a: Snippet, b: Snippet) => (a.order ?? 0) - (b.order ?? 0)) : []);
      setFolders(Array.isArray(f) ? f : []);
    } catch {
      toast.error("Failed to load snippets");
    }
  }, []);

  useEffect(() => {
    load().finally(() => setLoading(false));
  }, [load]);

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

  const snippetsInFolder = (folderName: string | null) =>
    snippets.filter((s) => s.folder === folderName);

  const handleCopy = async (snippet: Snippet) => {
    await Clipboard.setStringAsync(snippet.content);
    toast.success(`Copied: ${snippet.name}`);
  };

  const openCreate = () => {
    setEditingSnippet(null);
    setForm({ name: "", content: "", description: "", folder: "" });
    setEditDialog(true);
  };

  const openEdit = (snippet: Snippet) => {
    setEditingSnippet(snippet);
    setForm({
      name: snippet.name,
      content: snippet.content,
      description: snippet.description ?? "",
      folder: snippet.folder ?? "",
    });
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
      };
      if (editingSnippet) {
        await updateSnippet(editingSnippet.id, payload);
        toast.success("Snippet updated");
      } else {
        await createSnippet(payload);
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
      await deleteSnippet(deleteTarget.id);
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
      await createSnippetFolder({ name: folderName.trim() });
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
      await deleteSnippetFolder(deleteFolderTarget.name);
      toast.success("Folder deleted");
      setDeleteFolderTarget(null);
      await load();
    } catch {
      toast.error("Failed to delete folder");
    } finally {
      setDeletingFolder(false);
    }
  };

  const unfoldered = snippetsInFolder(null);

  const renderSnippet = (snippet: Snippet) => (
    <View
      key={snippet.id}
      className="flex-row items-center gap-2 border-b border-border px-4 py-3"
    >
      <FileText size={14} color={color("muted-foreground")} />
      <Pressable
        onPress={() => handleCopy(snippet)}
        onLongPress={() => openEdit(snippet)}
        className="flex-1 active:opacity-60"
      >
        <Text weight="medium" className="text-sm text-foreground" numberOfLines={1}>
          {snippet.name}
        </Text>
        <Text className="mt-0.5 text-xs text-muted-foreground" numberOfLines={1}>
          {snippet.description || snippet.content}
        </Text>
      </Pressable>
      <Pressable
        onPress={() => handleCopy(snippet)}
        hitSlop={8}
        className="p-1 active:opacity-60"
      >
        <Copy size={14} color={color("muted-foreground")} />
      </Pressable>
      <Pressable
        onPress={() => setDeleteTarget(snippet)}
        hitSlop={8}
        className="p-1 active:opacity-60"
      >
        <Trash2 size={14} color={color("destructive")} />
      </Pressable>
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
          className="flex-row items-center gap-2 border-b border-border bg-muted/20 px-4 py-2.5 active:bg-muted/40"
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
          <Text className="text-xs text-muted-foreground">
            {items.length}
          </Text>
          {folderKey !== null && (
            <Pressable
              onPress={() => {
                const f = folders.find((x) => x.name === folderKey);
                if (f) setDeleteFolderTarget(f);
              }}
              hitSlop={8}
              className="p-1"
            >
              <Trash2 size={12} color={color("muted-foreground")} />
            </Pressable>
          )}
          <ChevronDown
            size={13}
            color={color("muted-foreground")}
            style={{ transform: [{ rotate: collapsed ? "-90deg" : "0deg" }] }}
          />
        </Pressable>
        {!collapsed && (
          items.length === 0 ? (
            <View className="border-b border-border px-4 py-3">
              <Text className="text-xs italic text-muted-foreground">
                No snippets in this folder
              </Text>
            </View>
          ) : (
            items.map(renderSnippet)
          )
        )}
      </View>
    );
  };

  return (
    <Screen
      title="Snippets"
      headerRight={
        <View className="flex-row gap-2">
          <Button
            variant="ghost"
            size="sm"
            onPress={() => setFolderDialog(true)}
          >
            Folder
          </Button>
          <Button variant="accent" size="sm" onPress={openCreate}>
            New
          </Button>
        </View>
      }
    >
      {loading ? (
        <View className="flex-1 items-center justify-center">
          <Text className="text-sm text-muted-foreground">Loading…</Text>
        </View>
      ) : snippets.length === 0 && folders.length === 0 ? (
        <View className="flex-1 items-center justify-center px-8">
          <FileText size={32} color={color("muted-foreground")} />
          <Text weight="medium" className="mt-4 text-base text-foreground">
            No snippets yet
          </Text>
          <Text className="mt-2 text-center text-sm text-muted-foreground">
            Create your first snippet, or add snippets from the Termix web or
            desktop app.
          </Text>
          <Button
            variant="accent"
            size="lg"
            className="mt-6"
            onPress={openCreate}
          >
            Create snippet
          </Button>
        </View>
      ) : (
        <ScrollView
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
        >
          {unfoldered.length > 0 &&
            renderFolderSection("Uncategorized", null, unfoldered)}
          {folders.map((folder) =>
            renderFolderSection(
              folder.name,
              folder.name,
              snippetsInFolder(folder.name),
              folder.color ?? undefined,
            ),
          )}
        </ScrollView>
      )}

      {/* Create / Edit dialog */}
      <Dialog
        visible={editDialog}
        onClose={() => setEditDialog(false)}
        title={editingSnippet ? "Edit Snippet" : "New Snippet"}
        footer={
          <View className="flex-row gap-2">
            <Button
              variant="outline"
              className="flex-1"
              onPress={() => setEditDialog(false)}
            >
              Cancel
            </Button>
            <Button
              variant="accent"
              className="flex-1"
              loading={saving}
              onPress={handleSave}
            >
              {editingSnippet ? "Save" : "Create"}
            </Button>
          </View>
        }
      >
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
        </View>
      </Dialog>

      {/* Folder picker */}
      <Dialog
        visible={folderPickerOpen}
        onClose={() => setFolderPickerOpen(false)}
        title="Select Folder"
      >
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
      </Dialog>

      {/* Delete snippet confirm */}
      <Dialog
        visible={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        title="Delete Snippet"
        description={`Delete "${deleteTarget?.name}"? This cannot be undone.`}
        footer={
          <View className="flex-row gap-2">
            <Button
              variant="outline"
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

      {/* New folder dialog */}
      <Dialog
        visible={folderDialog}
        onClose={() => setFolderDialog(false)}
        title="New Folder"
        footer={
          <View className="flex-row gap-2">
            <Button
              variant="outline"
              className="flex-1"
              onPress={() => setFolderDialog(false)}
            >
              Cancel
            </Button>
            <Button
              variant="accent"
              className="flex-1"
              loading={creatingFolder}
              onPress={handleCreateFolder}
            >
              Create
            </Button>
          </View>
        }
      >
        <View className="gap-1">
          <Label>Folder name</Label>
          <Input
            value={folderName}
            onChangeText={setFolderName}
            placeholder="e.g. System"
            autoCapitalize="words"
          />
        </View>
      </Dialog>

      {/* Delete folder confirm */}
      <Dialog
        visible={!!deleteFolderTarget}
        onClose={() => setDeleteFolderTarget(null)}
        title="Delete Folder"
        description={`Delete "${deleteFolderTarget?.name}"? Snippets in this folder will become uncategorized.`}
        footer={
          <View className="flex-row gap-2">
            <Button
              variant="outline"
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
