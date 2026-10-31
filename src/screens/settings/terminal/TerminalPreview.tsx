import { View } from "react-native";
import { Text } from "@/ui";
import type { TerminalThemeColors } from "@/constants/terminal-themes";

/** A few lines of fake shell output in the chosen colors and font. */
export function TerminalPreview({
  colors,
  fontFamily,
  fontSize = 13,
}: {
  colors: TerminalThemeColors;
  fontFamily?: string;
  fontSize?: number;
}) {
  const font = fontFamily === "monospace" ? undefined : fontFamily;
  const line = (parts: { text: string; color: string }[]) => (
    <Text
      style={{ fontFamily: font, fontSize, lineHeight: fontSize * 1.35 }}
      numberOfLines={1}
    >
      {parts.map((p, i) => (
        <Text key={i} style={{ color: p.color, fontFamily: font, fontSize }}>
          {p.text}
        </Text>
      ))}
    </Text>
  );
  return (
    <View
      style={{
        backgroundColor: colors.background,
        borderWidth: 1,
        borderColor: colors.brightBlack,
        padding: 10,
      }}
    >
      {line([
        { text: "user@box", color: colors.green },
        { text: ":", color: colors.foreground },
        { text: "~/app", color: colors.blue },
        { text: "$ ls -> ", color: colors.foreground },
        { text: "!=", color: colors.yellow },
      ])}
      {line([
        { text: "src  ", color: colors.brightBlue },
        { text: "build.sh  ", color: colors.brightGreen },
        { text: "notes.md", color: colors.foreground },
      ])}
      {line([
        { text: "error ", color: colors.red },
        { text: "warn ", color: colors.yellow },
        { text: "info ", color: colors.cyan },
        { text: "debug", color: colors.magenta },
      ])}
      <View style={{ flexDirection: "row", marginTop: 6 }}>
        {[
          colors.black,
          colors.red,
          colors.green,
          colors.yellow,
          colors.blue,
          colors.magenta,
          colors.cyan,
          colors.white,
        ].map((c, i) => (
          <View key={i} style={{ flex: 1, height: 6, backgroundColor: c }} />
        ))}
      </View>
    </View>
  );
}
