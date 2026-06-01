import React, { useState, useMemo } from "react";
import { View, Modal, ScrollView, Pressable } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { X } from "lucide-react-native";
import { KeyConfig, KeyCategory } from "@/types/keyboard";
import { ALL_KEYS } from "@/app/tabs/sessions/terminal/keyboard/KeyDefinitions";
import { Text, Button, Input } from "@/app/components/ui";
import { useThemeColor } from "@/app/contexts/ThemeContext";

interface KeySelectorProps {
  visible: boolean;
  onClose: () => void;
  onSelectKey: (key: KeyConfig) => void;
  excludeKeys?: string[];
  title?: string;
}

const CATEGORIES: { id: KeyCategory | "all"; label: string }[] = [
  { id: "all", label: "All" },
  { id: "modifier", label: "Modifiers" },
  { id: "arrow", label: "Arrows" },
  { id: "navigation", label: "Navigation" },
  { id: "function", label: "Function" },
  { id: "number", label: "Numbers" },
  { id: "symbol", label: "Symbols" },
  { id: "operator", label: "Operators" },
  { id: "punctuation", label: "Punctuation" },
  { id: "action", label: "Actions" },
  { id: "shortcut", label: "Shortcuts" },
];

export default function KeySelector({
  visible,
  onClose,
  onSelectKey,
  excludeKeys = [],
  title = "Add Key",
}: KeySelectorProps) {
  const insets = useSafeAreaInsets();
  const color = useThemeColor();
  const [selectedCategory, setSelectedCategory] = useState<KeyCategory | "all">(
    "all",
  );
  const [searchQuery, setSearchQuery] = useState("");

  const allKeysArray = useMemo(() => Object.values(ALL_KEYS), []);

  const filteredKeys = useMemo(() => {
    let keys = allKeysArray;

    if (selectedCategory !== "all") {
      keys = keys.filter((key) => key.category === selectedCategory);
    }

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      keys = keys.filter(
        (key) =>
          key.label.toLowerCase().includes(query) ||
          key.id.toLowerCase().includes(query) ||
          key.description?.toLowerCase().includes(query),
      );
    }

    return keys.filter((key) => !excludeKeys.includes(key.id));
  }, [allKeysArray, selectedCategory, searchQuery, excludeKeys]);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={false}
      onRequestClose={onClose}
    >
      <View className="flex-1 bg-background" style={{ paddingTop: insets.top }}>
        {/* Header */}
        <View className="flex-row items-center gap-3 border-b border-border px-4 pb-3 pt-3">
          <Text weight="bold" className="flex-1 text-xl text-foreground">
            {title}
          </Text>
          <Pressable onPress={onClose} hitSlop={8} className="shrink-0">
            <X size={18} color={color("foreground")} />
          </Pressable>
        </View>

        {/* Search */}
        <View className="border-b border-border px-4 py-3">
          <Input
            placeholder="Search keys..."
            value={searchQuery}
            onChangeText={setSearchQuery}
            autoCapitalize="none"
            autoCorrect={false}
          />
        </View>

        {/* Category filter */}
        <View className="border-b border-border">
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ paddingHorizontal: 16 }}
          >
            {CATEGORIES.map((cat) => {
              const isActive = selectedCategory === cat.id;
              return (
                <Pressable
                  key={cat.id}
                  onPress={() => setSelectedCategory(cat.id)}
                  className={`mr-1 border-b-2 px-3 py-2.5 ${isActive ? "border-accent-brand" : "border-transparent"}`}
                >
                  <Text
                    weight={isActive ? "medium" : "regular"}
                    className={`text-xs ${isActive ? "text-accent-brand" : "text-muted-foreground"}`}
                  >
                    {cat.label}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>

        {/* Key list */}
        <ScrollView
          className="flex-1"
          contentContainerStyle={{ padding: 16, gap: 8, paddingBottom: 40 }}
        >
          {filteredKeys.length === 0 ? (
            <View className="items-center py-10">
              <Text className="text-sm text-muted-foreground">
                {searchQuery
                  ? "No keys match your search"
                  : "No keys available"}
              </Text>
            </View>
          ) : (
            filteredKeys.map((key) => (
              <Pressable
                key={key.id}
                onPress={() => onSelectKey(key)}
                className="flex-row items-center border border-border bg-card px-3 py-2.5 active:opacity-70"
              >
                <View className="mr-3 min-w-0 flex-1">
                  <View className="mb-0.5 flex-row items-center gap-2">
                    <View className="shrink-0 border border-border bg-muted px-2 py-1">
                      <Text weight="medium" className="text-xs text-foreground">
                        {key.label}
                      </Text>
                    </View>
                    <Text className="text-[10px] text-muted-foreground">
                      {key.category}
                    </Text>
                  </View>
                  {key.description ? (
                    <Text
                      className="mt-0.5 text-[10px] text-muted-foreground"
                      numberOfLines={1}
                    >
                      {key.description}
                    </Text>
                  ) : null}
                </View>
                <Button
                  variant="accent"
                  size="sm"
                  onPress={() => onSelectKey(key)}
                >
                  Add
                </Button>
              </Pressable>
            ))
          )}
        </ScrollView>
      </View>
    </Modal>
  );
}
