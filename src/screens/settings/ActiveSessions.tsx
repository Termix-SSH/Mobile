import { useState, useEffect, useCallback } from "react";
import { View, ScrollView, Pressable, RefreshControl } from "react-native";
import { useRouter } from "expo-router";
import {
  Monitor,
  Smartphone,
  Globe,
  Trash2,
  LogOut,
} from "lucide-react-native";
import { Text, Button, Sheet, useConfirm } from "@/ui";
import { useThemeColor } from "@/contexts/ThemeContext";
import { toast } from "@/utils/toast";
import { apiOf, useActiveClient } from "@/core/accounts";
import { Screen } from "@/components/Screen";
import { t } from "@/i18n";

interface Session {
  id: string;
  userId: string;
  username?: string;
  deviceType: string;
  deviceInfo: string;
  createdAt: string;
  expiresAt: string;
  lastActiveAt: string;
  jwtToken: string;
  isRevoked?: boolean;
}

function deviceIcon(deviceType: string, color: string) {
  const type = (deviceType ?? "").toLowerCase();
  if (type.includes("mobile") || type.includes("app"))
    return <Smartphone size={16} color={color} />;
  if (type.includes("desktop") || type.includes("electron"))
    return <Monitor size={16} color={color} />;
  return <Globe size={16} color={color} />;
}

function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

export default function ActiveSessions() {
  const client = useActiveClient();
  const router = useRouter();
  const confirm = useConfirm();
  const color = useThemeColor();

  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [revokeAllDialog, setRevokeAllDialog] = useState(false);
  const [revokeAllBusy, setRevokeAllBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const [sessRes, userRes] = await Promise.all([
        apiOf(client).users.getSessions(),
        apiOf(client).auth.getUserInfo(),
      ]);
      setSessions(sessRes?.sessions ?? []);
      setUserId(userRes?.userId ?? null);
    } catch {
      toast.error(t("settings.activeSessions.failedToLoadSessions"));
    }
  }, [client]);

  useEffect(() => {
    load().finally(() => setLoading(false));
  }, [load]);

  const handleRevoke = async (sessionId: string) => {
    try {
      await apiOf(client).users.revokeSession(sessionId);
      setSessions((prev) => prev.filter((s) => s.id !== sessionId));
      toast.success(t("settings.activeSessions.sessionRevoked"));
    } catch {
      toast.error(t("settings.activeSessions.failedToRevokeSession"));
    }
  };

  const handleRevokeAll = async () => {
    if (!userId) return;
    setRevokeAllBusy(true);
    try {
      await apiOf(client).users.revokeAllUserSessions(userId);
      setSessions([]);
      setRevokeAllDialog(false);
      toast.success(t("settings.activeSessions.allSessionsRevoked"));
    } catch {
      toast.error(t("settings.activeSessions.failedToRevokeAllSessions"));
    } finally {
      setRevokeAllBusy(false);
    }
  };

  return (
    <Screen
      title={t("settings.activeSessions.activeSessions")}
      onBack={() => router.back()}
      headerRight={
        sessions.length > 0 ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t(
              "settings.activeSessions.signOutAllOtherSessions",
            )}
            onPress={() => setRevokeAllDialog(true)}
            hitSlop={8}
            className="h-9 w-9 items-center justify-center"
          >
            <LogOut size={18} color={color("destructive")} />
          </Pressable>
        ) : null
      }
    >
      {loading ? (
        <View className="flex-1 items-center justify-center">
          <Text className="text-sm text-muted-foreground">
            {t("settings.activeSessions.loading")}
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
          {sessions.length === 0 ? (
            <Text className="mt-8 text-center text-sm text-muted-foreground">
              {t("settings.activeSessions.noActiveSessionsFound")}
            </Text>
          ) : (
            sessions.map((session) => (
              <View
                key={session.id}
                className="flex-row items-start gap-3 border border-border bg-card p-3"
              >
                <View className="mt-0.5">
                  {deviceIcon(session.deviceType, color("muted-foreground"))}
                </View>
                <View className="flex-1 gap-0.5">
                  <Text
                    weight="medium"
                    className="text-sm text-foreground"
                    numberOfLines={1}
                  >
                    {session.deviceInfo ||
                      session.deviceType ||
                      t("settings.activeSessions.unknownDevice")}
                  </Text>
                  <Text className="text-[11px] text-muted-foreground">
                    {t("settings.activeSessions.lastActive", {
                      lastActiveAt: formatDate(session.lastActiveAt),
                    })}
                  </Text>
                  <Text className="text-[11px] text-muted-foreground">
                    {t("settings.activeSessions.created", {
                      createdAt: formatDate(session.createdAt),
                    })}
                  </Text>
                </View>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={t(
                    "settings.activeSessions.revokeSession",
                  )}
                  onPress={async () => {
                    const ok = await confirm({
                      title: t("settings.activeSessions.revokeSession2"),
                      description: t(
                        "settings.activeSessions.thisWillSignOutThat",
                      ),
                      confirmLabel: t("settings.activeSessions.revoke"),
                    });
                    if (ok) handleRevoke(session.id);
                  }}
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

      <Sheet
        scroll
        visible={revokeAllDialog}
        onClose={() => setRevokeAllDialog(false)}
        icon={<LogOut size={20} color={color("destructive")} />}
        title={t("settings.activeSessions.revokeAllSessions")}
        description={t("settings.activeSessions.thisWillSignOutEvery")}
        footer={
          <View className="flex-row gap-2">
            <Button
              variant="muted"
              className="flex-1"
              onPress={() => setRevokeAllDialog(false)}
            >
              {t("settings.activeSessions.cancel")}
            </Button>
            <Button
              variant="destructive"
              className="flex-1"
              onPress={handleRevokeAll}
              loading={revokeAllBusy}
            >
              {t("settings.activeSessions.revokeAll")}
            </Button>
          </View>
        }
      />
    </Screen>
  );
}
