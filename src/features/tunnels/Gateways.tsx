import { View } from "react-native";
import type { Gateway } from "@/core/api/modules/tunnels";
import { Badge, Text } from "@/ui";
import { t } from "@/i18n";

const STATE_LABEL: Record<string, string> = {
  up: t("tunnels.gateways.up"),
  pending: t("tunnels.gateways.pending"),
  applying: t("tunnels.gateways.applying"),
  no_handshake: t("tunnels.gateways.noHandshake"),
  rules_missing: t("tunnels.gateways.rulesMissing"),
  down: t("tunnels.gateways.down"),
  unreachable: t("tunnels.gateways.unreachable"),
  error: t("tunnels.gateways.error"),
};

/** WireGuard gateways from the server. Read only: they are set up in Termix on the web. */
export function Gateways({ gateways }: { gateways: Gateway[] }) {
  if (!gateways.length) return null;
  return (
    <View className="mt-2 gap-2.5">
      <Text className="text-[10px] uppercase tracking-[1px] text-muted-foreground">
        {t("tunnels.gateways.gateways")}
      </Text>
      {gateways.map((g) => (
        <View key={g.id} className="gap-2 border border-border bg-card p-3.5">
          <View className="flex-row items-center justify-between gap-2">
            <Text
              weight="medium"
              className="min-w-0 flex-1 text-sm text-foreground"
              numberOfLines={1}
            >
              {g.name}
            </Text>
            <Badge variant={g.status.state === "up" ? "success" : "muted"}>
              {STATE_LABEL[g.status.state] ?? g.status.state}
            </Badge>
          </View>
          {g.status.message ? (
            <Text className="text-[11px] text-muted-foreground">
              {g.status.message}
            </Text>
          ) : null}
          {g.ports.map((p) => (
            <Text
              key={p.id}
              className="text-[12px] text-foreground"
              numberOfLines={1}
            >
              {`${p.proto.toUpperCase()} ${p.publicPort} to ${p.targetPort}${p.label ? ` | ${p.label}` : ""}${p.enabled ? "" : " | off"}`}
            </Text>
          ))}
        </View>
      ))}
      <Text className="text-[11px] text-muted-foreground">
        {t("tunnels.gateways.gatewaysCanOnlyBeChanged")}
      </Text>
    </View>
  );
}
