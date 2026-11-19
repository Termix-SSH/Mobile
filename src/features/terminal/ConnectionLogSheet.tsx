import { ScrollView } from "react-native";
import * as Clipboard from "expo-clipboard";
import { Copy, ScrollText } from "lucide-react-native";
import { Button, Sheet, SheetBody, Text } from "@/ui";
import { useThemeColor } from "@/contexts/ThemeContext";
import { toast } from "@/utils/toast";
import { t } from "@/i18n";

/** The whole connection log of a tab, with Copy for bug reports. */
export function ConnectionLogSheet({
  text,
  onClose,
}: {
  /** The formatted log; null hides the sheet. */
  text: string | null;
  onClose: () => void;
}) {
  const color = useThemeColor();
  const copy = async () => {
    if (!text) return;
    await Clipboard.setStringAsync(text);
    toast.success(t("terminal.connectionLogSheet.connectionLogCopied"));
  };
  return (
    <Sheet
      visible={text !== null}
      onClose={onClose}
      title={t("terminal.connectionLogSheet.connectionLog")}
      description={t("terminal.connectionLogSheet.copyItIntoABug")}
      icon={<ScrollText size={16} color={color("accent-brand")} />}
      footer={
        <Button
          variant="default"
          icon={<Copy size={14} color={color("accent-brand")} />}
          onPress={copy}
        >
          {t("terminal.connectionLogSheet.copy")}
        </Button>
      }
    >
      <SheetBody>
        <ScrollView
          style={{ maxHeight: 360 }}
          className="border border-border"
          contentContainerStyle={{ padding: 8 }}
        >
          <Text selectable className="font-mono text-[11px] text-foreground">
            {text ?? ""}
          </Text>
        </ScrollView>
      </SheetBody>
    </Sheet>
  );
}
