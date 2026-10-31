import {
  forwardRef,
  useImperativeHandle,
  useState,
  useCallback,
  useEffect,
} from "react";
import { ScrollView, RefreshControl, View } from "react-native";
import { Network } from "lucide-react-native";
import { pluginTunnelName } from "@/core/api/compat/api-compat";
import type { Gateway } from "@/core/api/modules/tunnels";
import type { TunnelStatus, SSHHost, TunnelSessionProps } from "@/types";
import { useThemeColor } from "@/contexts/ThemeContext";
import { toast } from "@/utils/toast";
import { toTerminalHostConfig } from "@/utils/hosts";
import { SessionFrame, usePolling } from "@/screens/sessions/shared";
import { Tabs, Text } from "@/ui";
import { useClient } from "@/core/accounts";
import { useSessionAccountId } from "@/core/accounts/session";
import { useSessionRepositories } from "@/core/data/hooks";
import { transportsFor } from "@/core/transport";
import {
  loadTunnels,
  runOnFor,
  RUN_ON_PREF,
  tunnelRunner,
  useLocalTunnelStatuses,
  type RunOn,
} from "@/core/tunnels";
import TunnelCard from "./TunnelCard";
import { Gateways } from "./Gateways";

export type TunnelManagerHandle = {
  refresh: () => void;
};

/**
 * Stable tunnel name shared with the backend. Pre 2.9 servers use
 * host_sourcePort_endpoint_port, 2.9+ checks its own format against the
 * tunnel saved at that index on the host.
 */
function tunnelKey(
  host: TunnelSessionProps["hostConfig"],
  idx: number,
  t: { sourcePort: number; endpointHost?: string; endpointPort: number },
  pluginApi: boolean,
): string {
  if (pluginApi) return pluginTunnelName(host, idx, t);
  return `${host.name || host.id}_${t.sourcePort}_${t.endpointHost}_${t.endpointPort}`;
}

export const TunnelManager = forwardRef<
  TunnelManagerHandle,
  TunnelSessionProps
>(({ hostConfig, host: savedHost, isVisible }, ref) => {
  const accountId = useSessionAccountId();
  const client = useClient(accountId);
  const repos = useSessionRepositories();
  const color = useThemeColor();
  const localStatuses = useLocalTunnelStatuses();
  const [serverStatuses, setServerStatuses] = useState<
    Record<string, TunnelStatus>
  >({});
  const [loadingKeys, setLoadingKeys] = useState<Set<string>>(new Set());
  const [allHosts, setAllHosts] = useState<SSHHost[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "error">(
    "loading",
  );
  const [error, setError] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [tunnels, setTunnels] = useState(hostConfig.tunnelConnections || []);
  const [runOn, setRunOn] = useState<RunOn>(client ? "server" : "phone");
  const [gateways, setGateways] = useState<Gateway[]>([]);

  const onPhone = runOn === "phone";
  const pluginApi = !!client?.isPluginApi();
  const statuses = onPhone ? localStatuses : serverStatuses;

  const load = useCallback(async () => {
    if (!savedHost) return;
    const [list, where] = await Promise.all([
      loadTunnels(client, savedHost),
      runOnFor(repos, savedHost, !!client),
    ]);
    setTunnels(list);
    setRunOn(where);
    if (client?.supportsSavedTunnels()) {
      client.api.tunnels
        .getGateways()
        .then(setGateways)
        .catch(() => setGateways([]));
    }
  }, [client, repos, savedHost]);

  const fetchStatuses = useCallback(async () => {
    if (onPhone || !client) {
      setStatus("ready");
      return;
    }
    try {
      setServerStatuses(await client.api.tunnels.getTunnelStatuses());
      setStatus("ready");
      setError("");
    } catch (e: any) {
      setError(e?.message || "Failed to fetch tunnel statuses");
      setStatus((s) => (s === "loading" ? "error" : s));
    }
  }, [client, onPhone]);

  const fetchHosts = useCallback(async () => {
    if (!client || onPhone) return;
    try {
      setAllHosts(await client.api.hosts.getSSHHosts());
    } catch {
      // Endpoint lookup is best-effort; connect will surface a clear error.
    }
  }, [client, onPhone]);

  useEffect(() => {
    if (isVisible) void load();
  }, [isVisible, load]);

  useEffect(() => {
    if (isVisible) {
      fetchStatuses();
      fetchHosts();
    }
  }, [isVisible, fetchStatuses, fetchHosts]);

  usePolling(fetchStatuses, 4000, isVisible && !onPhone && status !== "error");

  useImperativeHandle(
    ref,
    () => ({
      refresh: () => {
        void load();
        void fetchStatuses();
      },
    }),
    [fetchStatuses, load],
  );

  const startOnPhone = useCallback(
    (tunnel: (typeof tunnels)[number], idx: number) => {
      if (!savedHost) return;
      const { local } = transportsFor(accountId);
      tunnelRunner.start({
        key: tunnelKey(hostConfig, idx, tunnel, pluginApi),
        hostId: hostConfig.id,
        hostName: hostConfig.name,
        tunnel,
        open: async () => {
          if (!local.openSession) {
            throw new Error("This build can't open tunnels on the phone.");
          }
          return local.openSession(toTerminalHostConfig(savedHost));
        },
      });
    },
    [accountId, hostConfig, pluginApi, savedHost],
  );

  // Auto start tunnels that are marked for it, once per visit to the host.
  useEffect(() => {
    if (!isVisible || !onPhone) return;
    tunnels.forEach((t, idx) => {
      const key = tunnelKey(hostConfig, idx, t, pluginApi);
      if (t.autoStart && !tunnelRunner.getSnapshot()[key]) startOnPhone(t, idx);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isVisible, onPhone, tunnels]);

  const chooseRunOn = async (next: RunOn) => {
    if (!savedHost) return;
    setRunOn(next);
    await repos.hostPrefs.set(savedHost, RUN_ON_PREF, next).catch(() => {});
  };

  const handleAction = useCallback(
    async (
      action: "connect" | "disconnect" | "cancel",
      tunnel: (typeof tunnels)[number],
      idx: number,
    ) => {
      const key = tunnelKey(hostConfig, idx, tunnel, pluginApi);
      if (onPhone) {
        if (action === "connect") {
          startOnPhone(tunnel, idx);
          toast.success(`Starting tunnel on port ${tunnel.sourcePort}`);
        } else {
          tunnelRunner.stop(key);
        }
        return;
      }
      if (!client) return;
      setLoadingKeys((prev) => new Set(prev).add(key));
      try {
        if (action === "connect" && pluginApi) {
          // 2.9 resolves both hosts and their secrets on the server.
          await client.api.tunnels.connectTunnel({
            name: key,
            sourceHostId: hostConfig.id,
            tunnelIndex: idx,
            scope: tunnel.scope,
            mode: tunnel.mode,
            sourcePort: tunnel.sourcePort,
            endpointHost: tunnel.endpointHost,
            endpointPort: tunnel.endpointPort,
            maxRetries: tunnel.maxRetries,
            retryInterval: tunnel.retryInterval * 1000,
            autoStart: tunnel.autoStart,
          });
          toast.success(`Connecting tunnel on port ${tunnel.sourcePort}`);
        } else if (action === "connect") {
          const sourceHost = allHosts.find((h) => h.id === hostConfig.id);
          const endpointHost = allHosts.find(
            (h) =>
              h.name === tunnel.endpointHost ||
              `${h.username}@${h.ip}` === tunnel.endpointHost,
          );
          if (!sourceHost) throw new Error("Source host not found");
          if (!endpointHost)
            throw new Error(`Endpoint host not found: ${tunnel.endpointHost}`);

          await client.api.tunnels.connectTunnel({
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
          await client.api.tunnels.disconnectTunnel(key);
          toast.success(`Disconnecting port ${tunnel.sourcePort}`);
        } else {
          await client.api.tunnels.cancelTunnel(key);
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
    [
      allHosts,
      client,
      hostConfig,
      fetchStatuses,
      onPhone,
      pluginApi,
      startOnPhone,
    ],
  );

  if (!isVisible) return null;

  const frameStatus =
    status === "loading"
      ? "loading"
      : status === "error"
        ? "error"
        : tunnels.length === 0 && gateways.length === 0
          ? "empty"
          : "ready";

  return (
    <SessionFrame
      title={hostConfig.name}
      subtitle={`Tunnels | ${tunnels.length} | ${onPhone ? "This phone" : "Server"}`}
      status={frameStatus}
      loadingLabel="Loading tunnels…"
      errorMessage={error}
      emptyMessage="No SSH tunnels configured for this host. Add tunnels from the host form."
      emptyIcon={<Network size={32} color={color("muted-foreground")} />}
      onRetry={status === "error" ? fetchStatuses : undefined}
    >
      <ScrollView
        className="flex-1"
        contentContainerStyle={{
          flexGrow: 1,
          padding: 12,
          gap: 10,
          paddingBottom: 24,
        }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            tintColor={color("muted-foreground")}
            colors={[color("muted-foreground")]}
            onRefresh={async () => {
              setRefreshing(true);
              await Promise.all([load(), fetchStatuses(), fetchHosts()]);
              setRefreshing(false);
            }}
          />
        }
      >
        {client ? (
          <View className="gap-1.5">
            <Text className="text-[10px] uppercase tracking-[1px] text-muted-foreground">
              Run on
            </Text>
            <Tabs<RunOn>
              value={runOn}
              onChange={chooseRunOn}
              options={[
                { id: "server", label: "Server" },
                { id: "phone", label: "This phone" },
              ]}
            />
          </View>
        ) : null}
        {onPhone ? (
          <Text className="text-[11px] text-muted-foreground">
            Tunnels on this phone stop when the app is closed. On iOS they also
            stop soon after the app goes to the background.
          </Text>
        ) : null}
        {tunnels.map((tunnel, idx) => {
          const key = tunnelKey(hostConfig, idx, tunnel, pluginApi);
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
        <Gateways gateways={gateways} />
      </ScrollView>
    </SessionFrame>
  );
});

TunnelManager.displayName = "TunnelManager";

export default TunnelManager;
