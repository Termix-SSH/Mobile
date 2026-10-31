import type { ReactNode } from "react";
import { ActivityIndicator, View } from "react-native";
import type { ExecRunner, ExecTarget } from "@/core/exec";
import type { ConnectionOrigin } from "@/core/transport";
import type { SSHHost } from "@/types";
import { useUiColors } from "@/contexts/ThemeContext";
import { Text } from "@/ui";
import { ConnectionError } from "./ConnectionError";

/**
 * Shows connecting and failure states for a feature that runs on the phone
 * or through the server, then renders the right side once it is known.
 */
export function ExecGate({
  target,
  onRetry,
  onSwitch,
  onClose,
  local,
  relay,
}: {
  target: ExecTarget;
  onRetry: () => void;
  onSwitch: (origin: ConnectionOrigin) => void;
  onClose?: () => void;
  local: (runner: ExecRunner) => ReactNode;
  relay: (host: SSHHost) => ReactNode;
}) {
  const colors = useUiColors();
  if (target.phase === "local") return <>{local(target.runner)}</>;
  if (target.phase === "relay") return <>{relay(target.host)}</>;
  if (target.phase === "failed") {
    return (
      <ConnectionError
        failure={target.failure}
        switchTo={target.fix}
        onRetry={onRetry}
        onSwitch={onSwitch}
        onClose={onClose}
      />
    );
  }
  return (
    <View className="flex-1 items-center justify-center gap-3 bg-background">
      <ActivityIndicator color={colors.brand} />
      <Text className="text-sm text-muted-foreground">Connecting...</Text>
    </View>
  );
}
