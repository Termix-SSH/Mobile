import { useEffect, useRef } from "react";
import { Pressable, ScrollView } from "react-native";
import { ChevronRight } from "lucide-react-native";
import { Text } from "@/ui";
import { useUiColors } from "@/contexts/ThemeContext";
import { crumbs } from "../backend/paths";

/** The path as tappable parts, scrolled to the end. */
export function Breadcrumbs({
  path,
  onNavigate,
}: {
  path: string;
  onNavigate: (path: string) => void;
}) {
  const colors = useUiColors();
  const scroll = useRef<ScrollView>(null);
  const parts = crumbs(path);

  useEffect(() => {
    const id = setTimeout(
      () => scroll.current?.scrollToEnd({ animated: false }),
      0,
    );
    return () => clearTimeout(id);
  }, [path]);

  return (
    <ScrollView
      ref={scroll}
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ alignItems: "center", paddingHorizontal: 8 }}
      className="h-9 flex-grow-0 border-b border-border"
    >
      {parts.map((part, i) => {
        const last = i === parts.length - 1;
        return (
          <Pressable
            key={part.path}
            onPress={() => !last && onNavigate(part.path)}
            accessibilityRole="button"
            accessibilityLabel={`Go to ${part.path}`}
            className="h-9 flex-row items-center active:bg-muted"
          >
            {i > 1 ? <ChevronRight size={12} color={colors.textFaint} /> : null}
            <Text
              weight={last ? "bold" : undefined}
              className={`px-1 text-xs ${last ? "text-foreground" : "text-muted-foreground"}`}
            >
              {part.name}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}
