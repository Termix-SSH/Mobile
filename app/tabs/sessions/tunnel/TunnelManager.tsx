import {
  forwardRef,
  useImperativeHandle,
  useState,
  useCallback,
  useEffect,
} from "react";
import { ScrollView, RefreshControl } from "react-native";
import { Network } from "lucide-react-native";
import {
  getTunnelStatuses,
  connectTunnel,
  disconnectTunnel,
  cancelTunnel,
  getSSHHosts,
} from "@/app/main-axios";
import type { TunnelStatus, SSHHost, TunnelSessionProps } from "@/types";
import { useThemeColor } from "@/app/contexts/ThemeContext";
import { toast } from "@/app/utils/toast";
import { SessionFrame, usePolling } from "@/app/tabs/sessions/_shared";
import TunnelCard from "./TunnelCard";

export type TunnelManagerHandle = {
  refresh: () => void;
};

/**
 * Stable tunnel name shared with the backend (host_sourcePort_endpoint_port).
 * Matches the legacy naming the backend's parseTunnelName understands.
 */
function tunnelKey(
  hostName: string,
  hostId: number,
  t: { sourcePort: number; endpointHost: string; endpointPort: number },
): string {
  return `${hostName || hostId}_${t.sourcePort}_${t.endpointHost}_${t.endpointPort}`;
}

export const TunnelManager = forwardRef<TunnelManagerHandle, TunnelSessionProps>(
  ({ hostConfig, isVisible }, ref) => {
    const color = useThemeColor();
    const [statuses, setStatuses] = useState<Record<string, TunnelStatus>>({});
    const [loadingKeys, setLoadingKeys] = useState<Set<string>>(new Set());
    const [allHosts, setAllHosts] = useState<SSHHost[]>([]);
    const [status, setStatus] = useState<"loading" | "ready" | "error">(
      "loading",
    );
    const [error, setError] = useState("");
    const [refreshing, setRefreshing] = useState(false);

    const tunnels = hostConfig.tunnelConnections || [];

    const fetchStatuses = useCallback(async () => {
      try {
        const data = await getTunnelStatuses();
        setStatuses(data);
        setStatus("ready");
        setError("");
      } catch (e: any) {
        setError(e?.message || "Failed to fetch tunnel statuses");
        setStatus((s) => (s === "loading" ? "error" : s));
      }
    }, []);

    const fetchHosts = useCallback(async () => {
      try {
        setAllHosts(await getSSHHosts());
      } catch {
        // Endpoint lookup is best-effort; connect will surface a clear error.
      }
    }, []);

    useEffect(() => {
      if (isVisible) {
        fetchStatuses();
        fetchHosts();
      }
    }, [isVisible, fetchStatuses, fetchHosts]);

    usePolling(fetchStatuses, 4000, isVisible && status !== "error");

    useImperativeHandle(ref, () => ({ refresh: fetchStatuses }), [
      fetchStatuses,
    ]);

    const handleAction = useCallback(
      async (
        action: "connect" | "disconnect" | "cancel",
        tunnel: (typeof tunnels)[number],
        idx: number,
      ) => {
        const key = tunnelKey(hostConfig.name, hostConfig.id, tunnel);
        setLoadingKeys((prev) => new Set(prev).add(key));
        try {
          if (action === "connect") {
            const sourceHost = allHosts.find((h) => h.id === hostConfig.id);
            const endpointHost = allHosts.find(
              (h) =>
                h.name === tunnel.endpointHost ||
                `${h.username}@${h.ip}` === tunnel.endpointHost,
            );
            if (!sourceHost) throw new Error("Source host not found");
            if (!endpointHost)
              throw new Error(`Endpoint host not found: ${tunnel.endpointHost}`);

            await connectTunnel({
              name: key,
              scope: tunnel.scope,
              mode: tunnel.mode,
              tunnelType: tunnel.tunnelType,
              bindHost: tunnel.bindHost,
              targetHost: tunnel.targetHost,
              sourceHostId: hostConfig.id,
              tunnelIndex: idx,
              hostName:
                sourceHost.name || `${sourceHost.username}@${sourceHost.ip}`,
              sourceIP: sourceHost.ip,
              sourceSSHPort: sourceHost.port,
              sourceUsername: sourceHost.username,
              sourcePassword:
                sourceHost.authType === "password"
                  ? sourceHost.password
                  : undefined,
              sourceAuthMethod: sourceHost.authType,
              sourceSSHKey:
                sourceHost.authType === "key" ? sourceHost.key : undefined,
              sourceKeyPassword:
                sourceHost.authType === "key"
                  ? sourceHost.keyPassword
                  : undefined,
              sourceKeyType:
                sourceHost.authType === "key" ? sourceHost.keyType : undefined,
              sourceCredentialId: sourceHost.credentialId,
              sourceUserId: sourceHost.userId,
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
                endpointHost.authType === "key"
                  ? endpointHost.keyType
                  : undefined,
              endpointCredentialId: endpointHost.credentialId,
              endpointUserId: endpointHost.userId,
              sourcePort: tunnel.sourcePort,
              endpointPort: tunnel.endpointPort,
              maxRetries: tunnel.maxRetries,
              retryInterval: tunnel.retryInterval * 1000,
              autoStart: tunnel.autoStart,
              isPinned: sourceHost.pin,
            });
            toast.success(`Connecting tunnel on port ${tunnel.sourcePort}`);
          } else if (action === "disconnect") {
            await disconnectTunnel(key);
            toast.success(`Disconnecting port ${tunnel.sourcePort}`);
          } else {
            await cancelTunnel(key);
            toast.success(`Cancelling port ${tunnel.sourcePort}`);
          }
          await fetchStatuses();
        } catch (e: any) {
          toast.error(e?.message || `Failed to ${action} tunnel`);
        } finally {
          setLoadingKeys((prev) => {
            const next = new Set(prev);
            next.delete(key);
            return next;
          });
        }
      },
      [allHosts, hostConfig.id, hostConfig.name, fetchStatuses],
    );

    if (!isVisible) return null;

    const frameStatus =
      status === "loading"
        ? "loading"
        : status === "error"
          ? "error"
          : tunnels.length === 0
            ? "empty"
            : "ready";

    return (
      <SessionFrame
        title={hostConfig.name}
        subtitle={`Tunnels · ${tunnels.length}`}
        status={frameStatus}
        loadingLabel="Loading tunnels…"
        errorMessage={error}
        emptyMessage="No SSH tunnels configured for this host. Add tunnels from the host form."
        emptyIcon={<Network size={32} color={color("muted-foreground")} />}
        onRetry={status === "error" ? fetchStatuses : undefined}
      >
        <ScrollView
          contentContainerStyle={{ padding: 12, gap: 10, paddingBottom: 120 }}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              tintColor={color("accent-brand")}
              onRefresh={async () => {
                setRefreshing(true);
                await Promise.all([fetchStatuses(), fetchHosts()]);
                setRefreshing(false);
              }}
            />
          }
        >
          {tunnels.map((tunnel, idx) => {
            const key = tunnelKey(hostConfig.name, hostConfig.id, tunnel);
            return (
              <TunnelCard
                key={`${key}-${idx}`}
                tunnel={tunnel}
                tunnelName={key}
                status={statuses[key] || null}
                isLoading={loadingKeys.has(key)}
                onAction={(action) => handleAction(action, tunnel, idx)}
              />
            );
          })}
        </ScrollView>
      </SessionFrame>
    );
  },
);

TunnelManager.displayName = "TunnelManager";

export default TunnelManager;
