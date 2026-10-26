import { useEffect, useState, type ReactNode } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  useWindowDimensions,
  View,
} from "react-native";
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
          Loading Tailscale devices…
        </Text>
      </View>
    );
  }
  const messages: Partial<Record<DeviceStatus, string>> = {
    noApiKey:
      "No Tailscale API key is configured on this server. Ask an administrator to add one.",
    forbidden: "You do not have permission to list Tailscale devices.",
    failed: "Could not load Tailscale devices. Refresh to try again.",
    unavailable: "Tailscale is unavailable on this server.",
  };
  const filtered = filterTailscaleDevices(devices, query);
  const message =
    messages[status] ??
    (filtered.length === 0
      ? query.trim()
        ? "No Tailscale devices match your search."
        : "No Tailscale devices found."
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
        placeholder="Search Tailscale devices…"
        accessibilityLabel="Search Tailscale devices"
        autoCapitalize="none"
        autoCorrect={false}
        leading={<Search size={15} color={color("muted-foreground")} />}
        trailing={
          query ? (
            <Pressable
              accessibilityLabel="Clear device search"
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
        accessibilityLabel="Refresh Tailscale devices"
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
        {device.hostname || device.name || tailnetAddress(device) || "Device"}
      </Text>
      <Text selectable className="text-xs text-muted-foreground">
        {tailnetAddress(device) || "No tailnet address"}
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
      <Label>Tailscale device</Label>
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
  const { height } = useWindowDimensions();
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
    <Sheet visible={visible} onClose={onClose} onDismiss={onDismiss}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View className="flex-row items-center gap-2.5 border-b border-border px-4 pb-3 pt-1">
          <View className="h-8 w-8 shrink-0 items-center justify-center border border-border bg-muted">
            <Radar size={15} color={color("accent-brand")} />
          </View>
          <View className="min-w-0 flex-1">
            <Text weight="bold" className="text-base text-foreground">
              Tailscale devices
            </Text>
            <Text className="text-xs text-muted-foreground">
              Add a host that connects with Tailscale SSH.
            </Text>
          </View>
          <Button
            variant="ghost"
            size="icon"
            accessibilityLabel="Close Tailscale devices"
            onPress={onClose}
            icon={<X size={18} color={color("muted-foreground")} />}
          />
        </View>
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
                    <Label>Username</Label>
                    <Input
                      value={username}
                      onChangeText={(value) =>
                        setUsernames((current) => ({
                          ...current,
                          [device.id]: value,
                        }))
                      }
                      accessibilityLabel={`SSH username for ${device.hostname || device.name}`}
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
                    Add host
                  </Button>
                </View>
              );
            }}
          />
        </ScrollView>
      </KeyboardAvoidingView>
    </Sheet>
  );
}
