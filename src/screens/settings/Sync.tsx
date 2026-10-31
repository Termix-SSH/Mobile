import { useState } from "react";
import { ScrollView, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { RefreshCw } from "lucide-react-native";
import {
  accountLabel,
  accounts,
  isServerAccount,
  useAccounts,
  useClient,
} from "@/core/accounts";
import { toUserMessage } from "@/core/errors";
import {
  describeReason,
  kindsOf,
  resolveConflict,
  retryRejected,
  rowLabel,
  setKindEnabled,
  sync,
  SYNC_KINDS,
  typeLabel,
  useAccountSync,
  useSyncIssues,
} from "@/core/sync";
import { useAppContext } from "@/contexts/AppContext";
import { useThemeColor } from "@/contexts/ThemeContext";
import {
  Badge,
  Button,
  FakeSwitch,
  SectionLabel,
  SettingRow,
  Text,
} from "@/ui";
import { toast } from "@/utils/toast";
import { ProxySettings } from "@/screens/accounts/ProxySettings";
import { SavedLoginRow } from "@/screens/accounts/SavedLoginRow";
import { UnlinkSheet } from "@/screens/accounts/UnlinkSheet";
import { useSyncFix } from "@/screens/accounts/useSyncFix";
import { Screen } from "@/components/Screen";

function since(iso: string | null): string {
  if (!iso) return "Not yet";
  const seconds = Math.max(0, (Date.now() - Date.parse(iso)) / 1000);
  if (seconds < 60) return "Just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)} min ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)} h ago`;
  return new Date(iso).toLocaleDateString();
}

const STATE_TEXT = {
  idle: "Synced",
  syncing: "Syncing",
  offline: "Offline",
  error: "Stopped",
  signed_out: "Signed out",
  off: "Waiting to sync",
} as const;

function Section({ title, hint }: { title: string; hint?: string }) {
  return (
    <SectionLabel hint={hint} className="mb-2 mt-6">
      {title}
    </SectionLabel>
  );
}

/** Sync status and settings of a linked server: the one in the link, else the active one. */
export default function SyncSettings() {
  const router = useRouter();
  const color = useThemeColor();
  const params = useLocalSearchParams<{ account?: string }>();
  const { accounts: list, active } = useAccounts();
  const account = list.find((a) => a.id === params.account) ?? active;
  const client = useClient(account.id);
  const status = useAccountSync(account.id);
  const { conflicts, rejected } = useSyncIssues(account.id);
  const { openAuthFlow } = useAppContext();
  const { fix, overlay } = useSyncFix(account.id, async () => {
    // Signing in works on the active account.
    if (account.id !== active.id) await accounts.setActive(account.id);
    openAuthFlow("login");
  });
  const [unlinkOpen, setUnlinkOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const server = isServerAccount(account) ? account : null;
  const synced = server?.options.sync === true;
  const offKinds = new Set(server ? kindsOf(server.disabledTypes) : []);
  const reason = describeReason(status.reason ?? server?.lastError);

  const syncNow = async () => {
    setBusy(true);
    try {
      await sync.syncNow(account.id);
      if (sync.get(account.id).state === "off") {
        toast.error("Sign in to this server again to sync");
      }
    } finally {
      setBusy(false);
    }
  };

  const toggleKind = async (kindId: string, on: boolean) => {
    try {
      await setKindEnabled(account.id, kindId, on);
    } catch (error) {
      toast.error(toUserMessage(error, "Could not change that"));
    }
  };

  return (
    <Screen title="Sync" onBack={() => router.back()}>
      {!server ? (
        <View className="flex-1 items-center justify-center p-6">
          <Text className="text-center text-sm text-muted-foreground">
            This device does not sync. Link a Termix server to keep your hosts
            on more than one device.
          </Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ padding: 12, paddingBottom: 48 }}>
          <Text className="mb-3 text-[11px] text-muted-foreground">
            {accountLabel(server)} keeps hosts, credentials, snippets and
            settings in step with this phone. A copy stays on this phone, so it
            works offline too.
          </Text>

          {synced ? (
            <View className="border border-border bg-card px-3">
              <SettingRow
                label={STATE_TEXT[status.state]}
                description={
                  (status.reason ?? server.lastError)
                    ? reason.message
                    : `Last synced ${since(
                        status.lastSyncAt ?? server.lastSyncAt,
                      ).toLowerCase()}`
                }
              >
                {status.live ? <Badge variant="success">Live</Badge> : null}
              </SettingRow>
              <View className="flex-row gap-2 py-3">
                <Button
                  variant="muted"
                  size="sm"
                  icon={<RefreshCw size={14} color={color("foreground")} />}
                  loading={busy || status.state === "syncing"}
                  onPress={() => void syncNow()}
                  disabled={status.state === "signed_out"}
                >
                  Sync now
                </Button>
                {status.reason && reason.fix && reason.fix !== "retry" ? (
                  <Button size="sm" onPress={() => fix(reason.fix!)}>
                    {reason.fixLabel ?? "Fix"}
                  </Button>
                ) : null}
              </View>
            </View>
          ) : (
            <View className="border border-border bg-card p-3">
              <Text className="text-sm text-foreground">
                This server reads live and keeps no copy on the phone.
              </Text>
              <Text className="mt-1 text-[11px] text-muted-foreground">
                {
                  "Turn on the Sync plugin in the server's Plugins page, then sign in again here to keep a copy on this phone."
                }
              </Text>
            </View>
          )}

          {synced ? (
            <>
              <Section
                title="What syncs"
                hint="Turned off, that data stays on this phone only."
              />
              <View className="border border-border bg-card px-3">
                {SYNC_KINDS.map((kind, index) => (
                  <SettingRow
                    key={kind.id}
                    label={kind.label}
                    description={kind.description}
                    last={index === SYNC_KINDS.length - 1}
                  >
                    <FakeSwitch
                      checked={!offKinds.has(kind.id)}
                      onChange={(on) => void toggleKind(kind.id, on)}
                      accessibilityLabel={kind.label}
                    />
                  </SettingRow>
                ))}
              </View>

              {conflicts.length ? (
                <>
                  <Section
                    title="Conflicts"
                    hint="Changed here and on the server at the same time. The server's version was kept."
                  />
                  <View className="border border-border bg-card px-3">
                    {conflicts.map((conflict, index) => (
                      <SettingRow
                        key={conflict.id}
                        label={rowLabel(conflict.localRow)}
                        description={typeLabel(conflict.entityType)}
                        last={index === conflicts.length - 1}
                      >
                        <View className="flex-row gap-1">
                          <Button
                            variant="ghost"
                            size="xs"
                            onPress={() =>
                              void resolveConflict(
                                account.id,
                                conflict.id,
                                "server",
                              )
                            }
                          >
                            Use server
                          </Button>
                          <Button
                            variant="muted"
                            size="xs"
                            onPress={() =>
                              void resolveConflict(
                                account.id,
                                conflict.id,
                                "mine",
                              )
                            }
                          >
                            Keep mine
                          </Button>
                        </View>
                      </SettingRow>
                    ))}
                  </View>
                </>
              ) : null}

              {rejected.length ? (
                <>
                  <Section
                    title="Not saved on the server"
                    hint="The server refused these changes. They stay on this phone."
                  />
                  <View className="border border-border bg-card px-3">
                    {rejected.map((record, index) => (
                      <SettingRow
                        key={`${record.entityType}:${record.syncId}`}
                        label={typeLabel(record.entityType)}
                        description={record.error ?? undefined}
                        last={index === rejected.length - 1}
                      >
                        <Text className="text-[11px] text-muted-foreground">
                          {record.syncId.slice(0, 8)}
                        </Text>
                      </SettingRow>
                    ))}
                  </View>
                  <Button
                    variant="muted"
                    className="mt-2"
                    onPress={() => void retryRejected(account.id)}
                  >
                    Try again
                  </Button>
                </>
              ) : null}
            </>
          ) : null}

          {client ? (
            <SavedLoginRow key={`login-${client.accountId}`} client={client} />
          ) : null}

          <Section
            title="Proxy"
            hint="Only needed when a reverse proxy sits in front of the server."
          />
          {client?.isLoaded() ? (
            <ProxySettings
              key={`proxy-${client.accountId}`}
              client={client}
              onSaved={() => void sync.syncNow(account.id)}
            />
          ) : null}

          <Section title="Unlink" />
          <Button variant="destructive" onPress={() => setUnlinkOpen(true)}>
            Unlink this server
          </Button>
        </ScrollView>
      )}

      {overlay}
      <UnlinkSheet
        account={server}
        visible={unlinkOpen}
        onClose={() => setUnlinkOpen(false)}
        onDone={() => router.back()}
      />
    </Screen>
  );
}
