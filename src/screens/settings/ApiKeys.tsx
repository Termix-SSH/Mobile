import { useState, useEffect, useCallback } from "react";
import { View, ScrollView, Pressable, RefreshControl } from "react-native";
import { useRouter } from "expo-router";
import { Plus, Copy, Trash2, Key, KeyRound } from "lucide-react-native";
import * as Clipboard from "expo-clipboard";
import { UserInfo } from "@/types";
import {
  Text,
  Button,
  Input,
  Sheet,
  SheetBody,
  Label,
  EmptyState,
  useConfirm,
} from "@/ui";
import { useThemeColor } from "@/contexts/ThemeContext";
import { toast } from "@/utils/toast";
import { apiOf, useActiveClient } from "@/core/accounts";
import type { ApiKey } from "@/core/api/types";
import { Screen } from "@/components/Screen";
import { t } from "@/i18n";

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

// Defensive ID extraction - handles backends that return `id` instead of `userId`
function getUserId(u: UserInfo): string {
  return u.userId || (u as any).id || "";
}

export default function ApiKeys() {
  const client = useActiveClient();
  const router = useRouter();
  const confirm = useConfirm();
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

  // Shown once in the same sheet, since swapping sheets can drop the second.
  const [newKeySecret, setNewKeySecret] = useState("");

  const load = useCallback(async () => {
    try {
      const [keysRes, usersRes] = await Promise.all([
        apiOf(client).apiKeys.getApiKeys(),
        apiOf(client).users.getUserList(),
      ]);
      setKeys(keysRes?.apiKeys ?? []);
      const userList = usersRes?.users ?? [];
      setUsers(userList);
      if (userList.length > 0) {
        setKeyUserId((prev) => (prev ? prev : getUserId(userList[0])));
      }
    } catch {
      toast.error(t("settings.apiKeys.failedToLoadApiKeys"));
    }
  }, [client]);

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
    setNewKeySecret("");
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
    if (digits.length > 4)
      formatted = digits.slice(0, 4) + "/" + digits.slice(4);
    if (digits.length > 6)
      formatted =
        digits.slice(0, 4) +
        "/" +
        digits.slice(4, 6) +
        "/" +
        digits.slice(6, 8);
    setExpiresAt(formatted);
  };

  const handleCreate = async () => {
    if (!keyName.trim() || !keyUserId) return;
    setCreateBusy(true);
    try {
      const res = await apiOf(client).apiKeys.createApiKey(
        keyName.trim(),
        keyUserId,
        buildExpiresAt(),
      );
      load();
      const secret = res?.token ?? res?.key ?? "";
      if (secret) setNewKeySecret(secret);
      else closeCreate();
    } catch (e: any) {
      toast.error(
        e?.response?.data?.error ??
          e?.message ??
          t("settings.apiKeys.failedToCreateApiKey"),
      );
    } finally {
      setCreateBusy(false);
    }
  };

  const handleDelete = async (keyId: string, name: string) => {
    const ok = await confirm({
      title: t("settings.apiKeys.deleteApiKey"),
      description: t("settings.apiKeys.willStopWorkingRightAway", { name }),
    });
    if (!ok) return;
    try {
      await apiOf(client).apiKeys.deleteApiKey(keyId);
      setKeys((prev) => prev.filter((k) => k.id !== keyId));
      toast.success(t("settings.apiKeys.apiKeyDeleted"));
    } catch {
      toast.error(t("settings.apiKeys.failedToDeleteApiKey"));
    }
  };

  return (
    <Screen
      title={t("settings.apiKeys.apiKeys")}
      onBack={() => router.back()}
      headerRight={
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t("settings.apiKeys.newApiKey")}
          onPress={openCreate}
          hitSlop={8}
          className="h-9 w-9 items-center justify-center"
        >
          <Plus size={20} color={color("accent-brand")} />
        </Pressable>
      }
    >
      {loading ? (
        <View className="flex-1 items-center justify-center">
          <Text className="text-sm text-muted-foreground">
            {t("settings.apiKeys.loading")}
          </Text>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: 12, gap: 10, paddingBottom: 40 }}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={async () => {
                setRefreshing(true);
                await load();
                setRefreshing(false);
              }}
              tintColor={color("muted-foreground")}
              colors={[color("muted-foreground")]}
            />
          }
        >
          <Text className="text-xs text-muted-foreground">
            {t("settings.apiKeys.apiKeysAllowProgrammaticAccess")}
          </Text>

          {keys.length === 0 ? (
            <EmptyState
              icon={KeyRound}
              title={t("settings.apiKeys.noApiKeysYet")}
            />
          ) : (
            keys.map((k) => (
              <View
                key={k.id}
                className="flex-row items-start gap-3 border border-border bg-card p-3"
              >
                <Key
                  size={16}
                  color={color("muted-foreground")}
                  style={{ marginTop: 2 }}
                />
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
                    {t("settings.apiKeys.created", {
                      createdAt: formatDate(k.createdAt),
                    })}
                  </Text>
                  <Text className="text-[11px] text-muted-foreground">
                    {t("settings.apiKeys.lastUsed", {
                      lastUsedAt: formatDate(k.lastUsedAt),
                    })}
                  </Text>
                  {k.expiresAt ? (
                    <Text className="text-[11px] text-muted-foreground">
                      {t("settings.apiKeys.expires", {
                        expiresAt: formatDate(k.expiresAt),
                      })}
                    </Text>
                  ) : null}
                </View>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={t("settings.apiKeys.delete", {
                    name: k.name,
                  })}
                  onPress={() => handleDelete(k.id, k.name)}
                  hitSlop={8}
                  className="mt-0.5"
                >
                  <Trash2 size={16} color={color("destructive")} />
                </Pressable>
              </View>
            ))
          )}
        </ScrollView>
      )}

      {/* Create dialog */}
      <Sheet
        scroll
        visible={createDialog || !!newKeySecret}
        onClose={closeCreate}
        icon={<Key size={20} color={color("accent-brand")} />}
        title={
          newKeySecret
            ? t("settings.apiKeys.keyCreatedCopyItNow")
            : t("settings.apiKeys.newApiKey2")
        }
        description={
          newKeySecret ? t("settings.apiKeys.thisTokenWonTBe") : undefined
        }
        footer={
          newKeySecret ? (
            <View className="flex-row gap-2">
              <Button
                variant="muted"
                className="flex-1"
                onPress={async () => {
                  await Clipboard.setStringAsync(newKeySecret);
                  toast.success(t("settings.apiKeys.apiKeyCopied"));
                }}
                icon={<Copy size={14} color={color("foreground")} />}
              >
                {t("settings.apiKeys.copy")}
              </Button>
              <Button
                variant="default"
                className="flex-1"
                onPress={closeCreate}
              >
                {t("settings.apiKeys.done")}
              </Button>
            </View>
          ) : (
            <View className="flex-row gap-2">
              <Button variant="muted" className="flex-1" onPress={closeCreate}>
                {t("settings.apiKeys.cancel")}
              </Button>
              <Button
                variant="default"
                className="flex-1"
                onPress={handleCreate}
                loading={createBusy}
                disabled={!keyName.trim() || !keyUserId}
              >
                {t("settings.apiKeys.create")}
              </Button>
            </View>
          )
        }
      >
        <SheetBody>
          {newKeySecret ? (
            <View className="border border-border bg-muted/30 p-3">
              <Text className="font-mono text-xs text-foreground" selectable>
                {newKeySecret}
              </Text>
            </View>
          ) : (
            <View className="gap-4">
              {/* Name */}
              <View className="gap-1.5">
                <Label>{t("settings.apiKeys.name")}</Label>
                <Input
                  value={keyName}
                  onChangeText={setKeyName}
                  placeholder={t("settings.apiKeys.eGCiPipeline")}
                  autoCapitalize="none"
                  autoFocus
                />
              </View>

              {/* User */}
              <View className="gap-1.5">
                <Label>{t("settings.apiKeys.user")}</Label>
                {users.length === 0 ? (
                  <Text className="text-xs text-muted-foreground">
                    {t("settings.apiKeys.noUsersAvailable")}
                  </Text>
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
                            className={`text-sm ${selected ? "text-accent-text" : "text-foreground"}`}
                          >
                            {u.username}
                          </Text>
                          {u.is_admin ? (
                            <Text className="text-[10px] text-muted-foreground">
                              admin
                            </Text>
                          ) : null}
                        </Pressable>
                      );
                    })}
                  </View>
                )}
              </View>

              {/* Expires At */}
              <View className="gap-1.5">
                <Label>{t("settings.apiKeys.expiresAtOptional")}</Label>
                <Input
                  value={expiresAt}
                  onChangeText={handleExpiresChange}
                  placeholder={t("settings.apiKeys.yyyyMmDd")}
                  keyboardType="number-pad"
                  maxLength={10}
                />
                <Text className="text-[11px] text-muted-foreground">
                  {t("settings.apiKeys.yearMonthDay")}
                </Text>
              </View>
            </View>
          )}
        </SheetBody>
      </Sheet>
    </Screen>
  );
}
