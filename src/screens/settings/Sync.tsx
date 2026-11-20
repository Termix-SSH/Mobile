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
import { deviceWord } from "@/utils/device-word";
import { t } from "@/i18n";

function since(iso: string | null): string {
  if (!iso) return t("settings.sync.notYet");
  const seconds = Math.max(0, (Date.now() - Date.parse(iso)) / 1000);
  if (seconds < 60) return t("settings.sync.justNow");
  if (seconds < 3600)
    return t("settings.sync.minAgo", { value: Math.floor(seconds / 60) });
  if (seconds < 86400) return `${Math.floor(seconds / 3600)} h ago`;
  return new Date(iso).toLocaleDateString();
}

const STATE_TEXT = {
  idle: t("settings.sync.synced"),
  syncing: t("settings.sync.syncing"),
  offline: t("settings.sync.offline"),
  error: t("settings.sync.stopped"),
  signed_out: t("settings.sync.signedOut"),
  off: t("settings.sync.waitingToSync"),
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
      await sync.syncNow(account.id, { full: true });
      if (sync.get(account.id).state === "off") {
        toast.error(t("settings.sync.signInToThisServer"));
      }
    } finally {
      setBusy(false);
    }
  };

  const toggleKind = async (kindId: string, on: boolean) => {
    try {
      await setKindEnabled(account.id, kindId, on);
    } catch (error) {
      toast.error(toUserMessage(error, t("settings.sync.couldNotChangeThat")));
    }
  };

  return (
    <Screen title={t("settings.sync.sync")} onBack={() => router.back()}>
      {!server ? (
        <View className="flex-1 items-center justify-center p-6">
          <Text className="text-center text-sm text-muted-foreground">
            {t("settings.sync.thisDeviceDoesNotSync")}
          </Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ padding: 12, paddingBottom: 48 }}>
          <Text className="mb-3 text-[11px] text-muted-foreground">
            {t("settings.sync.keepsHostsCredentialsSnippetsAnd", {
              server: accountLabel(server),
              deviceWord,
            })}
          </Text>

          {synced ? (
            <View className="border border-border bg-card px-3">
              <SettingRow
                label={STATE_TEXT[status.state]}
                description={
                  (status.reason ?? server.lastError)
                    ? reason.message
                    : t("settings.sync.lastSynced", {
                        value: since(
                          status.lastSyncAt ?? server.lastSyncAt,
                        ).toLowerCase(),
                      })
                }
              >
                {status.live ? (
                  <Badge variant="success">{t("settings.sync.live")}</Badge>
                ) : null}
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
                  {t("settings.sync.syncNow")}
                </Button>
                {status.reason && reason.fix && reason.fix !== "retry" ? (
                  <Button size="sm" onPress={() => fix(reason.fix!)}>
                    {reason.fixLabel ?? t("settings.sync.fix")}
                  </Button>
                ) : null}
              </View>
            </View>
          ) : (
            <View className="border border-border bg-card p-3">
              <Text className="text-sm text-foreground">
                {t("settings.sync.thisServerReadsLiveAnd", { deviceWord })}
              </Text>
              <Text className="mt-1 text-[11px] text-muted-foreground">
                {t("settings.sync.turnOnTheSyncPlugin", { deviceWord })}
              </Text>
            </View>
          )}

          {synced ? (
            <>
              <Section
                title={t("settings.sync.whatSyncs")}
                hint={t("settings.sync.turnedOffThatDataStays", { deviceWord })}
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
                    title={t("settings.sync.conflicts")}
                    hint={t("settings.sync.changedHereAndOnThe")}
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
                            {t("settings.sync.useServer")}
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
                            {t("settings.sync.keepMine")}
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
                    title={t("settings.sync.notSavedOnTheServer")}
                    hint={t("settings.sync.theServerRefusedTheseChanges", {
                      deviceWord,
                    })}
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
                    {t("settings.sync.tryAgain")}
                  </Button>
                </>
              ) : null}
            </>
          ) : null}

          {client ? (
            <SavedLoginRow key={`login-${client.accountId}`} client={client} />
          ) : null}

          <Section
            title={t("settings.sync.proxy")}
            hint={t("settings.sync.onlyNeededWhenAReverse")}
          />
          {client?.isLoaded() ? (
            <ProxySettings
              key={`proxy-${client.accountId}`}
              client={client}
              onSaved={() => void sync.syncNow(account.id)}
            />
          ) : null}

          <Section title={t("settings.sync.unlink")} />
          <Button variant="destructive" onPress={() => setUnlinkOpen(true)}>
            {t("settings.sync.unlinkThisServer")}
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
