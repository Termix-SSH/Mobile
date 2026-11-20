import { useEffect, useState, type ReactNode } from "react";
import { ActivityIndicator, Pressable, ScrollView, View } from "react-native";
import { useWindowInfo } from "@/utils/window-class";
import { Check, Radar, RefreshCw, Search, X } from "lucide-react-native";
import { useCapability } from "@/core/features";
import { useThemeColor } from "@/contexts/ThemeContext";
import { Sheet, Button, Input, Label, Text } from "@/ui";
import {
  filterTailscaleDevices,
  tailnetAddress,
  tailscaleHostDraft,
  type TailscaleDevice,
} from "@/features/tailscale/tailscale";
import type { SSHHost } from "@/types";
import { api } from "@/core/accounts";
import { t } from "@/i18n";

type DeviceStatus =
  "loading" | "ready" | "noApiKey" | "forbidden" | "failed" | "unavailable";

function useDevices(active: boolean) {
  const [devices, setDevices] = useState<TailscaleDevice[]>([]);
  const [status, setStatus] = useState<DeviceStatus>("loading");
  const [refreshIndex, setRefreshIndex] = useState(0);

  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    setStatus("loading");
    setDevices([]);
    api()
      .tailscale.getTailscaleDevices()
      .then((result) => {
        if (cancelled) return;
        if (!result) {
          setStatus("unavailable");
        } else if (result.error === "forbidden") {
          setStatus("forbidden");
        } else if (!result.hasApiKey) {
          setStatus("noApiKey");
        } else if (result.error) {
          setStatus("failed");
        } else {
          setDevices(result.devices);
          setStatus("ready");
        }
      })
      .catch(() => {
        if (!cancelled) setStatus("failed");
      });
    return () => {
      cancelled = true;
    };
  }, [active, refreshIndex]);

  return {
    devices,
    status,
    refresh: () => setRefreshIndex((index) => index + 1),
  };
}

function DeviceResults({
  devices,
  status,
  query,
  renderDevice,
}: {
  devices: TailscaleDevice[];
  status: DeviceStatus;
  query: string;
  renderDevice: (device: TailscaleDevice) => ReactNode;
}) {
  const color = useThemeColor();
  if (status === "loading") {
    return (
      <View className="items-center gap-2 py-6">
        <ActivityIndicator color={color("accent-brand")} />
        <Text className="text-xs text-muted-foreground">
          {t("tailscale.tailscaleDevices.loadingTailscaleDevices")}
        </Text>
      </View>
    );
  }
  const messages: Partial<Record<DeviceStatus, string>> = {
    noApiKey: t("tailscale.tailscaleDevices.noTailscaleApiKeyIs"),
    forbidden: t("tailscale.tailscaleDevices.youDoNotHavePermission"),
    failed: t("tailscale.tailscaleDevices.couldNotLoadTailscaleDevices"),
    unavailable: t("tailscale.tailscaleDevices.tailscaleIsUnavailableOnThis"),
  };
  const filtered = filterTailscaleDevices(devices, query);
  const message =
    messages[status] ??
    (filtered.length === 0
      ? query.trim()
        ? t("tailscale.tailscaleDevices.noTailscaleDevicesMatchYour")
        : t("tailscale.tailscaleDevices.noTailscaleDevicesFound")
      : null);
  if (message) {
    return (
      <Text className="py-4 text-center text-xs text-muted-foreground">
        {message}
      </Text>
    );
  }
  return <View className="gap-2">{filtered.map(renderDevice)}</View>;
}

function DeviceSearch({
  query,
  setQuery,
  loading,
  refresh,
}: {
  query: string;
  setQuery: (value: string) => void;
  loading: boolean;
  refresh: () => void;
}) {
  const color = useThemeColor();
  return (
    <View className="flex-row items-center gap-2">
      <Input
        containerClassName="flex-1"
        value={query}
        onChangeText={setQuery}
        placeholder={t("tailscale.tailscaleDevices.searchTailscaleDevices")}
        accessibilityLabel={t(
          "tailscale.tailscaleDevices.searchTailscaleDevices2",
        )}
        autoCapitalize="none"
        autoCorrect={false}
        leading={<Search size={15} color={color("muted-foreground")} />}
        trailing={
          query ? (
            <Pressable
              accessibilityLabel={t(
                "tailscale.tailscaleDevices.clearDeviceSearch",
              )}
              onPress={() => setQuery("")}
              hitSlop={8}
            >
              <X size={15} color={color("muted-foreground")} />
            </Pressable>
          ) : undefined
        }
      />
      <Button
        variant="muted"
        size="icon"
        accessibilityLabel={t(
          "tailscale.tailscaleDevices.refreshTailscaleDevices",
        )}
        onPress={refresh}
        disabled={loading}
        icon={<RefreshCw size={16} color={color("muted-foreground")} />}
      />
    </View>
  );
}

function DeviceDetails({ device }: { device: TailscaleDevice }) {
  return (
    <View className="min-w-0 flex-1 gap-0.5">
      <Text weight="medium" className="text-sm text-foreground">
        {device.hostname ||
          device.name ||
          tailnetAddress(device) ||
          t("tailscale.tailscaleDevices.device")}
      </Text>
      <Text selectable className="text-xs text-muted-foreground">
        {tailnetAddress(device) ||
          t("tailscale.tailscaleDevices.noTailnetAddress")}
      </Text>
      {device.os ? (
        <Text className="text-[11px] text-muted-foreground">{device.os}</Text>
      ) : null}
    </View>
  );
}

export function TailscaleDevicePicker({
  address,
  onSelect,
}: {
  address: string;
  onSelect: (device: TailscaleDevice) => void;
}) {
  const color = useThemeColor();
  const [query, setQuery] = useState("");
  const { devices, status, refresh } = useDevices(true);
  return (
    <View className="gap-2.5">
      <Label>{t("tailscale.tailscaleDevices.tailscaleDevice")}</Label>
      <DeviceSearch
        query={query}
        setQuery={setQuery}
        loading={status === "loading"}
        refresh={refresh}
      />
      <DeviceResults
        devices={devices}
        status={status}
        query={query}
        renderDevice={(device) => {
          const ip = tailnetAddress(device);
          const selected = !!ip && address === ip;
          return (
            <Pressable
              key={device.id}
              accessibilityRole="button"
              accessibilityState={{ selected, disabled: !ip }}
              disabled={!ip}
              onPress={() => onSelect(device)}
              className={`flex-row items-center gap-2 border p-3 ${selected ? "border-accent-brand/40 bg-accent-brand/10" : "border-border bg-card"} ${!ip ? "opacity-50" : ""}`}
            >
              {/* a11y-reads-children: the details hold the device name */}
              <DeviceDetails device={device} />
              {selected ? (
                <Check size={16} color={color("accent-brand")} />
              ) : null}
            </Pressable>
          );
        }}
      />
    </View>
  );
}

export function TailscaleDevices({
  visible,
  onClose,
  onDismiss,
  onAddHost,
}: {
  visible: boolean;
  onClose: () => void;
  onDismiss?: () => void;
  onAddHost: (draft: Partial<SSHHost>) => void;
}) {
  const color = useThemeColor();
  const { height } = useWindowInfo();
  const available = useCapability("hosts.discovery");
  const [query, setQuery] = useState("");
  const [usernames, setUsernames] = useState<Record<string, string>>({});
  const { devices, status, refresh } = useDevices(visible && available);

  useEffect(() => {
    if (!visible) return;
    setQuery("");
    setUsernames({});
  }, [visible]);

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      onDismiss={onDismiss}
      title={t("tailscale.tailscaleDevices.tailscaleDevices")}
      description={t("tailscale.tailscaleDevices.addAHostThatConnects")}
      icon={<Radar size={15} color={color("accent-brand")} />}
    >
      <ScrollView
        style={{ maxHeight: Math.max(80, height * 0.7 - 80) }}
        contentContainerStyle={{ padding: 16, gap: 12 }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {available ? (
          <DeviceSearch
            query={query}
            setQuery={setQuery}
            loading={status === "loading"}
            refresh={refresh}
          />
        ) : null}
        <DeviceResults
          devices={devices}
          status={available ? status : "unavailable"}
          query={query}
          renderDevice={(device) => {
            const username = usernames[device.id] ?? "root";
            return (
              <View
                key={device.id}
                className="gap-3 border border-border bg-card p-3"
              >
                <DeviceDetails device={device} />
                <View className="gap-1.5">
                  <Label>{t("tailscale.tailscaleDevices.username")}</Label>
                  <Input
                    value={username}
                    onChangeText={(value) =>
                      setUsernames((current) => ({
                        ...current,
                        [device.id]: value,
                      }))
                    }
                    accessibilityLabel={t(
                      "tailscale.tailscaleDevices.sshUsernameFor",
                      { value: device.hostname || device.name },
                    )}
                    autoCapitalize="none"
                    autoCorrect={false}
                    placeholder="root"
                  />
                </View>
                <Button
                  variant="default"
                  size="sm"
                  disabled={!tailnetAddress(device)}
                  onPress={() =>
                    onAddHost(tailscaleHostDraft(device, username))
                  }
                >
                  {t("tailscale.tailscaleDevices.addHost")}
                </Button>
              </View>
            );
          }}
        />
      </ScrollView>
    </Sheet>
  );
}
