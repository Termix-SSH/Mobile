import { View } from "react-native";
import { Text } from "@/ui";
import { Empty, str, type WidgetProps } from "./shared";
import { t } from "@/i18n";

/** Markdown marks taken off, so notes read as plain text. */
export function plainMarkdown(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, (block) => block.replace(/```\w*\n?/g, ""))
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^\s*[-*+]\s+\[( |x)\]\s+/gim, (_m, done) =>
      done.trim() ? "[x] " : "[ ] ",
    )
    .replace(/^\s*[-*+]\s+/gm, "- ")
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/(\*\*|__)(.*?)\1/g, "$2")
    .replace(/(\*|_)(.*?)\1/g, "$2")
    .replace(/`([^`]+)`/g, "$1")
    .trim();
}

export function NotesWidget({ item }: WidgetProps) {
  const content = str(item.config.content).trim();
  if (!content) return <Empty>{t("homepage.widgets.text.noNotesYet")}</Empty>;
  const text =
    item.typeId === "markdown_notes" ? plainMarkdown(content) : content;
  return (
    <Text className="px-3 py-2.5 text-[13px] leading-5 text-foreground">
      {text}
    </Text>
  );
}

const SIZES: Record<string, string> = {
  sm: "text-sm",
  md: "text-base",
  lg: "text-xl",
  xl: "text-2xl",
};
const ALIGN: Record<string, string> = {
  left: "text-left",
  center: "text-center",
  right: "text-right",
};

export function TextBannerWidget({ item }: WidgetProps) {
  const text = str(item.config.text).trim();
  if (!text) return <Empty>{t("homepage.widgets.text.noTextYet")}</Empty>;
  const weight = str(item.config.fontWeight, "semibold");
  return (
    <View className="px-3 py-3">
      <Text
        weight={
          weight === "normal"
            ? "regular"
            : weight === "bold"
              ? "bold"
              : "medium"
        }
        className={`${SIZES[str(item.config.fontSize, "md")] ?? "text-base"} ${ALIGN[str(item.config.textAlign, "center")] ?? "text-center"} text-foreground`}
      >
        {text}
      </Text>
    </View>
  );
}
