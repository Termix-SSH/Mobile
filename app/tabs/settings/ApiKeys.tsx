import { useState, useEffect, useCallback } from "react";
import {
  View,
  ScrollView,
  Pressable,
  RefreshControl,
  Alert,
} from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ArrowLeft, Plus, Copy, Trash2, Key } from "lucide-react-native";
import * as Clipboard from "expo-clipboard";
import {
  getApiKeys,
  createApiKey,
  deleteApiKey,
  getUserList,
  type ApiKey,
} from "@/app/main-axios";
import { UserInfo } from "@/types";
import { Text, Button, Input, Dialog, Label } from "@/app/components/ui";
import { useThemeColor } from "@/app/contexts/ThemeContext";
import { toast } from "@/app/utils/toast";

function formatDate(iso: string | null): string {
  if (!iso) return "Never";
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return iso;
  }
}

// Defensive ID extraction — handles backends that return `id` instead of `userId`
function getUserId(u: UserInfo): string {
  return u.userId || (u as any).id || "";
}

export default function ApiKeys() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const color = useThemeColor();

  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [users, setUsers] = useState<UserInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Create form state
  const [createDialog, setCreateDialog] = useState(false);
  const [keyName, setKeyName] = useState("");
  const [keyUserId, setKeyUserId] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [createBusy, setCreateBusy] = useState(false);

  // Secret reveal
  const [revealDialog, setRevealDialog] = useState(false);
  const [newKeySecret, setNewKeySecret] = useState("");

  const load = useCallback(async () => {
    try {
      const [keysRes, usersRes] = await Promise.all([
        getApiKeys(),
        getUserList(),
      ]);
      setKeys(keysRes?.apiKeys ?? []);
      const userList = usersRes?.users ?? [];
      setUsers(userList);
      if (userList.length > 0) {
        setKeyUserId((prev) => (prev ? prev : getUserId(userList[0])));
      }
    } catch {
      toast.error("Failed to load API keys");
    }
  }, []);

  useEffect(() => {
    load().finally(() => setLoading(false));
  }, [load]);

  const openCreate = () => {
    setKeyName("");
    setExpiresAt("");
    setCreateBusy(false);
    setKeyUserId(users.length > 0 ? getUserId(users[0]) : "");
    setCreateDialog(true);
  };

  const closeCreate = () => {
    setCreateDialog(false);
    setCreateBusy(false);
  };

  // Accepts "YYYY/MM/DD" or "YYYY-MM-DD" with partial tolerance
  const buildExpiresAt = (): string | undefined => {
    const raw = expiresAt.trim();
    if (!raw) return undefined;
    try {
      const normalized = raw.replace(/\//g, "-");
      const d = new Date(normalized);
      return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
    } catch {
      return undefined;
    }
  };

  // Auto-format typed digits into YYYY/MM/DD as the user goes
  const handleExpiresChange = (text: string) => {
    // Strip everything except digits and slashes
    const digits = text.replace(/[^\d]/g, "");
    let formatted = digits;
    if (digits.length > 4) formatted = digits.slice(0, 4) + "/" + digits.slice(4);
    if (digits.length > 6) formatted = digits.slice(0, 4) + "/" + digits.slice(4, 6) + "/" + digits.slice(6, 8);
    setExpiresAt(formatted);
  };

  const handleCreate = async () => {
    if (!keyName.trim() || !keyUserId) return;
    setCreateBusy(true);
    try {
      const res = await createApiKey(keyName.trim(), keyUserId, buildExpiresAt());
      closeCreate();
      load();
      const newKey = res?.apiKey as any;
      if (newKey) {
        const secret = newKey.token ?? newKey.key ?? "";
        if (secret) {
          setNewKeySecret(secret);
          setRevealDialog(true);
        }
      }
    } catch (e: any) {
      toast.error(e?.response?.data?.error ?? e?.message ?? "Failed to create API key");
    } finally {
      setCreateBusy(false);
    }
  };

  const handleDelete = (keyId: string, name: string) => {
    Alert.alert("Delete API key?", `"${name}" will stop working immediately.`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          try {
            await deleteApiKey(keyId);
            setKeys((prev) => prev.filter((k) => k.id !== keyId));
            toast.success("API key deleted");
          } catch {
            toast.error("Failed to delete API key");
          }
        },
      },
    ]);
  };

  return (
    <View className="flex-1 bg-background" style={{ paddingTop: insets.top }}>
      {/* Header */}
      <View className="flex-row items-center gap-3 border-b border-border px-4 py-3">
        <Pressable onPress={() => router.back()} hitSlop={8}>
          <ArrowLeft size={20} color={color("foreground")} />
        </Pressable>
        <Text weight="bold" className="flex-1 text-base text-foreground">
          API Keys
        </Text>
        <Pressable onPress={openCreate} hitSlop={8}>
          <Plus size={20} color={color("accent-brand")} />
        </Pressable>
      </View>

      {loading ? (
        <View className="flex-1 items-center justify-center">
          <Text className="text-sm text-muted-foreground">Loading…</Text>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: 16, gap: 10, paddingBottom: 40 }}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={async () => {
                setRefreshing(true);
                await load();
                setRefreshing(false);
              }}
              tintColor={color("accent-brand")}
            />
          }
        >
          <Text className="text-xs text-muted-foreground">
            API keys allow programmatic access to Termix. The secret is only
            shown once so store it safely.
          </Text>

          {keys.length === 0 ? (
            <Text className="mt-6 text-center text-sm text-muted-foreground">
              No API keys yet.
            </Text>
          ) : (
            keys.map((k) => (
              <View
                key={k.id}
                className="flex-row items-start gap-3 border border-border bg-card p-3"
              >
                <Key size={16} color={color("muted-foreground")} style={{ marginTop: 2 }} />
                <View className="flex-1 gap-0.5">
                  <Text weight="medium" className="text-sm text-foreground">
                    {k.name}
                  </Text>
                  {(k as any).username ? (
                    <Text className="text-[11px] text-muted-foreground">
                      {(k as any).username}
                    </Text>
                  ) : null}
                  <Text className="text-[11px] text-muted-foreground">
                    Created {formatDate(k.createdAt)}
                  </Text>
                  <Text className="text-[11px] text-muted-foreground">
                    Last used {formatDate(k.lastUsedAt)}
                  </Text>
                  {k.expiresAt ? (
                    <Text className="text-[11px] text-muted-foreground">
                      Expires {formatDate(k.expiresAt)}
                    </Text>
                  ) : null}
                </View>
                <Pressable onPress={() => handleDelete(k.id, k.name)} hitSlop={8} className="mt-0.5">
                  <Trash2 size={16} color={color("destructive")} />
                </Pressable>
              </View>
            ))
          )}
        </ScrollView>
      )}

      {/* Create dialog */}
      <Dialog
        visible={createDialog}
        onClose={closeCreate}
        icon={<Key size={20} color={color("accent-brand")} />}
        title="New API Key"
        footer={
          <View className="flex-row gap-2">
            <Button variant="outline" className="flex-1" onPress={closeCreate}>
              Cancel
            </Button>
            <Button
              variant="accent"
              className="flex-1"
              onPress={handleCreate}
              loading={createBusy}
              disabled={!keyName.trim() || !keyUserId}
            >
              Create
            </Button>
          </View>
        }
      >
        <View className="gap-4">
          {/* Name */}
          <View className="gap-1.5">
            <Label>Name *</Label>
            <Input
              value={keyName}
              onChangeText={setKeyName}
              placeholder="e.g. CI Pipeline"
              autoCapitalize="none"
              autoFocus
            />
          </View>

          {/* User */}
          <View className="gap-1.5">
            <Label>User *</Label>
            {users.length === 0 ? (
              <Text className="text-xs text-muted-foreground">No users available.</Text>
            ) : (
              <View className="overflow-hidden border border-border bg-card">
                {users.map((u, i) => {
                  const uid = getUserId(u);
                  const selected = keyUserId === uid;
                  return (
                    <Pressable
                      key={uid || u.username}
                      onPress={() => setKeyUserId(uid)}
                      className={`flex-row items-center justify-between px-3 py-2.5 ${
                        i > 0 ? "border-t border-border/50" : ""
                      } ${selected ? "bg-accent-brand/10" : "active:bg-muted/40"}`}
                    >
                      <Text
                        className={`text-sm ${selected ? "text-accent-brand" : "text-foreground"}`}
                      >
                        {u.username}
                      </Text>
                      {u.is_admin ? (
                        <Text className="text-[10px] text-muted-foreground">admin</Text>
                      ) : null}
                    </Pressable>
                  );
                })}
              </View>
            )}
          </View>

          {/* Expires At */}
          <View className="gap-1.5">
            <Label>Expires At (optional)</Label>
            <Input
              value={expiresAt}
              onChangeText={handleExpiresChange}
              placeholder="YYYY/MM/DD"
              keyboardType="number-pad"
              maxLength={10}
            />
            <Text className="text-[11px] text-muted-foreground">
              Year / Month / Day
            </Text>
          </View>
        </View>
      </Dialog>

      {/* Secret reveal — shown once */}
      <Dialog
        visible={revealDialog}
        onClose={() => { setRevealDialog(false); setNewKeySecret(""); }}
        icon={<Key size={20} color={color("accent-brand")} />}
        title="Key created — copy it now"
        description="This token won't be shown again."
        footer={
          <View className="flex-row gap-2">
            <Button
              variant="outline"
              className="flex-1"
              onPress={async () => {
                await Clipboard.setStringAsync(newKeySecret);
                toast.success("API key copied");
              }}
              icon={<Copy size={14} color={color("foreground")} />}
            >
              Copy
            </Button>
            <Button
              variant="accent"
              className="flex-1"
              onPress={() => { setRevealDialog(false); setNewKeySecret(""); }}
            >
              Done
            </Button>
          </View>
        }
      >
        <View className="border border-border bg-muted/30 p-3">
          <Text className="font-mono text-xs text-foreground" selectable>
            {newKeySecret}
          </Text>
        </View>
      </Dialog>
    </View>
  );
}
