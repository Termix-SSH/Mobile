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
import { Activity } from "lucide-react-native";
import {
  getTunnelStatuses,
  connectTunnel,
  disconnectTunnel,
  cancelTunnel,
  getSSHHosts,
} from "../../../main-axios";
import { showToast } from "../../../utils/toast";
import type {
  TunnelStatus,
  SSHHost,
  TunnelConnection,
  TunnelSessionProps,
} from "../../../../types";
import { useOrientation } from "@/app/utils/orientation";
import { getResponsivePadding, getColumnCount } from "@/app/utils/responsive";
import {
  BACKGROUNDS,
  BORDER_COLORS,
  RADIUS,
  TEXT_COLORS,
} from "@/app/constants/designTokens";
import TunnelCard from "@/app/tabs/sessions/tunnel/TunnelCard";

export type TunnelManagerHandle = {
  refresh: () => void;
};

export const TunnelManager = forwardRef<
  TunnelManagerHandle,
  TunnelSessionProps
>(({ hostConfig, isVisible, title = "Manage Tunnels", onClose }, ref) => {
  const insets = useSafeAreaInsets();
  const { width, isLandscape } = useOrientation();
  const [tunnelStatuses, setTunnelStatuses] = useState<
    Record<string, TunnelStatus>
  >({});
  const [loadingTunnels, setLoadingTunnels] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [allHosts, setAllHosts] = useState<SSHHost[]>([]);
  const [currentHostConfig, setCurrentHostConfig] = useState(hostConfig);
  const refreshIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const padding = getResponsivePadding(isLandscape);
  const columnCount = getColumnCount(width, isLandscape, 350);

  const fetchTunnelStatuses = useCallback(async (showLoadingSpinner = true) => {
    try {
      if (showLoadingSpinner) {
        setIsLoading(true);
      }
      setError(null);

      const statuses = await getTunnelStatuses();
      setTunnelStatuses(statuses);
    } catch (err: any) {
      const errorMessage = err?.message || "Failed to fetch tunnel statuses";
      setError(errorMessage);
      if (showLoadingSpinner) {
        showToast.error(errorMessage);
      }
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  const fetchAllHosts = useCallback(async () => {
    try {
      const hosts = await getSSHHosts();
      setAllHosts(hosts);

      const updatedHost = hosts.find((h) => h.id === hostConfig.id);
      if (updatedHost) {
        setCurrentHostConfig({
          id: updatedHost.id,
          name: updatedHost.name,
          enableTunnel: updatedHost.enableTunnel,
          tunnelConnections: updatedHost.tunnelConnections,
        });
      }
    } catch (err: any) {
      console.error("Failed to fetch hosts for tunnel endpoint lookup:", err);
    }
  }, [hostConfig.id]);

  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    await Promise.all([fetchTunnelStatuses(false), fetchAllHosts()]);
    setIsRefreshing(false);
  }, [fetchTunnelStatuses, fetchAllHosts]);

  useImperativeHandle(
    ref,
    () => ({
      refresh: handleRefresh,
    }),
    [handleRefresh],
  );

  useEffect(() => {
    if (isVisible) {
      fetchTunnelStatuses();
      fetchAllHosts();

      refreshIntervalRef.current = setInterval(() => {
        fetchTunnelStatuses(false);
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
  }, [isVisible, fetchTunnelStatuses, fetchAllHosts]);

  const handleTunnelAction = async (
    action: "connect" | "disconnect" | "cancel",
    tunnelIndex: number,
  ) => {
    const tunnel = currentHostConfig.tunnelConnections[tunnelIndex];
    const tunnelName = `${currentHostConfig.name || `${currentHostConfig.id}`}_${tunnel.sourcePort}_${tunnel.endpointHost}_${tunnel.endpointPort}`;

    setLoadingTunnels((prev) => new Set(prev).add(tunnelName));

    try {
      if (action === "connect") {
        const endpointHost = allHosts.find(
          (h) =>
            h.name === tunnel.endpointHost ||
            `${h.username}@${h.ip}` === tunnel.endpointHost,
        );

        if (!endpointHost) {
          throw new Error(`Endpoint host not found: ${tunnel.endpointHost}`);
        }

        const sourceHost: Partial<SSHHost> = {
          id: currentHostConfig.id,
          name: currentHostConfig.name,
          ip: "",
          port: 0,
          username: "",
          authType: "none",
          folder: "",
          tags: [],
          pin: false,
          enableTerminal: true,
          enableTunnel: true,
          enableFileManager: true,
          defaultPath: "",
          tunnelConnections: currentHostConfig.tunnelConnections,
          createdAt: "",
          updatedAt: "",
        };

        const fullHost = allHosts.find((h) => h.id === currentHostConfig.id);
        if (!fullHost) {
          throw new Error("Source host not found");
        }

        const tunnelConfig = {
          name: tunnelName,
          hostName: fullHost.name || `${fullHost.username}@${fullHost.ip}`,
          sourceIP: fullHost.ip,
          sourceSSHPort: fullHost.port,
          sourceUsername: fullHost.username,
          sourcePassword:
            fullHost.authType === "password" ? fullHost.password : undefined,
          sourceAuthMethod: fullHost.authType,
          sourceSSHKey: fullHost.authType === "key" ? fullHost.key : undefined,
          sourceKeyPassword:
            fullHost.authType === "key" ? fullHost.keyPassword : undefined,
          sourceKeyType:
            fullHost.authType === "key" ? fullHost.keyType : undefined,
          sourceCredentialId: fullHost.credentialId,
          sourceUserId: fullHost.userId,
          endpointIP: endpointHost.ip,
          endpointSSHPort: endpointHost.port,
          endpointUsername: endpointHost.username,
          endpointPassword:
            endpointHost.authType === "password"
              ? endpointHost.password
              : undefined,
          endpointAuthMethod: endpointHost.authType,
          endpointSSHKey:
            endpointHost.authType === "key" ? endpointHost.key : undefined,
          endpointKeyPassword:
            endpointHost.authType === "key"
              ? endpointHost.keyPassword
              : undefined,
          endpointKeyType:
            endpointHost.authType === "key" ? endpointHost.keyType : undefined,
          endpointCredentialId: endpointHost.credentialId,
          endpointUserId: endpointHost.userId,
          sourcePort: tunnel.sourcePort,
          endpointPort: tunnel.endpointPort,
          maxRetries: tunnel.maxRetries,
          retryInterval: tunnel.retryInterval * 1000,
          autoStart: tunnel.autoStart,
          isPinned: fullHost.pin,
        };

        await connectTunnel(tunnelConfig);
        showToast.success(`Connecting tunnel on port ${tunnel.sourcePort}`);
      } else if (action === "disconnect") {
        await disconnectTunnel(tunnelName);
        showToast.success(`Disconnecting tunnel on port ${tunnel.sourcePort}`);
      } else if (action === "cancel") {
        await cancelTunnel(tunnelName);
        showToast.success(`Cancelling tunnel on port ${tunnel.sourcePort}`);
      }

      await fetchTunnelStatuses(false);
    } catch (err: any) {
      const errorMsg = err?.message || `Failed to ${action} tunnel`;
      showToast.error(errorMsg);
    } finally {
      setLoadingTunnels((prev) => {
        const newSet = new Set(prev);
        newSet.delete(tunnelName);
        return newSet;
      });
    }
  };

  const cardWidth =
    isLandscape && columnCount > 1 ? `${100 / columnCount - 1}%` : "100%";

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
      {isLoading && !tunnelStatuses ? (
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
            Loading tunnels...
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
          <Activity size={48} color="#EF4444" />
          <Text
            style={{
              color: "#ffffff",
              fontSize: 18,
              fontWeight: "600",
              marginTop: 16,
              textAlign: "center",
            }}
          >
            Failed to Load Tunnels
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
      ) : !currentHostConfig.enableTunnel ||
        !currentHostConfig.tunnelConnections ||
        currentHostConfig.tunnelConnections.length === 0 ? (
        <View
          style={{
            flex: 1,
            alignItems: "center",
            justifyContent: "center",
            padding: 32,
            marginTop: 80,
          }}
        >
          <Activity size={64} color="#6b7280" />
          <Text
            style={{
              color: "#9CA3AF",
              fontSize: 18,
              fontWeight: "600",
              marginTop: 16,
            }}
          >
            No Tunnels Configured
          </Text>
          <Text
            style={{
              color: "#6B7280",
              textAlign: "center",
              marginTop: 8,
              fontSize: 14,
            }}
          >
            This host doesn't have any SSH tunnels configured.
          </Text>
          <Text
            style={{
              color: "#6B7280",
              textAlign: "center",
              marginTop: 4,
              fontSize: 14,
            }}
          >
            Configure tunnels from the desktop app.
          </Text>
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
            <Text style={{ color: "#ffffff", fontSize: 24, fontWeight: "700" }}>
              SSH Tunnels
            </Text>
            <Text style={{ color: "#9CA3AF", fontSize: 14, marginTop: 4 }}>
              {currentHostConfig.tunnelConnections.length} tunnel
              {currentHostConfig.tunnelConnections.length !== 1 ? "s" : ""}{" "}
              configured for {currentHostConfig.name}
            </Text>
          </View>

          <View
            style={{
              flexDirection: isLandscape && columnCount > 1 ? "row" : "column",
              flexWrap: "wrap",
              gap: 12,
            }}
          >
            {currentHostConfig.tunnelConnections.map((tunnel, idx) => {
              const tunnelName = `${currentHostConfig.name || `${currentHostConfig.id}`}_${tunnel.sourcePort}_${tunnel.endpointHost}_${tunnel.endpointPort}`;
              const status = tunnelStatuses[tunnelName] || null;
              const isLoadingTunnel = loadingTunnels.has(tunnelName);

              return (
                <View
                  key={idx}
                  style={{
                    width: cardWidth,
                    marginBottom: isLandscape && columnCount > 1 ? 0 : 12,
                  }}
                >
                  <TunnelCard
                    tunnel={tunnel}
                    tunnelName={tunnelName}
                    status={status}
                    isLoading={isLoadingTunnel}
                    onAction={async (action) => handleTunnelAction(action, idx)}
                  />
                </View>
              );
            })}
          </View>
        </ScrollView>
      )}
    </View>
  );
});

export default TunnelManager;
