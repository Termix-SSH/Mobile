import { View, Modal, Pressable, ActivityIndicator } from "react-native";
import { Network, Wifi, X } from "lucide-react-native";
import { Text, Button } from "@/app/components/ui";
import { useThemeColor } from "@/app/contexts/ThemeContext";

export type NetworkModeChoice = "direct" | "tailscale";

type Props = {
  visible: boolean;
  busy?: boolean;
  error?: string;
  serverLabel?: string;
  onChoose: (mode: NetworkModeChoice) => void;
  onDismiss?: () => void;
};

/**
 * Shown on cold start when a Tailscale auth key is saved, so the user can pick
 * LAN/direct vs userspace Tailscale for this session.
 */
export function NetworkModeDialog({
  visible,
  busy,
  error,
  serverLabel,
  onChoose,
  onDismiss,
}: Props) {
  const color = useThemeColor();
  const muted = color("muted-foreground") ?? "#888";
  const accent = color("accent-brand") ?? "#f59145";

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={() => {
        if (!busy) onDismiss?.();
      }}
    >
      <View className="flex-1 items-center justify-center bg-black/70 px-6">
        <View className="w-full max-w-md border border-border bg-card p-5">
          <View className="mb-3 flex-row items-start justify-between gap-3">
            <View className="min-w-0 flex-1">
              <Text weight="bold" className="text-base text-foreground">
                How do you want to connect?
              </Text>
              {serverLabel ? (
                <Text
                  className="mt-1 text-[11px] text-muted-foreground"
                  numberOfLines={2}
                >
                  {serverLabel.replace(/^https?:\/\//, "")}
                </Text>
              ) : null}
            </View>
            {onDismiss && !busy ? (
              <Pressable onPress={onDismiss} hitSlop={10}>
                <X size={18} color={muted} />
              </Pressable>
            ) : null}
          </View>

          <Text className="mb-4 text-[11px] leading-4 text-muted-foreground">
            On the same LAN, prefer direct. Use Tailscale when you are off the
            local network. You can change this anytime via Change server.
          </Text>

          {error ? (
            <View className="mb-4 border border-destructive/40 bg-destructive/10 px-3 py-2.5">
              <Text className="text-[11px] leading-4 text-destructive">
                {error}
              </Text>
            </View>
          ) : null}

          {busy ? (
            <View className="items-center py-6">
              <ActivityIndicator color={accent} />
              <Text className="mt-3 text-sm text-muted-foreground">
                Connecting…
              </Text>
            </View>
          ) : (
            <View className="gap-2.5">
              <Button
                variant="accent"
                size="lg"
                onPress={() => onChoose("direct")}
                icon={<Wifi size={16} color={accent} />}
              >
                Direct / LAN
              </Button>
              <Button
                variant="outline"
                size="lg"
                onPress={() => onChoose("tailscale")}
                icon={
                  <Network size={16} color={color("foreground") ?? "#fff"} />
                }
              >
                Via Tailscale
              </Button>
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
}
