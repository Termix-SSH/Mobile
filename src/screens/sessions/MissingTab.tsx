import { View } from "react-native";
import { Blocks } from "lucide-react-native";
import { Button, EmptyState } from "@/ui";
import { t } from "@/i18n";

/**
 * Stands in for a tab whose feature is gone, like a server plugin an admin
 * turned off. It comes back by itself when the plugin is turned on again.
 */
export function MissingTab({
  title,
  isVisible,
  onClose,
}: {
  title: string;
  isVisible: boolean;
  onClose: () => void;
}) {
  return (
    <View style={{ flex: 1, display: isVisible ? "flex" : "none" }}>
      <EmptyState
        className="flex-1"
        icon={Blocks}
        title={t("sessions.missingTab.thisIsTurnedOffOn")}
        hint={t("sessions.missingTab.comesBackHereWhenAn", { title })}
        action={
          <Button size="sm" variant="muted" onPress={onClose}>
            {t("sessions.missingTab.closeTab")}
          </Button>
        }
      />
    </View>
  );
}
