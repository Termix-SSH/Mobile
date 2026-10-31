import { useMemo } from "react";
import { Pressable, View } from "react-native";
import { Trash2 } from "lucide-react-native";
import {
  Button,
  FakeSwitch,
  Field,
  FieldRow,
  Input,
  SettingRow,
  Tabs,
  Text,
  digits,
} from "@/ui";
import { useThemeColor } from "@/contexts/ThemeContext";
import type {
  HostFormEditor,
  HostFormTabProps,
  HostFormValues,
} from "@/core/features/types";
import type { SSHHost, SSHHostData, TunnelConnection } from "@/types";

type Mode = "local" | "remote" | "dynamic";

export function tunnelsOf(value: HostFormValues): TunnelConnection[] {
  return Array.isArray(value.tunnels)
    ? (value.tunnels as TunnelConnection[])
    : [];
}

/** Other hosts a tunnel can point at, by the name it is resolved with. */
export function endpointOptions(hosts: SSHHost[]) {
  return hosts.map((h) => ({
    id: h.name || `${h.username}@${h.ip}`,
    label: h.name || h.ip,
  }));
}

export function newTunnel(endpointHost: string): TunnelConnection {
  return {
    mode: "local",
    sourcePort: 8080,
    endpointHost,
    endpointPort: 80,
    bindHost: "127.0.0.1",
    maxRetries: 3,
    retryInterval: 10,
    autoStart: false,
  } as TunnelConnection;
}

function HostTunnels({ value, onChange, context }: HostFormTabProps) {
  const color = useThemeColor();
  const tunnels = tunnelsOf(value);
  const options = useMemo(
    () => endpointOptions(context.otherHosts),
    [context.otherHosts],
  );
  const setAll = (next: TunnelConnection[]) => onChange({ tunnels: next });
  const patch = (idx: number, change: Partial<TunnelConnection>) =>
    setAll(tunnels.map((t, i) => (i === idx ? { ...t, ...change } : t)));
  const port = (v: string) => Number(digits(v)) || 0;

  return (
    <View className="gap-3">
      {tunnels.length === 0 ? (
        <Text className="text-meta text-muted-foreground">
          No tunnels yet. Add one to forward a port from the endpoint host to
          this host.
        </Text>
      ) : null}

      {tunnels.map((tunnel, idx) => (
        <View key={idx} className="gap-2.5 border border-border p-3">
          <View className="flex-row items-center justify-between">
            <Text weight="bold" className="text-xs">
              Tunnel {idx + 1}
            </Text>
            <Pressable
              onPress={() => setAll(tunnels.filter((_, i) => i !== idx))}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel={`Remove tunnel ${idx + 1}`}
              className="h-11 w-11 items-center justify-center border border-destructive/40 active:bg-destructive/10"
            >
              <Trash2 size={15} color={color("destructive")} />
            </Pressable>
          </View>

          <Field label="Mode">
            <Tabs<Mode>
              value={(tunnel.mode ?? tunnel.tunnelType ?? "local") as Mode}
              onChange={(v) =>
                patch(idx, {
                  mode: v,
                  tunnelType: v === "remote" ? "remote" : "local",
                })
              }
              options={[
                { id: "local", label: "Local" },
                { id: "remote", label: "Remote" },
                { id: "dynamic", label: "Dynamic" },
              ]}
              fill={false}
            />
          </Field>
          <Field
            label="Target host"
            hint="On this host, for tunnels the phone runs"
          >
            <Input
              value={tunnel.targetHost ?? ""}
              onChangeText={(v) => patch(idx, { targetHost: v })}
              placeholder="127.0.0.1"
              autoCapitalize="none"
              autoCorrect={false}
            />
          </Field>
          <Field label="Bind host">
            <Input
              value={tunnel.bindHost ?? ""}
              onChangeText={(v) => patch(idx, { bindHost: v })}
              placeholder="127.0.0.1"
              autoCapitalize="none"
              autoCorrect={false}
            />
          </Field>
          <Field label="Endpoint host">
            {options.length > 0 ? (
              <Tabs<string>
                value={tunnel.endpointHost ?? ""}
                onChange={(v) => patch(idx, { endpointHost: v })}
                options={options}
                fill={false}
              />
            ) : (
              <Text className="text-meta text-muted-foreground">
                Add another host first. Tunnels go through a saved host.
              </Text>
            )}
          </Field>
          <FieldRow>
            <Field label="Source port" className="flex-1">
              <Input
                value={String(tunnel.sourcePort ?? "")}
                onChangeText={(v) => patch(idx, { sourcePort: port(v) })}
                keyboardType="number-pad"
                placeholder="8080"
              />
            </Field>
            <Field label="Endpoint port" className="flex-1">
              <Input
                value={String(tunnel.endpointPort ?? "")}
                onChangeText={(v) => patch(idx, { endpointPort: port(v) })}
                keyboardType="number-pad"
                placeholder="80"
              />
            </Field>
          </FieldRow>
          <FieldRow>
            <Field label="Max retries" className="flex-1">
              <Input
                value={String(tunnel.maxRetries ?? "")}
                onChangeText={(v) => patch(idx, { maxRetries: port(v) })}
                keyboardType="number-pad"
                placeholder="3"
              />
            </Field>
            <Field label="Retry every (s)" className="flex-1">
              <Input
                value={String(tunnel.retryInterval ?? "")}
                onChangeText={(v) => patch(idx, { retryInterval: port(v) })}
                keyboardType="number-pad"
                placeholder="10"
              />
            </Field>
          </FieldRow>
          <SettingRow label="Start on its own" last>
            <FakeSwitch
              checked={!!tunnel.autoStart}
              onChange={(v) => patch(idx, { autoStart: v })}
            />
          </SettingRow>
        </View>
      ))}

      <Button
        variant="muted"
        onPress={() => setAll([...tunnels, newTunnel(options[0]?.id ?? "")])}
      >
        Add tunnel
      </Button>
    </View>
  );
}

export const hostTunnelsEditor: HostFormEditor = {
  read: (host) => ({ tunnels: host?.tunnelConnections ?? [] }),
  write: (value, payload: SSHHostData) => {
    payload.tunnelConnections = tunnelsOf(value);
  },
  validate: (value) => {
    const bad = tunnelsOf(value).findIndex(
      (t) =>
        !(Number(t.sourcePort) > 0 && Number(t.sourcePort) <= 65535) ||
        ((t.mode ?? "local") !== "dynamic" &&
          !(Number(t.endpointPort) > 0 && Number(t.endpointPort) <= 65535)),
    );
    return bad === -1 ? null : `Tunnel ${bad + 1} needs ports from 1 to 65535`;
  },
  component: HostTunnels,
};
