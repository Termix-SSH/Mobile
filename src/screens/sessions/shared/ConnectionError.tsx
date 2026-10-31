import { View } from "react-native";
import { AlertCircle, RotateCcw } from "lucide-react-native";
import { Button, Text } from "@/ui";
import { useThemeColor } from "@/contexts/ThemeContext";
import {
  failureTitle,
  hintFor,
  type ConnectFailure,
  type ConnectionOrigin,
} from "@/core/transport";

const SWITCH_LABEL: Record<Exclude<ConnectionOrigin, "auto">, string> = {
  server: "Connect through the server",
  device: "Connect from this phone",
};

const VIA: Record<string, string> = {
  local: "Tried from this phone",
  relay: "Tried through the server",
};

/**
 * What failed and what to try, with buttons for it. Shown in place of a tab
 * that could not connect, never a spinner.
 */
export function ConnectionError({
  failure,
  switchTo,
  onRetry,
  onSwitch,
  onClose,
}: {
  failure: ConnectFailure;
  switchTo?: ConnectionOrigin;
  onRetry?: () => void;
  onSwitch?: (origin: ConnectionOrigin) => void;
  onClose?: () => void;
}) {
  const color = useThemeColor();
  const hint = failure.hint || hintFor(failure.stage, failure.origin);
  const canSwitch = switchTo && switchTo !== "auto" && onSwitch;

  return (
    <View className="flex-1 items-center justify-center bg-background px-6">
      <View className="w-full max-w-md gap-3 border border-border bg-card p-4">
        <View className="flex-row items-center gap-2">
          <AlertCircle size={18} color={color("destructive")} />
          <Text weight="bold" className="flex-1 text-sm text-foreground">
            {failureTitle(failure.stage)}
          </Text>
        </View>
        <Text className="text-xs leading-5 text-muted-foreground">
          {failure.message}
        </Text>
        <Text className="text-xs leading-5 text-foreground">{hint}</Text>
        {failure.origin ? (
          <Text className="text-meta text-muted-foreground">
            {VIA[failure.origin]}
          </Text>
        ) : null}
        <View className="mt-1 flex-row flex-wrap gap-2">
          {onRetry ? (
            <Button
              size="sm"
              icon={<RotateCcw size={14} color={color("primary-foreground")} />}
              onPress={onRetry}
            >
              Try again
            </Button>
          ) : null}
          {canSwitch ? (
            <Button
              size="sm"
              variant="outline"
              onPress={() => onSwitch(switchTo)}
            >
              {SWITCH_LABEL[switchTo]}
            </Button>
          ) : null}
          {onClose ? (
            <Button size="sm" variant="muted" onPress={onClose}>
              Close
            </Button>
          ) : null}
        </View>
      </View>
    </View>
  );
}
