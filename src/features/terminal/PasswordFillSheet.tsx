import { KeyRound } from "lucide-react-native";
import { Sheet, SheetRow } from "@/ui";
import { useThemeColor } from "@/contexts/ThemeContext";
import { deviceWord } from "@/utils/device-word";
import { t } from "@/i18n";

export type FillChoice = "once" | "always" | "no";

/** Asks before a saved password goes into a prompt. */
export function PasswordFillSheet({
  ask,
  hostName,
  onChoose,
}: {
  ask: { sudo: boolean } | null;
  hostName: string;
  onChoose: (choice: FillChoice) => void;
}) {
  const color = useThemeColor();
  return (
    <Sheet
      visible={ask !== null}
      onClose={() => onChoose("no")}
      title={t("terminal.passwordFillSheet.fillTheSavedPassword")}
      description={
        ask?.sudo
          ? t("terminal.passwordFillSheet.asksForTheSudoPassword", { hostName })
          : t("terminal.passwordFillSheet.asksForAPassword", { hostName })
      }
      icon={<KeyRound size={16} color={color("accent-brand")} />}
    >
      <SheetRow
        label={t("terminal.passwordFillSheet.fillPassword")}
        onPress={() => onChoose("once")}
      />
      <SheetRow
        label={t("terminal.passwordFillSheet.alwaysFillOnThisHost")}
        description={t("terminal.passwordFillSheet.asksNoMoreOnThis", {
          deviceWord,
        })}
        onPress={() => onChoose("always")}
      />
      <SheetRow
        label={t("terminal.passwordFillSheet.notNow")}
        onPress={() => onChoose("no")}
      />
    </Sheet>
  );
}
