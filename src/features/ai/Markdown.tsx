import { useMemo, type ReactNode } from "react";
import { Linking, ScrollView, View } from "react-native";
import { Text, type TextWeight } from "@/ui/Text";
import { useConfirm } from "@/ui/Confirm";
import { toast } from "@/utils/toast";
import { parseMarkdown, safeLinkHref, type InlineNode } from "./markdown";

export interface MarkdownProps {
  source: string;
  muted?: boolean;
}

const HEADING_SIZE = [
  "",
  "text-xl",
  "text-lg",
  "text-title",
  "text-sm",
  "text-row",
  "text-xs",
];

/** Shared safe markdown for assistant replies and expanded Thinking text. */
export function Markdown({ source, muted = false }: MarkdownProps) {
  const blocks = useMemo(() => parseMarkdown(source), [source]);
  const confirm = useConfirm();
  const color = muted ? "text-muted-foreground" : "text-foreground";
  const body = `${muted ? "text-xs" : "text-sm"} leading-relaxed ${color}`;

  const openLink = async (destination: string) => {
    // Validate again at the native boundary, even though the parser filters URLs.
    const href = safeLinkHref(destination);
    if (!href) return;
    try {
      const ok = await confirm({
        title: "Open link?",
        description: (
          <Text selectable className="text-xs text-muted-foreground">
            {href}
          </Text>
        ),
        confirmLabel: "Open",
        destructive: false,
      });
      if (ok) await Linking.openURL(href);
    } catch {
      toast.error("Could not open link");
    }
  };

  const inline = (
    nodes: InlineNode[],
    weight: TextWeight = "regular",
  ): ReactNode =>
    nodes.map((node, index) => {
      switch (node.type) {
        case "text":
          return node.text;
        case "image-alt":
          return node.alt;
        case "strong":
          return (
            <Text key={index} selectable weight="bold" className={color}>
              {inline(node.children, "bold")}
            </Text>
          );
        case "emphasis":
        case "strikethrough":
          return (
            <Text
              key={index}
              selectable
              weight={weight}
              className={`${color} ${node.type === "emphasis" ? "italic" : "line-through"}`}
            >
              {inline(node.children, weight)}
            </Text>
          );
        case "code":
          return (
            <Text
              key={index}
              selectable
              weight={weight}
              className={`bg-muted text-xs ${color}`}
            >
              {node.text}
            </Text>
          );
        case "link":
          return (
            <Text
              key={index}
              selectable
              weight={weight}
              accessibilityRole="link"
              accessibilityHint="Asks for confirmation before opening"
              className={`underline ${muted ? "text-muted-foreground" : "text-accent-brand"}`}
              onPress={() => void openLink(node.href)}
            >
              {inline(node.children, weight)}
            </Text>
          );
      }
    });

  return (
    <View className="min-w-0 max-w-full gap-2">
      {blocks.map((block, index) => {
        switch (block.type) {
          case "paragraph":
            return (
              <Text key={index} selectable className={body}>
                {inline(block.children)}
              </Text>
            );
          case "heading":
            return (
              <Text
                key={index}
                selectable
                accessibilityRole="header"
                weight="bold"
                className={`${muted ? "text-xs" : HEADING_SIZE[block.level]} ${color}`}
              >
                {inline(block.children, "bold")}
              </Text>
            );
          case "code":
            return (
              <ScrollView
                key={index}
                horizontal
                className="max-w-full border border-border bg-muted"
                contentContainerStyle={{ padding: 8 }}
              >
                <Text selectable className={`text-xs ${color}`}>
                  {block.text}
                </Text>
              </ScrollView>
            );
          case "list":
            return (
              <View key={index} className="gap-1">
                {block.items.map((item, itemIndex) => (
                  <View key={itemIndex} className="flex-row gap-2 pl-2">
                    <Text selectable className={body}>
                      {block.ordered
                        ? `${(block.start ?? 1) + itemIndex}.`
                        : "•"}
                    </Text>
                    <Text selectable className={`min-w-0 flex-1 ${body}`}>
                      {inline(item)}
                    </Text>
                  </View>
                ))}
              </View>
            );
          case "blockquote":
            return (
              <View key={index} className="border-l-2 border-border pl-3">
                <Text selectable className={body}>
                  {inline(block.children)}
                </Text>
              </View>
            );
          case "table":
            return (
              <ScrollView key={index} horizontal className="max-w-full">
                <View>
                  {[block.header, ...block.rows].map((row, rowIndex) => (
                    <View key={rowIndex} className="flex-row">
                      {block.header.map((_, columnIndex) => (
                        <View
                          key={columnIndex}
                          className={`w-40 border border-border px-2 py-1 ${rowIndex === 0 ? "bg-muted" : ""}`}
                        >
                          <Text
                            selectable
                            weight={rowIndex === 0 ? "bold" : "regular"}
                            className={body}
                          >
                            {inline(
                              row[columnIndex] ?? [],
                              rowIndex === 0 ? "bold" : "regular",
                            )}
                          </Text>
                        </View>
                      ))}
                    </View>
                  ))}
                </View>
              </ScrollView>
            );
          case "horizontal-rule":
            return <View key={index} className="border-t border-border" />;
        }
      })}
    </View>
  );
}
