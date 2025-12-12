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
import { getServerMetricsById, executeSnippet } from "../../../main-axios";
import { showToast } from "../../../utils/toast";
import type { ServerMetrics, QuickAction } from "../../../../types";
import { useOrientation } from "@/app/utils/orientation";
import {
  getResponsivePadding,
  getColumnCount,
  getTabBarHeight,
} from "@/app/utils/responsive";
import {
  BACKGROUNDS,
  BORDER_COLORS,
  RADIUS,
  TEXT_COLORS,
} from "@/app/constants/designTokens";

interface ServerStatsProps {
  hostConfig: {
    id: number;
    name: string;
    quickActions?: QuickAction[];
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
    const [executingActions, setExecutingActions] = useState<Set<number>>(
      new Set(),
    );
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

    const cardWidth =
      isLandscape && columnCount > 1 ? `${100 / columnCount - 1}%` : "100%";

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

    const handleQuickAction = async (action: QuickAction) => {
      setExecutingActions((prev) => new Set(prev).add(action.snippetId));
      showToast.info(`Executing ${action.name}...`);

      try {
        const result = await executeSnippet(action.snippetId, hostConfig.id);

        if (result.success) {
          showToast.success(`${action.name} completed successfully`);
        } else {
          showToast.error(`${action.name} failed`);
        }
      } catch (error: any) {
        showToast.error(error?.message || `Failed to execute ${action.name}`);
      } finally {
        setExecutingActions((prev) => {
          const next = new Set(prev);
          next.delete(action.snippetId);
          return next;
        });
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
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 8,
              marginBottom: 12,
            }}
          >
            {icon}
            <Text style={{ color: "#ffffff", fontSize: 16, fontWeight: "600" }}>
              {title}
            </Text>
          </View>

          <View
            style={{
              flexDirection: "row",
              alignItems: "baseline",
              gap: 12,
              marginBottom: 4,
            }}
          >
            <Text style={{ color, fontSize: 32, fontWeight: "700" }}>
              {value}
            </Text>
            <Text style={{ color: "#9CA3AF", fontSize: 12 }}>{subtitle}</Text>
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
          backgroundColor: BACKGROUNDS.DARK,
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
              <Text
                style={{ color: "#ffffff", fontSize: 14, fontWeight: "600" }}
              >
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
            <View style={{ marginBottom: 12 }}>
              <Text
                style={{ color: "#ffffff", fontSize: 24, fontWeight: "700" }}
              >
                {hostConfig.name}
              </Text>
              <Text style={{ color: "#9CA3AF", fontSize: 14, marginTop: 4 }}>
                Server Statistics
              </Text>
            </View>

            {hostConfig?.quickActions && hostConfig.quickActions.length > 0 && (
              <View style={{ marginBottom: 16 }}>
                <Text
                  style={{
                    color: "#ffffff",
                    fontSize: 18,
                    fontWeight: "600",
                    marginBottom: 12,
                  }}
                >
                  Quick Actions
                </Text>
                <View
                  style={{
                    flexDirection: "row",
                    flexWrap: "wrap",
                    gap: 8,
                  }}
                >
                  {hostConfig.quickActions.map((action) => {
                    const isExecuting = executingActions.has(action.snippetId);
                    return (
                      <TouchableOpacity
                        key={action.snippetId}
                        onPress={() => handleQuickAction(action)}
                        disabled={isExecuting}
                        style={{
                          backgroundColor: isExecuting ? "#374151" : "#22C55E",
                          paddingHorizontal: 16,
                          paddingVertical: 10,
                          borderRadius: RADIUS.BUTTON,
                          flexDirection: "row",
                          alignItems: "center",
                          gap: 8,
                          opacity: isExecuting ? 0.6 : 1,
                        }}
                        activeOpacity={0.7}
                      >
                        {isExecuting && (
                          <ActivityIndicator size="small" color="#ffffff" />
                        )}
                        <Text
                          style={{
                            color: "#ffffff",
                            fontSize: 14,
                            fontWeight: "600",
                          }}
                        >
                          {action.name}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            )}

            <View
              style={{
                flexDirection:
                  isLandscape && columnCount > 1 ? "row" : "column",
                flexWrap: "wrap",
                gap: 12,
              }}
            >
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
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 8,
                    marginBottom: 12,
                  }}
                >
                  <Cpu size={20} color="#60A5FA" />
                  <Text
                    style={{
                      color: "#ffffff",
                      fontSize: 16,
                      fontWeight: "600",
                    }}
                  >
                    CPU Usage
                  </Text>
                </View>

                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "baseline",
                    gap: 12,
                    marginBottom: 12,
                  }}
                >
                  <Text
                    style={{
                      color: "#60A5FA",
                      fontSize: 32,
                      fontWeight: "700",
                    }}
                  >
                    {typeof metrics?.cpu?.percent === "number"
                      ? `${metrics.cpu.percent}%`
                      : "N/A"}
                  </Text>
                  <Text style={{ color: "#9CA3AF", fontSize: 12 }}>
                    {typeof metrics?.cpu?.cores === "number"
                      ? `${metrics.cpu.cores} cores`
                      : "N/A"}
                  </Text>
                </View>

                {metrics?.cpu?.load && (
                  <View
                    style={{
                      borderTopWidth: 1,
                      borderTopColor: BORDER_COLORS.BUTTON,
                      paddingTop: 12,
                    }}
                  >
                    <Text
                      style={{
                        color: "#9CA3AF",
                        fontSize: 12,
                        marginBottom: 8,
                      }}
                    >
                      Load Average
                    </Text>
                    <View style={{ flexDirection: "row", gap: 16 }}>
                      <View style={{ flex: 1 }}>
                        <Text
                          style={{
                            color: "#60A5FA",
                            fontSize: 18,
                            fontWeight: "700",
                          }}
                        >
                          {metrics.cpu.load[0].toFixed(2)}
                        </Text>
                        <Text
                          style={{
                            color: "#6B7280",
                            fontSize: 11,
                            marginTop: 2,
                          }}
                        >
                          1 min
                        </Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text
                          style={{
                            color: "#60A5FA",
                            fontSize: 18,
                            fontWeight: "700",
                          }}
                        >
                          {metrics.cpu.load[1].toFixed(2)}
                        </Text>
                        <Text
                          style={{
                            color: "#6B7280",
                            fontSize: 11,
                            marginTop: 2,
                          }}
                        >
                          5 min
                        </Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text
                          style={{
                            color: "#60A5FA",
                            fontSize: 18,
                            fontWeight: "700",
                          }}
                        >
                          {metrics.cpu.load[2].toFixed(2)}
                        </Text>
                        <Text
                          style={{
                            color: "#6B7280",
                            fontSize: 11,
                            marginTop: 2,
                          }}
                        >
                          15 min
                        </Text>
                      </View>
                    </View>
                  </View>
                )}
              </View>

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
