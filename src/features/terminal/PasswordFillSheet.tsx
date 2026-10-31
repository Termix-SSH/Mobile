import { KeyRound } from "lucide-react-native";
import { Sheet, SheetRow } from "@/ui";
import { useThemeColor } from "@/contexts/ThemeContext";

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
      title="Fill the saved password?"
      description={
        ask?.sudo
          ? `${hostName} asks for the sudo password.`
          : `${hostName} asks for a password.`
      }
      icon={<KeyRound size={16} color={color("accent-brand")} />}
    >
      <SheetRow label="Fill password" onPress={() => onChoose("once")} />
      <SheetRow
        label="Always fill on this host"
        description="Asks no more on this phone. Turn it off in the host's Terminal tab."
        onPress={() => onChoose("always")}
      />
      <SheetRow label="Not now" onPress={() => onChoose("no")} />
    </Sheet>
  );
}
