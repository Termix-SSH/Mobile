import {
  ScrollView,
  View,
  ActivityIndicator,
  RefreshControl,
  Pressable,
  Platform,
} from "react-native";
import { useState, useCallback, useRef, useMemo, useEffect } from "react";
import { useFocusEffect, useRouter } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  RefreshCw,
  Search,
  X,
  AlertTriangle,
  ArrowUpDown,
  Filter,
  Check,
  Zap,
  Plus,
  KeyRound,
  FileText,
  Radar,
  Server,
  Users,
} from "lucide-react-native";
import HostTree from "@/screens/hosts/navigation/Folder";
import type { HostMetrics } from "@/screens/hosts/navigation/Host";
import { HostActionSheet } from "@/screens/hosts/HostActionSheet";
import { useCapability, useHostFilters } from "@/core/features";
import { useAppContext } from "@/contexts/AppContext";
import HostForm from "@/screens/hosts/HostForm";
import { QuickConnect } from "@/screens/hosts/QuickConnect";
import { TailscaleDevices } from "@/features/tailscale/TailscaleDevices";
import CredentialListModal from "@/screens/hosts/CredentialListModal";
import { SSHHost, ServerStatus, Snippet } from "@/types";
import { publishHostSnapshot } from "@/widgets";
import { Screen } from "@/components/Screen";
import {
  Text,
  Input,
  Button,
  Sheet,
  SheetRow,
  Checkbox,
  EmptyState,
} from "@/ui";
import { useThemeColor } from "@/contexts/ThemeContext";
import { toast } from "@/utils/toast";
import {
  SortKey,
  FilterState,
  DEFAULT_FILTERS,
  HostStatus,
  buildHostTree,
  sortHostTree,
  applyFilters,
  filterTreeByQuery,
  collectFolderPaths,
  collectMatchingFolderPaths,
  collectAllTags,
  filtersActive,
} from "@/screens/hosts/navigation/hostTree";
import { api, activeClient } from "@/core/accounts";
import { useRepositories } from "@/core/data/hooks";

const SORT_OPTIONS: { id: SortKey; label: string }[] = [
  { id: "default", label: "Default" },
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
  {
    group: "features",
    title: "Features",
    options: [],
  },
];

const STORAGE_SORT = "hostSortKey";
const STORAGE_FILTER = "hostFilterState";
const STORAGE_EXPANDED = "hostExpandedFolders";

export default function Hosts() {
  const color = useThemeColor();
  const { openAccountSwitcher } = useAppContext();
  const hostFilters = useHostFilters();
  const canQuickConnect = useCapability("host.quickConnect");
  const tailscaleAvailable = useCapability("hosts.discovery");
  const refreshFeatures = useCallback(
    () => activeClient()?.refreshEnabledPlugins() ?? Promise.resolve(),
    [],
  );
  const router = useRouter();
  const repos = useRepositories();
  const [hosts, setHosts] = useState<SSHHost[]>([]);
  const [folderColors, setFolderColors] = useState<
    Record<string, string | undefined>
  >({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [alerts, setAlerts] = useState<
    { id: string; title: string; message: string }[]
  >([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [serverStatuses, setServerStatuses] = useState<
    Record<number, ServerStatus>
  >({});
  const [metrics, setMetrics] = useState<Record<number, HostMetrics>>({});
  // Snippets are fetched here purely to feed the home-screen widget; the list
  // itself lives under Settings. `null` means "not fetched yet", which keeps a
  // failed fetch from wiping snippets the Snippets screen already published.
  const [snippets, setSnippets] = useState<Snippet[] | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>("default");
  const [filterState, setFilterState] = useState<FilterState>(DEFAULT_FILTERS);
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set());
  const [prefsLoaded, setPrefsLoaded] = useState(false);
  const [showSort, setShowSort] = useState(false);
  const [showFilter, setShowFilter] = useState(false);

  // Action sheet + form state
  const [sheetHost, setSheetHost] = useState<SSHHost | null>(null);
  const [formHost, setFormHost] = useState<SSHHost | null>(null);
  const [formDraft, setFormDraft] = useState<Partial<SSHHost>>();
  const [formOpen, setFormOpen] = useState(false);
  const [quickConnectOpen, setQuickConnectOpen] = useState(false);
  const [tailscaleDevicesOpen, setTailscaleDevicesOpen] = useState(false);
  const [credentialListOpen, setCredentialListOpen] = useState(false);

  const isRefreshingRef = useRef(false);
  const pendingTailscaleFormRef = useRef(false);
  // Tracks whether the user has manually toggled folders this session, so a data
  // refresh doesn't blow away their expansion choices.
  const expansionInitializedRef = useRef(false);

  // --- Load persisted preferences once on mount.
  useEffect(() => {
    (async () => {
      try {
        const [savedSort, savedFilter, savedExpanded] = await Promise.all([
          AsyncStorage.getItem(STORAGE_SORT),
          AsyncStorage.getItem(STORAGE_FILTER),
          AsyncStorage.getItem(STORAGE_EXPANDED),
        ]);
        if (savedSort) setSortKey(savedSort as SortKey);
        if (savedFilter) setFilterState(JSON.parse(savedFilter) as FilterState);
        if (savedExpanded) {
          setExpandedPaths(new Set(JSON.parse(savedExpanded) as string[]));
          expansionInitializedRef.current = true;
        }
      } catch {
        // best-effort
      } finally {
        setPrefsLoaded(true);
      }
    })();
  }, []);

  const getHostStatus = useCallback(
    (hostId: number): HostStatus => serverStatuses[hostId]?.status ?? "unknown",
    [serverStatuses],
  );

  // Fetch CPU/RAM for online hosts. Never throws; failures are ignored so the
  // list always renders.
  const fetchMetrics = useCallback(
    async (hostList: SSHHost[], statuses: Record<number, ServerStatus>) => {
      if (!activeClient()) return;
      const onlineIds = hostList
        .filter((h) => statuses[h.id]?.status === "online")
        .map((h) => h.id);
      if (onlineIds.length === 0) {
        setMetrics((previous) =>
          Object.keys(previous).length === 0 ? previous : {},
        );
        return;
      }
      const results = await Promise.allSettled(
        onlineIds.map((id) =>
          activeClient()!.api.metrics.getServerMetricsById(id),
        ),
      );
      setMetrics((previous) => {
        const next: Record<number, HostMetrics> = {};
        results.forEach((res, i) => {
          const id = onlineIds[i];
          if (res.status === "fulfilled" && res.value) {
            next[id] = {
              cpu: res.value.cpu?.percent ?? null,
              ram: res.value.memory?.percent ?? null,
            };
          } else if (previous[id]) {
            // The backend only reports once collection is running, so keep the
            // last reading instead of blanking the row on an empty response.
            next[id] = previous[id];
          }
        });
        return next;
      });
    },
    [],
  );

  // "quiet" reloads after a change without showing a spinner.
  const fetchData = useCallback(
    async (mode: boolean | "quiet" = false) => {
      if (isRefreshingRef.current) return;
      try {
        isRefreshingRef.current = true;
        if (mode === true) setRefreshing(true);
        else if (mode !== "quiet") setLoading(true);

        // Live status and metrics come from a linked server only.
        const client = activeClient();
        const [hostsResult, statusesResult, snippetsResult] =
          await Promise.allSettled([
            repos.hosts.list(),
            client
              ? client.api.metrics.getAllServerStatuses()
              : Promise.resolve({}),
            repos.snippets.list(),
          ]);

        if (hostsResult.status !== "fulfilled") throw hostsResult.reason;

        const raw = hostsResult.value as any;
        const hostList: SSHHost[] = Array.isArray(raw)
          ? raw
          : Array.isArray(raw?.hosts)
            ? raw.hosts
            : [];
        const statuses =
          statusesResult.status === "fulfilled" ? statusesResult.value : {};

        const colors: Record<string, string | undefined> = {};
        try {
          (await repos.hostFolders.list()).forEach((f) => {
            colors[f.name] = f.color;
          });
        } catch {
          // folders are optional
        }

        setHosts(hostList);
        setFolderColors(colors);
        setServerStatuses(statuses);

        if (
          snippetsResult.status === "fulfilled" &&
          Array.isArray(snippetsResult.value)
        ) {
          setSnippets(snippetsResult.value as Snippet[]);
        }

        // Best-effort live metrics for online hosts only.
        void fetchMetrics(hostList, statuses);
      } catch (error: any) {
        const isAuth =
          error?.response?.status === 401 ||
          error?.code === "APP_LOCKED" ||
          error?.message?.includes("Authentication required");
        if (!isAuth) {
          toast.error(error?.message || "Failed to load hosts.");
        }
      } finally {
        setLoading(false);
        setRefreshing(false);
        isRefreshingRef.current = false;
      }
    },
    [fetchMetrics, repos],
  );

  // Lists follow the store: sync and other screens write, this reloads.
  useEffect(() => {
    const reload = () => void fetchData("quiet");
    const stops = [
      repos.hosts.subscribe(reload),
      repos.hostFolders.subscribe(reload),
      repos.snippets.subscribe(reload),
    ];
    return () => stops.forEach((stop) => stop());
  }, [repos, fetchData]);

  const handleRefresh = useCallback(() => {
    if (!isRefreshingRef.current) {
      void refreshFeatures();
      fetchData(true);
    }
  }, [fetchData, refreshFeatures]);

  // Server-side notices (maintenance, warnings) shown until dismissed.
  const loadAlerts = useCallback(async () => {
    const client = activeClient();
    if (!client) {
      setAlerts([]);
      return;
    }
    try {
      const res = await client.api.alerts.getUserAlerts();
      setAlerts(Array.isArray(res?.alerts) ? res.alerts : []);
    } catch {
      setAlerts([]);
    }
  }, []);

  const handleDismissAlert = async (id: string) => {
    setAlerts((prev) => prev.filter((a) => a.id !== id));
    try {
      await api().alerts.dismissAlert(id);
    } catch {
      // Dismissal is best-effort; it reappears on the next fetch if it fails.
    }
  };

  useFocusEffect(
    useCallback(() => {
      fetchData();
      loadAlerts();
    }, [fetchData, loadAlerts]),
  );

  // Keep the home-screen widgets in sync with whatever this screen shows. The
  // publisher throttles and de-dupes, so re-running on every data change is
  // cheap. This screen only renders for an authenticated user.
  useEffect(() => {
    if (loading) return;
    void publishHostSnapshot({
      hosts,
      statuses: serverStatuses,
      metrics,
      snippets: snippets ?? undefined,
      serverUrl: activeClient()?.serverUrl ?? null,
      authenticated: true,
    });
  }, [loading, hosts, serverStatuses, metrics, snippets]);

  // --- Build, sort, and filter the tree.
  const tree = useMemo(
    () => buildHostTree(hosts, folderColors),
    [hosts, folderColors],
  );

  const q = searchQuery.trim().toLowerCase();

  // Filter options come from the features the server has.
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
    nodes = sortHostTree(nodes, sortKey, getHostStatus);
    return nodes;
  }, [tree, filterState, q, sortKey, getHostStatus, hostFilters]);

  // --- Default expansion: expand all folders the first time hosts load.
  useEffect(() => {
    if (!prefsLoaded || expansionInitializedRef.current) return;
    if (tree.length === 0) return;
    setExpandedPaths(new Set(collectFolderPaths(tree)));
    expansionInitializedRef.current = true;
  }, [prefsLoaded, tree]);

  // When searching, force-expand matching folders without touching the
  // persisted set.
  const effectiveExpanded = useMemo(() => {
    if (!q) return expandedPaths;
    const next = new Set(expandedPaths);
    collectMatchingFolderPaths(tree, q).forEach((p) => next.add(p));
    return next;
  }, [q, expandedPaths, tree]);

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

  const handleSortChange = useCallback((key: SortKey) => {
    setSortKey(key);
    AsyncStorage.setItem(STORAGE_SORT, key).catch(() => {});
    setShowSort(false);
  }, []);

  const toggleFilter = useCallback(
    (group: keyof FilterState, value: string) => {
      setFilterState((prev) => {
        const arr = prev[group] as string[];
        const nextArr = arr.includes(value)
          ? arr.filter((v) => v !== value)
          : [...arr, value];
        const updated = { ...prev, [group]: nextArr } as FilterState;
        AsyncStorage.setItem(STORAGE_FILTER, JSON.stringify(updated)).catch(
          () => {},
        );
        return updated;
      });
    },
    [],
  );

  const clearFilters = useCallback(() => {
    setFilterState(DEFAULT_FILTERS);
    AsyncStorage.setItem(STORAGE_FILTER, JSON.stringify(DEFAULT_FILTERS)).catch(
      () => {},
    );
  }, []);

  const getHostMetrics = useCallback(
    (hostId: number): HostMetrics | undefined => metrics[hostId],
    [metrics],
  );

  const allTags = useMemo(() => collectAllTags(hosts), [hosts]);
  const isFilterActive = filtersActive(filterState);

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

  const openEdit = (host: SSHHost) => {
    setFormHost(host);
    setFormDraft(undefined);
    setFormOpen(true);
  };

  const openCreate = () => {
    setFormHost(null);
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

  const isEmpty = visibleTree.length === 0;

  return (
    <Screen
      title="Hosts"
      overlay={
        <>
          {/* Create / edit form */}
          <HostForm
            visible={formOpen}
            host={formHost}
            draft={formDraft}
            onClose={() => setFormOpen(false)}
            onSaved={() => setFormOpen(false)}
          />
          {/* Credential manager */}
          <CredentialListModal
            visible={credentialListOpen}
            onClose={() => setCredentialListOpen(false)}
          />
        </>
      }
      headerRight={
        <View className="flex-row items-center gap-1.5">
          <Button
            variant="ghost"
            size="icon"
            accessibilityLabel="Add host"
            onPress={openCreate}
            icon={<Plus size={20} color={color("muted-foreground")} />}
          />
          <Button
            variant="ghost"
            size="icon"
            accessibilityLabel="Snippets"
            onPress={() => router.push("/tabs/settings/Snippets" as never)}
            icon={<FileText size={18} color={color("muted-foreground")} />}
          />
          <Button
            variant="ghost"
            size="icon"
            accessibilityLabel="Accounts"
            onPress={openAccountSwitcher}
            icon={<Users size={18} color={color("muted-foreground")} />}
          />
          <Button
            variant="ghost"
            size="icon"
            accessibilityLabel="Credentials"
            onPress={() => setCredentialListOpen(true)}
            icon={<KeyRound size={18} color={color("muted-foreground")} />}
          />
          {canQuickConnect ? (
            <Button
              variant="ghost"
              size="icon"
              accessibilityLabel="Quick connect"
              onPress={() => setQuickConnectOpen(true)}
              icon={<Zap size={18} color={color("muted-foreground")} />}
            />
          ) : null}
          {tailscaleAvailable ? (
            <Button
              variant="ghost"
              size="icon"
              accessibilityLabel="Tailscale devices"
              onPress={() => {
                pendingTailscaleFormRef.current = false;
                setTailscaleDevicesOpen(true);
              }}
              icon={<Radar size={18} color={color("muted-foreground")} />}
            />
          ) : null}
          <Button
            variant="ghost"
            size="icon"
            accessibilityLabel="Refresh hosts"
            onPress={handleRefresh}
            disabled={refreshing}
            icon={
              <RefreshCw
                size={18}
                color={color("muted-foreground")}
                style={{
                  transform: [{ rotate: refreshing ? "180deg" : "0deg" }],
                }}
              />
            }
          />
        </View>
      }
    >
      {/* Search plus the two controls that shape the list. Keeping sort and
          filter here (rather than in the header) leaves room for the title on
          small screens and puts them next to the query they refine. */}
      <View className="flex-row items-center gap-1.5 px-4 pb-2 pt-3">
        <Input
          containerClassName="flex-1"
          placeholder="Search hosts…"
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
        <Button
          variant="muted"
          size="icon"
          accessibilityLabel="Filter hosts"
          onPress={() => setShowFilter(true)}
          icon={
            <Filter
              size={18}
              color={
                isFilterActive
                  ? color("accent-brand")
                  : color("muted-foreground")
              }
            />
          }
        />
        <Button
          variant="muted"
          size="icon"
          accessibilityLabel="Sort hosts"
          onPress={() => setShowSort(true)}
          icon={
            <ArrowUpDown
              size={18}
              color={
                sortKey !== "default"
                  ? color("accent-brand")
                  : color("muted-foreground")
              }
            />
          }
        />
      </View>

      {loading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color={color("accent-brand")} />
          <Text className="mt-3 text-sm text-muted-foreground">
            Loading hosts…
          </Text>
        </View>
      ) : (
        <ScrollView
          className="flex-1"
          contentContainerStyle={{ paddingHorizontal: 12, paddingBottom: 24 }}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor={color("accent-brand")}
              colors={[color("accent-brand") ?? "#f59145"]}
            />
          }
        >
          {alerts.map((alert) => (
            <View
              key={alert.id}
              className="mt-2 flex-row items-start gap-2 border border-border bg-card p-3"
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
                onPress={() => handleDismissAlert(alert.id)}
                hitSlop={8}
                className="p-0.5 active:bg-muted/40"
              >
                <X size={14} color={color("muted-foreground")} />
              </Pressable>
            </View>
          ))}

          {isEmpty ? (
            <EmptyState
              icon={Server}
              title={
                q || isFilterActive
                  ? "No hosts match your search"
                  : "No hosts yet"
              }
              action={
                !q && !isFilterActive ? (
                  <Button
                    variant="default"
                    size="sm"
                    onPress={openCreate}
                    icon={<Plus size={15} color={color("accent-brand")} />}
                  >
                    Add host
                  </Button>
                ) : undefined
              }
            />
          ) : (
            <HostTree
              nodes={visibleTree}
              expandedPaths={effectiveExpanded}
              onToggle={toggleFolder}
              getHostStatus={getHostStatus}
              getHostMetrics={getHostMetrics}
              onHostPress={setSheetHost}
            />
          )}
        </ScrollView>
      )}

      {/* Action sheet on host tap */}
      <HostActionSheet
        host={sheetHost}
        status={sheetHost ? getHostStatus(sheetHost.id) : "unknown"}
        metrics={sheetHost ? metrics[sheetHost.id] : undefined}
        visible={sheetHost !== null}
        onClose={() => setSheetHost(null)}
        onEdit={openEdit}
        onClone={handleClone}
        onDelete={handleDelete}
      />

      {/* Sort menu */}
      <Sheet
        visible={showSort}
        onClose={() => setShowSort(false)}
        title="Sort hosts"
        scroll
      >
        {SORT_OPTIONS.map((opt) => (
          <SheetRow
            key={opt.id}
            label={opt.label}
            onPress={() => handleSortChange(opt.id)}
            trailing={
              sortKey === opt.id ? (
                <Check size={16} color={color("accent-brand")} />
              ) : undefined
            }
          />
        ))}
      </Sheet>

      {/* Filter menu */}
      <Sheet
        visible={showFilter}
        onClose={() => setShowFilter(false)}
        title="Filter hosts"
        scroll
      >
        {isFilterActive ? (
          <SheetRow
            icon={<X size={18} color={color("accent-brand")} />}
            label="Clear all filters"
            onPress={clearFilters}
          />
        ) : null}
        {filterGroups.map((grp) => (
          <View key={grp.group}>
            <View className="px-4 pb-1 pt-3">
              <Text
                weight="bold"
                className="text-[10px] uppercase tracking-[2px] text-muted-foreground/60"
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
                  className="flex-row items-center gap-3 border-b border-border/60 px-4 py-3 active:bg-muted/40"
                >
                  <Checkbox
                    checked={checked}
                    onChange={() => toggleFilter(grp.group, opt.value)}
                  />
                  <Text className="flex-1 text-sm text-foreground">
                    {opt.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        ))}
        {allTags.length > 0 ? (
          <View>
            <View className="px-4 pb-1 pt-3">
              <Text
                weight="bold"
                className="text-[10px] uppercase tracking-[2px] text-muted-foreground/60"
              >
                Tags
              </Text>
            </View>
            {allTags.map((tag) => {
              const checked = filterState.tags.includes(tag);
              return (
                <Pressable
                  key={tag}
                  onPress={() => toggleFilter("tags", tag)}
                  className="flex-row items-center gap-3 border-b border-border/60 px-4 py-3 active:bg-muted/40"
                >
                  <Checkbox
                    checked={checked}
                    onChange={() => toggleFilter("tags", tag)}
                  />
                  <Text
                    className="flex-1 text-sm text-foreground"
                    numberOfLines={1}
                  >
                    {tag}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        ) : null}
      </Sheet>

      {/* Quick connect (ad-hoc, unsaved) */}
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
