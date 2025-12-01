import React, {
  useRef,
  useEffect,
  useState,
  useCallback,
  forwardRef,
  useImperativeHandle,
} from "react";
import {
  View,
  Text,
  ScrollView,
  ActivityIndicator,
  RefreshControl,
  TouchableOpacity,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  Cpu,
  MemoryStick,
  HardDrive,
  Activity,
  Clock,
  Server,
} from "lucide-react-native";
import { getServerMetricsById } from "../../main-axios";
import { showToast } from "../../utils/toast";
import type { ServerMetrics } from "../../../types/index";
import { useOrientation } from "@/app/utils/orientation";
import { getResponsivePadding, getColumnCount, getTabBarHeight } from "@/app/utils/responsive";
import { BACKGROUNDS, BORDER_COLORS, RADIUS } from "@/app/constants/designTokens";

interface ServerStatsProps {
  hostConfig: {
    id: number;
    name: string;
  };
  isVisible: boolean;
  title?: string;
  onClose?: () => void;
}

export type ServerStatsHandle = {
  refresh: () => void;
};

export const ServerStats = forwardRef<ServerStatsHandle, ServerStatsProps>(
  ({ hostConfig, isVisible, title = "Server Stats", onClose }, ref) => {
    const insets = useSafeAreaInsets();
    const { width, isLandscape } = useOrientation();
    const [metrics, setMetrics] = useState<ServerMetrics | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const refreshIntervalRef = useRef<NodeJS.Timeout | null>(null);

    const padding = getResponsivePadding(isLandscape);
    const columnCount = getColumnCount(width, isLandscape, 350);
    const tabBarHeight = getTabBarHeight(isLandscape);

    const fetchMetrics = useCallback(
      async (showLoadingSpinner = true) => {
        try {
          if (showLoadingSpinner) {
            setIsLoading(true);
          }
          setError(null);

          const data = await getServerMetricsById(hostConfig.id);
          setMetrics(data);
        } catch (err: any) {
          const errorMessage = err?.message || "Failed to fetch server metrics";
          setError(errorMessage);
          if (showLoadingSpinner) {
            showToast.error(errorMessage);
          }
        } finally {
          setIsLoading(false);
          setIsRefreshing(false);
        }
      },
      [hostConfig.id],
    );

    const handleRefresh = useCallback(() => {
      setIsRefreshing(true);
      fetchMetrics(false);
    }, [fetchMetrics]);

    useImperativeHandle(
      ref,
      () => ({
        refresh: handleRefresh,
      }),
      [handleRefresh],
    );

    useEffect(() => {
      if (isVisible) {
        fetchMetrics();

        // Auto-refresh every 5 seconds
        refreshIntervalRef.current = setInterval(() => {
          fetchMetrics(false);
        }, 5000);
      } else {
        if (refreshIntervalRef.current) {
          clearInterval(refreshIntervalRef.current);
          refreshIntervalRef.current = null;
        }
      }

      return () => {
        if (refreshIntervalRef.current) {
          clearInterval(refreshIntervalRef.current);
        }
      };
    }, [isVisible, fetchMetrics]);

    const cardWidth = isLandscape && columnCount > 1
      ? `${(100 / columnCount) - 1}%`
      : "100%";

    const formatUptime = (seconds: number | null): string => {
      if (seconds === null || seconds === undefined) return "N/A";

      const days = Math.floor(seconds / 86400);
      const hours = Math.floor((seconds % 86400) / 3600);
      const minutes = Math.floor((seconds % 3600) / 60);

      if (days > 0) {
        return `${days}d ${hours}h ${minutes}m`;
      } else if (hours > 0) {
        return `${hours}h ${minutes}m`;
      } else {
        return `${minutes}m`;
      }
    };

    const renderMetricCard = (
      icon: React.ReactNode,
      title: string,
      value: string,
      subtitle: string,
      color: string,
    ) => {
      return (
        <View
          style={{
            backgroundColor: BACKGROUNDS.CARD,
            borderRadius: RADIUS.CARD,
            padding: 16,
            borderWidth: 1,
            borderColor: BORDER_COLORS.BUTTON,
            marginBottom: isLandscape && columnCount > 1 ? 0 : 12,
            width: cardWidth,
          }}
        >

        <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 12 }}>
          {icon}
          <Text style={{ color: "#ffffff", fontSize: 16, fontWeight: "600" }}>
            {title}
          </Text>
        </View>

          <View style={{ flexDirection: "row", alignItems: "baseline", gap: 12, marginBottom: 4 }}>
            <Text style={{ color, fontSize: 32, fontWeight: "700" }}>
              {value}
            </Text>
            <Text style={{ color: "#9CA3AF", fontSize: 12 }}>
              {subtitle}
            </Text>
          </View>
        </View>
      );
    };

    if (!isVisible) {
      return null;
    }

    return (
      <View
        style={{
          flex: 1,
          backgroundColor:BACKGROUNDS.DARK,
          opacity: isVisible ? 1 : 0,
          display: isVisible ? "flex" : "none",
        }}
      >
        {isLoading && !metrics ? (
          <View
            style={{
              flex: 1,
              justifyContent: "center",
              alignItems: "center",
              backgroundColor: BACKGROUNDS.DARKEST,
            }}
          >
            <ActivityIndicator size="large" color="#22C55E" />
            <Text
              style={{
                color: "#9CA3AF",
                fontSize: 14,
                marginTop: 16,
              }}
            >
              Loading server metrics...
            </Text>
          </View>
        ) : error ? (
          <View
            style={{
              flex: 1,
              justifyContent: "center",
              alignItems: "center",
              backgroundColor: BACKGROUNDS.DARKEST,
              paddingHorizontal: 24,
            }}
          >
            <Server size={48} color="#EF4444" />
            <Text
              style={{
                color: "#ffffff",
                fontSize: 18,
                fontWeight: "600",
                marginTop: 16,
                textAlign: "center",
              }}
            >
              Failed to Load Metrics
            </Text>
            <Text
              style={{
                color: "#9CA3AF",
                fontSize: 14,
                marginTop: 8,
                textAlign: "center",
              }}
            >
              {error}
            </Text>
            <TouchableOpacity
              onPress={handleRefresh}
              style={{
                backgroundColor: "#22C55E",
                paddingHorizontal: 24,
                paddingVertical: 12,
                borderRadius: RADIUS.BUTTON,
                marginTop: 24,
              }}
            >
              <Text style={{ color: "#ffffff", fontSize: 14, fontWeight: "600" }}>
                Retry
              </Text>
            </TouchableOpacity>
          </View>
        ) : (
          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={{
              padding,
              paddingTop: padding / 2,
              paddingLeft: Math.max(insets.left, padding),
              paddingRight: Math.max(insets.right, padding),
              paddingBottom: padding,
            }}
            refreshControl={
              <RefreshControl
                refreshing={isRefreshing}
                onRefresh={handleRefresh}
                tintColor="#22C55E"
                colors={["#22C55E"]}
              />
            }
          >
            {/* Header */}
            <View style={{ marginBottom: 12 }}>
              <Text style={{ color: "#ffffff", fontSize: 24, fontWeight: "700" }}>
                {hostConfig.name}
              </Text>
              <Text style={{ color: "#9CA3AF", fontSize: 14, marginTop: 4 }}>
                Server Statistics
              </Text>
            </View>

            {/* Grid Container */}
            <View
              style={{
                flexDirection: isLandscape && columnCount > 1 ? "row" : "column",
                flexWrap: "wrap",
                gap: 12,
              }}
            >
              {/* CPU Metrics */}
              {renderMetricCard(
                <Cpu size={20} color="#60A5FA" />,
                "CPU Usage",
                typeof metrics?.cpu?.percent === "number"
                  ? `${metrics.cpu.percent}%`
                  : "N/A",
                typeof metrics?.cpu?.cores === "number"
                  ? `${metrics.cpu.cores} cores`
                  : "N/A",
                "#60A5FA",
              )}

              {/* Load Average */}
              {metrics?.cpu?.load && (
                <View
                  style={{
                    backgroundColor: BACKGROUNDS.CARD,
                    borderRadius: RADIUS.CARD,
                    padding: 16,
                    borderWidth: 1,
                    borderColor: BORDER_COLORS.BUTTON,
                    marginBottom: isLandscape && columnCount > 1 ? 0 : 12,
                    width: cardWidth,
                  }}
                >
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 12 }}>
                    <Activity size={20} color="#A78BFA" />
                    <Text style={{ color: "#ffffff", fontSize: 16, fontWeight: "600" }}>
                      Load Average
                    </Text>
                  </View>
                  <View style={{ flexDirection: "row", gap: 16 }}>
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: "#A78BFA", fontSize: 20, fontWeight: "700" }}>
                        {metrics.cpu.load[0].toFixed(2)}
                      </Text>
                      <Text style={{ color: "#6B7280", fontSize: 12, marginTop: 4 }}>
                        1 min
                      </Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: "#A78BFA", fontSize: 20, fontWeight: "700" }}>
                        {metrics.cpu.load[1].toFixed(2)}
                      </Text>
                      <Text style={{ color: "#6B7280", fontSize: 12, marginTop: 4 }}>
                        5 min
                      </Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: "#A78BFA", fontSize: 20, fontWeight: "700" }}>
                        {metrics.cpu.load[2].toFixed(2)}
                      </Text>
                      <Text style={{ color: "#6B7280", fontSize: 12, marginTop: 4 }}>
                        15 min
                      </Text>
                    </View>
                  </View>
                </View>
              )}

              {/* Memory Metrics */}
              {renderMetricCard(
                <MemoryStick size={20} color="#34D399" />,
                "Memory Usage",
                typeof metrics?.memory?.percent === "number"
                  ? `${metrics.memory.percent}%`
                  : "N/A",
                (() => {
                  const used = metrics?.memory?.usedGiB;
                  const total = metrics?.memory?.totalGiB;
                  if (typeof used === "number" && typeof total === "number") {
                    return `${used.toFixed(1)} / ${total.toFixed(1)} GiB`;
                  }
                  return "N/A";
                })(),
                "#34D399",
              )}

              {/* Disk Metrics */}
              {renderMetricCard(
                <HardDrive size={20} color="#F59E0B" />,
                "Disk Usage",
                typeof metrics?.disk?.percent === "number"
                  ? `${metrics.disk.percent}%`
                  : "N/A",
                (() => {
                  const used = metrics?.disk?.usedHuman;
                  const total = metrics?.disk?.totalHuman;
                  if (used && total) {
                    return `${used} / ${total}`;
                  }
                  return "N/A";
                })(),
                "#F59E0B",
              )}
            </View>
          </ScrollView>
        )}
      </View>
    );
  },
);

export default ServerStats;
