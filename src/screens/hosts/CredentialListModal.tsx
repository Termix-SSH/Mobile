import { useEffect, useState, useMemo } from "react";
import {
  View,
  ScrollView,
  Pressable,
  ActivityIndicator,
  RefreshControl,
} from "react-native";
import {
  X,
  Plus,
  Search,
  KeyRound,
  Lock,
  Pencil,
  Trash2,
  ChevronRight,
} from "lucide-react-native";
import { Credential } from "@/types";
import {
  Text,
  Input,
  Button,
  Sheet,
  SheetRow,
  EmptyState,
  InlineView,
} from "@/ui";
import { useThemeColor } from "@/contexts/ThemeContext";
import { toast } from "@/utils/toast";
import CredentialEditor from "@/screens/hosts/credentials/CredentialEditor";
import { useRepositories } from "@/core/data/hooks";

export default function CredentialListModal({
  visible,
  onClose,
}: {
  visible: boolean;
  onClose: () => void;
}) {
  const color = useThemeColor();
  const repos = useRepositories();

  const [credentials, setCredentials] = useState<Credential[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [sheetCredential, setSheetCredential] = useState<Credential | null>(
    null,
  );
  const [formCredential, setFormCredential] = useState<Credential | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Credential | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    try {
      setCredentials(await repos.credentials.list());
    } catch (e: any) {
      toast.error(e?.message || "Could not load credentials");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    if (!visible) return;
    setSearchQuery("");
    load();
    // Reload when logins change (a save here, or a sync).
    return repos.credentials.subscribe(() => {
      void load(true);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, repos]);

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return credentials;
    return credentials.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.username?.toLowerCase().includes(q) ||
        c.folder?.toLowerCase().includes(q) ||
        c.tags?.some((t) => t.toLowerCase().includes(q)),
    );
  }, [credentials, searchQuery]);

  const openCreate = () => {
    setFormCredential(null);
    setFormOpen(true);
  };

  const openEdit = (c: Credential) => {
    setFormCredential(c);
    setFormOpen(true);
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await repos.credentials.remove(deleteTarget.id);
      toast.success(`Deleted "${deleteTarget.name}"`);
      setDeleteTarget(null);
    } catch (e: any) {
      toast.error(e?.message || "Could not delete the credential");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <>
      <InlineView
        open={visible}
        onClose={onClose}
        title="Credentials"
        scroll={false}
        bare
        actions={
          <Button
            variant="default"
            size="sm"
            onPress={openCreate}
            icon={<Plus size={14} color={color("accent-brand")} />}
          >
            Add
          </Button>
        }
      >
        {/* Search bar */}
        <View className="border-b border-border px-3 py-2.5">
          <Input
            placeholder="Search credentials"
            value={searchQuery}
            onChangeText={setSearchQuery}
            autoCapitalize="none"
            autoCorrect={false}
            leading={<Search size={15} color={color("muted-foreground")} />}
            trailing={
              searchQuery ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Clear search"
                  onPress={() => setSearchQuery("")}
                  hitSlop={8}
                >
                  <X size={15} color={color("muted-foreground")} />
                </Pressable>
              ) : undefined
            }
          />
        </View>

        {/* List */}
        {loading ? (
          <View className="flex-1 items-center justify-center gap-3">
            <ActivityIndicator color={color("accent-brand")} />
            <Text className="text-sm text-muted-foreground">
              Loading credentials...
            </Text>
          </View>
        ) : (
          <ScrollView
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={() => load(true)}
                tintColor={color("accent-brand")}
              />
            }
            keyboardShouldPersistTaps="handled"
          >
            {filtered.length === 0 ? (
              <EmptyState
                icon={KeyRound}
                title={
                  searchQuery.trim()
                    ? "No credentials match your search"
                    : "No credentials yet"
                }
                action={
                  !searchQuery.trim() ? (
                    <Button variant="default" size="sm" onPress={openCreate}>
                      Add credential
                    </Button>
                  ) : undefined
                }
              />
            ) : (
              filtered.map((c) => (
                <CredentialRow
                  key={c.id}
                  credential={c}
                  onPress={() => setSheetCredential(c)}
                  color={color}
                />
              ))
            )}
          </ScrollView>
        )}
      </InlineView>

      {/* Action bottom sheet */}
      <Sheet
        visible={sheetCredential !== null}
        onClose={() => setSheetCredential(null)}
        title={sheetCredential?.name}
        description={
          (sheetCredential?.authType === "key" ? "SSH key" : "Password") +
          (sheetCredential?.username ? ` | ${sheetCredential.username}` : "")
        }
      >
        <SheetRow
          icon={<Pencil size={18} color={color("foreground")} />}
          label="Edit"
          onPress={() => {
            const c = sheetCredential!;
            setSheetCredential(null);
            openEdit(c);
          }}
        />
        <SheetRow
          icon={<Trash2 size={18} color={color("destructive")} />}
          label="Delete"
          destructive
          onPress={() => {
            setDeleteTarget(sheetCredential);
            setSheetCredential(null);
          }}
        />
      </Sheet>

      {/* Delete confirmation */}
      <Sheet
        tone="destructive"
        visible={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        title="Delete credential"
        description={`"${deleteTarget?.name}" will be permanently deleted. Hosts using it will lose their saved credentials.`}
        icon={<Trash2 size={16} color={color("destructive")} />}
        footer={
          <>
            <Button
              variant="muted"
              size="sm"
              onPress={() => setDeleteTarget(null)}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              size="sm"
              loading={deleting}
              onPress={handleDelete}
            >
              Delete
            </Button>
          </>
        }
      />

      {/* Create / edit form stacked on top */}
      <CredentialEditor
        visible={formOpen}
        credential={formCredential}
        onClose={() => setFormOpen(false)}
        onSaved={() => {
          setFormOpen(false);
          load(true);
        }}
      />
    </>
  );
}

function CredentialRow({
  credential: c,
  onPress,
  color,
}: {
  credential: Credential;
  onPress: () => void;
  color: (key: string) => string | undefined;
}) {
  const subtitle = [c.username, c.folder].filter(Boolean).join(" | ");

  return (
    <Pressable
      onPress={onPress}
      className="flex-row items-center gap-3 border-b border-border/60 px-4 py-3.5 active:bg-muted/40"
    >
      <View className="h-8 w-8 shrink-0 items-center justify-center border border-border bg-card">
        {c.authType === "key" ? (
          <KeyRound size={16} color={color("accent-brand")} />
        ) : (
          <Lock size={16} color={color("muted-foreground")} />
        )}
      </View>
      <View className="min-w-0 flex-1">
        <Text
          weight="medium"
          className="text-sm text-foreground"
          numberOfLines={1}
        >
          {c.name}
        </Text>
        {subtitle ? (
          <Text className="text-[11px] text-muted-foreground" numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {c.usageCount > 0 ? (
        <Text className="shrink-0 text-[10px] text-muted-foreground">
          {c.usageCount} host{c.usageCount !== 1 ? "s" : ""}
        </Text>
      ) : null}
      <ChevronRight size={14} color={color("muted-foreground")} />
    </Pressable>
  );
}
