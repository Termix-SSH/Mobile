import {
  ScrollView,
  Text,
  TextInput,
  View,
  ActivityIndicator,
  Alert,
  TouchableOpacity,
  RefreshControl,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useState, useCallback, useRef } from "react";
import { useFocusEffect } from "@react-navigation/native";
import { RefreshCw } from "lucide-react-native";
import Folder from "@/app/tabs/hosts/navigation/Folder";
import {
  getSSHHosts,
  getFoldersWithStats,
  getAllServerStatuses,
  initializeServerConfig,
  getCurrentServerUrl,
} from "@/app/main-axios";
import { SSHHost, ServerStatus } from "@/types";
import { useOrientation } from "@/app/utils/orientation";
import { getResponsivePadding, getColumnCount } from "@/app/utils/responsive";

interface FolderData {
  name: string;
  hosts: SSHHost[];
  stats?: {
    totalHosts: number;
    hostsByType: {
      type: string;
      count: number;
    }[];
  };
}

export default function Hosts() {
  const insets = useSafeAreaInsets();
  const { width, isLandscape } = useOrientation();
  const [folders, setFolders] = useState<FolderData[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [serverStatuses, setServerStatuses] = useState<
    Record<number, ServerStatus>
  >({});
  const isRefreshingRef = useRef(false);

  const padding = getResponsivePadding(isLandscape);
  const columnCount = getColumnCount(width, isLandscape, 400);

  const fetchData = useCallback(async (isRefresh = false) => {
    if (isRefreshingRef.current) return;

    try {
      isRefreshingRef.current = true;

      if (isRefresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }

      await initializeServerConfig();

      const currentServerUrl = getCurrentServerUrl();

      if (!currentServerUrl) {
        Alert.alert(
          "No Server Configured",
          "Please configure a server first in the settings.",
        );
        return;
      }

      const [hostsResult, statusesResult] = await Promise.allSettled([
        getSSHHosts(),
        getAllServerStatuses(),
      ]);

      if (hostsResult.status !== "fulfilled") {
        throw hostsResult.reason;
      }

      const hosts = hostsResult.value;
      const statuses =
        statusesResult.status === "fulfilled" ? statusesResult.value : {};

      let foldersData = null;
      try {
        foldersData = await getFoldersWithStats();
      } catch (error) {}

      const folderMap = new Map<string, FolderData>();

      if (foldersData && Array.isArray(foldersData)) {
        foldersData.forEach((folder: any) => {
          folderMap.set(folder.name, {
            name: folder.name,
            hosts: [],
            stats: folder.stats,
          });
        });
      }

      hosts.forEach((host: SSHHost) => {
        const folderName = host.folder || "No Folder";
        if (!folderMap.has(folderName)) {
          folderMap.set(folderName, {
            name: folderName,
            hosts: [],
            stats: { totalHosts: 0, hostsByType: [] },
          });
        }
        folderMap.get(folderName)!.hosts.push(host);
      });

      const foldersArray = Array.from(folderMap.values()).sort((a, b) => {
        if (a.name === "No Folder") return 1;
        if (b.name === "No Folder") return -1;
        return a.name.localeCompare(b.name);
      });

      setFolders(foldersArray);
      setServerStatuses(statuses);
    } catch (error: any) {
      console.error("[Hosts] Error loading hosts:", error);

      const isAuthError =
        error?.response?.status === 401 ||
        error?.status === 401 ||
        error?.message?.includes("Authentication required");

      if (isAuthError) {
      } else {
        const errorMessage =
          error?.message ||
          "Failed to load hosts. Please check your connection and try again.";
        Alert.alert("Error Loading Hosts", errorMessage);
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
      isRefreshingRef.current = false;
    }
  }, []);

  const handleRefresh = useCallback(() => {
    if (!isRefreshingRef.current) {
      fetchData(true);
    }
  }, [fetchData]);

  useFocusEffect(
    useCallback(() => {
      fetchData();
    }, [fetchData]),
  );

  const filteredFolders = folders
    .map((folder) => ({
      ...folder,
      hosts: folder.hosts.filter(
        (host) =>
          host.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          host.ip.toLowerCase().includes(searchQuery.toLowerCase()) ||
          host.username.toLowerCase().includes(searchQuery.toLowerCase()),
      ),
    }))
    .filter((folder) => folder.hosts.length > 0 || searchQuery === "");

  const getHostStatus = (hostId: number): "online" | "offline" | "unknown" => {
    const status = serverStatuses[hostId];
    if (!status) return "unknown";
    return status.status;
  };

  if (loading) {
    return (
      <View
        className="flex-1 bg-dark-bg px-6 justify-center items-center"
        style={{ paddingTop: insets.top + 24 }}
      >
        <ActivityIndicator size="large" color="#22C55E" />
        <Text className="text-white mt-4">Loading hosts...</Text>
      </View>
    );
  }

  return (
    <View
      className="flex-1 bg-dark-bg"
      style={{ paddingTop: insets.top + 20, paddingHorizontal: padding }}
    >
      <View className="flex-1 gap-2">
        <View className="flex-row items-center justify-between">
          <Text
            className="text-white font-bold text-3xl"
            style={{ lineHeight: 36, includeFontPadding: false }}
          >
            Hosts
          </Text>
          <TouchableOpacity
            onPress={handleRefresh}
            disabled={refreshing || loading}
            className={`bg-[#1a1a1a] p-2 rounded-md border border-[#303032] ${
              refreshing || loading ? "opacity-50" : ""
            }`}
            activeOpacity={0.7}
          >
            <RefreshCw
              size={20}
              color="#22c55e"
              style={{
                transform: [{ rotate: refreshing ? "180deg" : "0deg" }],
              }}
            />
          </TouchableOpacity>
        </View>
        <TextInput
          className="text-white w-full h-auto bg-[#1a1a1a] rounded-md border border-[#303032] px-3 py-2"
          placeholder="Search hosts..."
          placeholderTextColor="#9CA3AF"
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
        <ScrollView
          className="flex-1 w-full"
          contentContainerStyle={{ flexGrow: 1, width: "100%", gap: "5px" }}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor="#22c55e"
              colors={["#22c55e"]}
              progressBackgroundColor="transparent"
              titleColor="#ffffff"
            />
          }
        >
          {filteredFolders.length === 0 ? (
            <View className="flex-1 justify-center items-center py-8">
              <Text className="text-gray-400 text-lg">
                {searchQuery
                  ? "No hosts found matching your search"
                  : "No hosts configured"}
              </Text>
            </View>
          ) : (
            filteredFolders.map((folder, index) => (
              <Folder
                key={folder.name}
                name={folder.name}
                hosts={folder.hosts}
                getHostStatus={getHostStatus}
              />
            ))
          )}
        </ScrollView>
      </View>
    </View>
  );
}
