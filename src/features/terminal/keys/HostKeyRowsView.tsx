import { View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Screen } from "@/components/Screen";
import type { SessionMenuContext } from "@/core/features/types";
import { KeyLayoutEditor } from "./KeyLayoutEditor";
import { useKeyLayout } from "./useKeyLayout";

/** Key rows for one host. Changing anything gives the host its own copy. */
export function HostKeyRowsView({
  ctx,
  onClose,
}: {
  ctx: SessionMenuContext;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const { layout, own, setHostLayout } = useKeyLayout(ctx.session.host);
  return (
    <Screen
      title="Key rows"
      subtitle={
        own
          ? `Only for ${ctx.session.host.name}`
          : `Using the app's rows. Changes here are only for ${ctx.session.host.name}`
      }
      onBack={onClose}
      keyboardAvoiding
    >
      <View className="flex-1" style={{ paddingBottom: insets.bottom }}>
        <KeyLayoutEditor
          layout={layout}
          onChange={(next) => void setHostLayout(next).catch(() => {})}
          onReset={() => void setHostLayout(null).catch(() => {})}
          resetLabel="Use the app's rows"
        />
      </View>
    </Screen>
  );
}
