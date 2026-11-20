import { useCallback, useEffect, useState } from "react";
import { RefreshControl, ScrollView, View } from "react-native";
import { useRouter } from "expo-router";
import { Blocks, TriangleAlert } from "lucide-react-native";
import {
  accountLabel,
  accounts as accountStore,
  useAccounts,
  useClient,
} from "@/core/accounts";
import {
  PLUGIN_HOST_API,
  fitMessage,
  isNoise,
  modeLabel,
  serverRows,
  stateLabel,
  useSupportRows,
  type SupportRow,
  type SupportSection,
} from "@/core/plugins";
import { features } from "@/core/features";
import { framePlugin } from "@/core/plugins/webview";
import {
  Badge,
  Button,
  EmptyState,
  InlineView,
  ListRow,
  Tabs,
  Text,
} from "@/ui";
import { toast } from "@/utils/toast";
import type { ListRowTone } from "@/ui";
import { useThemeColor } from "@/contexts/ThemeContext";
import { Screen } from "@/components/Screen";
import { deviceWord } from "@/utils/device-word";
import { t } from "@/i18n";

const SECTIONS: { id: SupportSection; label: string; tone: ListRowTone }[] = [
  {
    id: "phone",
    label: t("settings.plugins.worksOnThis", { deviceWord }),
    tone: "brand",
  },
  { id: "server", label: t("settings.plugins.needsTheServer"), tone: "muted" },
  { id: "absent", label: t("settings.plugins.notInTheApp"), tone: "none" },
];

type ListMode = "server" | "all";

/** Something the user or an admin has to fix, shown before anything else. */
function problem(row: SupportRow): string | null {
  if (row.needsNewerApp || row.fit === "update-app") {
    return t("settings.plugins.needsANewerVersionOf");
  }
  if (row.fit === "update-plugin")
    return t("settings.plugins.updateThePluginOnThe");
  if (row.server === "failed") return stateLabel(row);
  return null;
}

function serverTone(row: SupportRow): ListRowTone {
  if (problem(row)) return "warning";
  return row.server === "on" ? "brand" : "muted";
}

function Section({
  label,
  rows,
  tone,
  onOpen,
}: {
  label: string;
  rows: SupportRow[];
  tone: (row: SupportRow) => ListRowTone;
  onOpen: (row: SupportRow) => void;
}) {
  if (rows.length === 0) return null;
  return (
    <View className="mb-5">
      <Text
        weight="medium"
        className="mb-1.5 px-1 text-[11px] uppercase tracking-wider text-muted-foreground"
      >
        {label} ({rows.length})
      </Text>
      <View className="border border-border">
        {rows.map((row, index) => (
          <ListRow
            key={row.id}
            index={index}
            tone={tone(row)}
            title={row.name}
            meta={row.note ? `${row.status} | ${row.note}` : row.status}
            onPress={() => onOpen(row)}
          />
        ))}
      </View>
    </View>
  );
}

function ServerList({
  rows,
  onOpen,
}: {
  rows: SupportRow[];
  onOpen: (row: SupportRow) => void;
}) {
  return (
    <View className="border border-border">
      {rows.map((row, index) => {
        const issue = problem(row);
        const parts = [stateLabel(row), modeLabel(row.mode)];
        if (issue && issue !== parts[0]) parts.push(issue);
        return (
          <ListRow
            key={row.id}
            index={index}
            tone={serverTone(row)}
            dimmed={row.server === "off"}
            title={row.name}
            badges={
              row.version ? <Badge variant="muted">{row.version}</Badge> : null
            }
            meta={parts.join(" | ")}
            onPress={() => onOpen(row)}
          />
        );
      })}
    </View>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <View className="flex-row gap-3 border-b border-border/40 py-2">
      <Text className="w-36 text-meta text-muted-foreground">{label}</Text>
      <Text className="flex-1 text-meta text-foreground">{value}</Text>
    </View>
  );
}

function Detail({
  row,
  local,
  onOpen,
}: {
  row: SupportRow;
  local: boolean;
  onOpen?: () => void;
}) {
  const color = useThemeColor();
  const misfit = row.needsNewerApp
    ? fitMessage("update-app", row.name)
    : fitMessage(row.fit, row.name);
  const talksToApp = row.mode === "webview" || row.mode === "native";
  return (
    <>
      {misfit ? (
        <View className="flex-row gap-2 border border-warning/40 bg-warning/10 p-3">
          <TriangleAlert size={16} color={color("warning")} />
          <View className="flex-1 gap-1">
            <Text weight="bold" className="text-sm text-foreground">
              {misfit.title}
            </Text>
            <Text className="text-meta text-muted-foreground">
              {misfit.hint}
            </Text>
          </View>
        </View>
      ) : null}
      <View>
        <Fact label={t("settings.plugins.inTheApp")} value={row.status} />
        {local ? null : (
          <Fact
            label={t("settings.plugins.onThisServer")}
            value={stateLabel(row) || "Unknown"}
          />
        )}
        {row.version ? (
          <Fact label={t("settings.plugins.version")} value={row.version} />
        ) : null}
        {talksToApp && !local ? (
          <>
            <Fact
              label={t("settings.plugins.needsPluginApi")}
              value={row.engineApi ?? t("settings.plugins.notSentByThisServer")}
            />
            <Fact
              label={t("settings.plugins.thisAppHas")}
              value={PLUGIN_HOST_API}
            />
          </>
        ) : null}
        {row.note ? (
          <Fact label={t("settings.plugins.note")} value={row.note} />
        ) : null}
      </View>
      {onOpen ? (
        <Button onPress={onOpen}>{t("settings.plugins.open")}</Button>
      ) : null}
    </>
  );
}

/** What each plugin does on this phone, and what the linked server runs. */
export default function Plugins() {
  const router = useRouter();
  const color = useThemeColor();
  const { accounts, active } = useAccounts();
  const [accountId, setAccountId] = useState(active.id);
  const account = accounts.find((a) => a.id === accountId) ?? active;
  const client = useClient(account.id);
  const rows = useSupportRows(account.id);
  const [view, setView] = useState<ListMode>("server");
  const [openId, setOpenId] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const local = account.kind === "local";

  const refresh = useCallback(async () => {
    const target = accountStore.client(account.id);
    if (!target) return;
    setRefreshing(true);
    try {
      await target.refreshEnabledPlugins();
    } finally {
      setRefreshing(false);
    }
  }, [account.id]);

  // An admin may have just turned something on or off.
  useEffect(() => {
    void accountStore.client(account.id)?.refreshEnabledPlugins();
  }, [account.id]);

  // A plugin that opens in the app opens from here too.
  const openAction = (row: SupportRow) => {
    if (row.mode !== "webview" || row.server !== "on" || row.fit !== "ok") {
      return undefined;
    }
    const entry = client?.serverPlugins?.find((p) => p.id === row.id);
    const plugin = entry ? framePlugin(entry, features, "phone") : null;
    if (!plugin) return undefined;
    const screen = plugin.views.find((v) => !v.host);
    return () => {
      if (!screen) {
        toast.info(t("settings.plugins.openFromAHostS", { name: plugin.name }));
        return;
      }
      setOpenId(null);
      router.push({
        pathname: "/tabs/plugins/[pluginId]",
        params: { pluginId: plugin.id, view: screen.view, account: account.id },
      });
    };
  };

  const listed = serverRows(rows, client?.serverPlugins ?? null);
  const showing = local ? "all" : view;
  const opened = rows.find((row) => row.id === openId) ?? null;

  return (
    <Screen title={t("settings.plugins.plugins")} onBack={() => router.back()}>
      {accounts.length > 1 ? (
        <Tabs
          fill={false}
          options={accounts.map((a) => ({ id: a.id, label: accountLabel(a) }))}
          value={account.id}
          onChange={(id) => {
            setAccountId(id);
            setOpenId(null);
          }}
        />
      ) : null}

      {local ? null : (
        <Tabs
          size="sm"
          options={[
            {
              id: "server" as const,
              label: t("settings.plugins.onThisServer"),
            },
            { id: "all" as const, label: t("settings.plugins.everything") },
          ]}
          value={view}
          onChange={setView}
        />
      )}

      <ScrollView
        contentContainerStyle={{ padding: 12, paddingBottom: 40 }}
        refreshControl={
          local ? undefined : (
            <RefreshControl
              refreshing={refreshing}
              onRefresh={refresh}
              tintColor={color("muted-foreground")}
              colors={[color("muted-foreground")]}
            />
          )
        }
      >
        <Text className="mb-4 text-[11px] text-muted-foreground">
          {local
            ? t("settings.plugins.thisDeviceWorksWithNo")
            : showing === "server"
              ? t("settings.plugins.pluginsOnAndHowEach", {
                  account: accountLabel(account),
                })
              : t("settings.plugins.whatRunsOnThisAnd", {
                  deviceWord,
                  account: accountLabel(account),
                })}
        </Text>
        {showing === "server" ? (
          listed.length === 0 ? (
            <EmptyState
              icon={Blocks}
              title={t("settings.plugins.noPluginList")}
              hint={
                client?.isPluginApi()
                  ? t("settings.plugins.theServerDidNotSend")
                  : t("settings.plugins.serversOlderThan29")
              }
            />
          ) : (
            <ServerList rows={listed} onOpen={(row) => setOpenId(row.id)} />
          )
        ) : rows.length === 0 ? (
          <EmptyState
            icon={Blocks}
            title={t("settings.plugins.nothingToShow")}
          />
        ) : (
          SECTIONS.map((section) => (
            <Section
              key={section.id}
              label={section.label}
              rows={rows.filter(
                (row) => row.section === section.id && !isNoise(row),
              )}
              tone={(row) => (problem(row) ? "warning" : section.tone)}
              onOpen={(row) => setOpenId(row.id)}
            />
          ))
        )}
      </ScrollView>

      <InlineView
        open={!!opened}
        onClose={() => setOpenId(null)}
        title={opened?.name ?? ""}
        subtitle={opened ? modeLabel(opened.mode) : undefined}
      >
        {opened ? (
          <Detail row={opened} local={local} onOpen={openAction(opened)} />
        ) : null}
      </InlineView>
    </Screen>
  );
}
