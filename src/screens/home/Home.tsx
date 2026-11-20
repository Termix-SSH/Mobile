import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Pressable,
  RefreshControl,
  ScrollView,
  useWindowDimensions,
  View,
} from "react-native";
import { useFocusEffect } from "expo-router";
import DraggableFlatList, {
  ScaleDecorator,
  type RenderItemParams,
} from "react-native-draggable-flatlist";
import { Check, GripVertical, Pencil } from "lucide-react-native";
import { Screen } from "@/components/Screen";
import { useThemeColor } from "@/contexts/ThemeContext";
import { useAccounts } from "@/core/accounts";
import { useLiveList, useRepositories } from "@/core/data/hooks";
import { useHomeCards } from "@/core/features/hooks";
import type {
  FeatureContext,
  HomeCardDef,
  HomeCardInstance,
} from "@/core/features/types";
import { useHostStatuses } from "@/core/status";
import { HostActionSheet } from "@/screens/hosts/HostActionSheet";
import { useOpenHost, useOpenHostAs } from "@/screens/hosts/useOpenHost";
import {
  AccountButton,
  NotificationsButton,
  SearchButton,
} from "@/screens/shell/AppHeader";
import { openTab } from "@/screens/shell/navigate";
import type { SSHHost } from "@/types";
import { Button, FakeSwitch, Text, useConfirm } from "@/ui";
import { windowInfo } from "@/utils/window-class";
import { CORE_HOME_CARDS } from "./cards";
import { HomeDataContext, type HomeData } from "./HomeData";
import {
  mergeLayout,
  resolveLayout,
  saveHomeLayout,
  useHomeLayout,
  type HomeEntry,
  type HomeSlot,
} from "./layout";
import { ServerReachBanner } from "./ServerReachBanner";
import { t } from "@/i18n";

export { pinnedHosts } from "./cards";

/** A card that can sit on Home: one card def, or one instance of it. */
export interface CardEntry extends HomeEntry {
  def: HomeCardDef;
  title: string;
  instance?: string;
}

/** Every card Home can show for this account, instances filled in. */
export function useCardEntries(
  ctx: FeatureContext,
  featureCards: HomeCardDef[],
  refreshKey: number,
): CardEntry[] {
  const defs = useMemo(
    () =>
      [
        ...CORE_HOME_CARDS.filter((c) => c.isAvailable?.(ctx) ?? true),
        ...featureCards,
      ].sort((a, b) => a.order - b.order),
    [ctx, featureCards],
  );
  const [instances, setInstances] = useState<
    Record<string, HomeCardInstance[]>
  >({});

  useEffect(() => {
    let live = true;
    for (const def of defs) {
      if (!def.instances) continue;
      def
        .instances(ctx)
        .then((list) => {
          if (live) setInstances((prev) => ({ ...prev, [def.id]: list }));
        })
        .catch(() => {
          // Keeps the last list when the source can't be reached.
        });
    }
    return () => {
      live = false;
    };
  }, [defs, ctx, refreshKey]);

  return useMemo(
    () =>
      defs.flatMap((def): CardEntry[] => {
        const defaultOn = def.defaultOn ?? true;
        if (!def.instances) {
          return [
            { key: def.id, order: def.order, defaultOn, def, title: def.title },
          ];
        }
        return (instances[def.id] ?? []).map((inst, index) => ({
          key: `${def.id}:${inst.key}`,
          order: def.order + index / 1000,
          defaultOn: inst.defaultOn ?? defaultOn,
          def,
          title: inst.title || def.title,
          instance: inst.key,
        }));
      }),
    [defs, instances],
  );
}

/** The Home dashboard: cards the user can reorder and hide. */
export default function Home() {
  const repos = useRepositories();
  const { active: account } = useAccounts();
  const color = useThemeColor();
  const confirm = useConfirm();
  const openHostRaw = useOpenHost();
  const openHostAsRaw = useOpenHostAs();
  const { width, height } = useWindowDimensions();
  const twoColumns = windowInfo(width, height).canSplit;
  const [focused, setFocused] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [editing, setEditing] = useState<HomeSlot[] | null>(null);
  const [sheetHost, setSheetHost] = useState<SSHHost | null>(null);
  const hosts = useLiveList(repos.hosts, () => repos.hosts.list(), [repos]);
  const statuses = useHostStatuses(account.id, hosts.data, {
    active: focused,
    refreshKey,
  });
  const { ctx, cards: featureCards } = useHomeCards();
  const entries = useCardEntries(ctx, featureCards, refreshKey);
  const { layout, loaded } = useHomeLayout(account.id);
  const placed = useMemo(
    () => resolveLayout(layout, entries),
    [layout, entries],
  );
  const byKey = useMemo(
    () => new Map(entries.map((e) => [e.key, e])),
    [entries],
  );

  // Cards only poll while Home is the screen in front.
  useFocusEffect(
    useCallback(() => {
      setFocused(true);
      return () => setFocused(false);
    }, []),
  );

  const openHost = useCallback(
    (host: SSHHost) =>
      void openHostRaw(host).then((opened) => !opened && setSheetHost(host)),
    [openHostRaw],
  );
  const openHostAs = useCallback(
    (host: SSHHost, serverTabType: string) =>
      void openHostAsRaw(host, serverTabType).then(
        (opened) => !opened && openHost(host),
      ),
    [openHostAsRaw, openHost],
  );
  const data: HomeData = useMemo(
    () => ({
      hosts: hosts.data,
      hostsLoading: hosts.loading,
      statuses,
      openHost,
      openHostAs,
      showHostMenu: setSheetHost,
    }),
    [hosts.data, hosts.loading, statuses, openHost, openHostAs],
  );

  const toHosts = () => openTab("/(tabs)/hosts");
  const refresh = () => {
    setRefreshing(true);
    setRefreshKey((k) => k + 1);
    setTimeout(() => setRefreshing(false), 600);
  };

  const startEditing = () =>
    setEditing(placed.map((p) => ({ key: p.entry.key, hidden: p.hidden })));
  const finishEditing = () => {
    if (editing) void saveHomeLayout(account.id, mergeLayout(layout, editing));
    setEditing(null);
  };
  const resetLayout = async () => {
    const ok = await confirm({
      title: t("home.resetHome"),
      description: t("home.cardsGoBackToThe"),
      confirmLabel: t("home.reset"),
    });
    if (!ok) return;
    await saveHomeLayout(account.id, null);
    setEditing(null);
  };

  const visible = placed.filter((p) => !p.hidden);
  const renderCard = ({ entry }: { entry: CardEntry }) => {
    const Card = entry.def.component;
    return (
      <Card
        key={`${account.id}:${entry.key}`}
        accountId={account.id}
        active={focused}
        refreshKey={refreshKey}
        instance={entry.instance}
      />
    );
  };
  const columns = twoColumns
    ? [
        visible.filter((_, i) => i % 2 === 0),
        visible.filter((_, i) => i % 2 === 1),
      ]
    : [visible];

  return (
    <Screen
      titleNode={<AccountButton />}
      headerRight={
        <View className="flex-row items-center gap-1">
          {editing ? null : (
            <>
              <NotificationsButton />
              <SearchButton />
            </>
          )}
          <Pressable
            onPress={editing ? finishEditing : startEditing}
            accessibilityRole="button"
            accessibilityLabel={
              editing ? t("home.doneEditingHome") : t("home.editHome")
            }
            hitSlop={8}
            className="h-9 w-9 items-center justify-center active:opacity-60"
          >
            {editing ? (
              <Check size={18} color={color("accent-brand")} />
            ) : (
              <Pencil size={17} color={color("foreground")} />
            )}
          </Pressable>
        </View>
      }
    >
      <HomeDataContext.Provider value={data}>
        {editing ? (
          <EditHome
            slots={editing}
            entries={byKey}
            onChange={setEditing}
            onDone={finishEditing}
            onReset={() => void resetLayout()}
          />
        ) : (
          <ScrollView
            contentContainerStyle={{ padding: 12, gap: 12, paddingBottom: 48 }}
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={refresh} />
            }
          >
            <ServerReachBanner />
            {loaded ? (
              <View className="flex-row gap-3">
                {columns.map((column, index) => (
                  <View key={index} className="min-w-0 flex-1 gap-3">
                    {column.map(renderCard)}
                  </View>
                ))}
              </View>
            ) : null}
          </ScrollView>
        )}
      </HomeDataContext.Provider>
      <HostActionSheet
        host={sheetHost}
        status={sheetHost ? (statuses[sheetHost.id] ?? "unknown") : "unknown"}
        visible={sheetHost !== null}
        onClose={() => setSheetHost(null)}
        onEdit={toHosts}
        onClone={toHosts}
        onDelete={toHosts}
      />
    </Screen>
  );
}

/** Reorder by dragging the grip, show or hide with the switch. */
function EditHome({
  slots,
  entries,
  onChange,
  onDone,
  onReset,
}: {
  slots: HomeSlot[];
  entries: Map<string, CardEntry>;
  onChange: (slots: HomeSlot[]) => void;
  onDone: () => void;
  onReset: () => void;
}) {
  const color = useThemeColor();
  const muted = color("muted-foreground");

  const row = ({ item, drag, isActive }: RenderItemParams<HomeSlot>) => {
    const entry = entries.get(item.key);
    if (!entry) return null;
    const Icon = entry.def.icon;
    const toggle = (on: boolean) =>
      onChange(
        slots.map((s) => (s.key === item.key ? { ...s, hidden: !on } : s)),
      );
    return (
      <ScaleDecorator>
        <View
          className={`flex-row items-center gap-2 border-b border-border pr-3 ${isActive ? "bg-muted" : "bg-card"}`}
        >
          <Pressable
            onPressIn={drag}
            accessibilityLabel={t("home.dragToReorder", { title: entry.title })}
            className="h-12 w-10 items-center justify-center"
          >
            <GripVertical size={16} color={muted} />
          </Pressable>
          <Icon size={16} color={muted} />
          <View className="min-w-0 flex-1">
            <Text className="text-sm text-foreground" numberOfLines={1}>
              {entry.title}
            </Text>
            {entry.instance ? (
              <Text className="text-[11px] text-muted-foreground">
                {entry.def.title}
              </Text>
            ) : null}
          </View>
          <FakeSwitch
            checked={!item.hidden}
            onChange={toggle}
            accessibilityLabel={t("home.show", { title: entry.title })}
          />
        </View>
      </ScaleDecorator>
    );
  };

  return (
    <View className="flex-1">
      <Text className="px-4 py-3 text-[11px] text-muted-foreground">
        {t("home.dragCardsToReorderThem")}
      </Text>
      <View className="flex-1 border-t border-border">
        <DraggableFlatList
          data={slots.filter((s) => entries.has(s.key))}
          keyExtractor={(s) => s.key}
          renderItem={row}
          onDragEnd={({ data: moved }) => {
            const hiddenAway = slots.filter((s) => !entries.has(s.key));
            onChange([...moved, ...hiddenAway]);
          }}
        />
      </View>
      <View className="flex-row gap-2 border-t border-border bg-background px-3 py-3">
        <View className="flex-1">
          <Button variant="ghost" onPress={onReset}>
            {t("home.resetToDefault")}
          </Button>
        </View>
        <View className="flex-1">
          <Button onPress={onDone}>{t("home.done")}</Button>
        </View>
      </View>
    </View>
  );
}
