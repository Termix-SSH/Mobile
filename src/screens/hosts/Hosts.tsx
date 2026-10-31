import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  View,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  AlertTriangle,
  ArrowUpDown,
  Check,
  Download,
  Filter,
  FolderInput,
  GripVertical,
  KeyRound,
  ListChecks,
  ListTree,
  MoreVertical,
  Pin,
  PinOff,
  Plus,
  Radar,
  RefreshCw,
  Search,
  Server,
  SlidersHorizontal,
  SquareTerminal,
  Trash2,
  X,
  Zap,
} from "lucide-react-native";
import { Screen } from "@/components/Screen";
import { useAppContext } from "@/contexts/AppContext";
import { useThemeColor } from "@/contexts/ThemeContext";
import { useTerminalSessions } from "@/contexts/TerminalSessionsContext";
import {
  useCapability,
  useHostFilters,
  useSettingsLinks,
} from "@/core/features";
import { TailscaleDevices } from "@/features/tailscale/TailscaleDevices";
import CredentialListModal from "@/screens/hosts/CredentialListModal";
import { HostActionSheet } from "@/screens/hosts/HostActionSheet";
import HostEditor from "@/screens/hosts/editor/HostEditor";
import { ParentHostSheet } from "@/screens/hosts/editor/ParentHostField";
import { QuickConnect } from "@/screens/hosts/QuickConnect";
import { SyncBanner } from "@/screens/hosts/SyncBanner";
import { ServerReachBanner } from "@/screens/home/ServerReachBanner";
import { HostList } from "@/screens/hosts/navigation/HostList";
import {
  DEFAULT_FILTERS,
  applyFilters,
  buildHostTree,
  collectAllTags,
  collectFolderPaths,
  collectMatchingFolderPaths,
  filterTreeByQuery,
  filtersActive,
  flattenTree,
  sortHostTree,
  type FilterState,
  type SortKey,
} from "@/screens/hosts/navigation/hostTree";
import {
  HOST_LIST_FIELDS,
  setHostListPrefs,
  useHostListPrefs,
} from "@/core/host-list-prefs";
import { useHostsData } from "@/screens/hosts/useHostsData";
import { useOpenHost } from "@/screens/hosts/useOpenHost";
import { AccountButton, SearchButton } from "@/screens/shell/AppHeader";
import type { SSHHost } from "@/types";
import {
  Button,
  Checkbox,
  EmptyState,
  FakeSwitch,
  Input,
  PromptSheet,
  Sheet,
  SheetBody,
  SheetRow,
  SettingRow,
  Text,
  useConfirm,
} from "@/ui";
import { isSshHost } from "@/utils/hosts";
import { useDebouncedValue, useStableCallback } from "@/utils/hooks";
import { toast } from "@/utils/toast";

const SORT_OPTIONS: { id: SortKey; label: string }[] = [
  { id: "default", label: "Default (your order)" },
  { id: "name-asc", label: "Name (A-Z)" },
  { id: "name-desc", label: "Name (Z-A)" },
  { id: "ip-asc", label: "IP (ascending)" },
  { id: "ip-desc", label: "IP (descending)" },
  { id: "status-online", label: "Online first" },
  { id: "status-offline", label: "Offline first" },
  { id: "pinned", label: "Pinned first" },
];

const FILTER_GROUPS: {
  group: keyof FilterState;
  title: string;
  options: { value: string; label: string }[];
}[] = [
  {
    group: "status",
    title: "Status",
    options: [
      { value: "online", label: "Online" },
      { value: "offline", label: "Offline" },
      { value: "pinned", label: "Pinned" },
    ],
  },
  {
    group: "protocol",
    title: "Protocol",
    options: [{ value: "ssh", label: "SSH" }],
  },
  { group: "features", title: "Features", options: [] },
];

const NO_SELECTION = new Set<number>();
const refusedDrop = () =>
  toast.error("Hosts can only move inside their own folder");

const STORAGE_SORT = "hostSortKey";
const STORAGE_FILTER = "hostFilterState";
const STORAGE_EXPANDED = "hostExpandedFolders";
const STORAGE_COLLAPSED_HOSTS = "hostCollapsedSubHosts";

/** Most terminals one bulk open starts, so a big selection can't flood the phone. */
export const BULK_OPEN_LIMIT = 8;

export default function Hosts() {
  const color = useThemeColor();
  const muted = color("muted-foreground");
  const router = useRouter();
  const confirm = useConfirm();
  const { openAuthFlow } = useAppContext();
  const { navigateToSessions } = useTerminalSessions();
  const openHost = useOpenHost();
  const hostFilters = useHostFilters();
  const settingsLinks = useSettingsLinks();
  const canQuickConnect = useCapability("host.quickConnect");
  const tailscaleAvailable = useCapability("hosts.discovery");
  const data = useHostsData();
  const { repos, hosts, getHostStatus, metrics } = data;

  const [searchQuery, setSearchQuery] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("default");
  const [filterState, setFilterState] = useState<FilterState>(DEFAULT_FILTERS);
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set());
  // Hosts whose sub-hosts are hidden. Sub-hosts show by default.
  const [collapsedHosts, setCollapsedHosts] = useState<Set<number>>(new Set());
  const [prefsLoaded, setPrefsLoaded] = useState(false);
  const [sheet, setSheet] = useState<
    "sort" | "filter" | "more" | "customize" | null
  >(null);
  const listPrefs = useHostListPrefs();
  const [sheetHost, setSheetHost] = useState<SSHHost | null>(null);
  const [formHost, setFormHost] = useState<SSHHost | null>(null);
  const [formDraft, setFormDraft] = useState<Partial<SSHHost>>();
  const [formOpen, setFormOpen] = useState(false);
  const [quickConnectOpen, setQuickConnectOpen] = useState(false);
  const [tailscaleDevicesOpen, setTailscaleDevicesOpen] = useState(false);
  const [credentialListOpen, setCredentialListOpen] = useState(false);
  const [selected, setSelected] = useState<Set<number> | null>(null);
  const [moving, setMoving] = useState(false);
  const [nesting, setNesting] = useState(false);
  const [reorder, setReorder] = useState(false);

  const pendingTailscaleFormRef = useRef(false);
  // Set once folders were opened or closed, so a reload keeps that choice.
  const expansionInitializedRef = useRef(false);

  const openCreate = useCallback(() => {
    setFormHost(null);
    setFormDraft(undefined);
    setFormOpen(true);
  }, []);

  // The palette and Home link here with ?action=new or ?action=quick.
  const { action } = useLocalSearchParams<{ action?: string }>();
  useEffect(() => {
    if (!action) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (action === "new") openCreate();
    else if (action === "quick") setQuickConnectOpen(true);
    router.setParams({ action: undefined });
  }, [action, openCreate, router]);

  useEffect(() => {
    (async () => {
      try {
        const [savedSort, savedFilter, savedExpanded, savedCollapsed] =
          await Promise.all([
            AsyncStorage.getItem(STORAGE_SORT),
            AsyncStorage.getItem(STORAGE_FILTER),
            AsyncStorage.getItem(STORAGE_EXPANDED),
            AsyncStorage.getItem(STORAGE_COLLAPSED_HOSTS),
          ]);
        if (savedCollapsed) {
          setCollapsedHosts(new Set(JSON.parse(savedCollapsed) as number[]));
        }
        if (savedSort) setSortKey(savedSort as SortKey);
        if (savedFilter) setFilterState(JSON.parse(savedFilter) as FilterState);
        if (savedExpanded) {
          setExpandedPaths(new Set(JSON.parse(savedExpanded) as string[]));
          expansionInitializedRef.current = true;
        }
      } catch {
        // best effort
      } finally {
        setPrefsLoaded(true);
      }
    })();
  }, []);

  const tree = useMemo(
    () => buildHostTree(hosts, data.folderColors),
    [hosts, data.folderColors],
  );
  // Waits for typing to stop, so a big list is filtered once per word.
  const q = useDebouncedValue(searchQuery, 150).trim().toLowerCase();

  const filterGroups = useMemo(
    () =>
      FILTER_GROUPS.map((grp) => ({
        ...grp,
        options: [
          ...grp.options,
          ...hostFilters
            .filter((f) => f.group === grp.group)
            .map((f) => ({ value: f.value, label: f.label })),
        ],
      })),
    [hostFilters],
  );

  const visibleTree = useMemo(() => {
    const matchers = Object.fromEntries(
      hostFilters.map((f) => [f.value, f.matches]),
    );
    const known = new Set(["ssh", ...hostFilters.map((f) => f.value)]);
    const activeFilters = {
      ...filterState,
      protocol: filterState.protocol.filter((v) => known.has(v)),
      features: filterState.features.filter((v) => known.has(v)),
    };
    let nodes = applyFilters(tree, activeFilters, getHostStatus, matchers);
    nodes = filterTreeByQuery(nodes, q);
    return sortHostTree(nodes, sortKey, getHostStatus);
  }, [tree, filterState, q, sortKey, getHostStatus, hostFilters]);

  // Open every folder the first time hosts load.
  useEffect(() => {
    if (!prefsLoaded || expansionInitializedRef.current) return;
    if (tree.length === 0) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setExpandedPaths(new Set(collectFolderPaths(tree)));
    expansionInitializedRef.current = true;
  }, [prefsLoaded, tree]);

  // A search opens matching folders without changing the saved set.
  const effectiveExpanded = useMemo(() => {
    if (!q) return expandedPaths;
    const next = new Set(expandedPaths);
    collectMatchingFolderPaths(tree, q).forEach((p) => next.add(p));
    return next;
  }, [q, expandedPaths, tree]);

  // A search shows every matching sub-host.
  const rows = useMemo(
    () =>
      flattenTree(
        visibleTree,
        effectiveExpanded,
        q ? NO_SELECTION : collapsedHosts,
      ),
    [visibleTree, effectiveExpanded, q, collapsedHosts],
  );

  const toggleHost = useCallback((hostId: number) => {
    setCollapsedHosts((prev) => {
      const next = new Set(prev);
      if (next.has(hostId)) next.delete(hostId);
      else next.add(hostId);
      AsyncStorage.setItem(
        STORAGE_COLLAPSED_HOSTS,
        JSON.stringify([...next]),
      ).catch(() => {});
      return next;
    });
  }, []);

  const toggleFolder = useCallback((path: string) => {
    setExpandedPaths((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      AsyncStorage.setItem(STORAGE_EXPANDED, JSON.stringify([...next])).catch(
        () => {},
      );
      return next;
    });
  }, []);

  const saveFilters = (next: FilterState) => {
    setFilterState(next);
    AsyncStorage.setItem(STORAGE_FILTER, JSON.stringify(next)).catch(() => {});
  };
  const toggleFilter = (group: keyof FilterState, value: string) => {
    const arr = filterState[group] as string[];
    saveFilters({
      ...filterState,
      [group]: arr.includes(value)
        ? arr.filter((v) => v !== value)
        : [...arr, value],
    } as FilterState);
  };
  const changeSort = (key: SortKey) => {
    setSortKey(key);
    AsyncStorage.setItem(STORAGE_SORT, key).catch(() => {});
    setSheet(null);
  };

  const allTags = useMemo(() => collectAllTags(hosts), [hosts]);
  const isFilterActive = filtersActive(filterState);
  const filterLabel = (group: keyof FilterState, value: string) =>
    group === "tags"
      ? value
      : (filterGroups
          .find((g) => g.group === group)
          ?.options.find((o) => o.value === value)?.label ?? value);
  const chips = (Object.keys(filterState) as (keyof FilterState)[]).flatMap(
    (group) =>
      (filterState[group] as string[]).map((value) => ({ group, value })),
  );

  const getHostMetrics = useCallback(
    (hostId: number) => metrics[hostId],
    [metrics],
  );

  // Selection

  const selecting = selected !== null;
  const selectedHosts = useMemo(
    () => (selected ? hosts.filter((h) => selected.has(h.id)) : []),
    [hosts, selected],
  );
  const toggleSelected = (host: SSHHost) =>
    setSelected((prev) => {
      const next = new Set(prev ?? []);
      if (next.has(host.id)) next.delete(host.id);
      else next.add(host.id);
      return next;
    });

  /** Runs a write on the selected hosts this account owns. */
  const onOwn = async (
    run: (ids: number[]) => Promise<void>,
    done: string,
  ): Promise<void> => {
    const own = selectedHosts.filter((h) => !h.shared);
    const skipped = selectedHosts.length - own.length;
    try {
      if (own.length) await run(own.map((h) => h.id));
      toast.success(
        skipped
          ? `${done}. ${skipped} shared ${skipped === 1 ? "host was" : "hosts were"} left as they are.`
          : done,
      );
      setSelected(null);
    } catch (e: any) {
      toast.error(e?.message || "Could not update the hosts");
    }
  };

  const bulkPin = (pin: boolean) =>
    onOwn(
      (ids) => repos.hosts.bulkUpdate(ids, { pin }),
      pin ? "Pinned" : "Unpinned",
    );

  const bulkMove = (folder: string) => {
    setMoving(false);
    void onOwn(
      (ids) => repos.hosts.bulkUpdate(ids, { folder }),
      folder.trim() ? `Moved to ${folder.trim()}` : "Moved out of folders",
    );
  };

  const bulkNest = (parentHostId: number) => {
    setNesting(false);
    const parent = hosts.find((h) => h.id === parentHostId);
    void onOwn(
      (ids) => repos.hosts.bulkUpdate(ids, { parentHostId }),
      `Moved under ${parent?.name ?? "the host"}`,
    );
  };

  const bulkDelete = async () => {
    const own = selectedHosts.filter((h) => !h.shared);
    if (own.length === 0) {
      toast.error("Shared hosts can't be deleted here");
      return;
    }
    const ok = await confirm({
      title: `Delete ${own.length} ${own.length === 1 ? "host" : "hosts"}?`,
      description: own
        .slice(0, 5)
        .map((h) => h.name)
        .join(", "),
      confirmLabel: "Delete",
    });
    if (!ok) return;
    await onOwn(async (ids) => {
      for (const id of ids) await repos.hosts.remove(id);
    }, "Deleted");
  };

  const bulkOpen = async () => {
    const ssh = selectedHosts.filter(isSshHost).slice(0, BULK_OPEN_LIMIT);
    if (ssh.length === 0) {
      toast.error("None of these hosts open a terminal");
      return;
    }
    setSelected(null);
    for (const host of ssh) await navigateToSessions(host);
  };

  // Single host actions

  const tapHost = useStableCallback((host: SSHHost) => {
    if (selecting) {
      toggleSelected(host);
      return;
    }
    if (reorder) return;
    void openHost(host).then((opened) => !opened && setSheetHost(host));
  });

  const togglePin = async (host: SSHHost) => {
    try {
      await repos.hosts.bulkUpdate([host.id], { pin: !host.pin });
    } catch (e: any) {
      toast.error(e?.message || "Could not pin the host");
    }
  };

  const handleDelete = async (host: SSHHost) => {
    try {
      await repos.hosts.remove(host.id);
      toast.success(`Deleted ${host.name}`);
    } catch (e: any) {
      toast.error(e?.message || "Failed to delete host");
    }
  };

  const handleClone = async (host: SSHHost) => {
    try {
      await repos.hosts.create({
        name: `${host.name} (copy)`,
        ip: host.ip,
        port: host.port,
        username: host.username,
        folder: host.folder,
        parentHostId: host.shared ? null : (host.parentHostId ?? null),
        tags: host.tags ?? [],
        pin: false,
        authType: host.authType,
        password: host.password,
        key: host.key,
        keyPassword: host.keyPassword,
        keyType: host.keyType,
        credentialId: host.credentialId ?? null,
        overrideCredentialUsername: host.overrideCredentialUsername,
        enableSsh: host.enableSsh,
        enableRdp: host.enableRdp,
        enableVnc: host.enableVnc,
        enableTelnet: host.enableTelnet,
        enableTerminal: host.enableTerminal,
        enableTunnel: host.enableTunnel,
        enableFileManager: host.enableFileManager,
        enableDocker: host.enableDocker,
        enableServices: host.enableServices,
        defaultPath: host.defaultPath ?? "/",
        jumpHosts: host.jumpHosts ?? [],
        forceKeyboardInteractive: host.forceKeyboardInteractive,
        tunnelConnections: host.tunnelConnections ?? [],
        notes: host.notes,
        rdpUser: host.rdpUser,
        rdpPassword: host.rdpPassword,
        rdpDomain: host.rdpDomain,
        rdpPort: host.rdpPort,
        vncUser: host.vncUser,
        vncPassword: host.vncPassword,
        vncPort: host.vncPort,
        telnetUser: host.telnetUser,
        telnetPassword: host.telnetPassword,
        telnetPort: host.telnetPort,
        statsConfig: host.statsConfig,
        terminalConfig: host.terminalConfig,
      } as any);
      toast.success(`Cloned ${host.name}`);
    } catch (e: any) {
      toast.error(e?.message || "Failed to clone host");
    }
  };

  const openAddSubHost = (parent: SSHHost) => {
    setFormHost(null);
    setFormDraft({ parentHostId: parent.id });
    setFormOpen(true);
  };

  const openEdit = (host: SSHHost) => {
    setFormHost(host);
    setFormDraft(undefined);
    setFormOpen(true);
  };

  const addTailscaleHost = (draft: Partial<SSHHost>) => {
    pendingTailscaleFormRef.current = Platform.OS === "ios";
    setTailscaleDevicesOpen(false);
    setFormHost(null);
    setFormDraft(draft);
    if (!pendingTailscaleFormRef.current) setFormOpen(true);
  };

  const handleTailscaleDismiss = () => {
    if (!pendingTailscaleFormRef.current) return;
    pendingTailscaleFormRef.current = false;
    setFormOpen(true);
  };

  const startReorder = () => {
    setSheet(null);
    if (sortKey !== "default" || q || isFilterActive) {
      toast.error(
        "Reorder works with the Default sort and no search or filter",
      );
      return;
    }
    setSelected(null);
    setReorder(true);
  };

  const saveOrder = async (positions: { id: number; sortOrder: number }[]) => {
    try {
      await repos.hosts.reorder(positions);
    } catch (e: any) {
      toast.error(e?.message || "Could not save the order");
    }
  };

  // Hosts can be imported from a feature's settings screen, when one is there.
  const importLink = settingsLinks.find((l) => /import/i.test(l.label));

  const noHosts = hosts.length === 0;
  const emptyList = noHosts ? (
    <EmptyState
      icon={Server}
      title="No hosts yet"
      hint="Add a host to connect to it with one tap."
      action={
        <View className="items-center gap-2">
          <Button
            size="sm"
            onPress={openCreate}
            icon={<Plus size={15} color={color("accent-brand")} />}
          >
            Add host
          </Button>
          {canQuickConnect ? (
            <Button
              size="sm"
              variant="muted"
              onPress={() => setQuickConnectOpen(true)}
            >
              Quick connect
            </Button>
          ) : null}
          {importLink ? (
            <Button
              size="sm"
              variant="ghost"
              onPress={() => router.push(importLink.href as never)}
              icon={<Download size={15} color={muted} />}
            >
              {importLink.label}
            </Button>
          ) : null}
          <Button
            size="sm"
            variant="ghost"
            onPress={() => openAuthFlow("server")}
          >
            Link a server
          </Button>
        </View>
      }
    />
  ) : (
    <EmptyState
      icon={Search}
      title="No hosts match"
      action={
        <Button
          size="sm"
          variant="muted"
          onPress={() => {
            setSearchQuery("");
            saveFilters(DEFAULT_FILTERS);
          }}
        >
          Clear search and filters
        </Button>
      }
    />
  );

  const listHeader = (
    <View className="gap-2 pb-2">
      <ServerReachBanner />
      <SyncBanner />
      {data.alerts.map((alert) => (
        <View
          key={alert.id}
          className="flex-row items-start gap-2 border border-border bg-card p-3"
        >
          <AlertTriangle
            size={15}
            color={color("accent-brand")}
            style={{ marginTop: 1 }}
          />
          <View className="flex-1">
            <Text weight="medium" className="text-sm text-foreground">
              {alert.title}
            </Text>
            <Text className="mt-0.5 text-xs text-muted-foreground">
              {alert.message}
            </Text>
          </View>
          <Pressable
            onPress={() => data.dismissAlert(alert.id)}
            hitSlop={8}
            accessibilityLabel="Dismiss"
            className="p-0.5 active:bg-muted/40"
          >
            <X size={14} color={muted} />
          </Pressable>
        </View>
      ))}
    </View>
  );

  return (
    <Screen
      titleNode={<AccountButton />}
      overlay={
        <>
          <HostEditor
            visible={formOpen}
            host={formHost}
            draft={formDraft}
            onClose={() => setFormOpen(false)}
            onSaved={() => setFormOpen(false)}
          />
          <CredentialListModal
            visible={credentialListOpen}
            onClose={() => setCredentialListOpen(false)}
          />
        </>
      }
      headerRight={
        <View className="flex-row items-center gap-1">
          <SearchButton />
          {canQuickConnect ? (
            <Button
              variant="ghost"
              size="icon"
              accessibilityLabel="Quick connect"
              onPress={() => setQuickConnectOpen(true)}
              icon={<Zap size={18} color={muted} />}
            />
          ) : null}
          <Button
            variant="ghost"
            size="icon"
            accessibilityLabel="Add host"
            onPress={openCreate}
            icon={<Plus size={20} color={muted} />}
          />
          <Button
            variant="ghost"
            size="icon"
            accessibilityLabel="More"
            onPress={() => setSheet("more")}
            icon={<MoreVertical size={18} color={muted} />}
          />
        </View>
      }
    >
      {reorder ? (
        <View className="flex-row items-center gap-2 border-b border-border bg-card px-3 py-2">
          <GripVertical size={15} color={muted} />
          <Text className="flex-1 text-xs text-muted-foreground">
            Drag a host by its grip to move it inside its folder.
          </Text>
          <Button size="sm" onPress={() => setReorder(false)}>
            Done
          </Button>
        </View>
      ) : (
        <View className="gap-2 px-3 pb-2 pt-3">
          <View className="flex-row items-center gap-1.5">
            <Input
              containerClassName="flex-1"
              placeholder="Filter hosts"
              value={searchQuery}
              onChangeText={setSearchQuery}
              autoCapitalize="none"
              autoCorrect={false}
              leading={<Search size={15} color={muted} />}
              trailing={
                searchQuery ? (
                  <Pressable
                    onPress={() => setSearchQuery("")}
                    hitSlop={8}
                    accessibilityLabel="Clear filter text"
                  >
                    <X size={15} color={muted} />
                  </Pressable>
                ) : undefined
              }
            />
            <Button
              variant="muted"
              size="icon-field"
              accessibilityLabel="Filter hosts"
              onPress={() => setSheet("filter")}
              icon={
                <Filter
                  size={18}
                  color={isFilterActive ? color("accent-brand") : muted}
                />
              }
            />
            <Button
              variant="muted"
              size="icon-field"
              accessibilityLabel="Sort hosts"
              onPress={() => setSheet("sort")}
              icon={
                <ArrowUpDown
                  size={18}
                  color={sortKey !== "default" ? color("accent-brand") : muted}
                />
              }
            />
          </View>
          {chips.length > 0 ? (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ gap: 6 }}
            >
              {chips.map(({ group, value }) => (
                <Pressable
                  key={`${group}:${value}`}
                  onPress={() => toggleFilter(group, value)}
                  accessibilityLabel={`Remove filter ${filterLabel(group, value)}`}
                  className="flex-row items-center gap-1 border border-border bg-muted/30 px-2 py-1 active:bg-muted"
                >
                  <Text className="text-[11px] text-foreground">
                    {filterLabel(group, value)}
                  </Text>
                  <X size={12} color={muted} />
                </Pressable>
              ))}
            </ScrollView>
          ) : null}
        </View>
      )}

      {data.loading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color={color("accent-brand")} />
          <Text className="mt-3 text-sm text-muted-foreground">
            Loading hosts…
          </Text>
        </View>
      ) : (
        <HostList
          rows={rows}
          getHostStatus={getHostStatus}
          getHostMetrics={getHostMetrics}
          onToggleFolder={toggleFolder}
          onToggleHost={toggleHost}
          onHostPress={tapHost}
          onHostLongPress={setSheetHost}
          selecting={selecting}
          selected={selected ?? NO_SELECTION}
          reorder={reorder}
          onReorder={saveOrder}
          onRefusedDrop={refusedDrop}
          refreshControl={
            <RefreshControl
              refreshing={data.refreshing}
              onRefresh={data.refresh}
              tintColor={color("muted-foreground")}
              colors={[color("muted-foreground")]}
            />
          }
          header={listHeader}
          empty={emptyList}
        />
      )}

      {selecting ? (
        <SelectionBar
          count={selectedHosts.length}
          onPin={() => bulkPin(true)}
          onUnpin={() => bulkPin(false)}
          onMove={() => setMoving(true)}
          onNest={() => setNesting(true)}
          onOpen={bulkOpen}
          onDelete={bulkDelete}
          onCancel={() => setSelected(null)}
        />
      ) : null}

      <HostActionSheet
        host={sheetHost}
        status={sheetHost ? getHostStatus(sheetHost.id) : "unknown"}
        metrics={sheetHost ? metrics[sheetHost.id] : undefined}
        visible={sheetHost !== null}
        onClose={() => setSheetHost(null)}
        onEdit={openEdit}
        onClone={handleClone}
        onDelete={handleDelete}
        onTogglePin={togglePin}
        onSelect={(host) => setSelected(new Set([host.id]))}
        onAddSubHost={openAddSubHost}
      />

      <ParentHostSheet
        visible={nesting}
        title="Move under a host"
        hosts={hosts}
        moving={selectedHosts.filter((h) => !h.shared).map((h) => h.id)}
        onPick={bulkNest}
        onClose={() => setNesting(false)}
      />

      <PromptSheet
        visible={moving}
        title="Move to folder"
        description="Leave it empty to take the hosts out of folders."
        placeholder="Folder, like Prod / Web"
        confirmLabel="Move"
        validate={() => true}
        onSubmit={bulkMove}
        onCancel={() => setMoving(false)}
      />

      <Sheet
        visible={sheet === "more"}
        onClose={() => setSheet(null)}
        title="Hosts"
      >
        <SheetRow
          icon={<ListChecks size={18} color={color("foreground")} />}
          label="Select hosts"
          onPress={() => {
            setSheet(null);
            setReorder(false);
            setSelected(new Set());
          }}
        />
        <SheetRow
          icon={<GripVertical size={18} color={color("foreground")} />}
          label="Reorder hosts"
          onPress={startReorder}
        />
        <SheetRow
          icon={<SlidersHorizontal size={18} color={color("foreground")} />}
          label="Customize list"
          description="Choose what each host row shows"
          onPress={() => setSheet("customize")}
        />
        <SheetRow
          icon={<KeyRound size={18} color={color("foreground")} />}
          label="Credentials"
          description="Saved passwords and keys"
          onPress={() => {
            setSheet(null);
            setCredentialListOpen(true);
          }}
        />
        {tailscaleAvailable ? (
          <SheetRow
            icon={<Radar size={18} color={color("foreground")} />}
            label="Tailscale devices"
            onPress={() => {
              setSheet(null);
              pendingTailscaleFormRef.current = false;
              setTailscaleDevicesOpen(true);
            }}
          />
        ) : null}
        <SheetRow
          icon={<RefreshCw size={18} color={color("foreground")} />}
          label="Refresh"
          onPress={() => {
            setSheet(null);
            data.refresh();
          }}
        />
      </Sheet>

      <Sheet
        visible={sheet === "customize"}
        onClose={() => setSheet(null)}
        title="Customize list"
        scroll
      >
        <SheetBody className="gap-0">
          {HOST_LIST_FIELDS.map((f, i) => (
            <SettingRow
              key={f.key}
              label={f.label}
              description={f.description}
              last={i === HOST_LIST_FIELDS.length - 1}
            >
              <FakeSwitch
                checked={listPrefs[f.key]}
                disabled={f.dependsOnAddress && !listPrefs.showAddress}
                accessibilityLabel={f.label}
                onChange={(v) => void setHostListPrefs({ [f.key]: v })}
              />
            </SettingRow>
          ))}
          <Text className="pt-3 text-meta text-muted-foreground">
            Row density follows Settings, Appearance.
          </Text>
        </SheetBody>
      </Sheet>

      <Sheet
        visible={sheet === "sort"}
        onClose={() => setSheet(null)}
        title="Sort hosts"
        scroll
      >
        {SORT_OPTIONS.map((opt) => (
          <SheetRow
            key={opt.id}
            label={opt.label}
            onPress={() => changeSort(opt.id)}
            trailing={
              sortKey === opt.id ? (
                <Check size={16} color={color("accent-brand")} />
              ) : undefined
            }
          />
        ))}
      </Sheet>

      <Sheet
        visible={sheet === "filter"}
        onClose={() => setSheet(null)}
        title="Filter hosts"
        scroll
      >
        {isFilterActive ? (
          <SheetRow
            icon={<X size={18} color={color("accent-brand")} />}
            label="Clear all filters"
            onPress={() => saveFilters(DEFAULT_FILTERS)}
          />
        ) : null}
        {[
          ...filterGroups,
          ...(allTags.length
            ? [
                {
                  group: "tags" as const,
                  title: "Tags",
                  options: allTags.map((t) => ({ value: t, label: t })),
                },
              ]
            : []),
        ].map((grp) => (
          <View key={grp.group}>
            <View className="px-3 pb-1 pt-3">
              <Text
                weight="bold"
                className="text-[10px] uppercase tracking-[2px] text-muted-foreground"
              >
                {grp.title}
              </Text>
            </View>
            {grp.options.map((opt) => {
              const checked = (filterState[grp.group] as string[]).includes(
                opt.value,
              );
              return (
                <Pressable
                  key={opt.value}
                  onPress={() => toggleFilter(grp.group, opt.value)}
                  className="flex-row items-center gap-3 border-b border-border/60 px-3 py-3 active:bg-muted/40"
                >
                  <Checkbox
                    checked={checked}
                    onChange={() => toggleFilter(grp.group, opt.value)}
                  />
                  <Text
                    className="flex-1 text-sm text-foreground"
                    numberOfLines={1}
                  >
                    {opt.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        ))}
      </Sheet>

      <QuickConnect
        visible={quickConnectOpen}
        onClose={() => setQuickConnectOpen(false)}
      />

      <TailscaleDevices
        visible={tailscaleDevicesOpen}
        onClose={() => setTailscaleDevicesOpen(false)}
        onDismiss={handleTailscaleDismiss}
        onAddHost={addTailscaleHost}
      />
    </Screen>
  );
}

/** The bar for what to do with the selected hosts. */
function SelectionBar({
  count,
  onPin,
  onUnpin,
  onMove,
  onNest,
  onOpen,
  onDelete,
  onCancel,
}: {
  count: number;
  onPin: () => void;
  onUnpin: () => void;
  onMove: () => void;
  onNest: () => void;
  onOpen: () => void;
  onDelete: () => void;
  onCancel: () => void;
}) {
  const color = useThemeColor();
  const fg = color("foreground");
  const disabled = count === 0;
  const action = (
    label: string,
    icon: React.ReactNode,
    onPress: () => void,
  ) => (
    <Button
      variant="ghost"
      size="icon"
      accessibilityLabel={label}
      disabled={disabled}
      onPress={onPress}
      icon={icon}
    />
  );
  return (
    <View className="flex-row items-center gap-1 border-t border-border bg-sidebar px-2 py-1.5">
      <Button
        variant="ghost"
        size="icon"
        accessibilityLabel="Stop selecting"
        onPress={onCancel}
        icon={<X size={18} color={fg} />}
      />
      <Text weight="medium" className="flex-1 text-sm text-foreground">
        {count} selected
      </Text>
      {action(
        "Open terminals",
        <SquareTerminal size={18} color={fg} />,
        onOpen,
      )}
      {action("Pin", <Pin size={18} color={fg} />, onPin)}
      {action("Unpin", <PinOff size={18} color={fg} />, onUnpin)}
      {action("Move to folder", <FolderInput size={18} color={fg} />, onMove)}
      {action("Move under a host", <ListTree size={18} color={fg} />, onNest)}
      {action(
        "Delete",
        <Trash2 size={18} color={color("destructive")} />,
        onDelete,
      )}
    </View>
  );
}
