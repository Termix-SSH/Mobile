import { View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Screen } from "@/components/Screen";
import type { SessionMenuContext } from "@/core/features/types";
import { KeyLayoutEditor } from "./KeyLayoutEditor";
import { useKeyLayout } from "./useKeyLayout";
import { t } from "@/i18n";

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
      title={t("terminal.keys.hostKeyRowsView.keyRows")}
      subtitle={
        own
          ? t("terminal.keys.hostKeyRowsView.onlyFor", {
              name: ctx.session.host.name,
            })
          : t("terminal.keys.hostKeyRowsView.usingTheAppSRows", {
              name: ctx.session.host.name,
            })
      }
      onBack={onClose}
      keyboardAvoiding
    >
      <View className="flex-1" style={{ paddingBottom: insets.bottom }}>
        <KeyLayoutEditor
          layout={layout}
          onChange={(next) => void setHostLayout(next).catch(() => {})}
          onReset={() => void setHostLayout(null).catch(() => {})}
          resetLabel={t("terminal.keys.hostKeyRowsView.useTheAppSRows")}
        />
      </View>
    </Screen>
  );
}
