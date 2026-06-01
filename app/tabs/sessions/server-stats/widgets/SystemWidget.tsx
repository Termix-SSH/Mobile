import { View } from "react-native";
import { Server } from "lucide-react-native";
import { ServerMetrics } from "@/types";
import { Text } from "@/app/components/ui";
import { useThemeColor } from "@/app/contexts/ThemeContext";
import { WidgetCard } from "./WidgetCard";

function Row({ label, value }: { label: string; value?: string | null }) {
  if (!value) return null;
  return (
    <View className="flex-row justify-between gap-3 py-0.5">
      <Text className="text-[11px] text-muted-foreground">{label}</Text>
      <Text
        className="text-[11px] text-foreground flex-1 text-right"
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
      {!sys?.hostname && !sys?.os && !sys?.kernel ? (
        <Text className="text-[11px] text-muted-foreground">
          No system info
        </Text>
      ) : null}
    </WidgetCard>
  );
}
