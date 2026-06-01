import { Clock } from "lucide-react-native";
import { ServerMetrics } from "@/types";
import { Text } from "@/app/components/ui";
import { useThemeColor } from "@/app/contexts/ThemeContext";
import { WidgetCard } from "./WidgetCard";

function formatUptime(seconds: number): string {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const parts: string[] = [];
  if (d) parts.push(`${d}d`);
  if (h) parts.push(`${h}h`);
  if (m || parts.length === 0) parts.push(`${m}m`);
  return parts.join(" ");
}

export function UptimeWidget({ metrics }: { metrics: ServerMetrics }) {
  const color = useThemeColor();
  const uptime = metrics.uptime;
  const text =
    uptime?.formatted ||
    (uptime?.seconds != null ? formatUptime(uptime.seconds) : "—");

  return (
    <WidgetCard
      icon={<Clock size={15} color={color("accent-brand")} />}
      title="Uptime"
    >
      <Text weight="bold" className="text-lg text-foreground">
        {text}
      </Text>
    </WidgetCard>
  );
}
