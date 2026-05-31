import { useEffect, useState, useMemo } from "react";
import {
  Modal,
  View,
  ScrollView,
  Pressable,
  ActivityIndicator,
  RefreshControl,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
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
import { getCredentials, deleteCredential } from "@/app/main-axios";
import {
  Text,
  Input,
  Button,
  BottomSheet,
  SheetRow,
  Dialog,
} from "@/app/components/ui";
import { useThemeColor } from "@/app/contexts/ThemeContext";
import { toast } from "@/app/utils/toast";
import CredentialForm from "@/app/tabs/hosts/CredentialForm";

export default function CredentialListModal({
  visible,
  onClose,
}: {
  visible: boolean;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const color = useThemeColor();

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
      const res = await getCredentials();
      const list: Credential[] = Array.isArray(res)
        ? res
        : (res?.credentials ?? []);
      setCredentials(list);
    } catch (e: any) {
      toast.error(e?.message || "Failed to load credentials");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    if (!visible) return;
    setSearchQuery("");
    load();
  }, [visible]);

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
      await deleteCredential(deleteTarget.id);
      toast.success(`Deleted "${deleteTarget.name}"`);
      setDeleteTarget(null);
      load(true);
    } catch (e: any) {
      toast.error(e?.message || "Failed to delete credential");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      onRequestClose={onClose}
      presentationStyle="fullScreen"
    >
      <View className="flex-1 bg-background" style={{ paddingTop: insets.top }}>
        {/* Header */}
        <View className="flex-row items-center justify-between border-b border-border px-4 py-3">
          <Pressable
            onPress={onClose}
            hitSlop={8}
            className="flex-row items-center gap-1.5"
          >
            <X size={18} color={color("foreground")} />
            <Text weight="medium" className="text-sm text-foreground">
              Cancel
            </Text>
          </Pressable>
          <Text weight="bold" className="text-base text-foreground">
            Credentials
          </Text>
          <Button
            variant="accent"
            size="sm"
            onPress={openCreate}
            icon={<Plus size={14} color="#fff" />}
          >
            Add
          </Button>
        </View>

        {/* Search bar */}
        <View className="px-4 pb-2 pt-3">
          <Input
            placeholder="Search credentials…"
            value={searchQuery}
            onChangeText={setSearchQuery}
            autoCapitalize="none"
            autoCorrect={false}
            leading={<Search size={15} color={color("muted-foreground")} />}
            trailing={
              searchQuery ? (
                <Pressable onPress={() => setSearchQuery("")} hitSlop={8}>
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
              Loading credentials…
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
              <View className="items-center justify-center gap-3 py-16">
                <Text className="text-sm text-muted-foreground">
                  {searchQuery.trim()
                    ? "No credentials match your search"
                    : "No credentials yet"}
                </Text>
                {!searchQuery.trim() ? (
                  <Button variant="accent" size="sm" onPress={openCreate}>
                    Add credential
                  </Button>
                ) : null}
              </View>
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
      </View>

      {/* Action bottom sheet */}
      <BottomSheet
        visible={sheetCredential !== null}
        onClose={() => setSheetCredential(null)}
      >
        <View className="border-b border-border px-4 pb-3 pt-1">
          <Text
            weight="bold"
            className="text-base text-foreground"
            numberOfLines={1}
          >
            {sheetCredential?.name}
          </Text>
          <Text className="text-xs text-muted-foreground" numberOfLines={1}>
            {sheetCredential?.authType === "key" ? "SSH Key" : "Password"}
            {sheetCredential?.username ? ` · ${sheetCredential.username}` : ""}
          </Text>
        </View>
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
      </BottomSheet>

      {/* Delete confirmation dialog */}
      <Dialog
        visible={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        title="Delete Credential"
        description={`"${deleteTarget?.name}" will be permanently deleted. Hosts using it will lose their saved credentials.`}
        icon={<Trash2 size={16} color={color("destructive")} />}
        footer={
          <>
            <Button
              variant="outline"
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
      <CredentialForm
        visible={formOpen}
        credential={formCredential}
        onClose={() => setFormOpen(false)}
        onSaved={() => {
          setFormOpen(false);
          load(true);
        }}
      />
    </Modal>
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
  const subtitle = [c.username, c.folder].filter(Boolean).join(" · ");

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
