import { View } from "react-native";
import { Server } from "lucide-react-native";
import { ServerMetrics } from "@/types";
import { Text } from "@/ui";
import { useThemeColor } from "@/contexts/ThemeContext";
import { WidgetCard } from "./WidgetCard";

function Row({ label, value }: { label: string; value?: string | null }) {
  if (!value) return null;
  return (
    <View className="flex-row justify-between gap-3 py-0.5">
      <Text className="text-meta text-muted-foreground">{label}</Text>
      <Text
        className="flex-1 text-right text-meta text-foreground"
        numberOfLines={1}
      >
        {value}
      </Text>
    </View>
  );
}

export function SystemWidget({ metrics }: { metrics: ServerMetrics }) {
  const color = useThemeColor();
  const sys = metrics.system;

  return (
    <WidgetCard
      icon={<Server size={15} color={color("accent-brand")} />}
      title="System"
    >
      <Row label="Hostname" value={sys?.hostname} />
      <Row label="OS" value={sys?.os} />
      <Row label="Kernel" value={sys?.kernel} />
      <Row label="Arch" value={sys?.arch} />
      {!sys?.hostname && !sys?.os && !sys?.kernel ? (
        <Text className="text-meta text-muted-foreground">No system info</Text>
      ) : null}
    </WidgetCard>
  );
}
