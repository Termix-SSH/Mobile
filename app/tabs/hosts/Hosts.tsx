import {
  ScrollView,
  View,
  ActivityIndicator,
  RefreshControl,
  Pressable,
} from "react-native";
import { useState, useCallback, useRef } from "react";
import { useFocusEffect } from "@react-navigation/native";
import {
  RefreshCw,
  Search,
  X,
  ArrowUpDown,
  Check,
  Zap,
} from "lucide-react-native";
import Folder from "@/app/tabs/hosts/navigation/Folder";
import { HostActionSheet } from "@/app/tabs/hosts/HostActionSheet";
import HostForm from "@/app/tabs/hosts/HostForm";
import { QuickConnect } from "@/app/tabs/hosts/QuickConnect";
import {
  getSSHHosts,
  getFoldersWithStats,
  getAllServerStatuses,
  initializeServerConfig,
  getCurrentServerUrl,
  deleteSSHHost,
  updateSSHHost,
} from "@/app/main-axios";
import { SSHHost, ServerStatus } from "@/types";
import { Screen } from "@/app/components/Screen";
import {
  Text,
  Input,
  Button,
  BottomSheet,
  SheetRow,
} from "@/app/components/ui";
import { useThemeColor } from "@/app/contexts/ThemeContext";
import { toast } from "@/app/utils/toast";

interface FolderData {
  name: string;
  color?: string;
  hosts: SSHHost[];
}

type SortKey =
  | "default"
  | "name-asc"
  | "name-desc"
  | "status-online"
  | "pinned";

const SORT_OPTIONS: { id: SortKey; label: string }[] = [
  { id: "default", label: "Default" },
  { id: "name-asc", label: "Name (A–Z)" },
  { id: "name-desc", label: "Name (Z–A)" },
  { id: "status-online", label: "Online first" },
  { id: "pinned", label: "Pinned first" },
];

export default function Hosts() {
  const color = useThemeColor();
  const [folders, setFolders] = useState<FolderData[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [serverStatuses, setServerStatuses] = useState<
    Record<number, ServerStatus>
  >({});
  const [sortKey, setSortKey] = useState<SortKey>("default");
  const [showSort, setShowSort] = useState(false);

  // Action sheet + form state
  const [sheetHost, setSheetHost] = useState<SSHHost | null>(null);
  const [formHost, setFormHost] = useState<SSHHost | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [quickConnectOpen, setQuickConnectOpen] = useState(false);

  const isRefreshingRef = useRef(false);

  const fetchData = useCallback(async (isRefresh = false) => {
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
      const hosts: SSHHost[] = Array.isArray(raw)
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

      const folderMap = new Map<string, FolderData>();
      if (Array.isArray(foldersData)) {
        foldersData.forEach((f: any) =>
          folderMap.set(f.name, { name: f.name, color: f.color, hosts: [] }),
        );
      }

      hosts.forEach((host) => {
        const folderName = host.folder || "No Folder";
        if (!folderMap.has(folderName))
          folderMap.set(folderName, { name: folderName, hosts: [] });
        folderMap.get(folderName)!.hosts.push(host);
      });

      const arr = Array.from(folderMap.values())
        .filter((f) => f.hosts.length > 0)
        .sort((a, b) => {
          if (a.name === "No Folder") return 1;
          if (b.name === "No Folder") return -1;
          return a.name.localeCompare(b.name);
        });

      setFolders(arr);
      setServerStatuses(statuses);
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
  }, []);

  const handleRefresh = useCallback(() => {
    if (!isRefreshingRef.current) fetchData(true);
  }, [fetchData]);

  useFocusEffect(
    useCallback(() => {
      fetchData();
    }, [fetchData]),
  );

  const getHostStatus = (
    hostId: number,
  ): "online" | "offline" | "unknown" => {
    return serverStatuses[hostId]?.status ?? "unknown";
  };

  const sortHosts = (hosts: SSHHost[]): SSHHost[] => {
    if (sortKey === "default") return hosts;
    const copy = [...hosts];
    copy.sort((a, b) => {
      switch (sortKey) {
        case "name-asc":
          return a.name.localeCompare(b.name);
        case "name-desc":
          return b.name.localeCompare(a.name);
        case "status-online":
          return (
            (getHostStatus(b.id) === "online" ? 1 : 0) -
            (getHostStatus(a.id) === "online" ? 1 : 0)
          );
        case "pinned":
          return (b.pin ? 1 : 0) - (a.pin ? 1 : 0);
        default:
          return 0;
      }
    });
    return copy;
  };

  const q = searchQuery.trim().toLowerCase();
  const filteredFolders = folders
    .map((folder) => ({
      ...folder,
      hosts: sortHosts(
        folder.hosts.filter(
          (h) =>
            !q ||
            h.name.toLowerCase().includes(q) ||
            h.ip.toLowerCase().includes(q) ||
            (h.username ?? "").toLowerCase().includes(q) ||
            (h.tags ?? []).some((t) => t.toLowerCase().includes(q)),
        ),
      ),
    }))
    .filter((folder) => folder.hosts.length > 0);

  const handleTogglePin = async (host: SSHHost) => {
    try {
      await updateSSHHost(host.id, { ...(host as any), pin: !host.pin });
      toast.success(host.pin ? "Unpinned" : "Pinned");
      fetchData(true);
    } catch (e: any) {
      toast.error(e?.message || "Failed to update host");
    }
  };

  const handleDelete = async (host: SSHHost) => {
    try {
      await deleteSSHHost(host.id);
      toast.success(`Deleted ${host.name}`);
      fetchData(true);
    } catch (e: any) {
      toast.error(e?.message || "Failed to delete host");
    }
  };

  const openEdit = (host: SSHHost) => {
    setFormHost(host);
    setFormOpen(true);
  };

  return (
    <Screen
      title="Hosts"
      headerRight={
        <View className="flex-row items-center gap-1.5">
          <Button
            variant="ghost"
            size="icon"
            onPress={() => setQuickConnectOpen(true)}
            icon={<Zap size={18} color={color("muted-foreground")} />}
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
                style={{ transform: [{ rotate: refreshing ? "180deg" : "0deg" }] }}
              />
            }
          />
        </View>
      }
    >
      <View className="px-4 pt-3 pb-2">
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
          <Text className="text-muted-foreground text-sm mt-3">
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
          {filteredFolders.length === 0 ? (
            <View className="items-center justify-center py-16">
              <Text className="text-muted-foreground text-sm text-center">
                {searchQuery
                  ? "No hosts match your search"
                  : "No hosts. Add hosts from the Termix web app."}
              </Text>
            </View>
          ) : (
            filteredFolders.map((folder) => (
              <Folder
                key={folder.name}
                name={folder.name}
                hosts={folder.hosts}
                color={folder.color}
                getHostStatus={getHostStatus}
                onHostPress={setSheetHost}
              />
            ))
          )}
        </ScrollView>
      )}

      {/* Action sheet on host tap */}
      <HostActionSheet
        host={sheetHost}
        status={sheetHost ? getHostStatus(sheetHost.id) : "unknown"}
        visible={sheetHost !== null}
        onClose={() => setSheetHost(null)}
        onEdit={openEdit}
        onTogglePin={handleTogglePin}
        onDelete={handleDelete}
      />

      {/* Sort menu */}
      <BottomSheet
        visible={showSort}
        onClose={() => setShowSort(false)}
        title="Sort hosts"
      >
        {SORT_OPTIONS.map((opt) => (
          <SheetRow
            key={opt.id}
            label={opt.label}
            onPress={() => {
              setSortKey(opt.id);
              setShowSort(false);
            }}
            trailing={
              sortKey === opt.id ? (
                <Check size={16} color={color("accent-brand")} />
              ) : undefined
            }
          />
        ))}
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
    </Screen>
  );
}
