import { useState } from "react";
import { View } from "react-native";
import { Power } from "lucide-react-native";
import { useThemeColor } from "@/contexts/ThemeContext";
import { useFeatureContext } from "@/core/features/hooks";
import { Dot, HomeCard } from "@/screens/home/HomeCard";
import { useHomeData } from "@/screens/home/HomeData";
import type { SSHHost } from "@/types";
import { ListRow, ListRowAction, Text } from "@/ui";
import { sendWake } from "./wake";
import { t } from "@/i18n";

const SHOWN = 6;

/** Hosts with a MAC address, offline ones first. */
export function wakeTargets(
  hosts: SSHHost[],
  statuses: Record<number, string>,
): SSHHost[] {
  return hosts
    .filter((h) => !!h.macAddress)
    .sort(
      (a, b) =>
        Number(statuses[a.id] === "online") -
          Number(statuses[b.id] === "online") ||
        (a.name || a.ip).localeCompare(b.name || b.ip),
    )
    .slice(0, SHOWN);
}

/** One tap to wake a machine. */
export function WakeCard() {
  const ctx = useFeatureContext();
  const color = useThemeColor();
  const { hosts, statuses } = useHomeData();
  const [busy, setBusy] = useState<number | null>(null);
  const targets = wakeTargets(hosts, statuses);
  if (targets.length === 0) return null;

  const wake = async (host: SSHHost) => {
    setBusy(host.id);
    await sendWake(host, ctx);
    setBusy(null);
  };

  return (
    <HomeCard title={t("wakeOnLan.wakeCard.wakeOnLan")} icon={Power}>
      <View>
        {targets.map((host, index) => (
          <ListRow
            key={host.id}
            index={index}
            title={host.name || host.ip}
            icon={<Dot state={statuses[host.id] ?? "unknown"} />}
            meta={
              <Text className="text-meta text-muted-foreground">
                {host.macAddress}
              </Text>
            }
            actions={
              <ListRowAction
                label={t("wakeOnLan.wakeCard.wake", {
                  value: host.name || host.ip,
                })}
                tone="brand"
                disabled={busy === host.id}
                onPress={() => void wake(host)}
              >
                <Power size={15} color={color("accent-brand")} />
              </ListRowAction>
            }
          />
        ))}
      </View>
    </HomeCard>
  );
}
