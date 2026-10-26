import { useState, useEffect, useCallback } from "react";
import { View, ScrollView, Pressable, RefreshControl } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  ArrowLeft,
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
  const insets = useSafeAreaInsets();
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
      toast.error("Failed to load sessions");
    }
  }, [client]);

  useEffect(() => {
    load().finally(() => setLoading(false));
  }, [load]);

  const handleRevoke = async (sessionId: string) => {
    try {
      await apiOf(client).users.revokeSession(sessionId);
      setSessions((prev) => prev.filter((s) => s.id !== sessionId));
      toast.success("Session revoked");
    } catch {
      toast.error("Failed to revoke session");
    }
  };

  const handleRevokeAll = async () => {
    if (!userId) return;
    setRevokeAllBusy(true);
    try {
      await apiOf(client).users.revokeAllUserSessions(userId);
      setSessions([]);
      setRevokeAllDialog(false);
      toast.success("All sessions revoked");
    } catch {
      toast.error("Failed to revoke all sessions");
    } finally {
      setRevokeAllBusy(false);
    }
  };

  return (
    <View className="flex-1 bg-background" style={{ paddingTop: insets.top }}>
      <View className="flex-row items-center gap-3 border-b border-border px-4 py-3">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back"
          onPress={() => router.back()}
          hitSlop={8}
        >
          <ArrowLeft size={20} color={color("foreground")} />
        </Pressable>
        <Text weight="bold" className="flex-1 text-base text-foreground">
          Active Sessions
        </Text>
        {sessions.length > 0 ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Sign out all other sessions"
            onPress={() => setRevokeAllDialog(true)}
            hitSlop={8}
          >
            <LogOut size={18} color={color("destructive")} />
          </Pressable>
        ) : null}
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
          {sessions.length === 0 ? (
            <Text className="mt-8 text-center text-sm text-muted-foreground">
              No active sessions found.
            </Text>
          ) : (
            sessions.map((session) => (
              <View
                key={session.id}
                className="flex-row items-start gap-3 border border-border bg-card p-3"
              >
                <View className="mt-0.5">
                  {deviceIcon(
                    session.deviceType,
                    color("muted-foreground") ?? "#aaa",
                  )}
                </View>
                <View className="flex-1 gap-0.5">
                  <Text
                    weight="medium"
                    className="text-sm text-foreground"
                    numberOfLines={1}
                  >
                    {session.deviceInfo ||
                      session.deviceType ||
                      "Unknown device"}
                  </Text>
                  <Text className="text-[11px] text-muted-foreground">
                    Last active {formatDate(session.lastActiveAt)}
                  </Text>
                  <Text className="text-[11px] text-muted-foreground">
                    Created {formatDate(session.createdAt)}
                  </Text>
                </View>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Revoke session"
                  onPress={async () => {
                    const ok = await confirm({
                      title: "Revoke session?",
                      description: "This will sign out that device.",
                      confirmLabel: "Revoke",
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
        title="Revoke all sessions?"
        description="This will sign out every device. You will remain signed in on this device."
        footer={
          <View className="flex-row gap-2">
            <Button
              variant="muted"
              className="flex-1"
              onPress={() => setRevokeAllDialog(false)}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              className="flex-1"
              onPress={handleRevokeAll}
              loading={revokeAllBusy}
            >
              Revoke all
            </Button>
          </View>
        }
      />
    </View>
  );
}
