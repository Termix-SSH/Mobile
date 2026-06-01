import {
  ScrollView,
  View,
  ActivityIndicator,
  RefreshControl,
  Pressable,
} from "react-native";
import { useState, useCallback, useRef, useMemo, useEffect } from "react";
import { useFocusEffect } from "@react-navigation/native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  RefreshCw,
  Search,
  X,
  ArrowUpDown,
  Filter,
  Check,
  Zap,
  Plus,
  KeyRound,
} from "lucide-react-native";
import HostTree from "@/app/tabs/hosts/navigation/Folder";
import type { HostMetrics } from "@/app/tabs/hosts/navigation/Host";
import { HostActionSheet } from "@/app/tabs/hosts/HostActionSheet";
import HostForm from "@/app/tabs/hosts/HostForm";
import { QuickConnect } from "@/app/tabs/hosts/QuickConnect";
import CredentialListModal from "@/app/tabs/hosts/CredentialListModal";
import {
  getSSHHosts,
  getFoldersWithStats,
  getAllServerStatuses,
  getServerMetricsById,
  initializeServerConfig,
  getCurrentServerUrl,
  deleteSSHHost,
  createSSHHost,
} from "@/app/main-axios";
import { SSHHost, ServerStatus } from "@/types";
import { Screen } from "@/app/components/Screen";
import {
  Text,
  Input,
  Button,
  BottomSheet,
  SheetRow,
  Checkbox,
} from "@/app/components/ui";
import { useThemeColor } from "@/app/contexts/ThemeContext";
import { toast } from "@/app/utils/toast";
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
} from "@/app/tabs/hosts/navigation/hostTree";

const SORT_OPTIONS: { id: SortKey; label: string }[] = [
  { id: "default", label: "Default" },
  { id: "name-asc", label: "Name (A–Z)" },
  { id: "name-desc", label: "Name (Z–A)" },
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
    options: [
      { value: "ssh", label: "SSH" },
      { value: "rdp", label: "RDP" },
      { value: "vnc", label: "VNC" },
      { value: "telnet", label: "Telnet" },
    ],
  },
  {
    group: "features",
    title: "Features",
    options: [
      { value: "terminal", label: "Terminal" },
      { value: "fileManager", label: "File Manager" },
      { value: "tunnel", label: "Tunnel" },
      { value: "docker", label: "Docker" },
    ],
  },
];

const STORAGE_SORT = "hostSortKey";
const STORAGE_FILTER = "hostFilterState";
const STORAGE_EXPANDED = "hostExpandedFolders";

export default function Hosts() {
  const color = useThemeColor();
  const [hosts, setHosts] = useState<SSHHost[]>([]);
  const [folderColors, setFolderColors] = useState<
    Record<string, string | undefined>
  >({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [serverStatuses, setServerStatuses] = useState<
    Record<number, ServerStatus>
  >({});
  const [metrics, setMetrics] = useState<Record<number, HostMetrics>>({});
  const [sortKey, setSortKey] = useState<SortKey>("default");
  const [filterState, setFilterState] = useState<FilterState>(DEFAULT_FILTERS);
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set());
  const [prefsLoaded, setPrefsLoaded] = useState(false);
  const [showSort, setShowSort] = useState(false);
  const [showFilter, setShowFilter] = useState(false);

  // Action sheet + form state
  const [sheetHost, setSheetHost] = useState<SSHHost | null>(null);
  const [formHost, setFormHost] = useState<SSHHost | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [quickConnectOpen, setQuickConnectOpen] = useState(false);
  const [credentialListOpen, setCredentialListOpen] = useState(false);

  const isRefreshingRef = useRef(false);
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
      const onlineIds = hostList
        .filter((h) => statuses[h.id]?.status === "online")
        .map((h) => h.id);
      if (onlineIds.length === 0) {
        setMetrics({});
        return;
      }
      const results = await Promise.allSettled(
        onlineIds.map((id) => getServerMetricsById(id)),
      );
      const next: Record<number, HostMetrics> = {};
      results.forEach((res, i) => {
        if (res.status === "fulfilled" && res.value) {
          next[onlineIds[i]] = {
            cpu: res.value.cpu?.percent ?? null,
            ram: res.value.memory?.percent ?? null,
          };
        }
      });
      setMetrics(next);
    },
    [],
  );

  const fetchData = useCallback(
    async (isRefresh = false) => {
      if (isRefreshingRef.current) return;
      try {
        isRefreshingRef.current = true;
        if (isRefresh) setRefreshing(true);
        else setLoading(true);

        await initializeServerConfig();
        if (!getCurrentServerUrl()) {
          toast.error("No server configured. Set one up in Settings.");
          return;
        }

        const [hostsResult, statusesResult] = await Promise.allSettled([
          getSSHHosts(),
          getAllServerStatuses(),
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

        let foldersData: any = null;
        try {
          foldersData = await getFoldersWithStats();
        } catch {
          // folders are optional
        }
        const colors: Record<string, string | undefined> = {};
        if (Array.isArray(foldersData)) {
          foldersData.forEach((f: any) => {
            if (f?.name) colors[f.name] = f.color;
          });
        }

        setHosts(hostList);
        setFolderColors(colors);
        setServerStatuses(statuses);

        // Best-effort live metrics for online hosts only.
        void fetchMetrics(hostList, statuses);
      } catch (error: any) {
        const isAuth =
          error?.response?.status === 401 ||
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
    [fetchMetrics],
  );

  const handleRefresh = useCallback(() => {
    if (!isRefreshingRef.current) fetchData(true);
  }, [fetchData]);

  useFocusEffect(
    useCallback(() => {
      fetchData();
    }, [fetchData]),
  );

  // --- Build, sort, and filter the tree.
  const tree = useMemo(
    () => buildHostTree(hosts, folderColors),
    [hosts, folderColors],
  );

  const q = searchQuery.trim().toLowerCase();

  const visibleTree = useMemo(() => {
    let nodes = applyFilters(tree, filterState, getHostStatus);
    nodes = filterTreeByQuery(nodes, q);
    nodes = sortHostTree(nodes, sortKey, getHostStatus);
    return nodes;
  }, [tree, filterState, q, sortKey, getHostStatus]);

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
      await deleteSSHHost(host.id);
      toast.success(`Deleted ${host.name}`);
      fetchData(true);
    } catch (e: any) {
      toast.error(e?.message || "Failed to delete host");
    }
  };

  const handleClone = async (host: SSHHost) => {
    try {
      await createSSHHost({
        name: `${host.name} (copy)`,
        ip: host.ip,
        port: host.port,
        username: host.username,
        folder: host.folder,
        tags: host.tags ?? [],
        pin: false,
        authType: host.authType,
        password: host.password,
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
      fetchData(true);
    } catch (e: any) {
      toast.error(e?.message || "Failed to clone host");
    }
  };

  const openEdit = (host: SSHHost) => {
    setFormHost(host);
    setFormOpen(true);
  };

  const openCreate = () => {
    setFormHost(null);
    setFormOpen(true);
  };

  const isEmpty = visibleTree.length === 0;

  return (
    <Screen
      title="Hosts"
      headerRight={
        <View className="flex-row items-center gap-1.5">
          <Button
            variant="ghost"
            size="icon"
            onPress={openCreate}
            icon={<Plus size={20} color={color("muted-foreground")} />}
          />
          <Button
            variant="ghost"
            size="icon"
            onPress={() => setCredentialListOpen(true)}
            icon={<KeyRound size={18} color={color("muted-foreground")} />}
          />
          <Button
            variant="ghost"
            size="icon"
            onPress={() => setQuickConnectOpen(true)}
            icon={<Zap size={18} color={color("muted-foreground")} />}
          />
          <Button
            variant="ghost"
            size="icon"
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
            variant="ghost"
            size="icon"
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
          <Button
            variant="ghost"
            size="icon"
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
      <View className="px-4 pb-2 pt-3">
        <Input
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
          {isEmpty ? (
            <View className="items-center justify-center gap-3 py-16">
              <Text className="text-center text-sm text-muted-foreground">
                {q || isFilterActive
                  ? "No hosts match your search"
                  : "No hosts yet"}
              </Text>
              {!q && !isFilterActive ? (
                <Button
                  variant="accent"
                  size="sm"
                  onPress={openCreate}
                  icon={<Plus size={15} color={color("accent-brand")} />}
                >
                  Add host
                </Button>
              ) : null}
            </View>
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
      <BottomSheet
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
      </BottomSheet>

      {/* Filter menu */}
      <BottomSheet
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
        {FILTER_GROUPS.map((grp) => (
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
      </BottomSheet>

      {/* Create / edit form */}
      <HostForm
        visible={formOpen}
        host={formHost}
        onClose={() => setFormOpen(false)}
        onSaved={() => {
          setFormOpen(false);
          fetchData(true);
        }}
      />

      {/* Quick connect (ad-hoc, unsaved) */}
      <QuickConnect
        visible={quickConnectOpen}
        onClose={() => setQuickConnectOpen(false)}
      />

      {/* Credential manager */}
      <CredentialListModal
        visible={credentialListOpen}
        onClose={() => setCredentialListOpen(false)}
      />
    </Screen>
  );
}
