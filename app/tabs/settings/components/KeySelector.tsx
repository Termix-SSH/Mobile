import React, { useState, useMemo } from "react";
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  ScrollView,
  TextInput,
  Pressable,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { KeyConfig, KeyCategory } from "@/types/keyboard";
import { ALL_KEYS } from "@/app/tabs/sessions/terminal/keyboard/KeyDefinitions";

interface KeySelectorProps {
  visible: boolean;
  onClose: () => void;
  onSelectKey: (key: KeyConfig) => void;
  excludeKeys?: string[];
  title?: string;
}

const CATEGORIES: { id: KeyCategory; label: string }[] = [
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

    keys = keys.filter((key) => !excludeKeys.includes(key.id));

    return keys;
  }, [allKeysArray, selectedCategory, searchQuery, excludeKeys]);

  const handleSelectKey = (key: KeyConfig) => {
    onSelectKey(key);
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={false}
      onRequestClose={onClose}
    >
      <View className="flex-1 bg-[#18181b]">
        <View
          className="bg-[#1a1a1a] border-b border-[#303032] px-4"
          style={{ paddingTop: insets.top + 12, paddingBottom: 12 }}
        >
          <View className="flex-row items-center justify-between">
            <Text className="text-white text-lg font-semibold">{title}</Text>
            <TouchableOpacity onPress={onClose}>
              <Text className="text-green-500 text-base font-semibold">
                Done
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        <View className="bg-[#1a1a1a] border-b border-[#303032] px-4 py-3">
          <TextInput
            className="bg-[#27272a] border border-[#3f3f46] rounded-lg px-4 py-2 text-white"
            placeholder="Search keys..."
            placeholderTextColor="#6b7280"
            value={searchQuery}
            onChangeText={setSearchQuery}
            autoCapitalize="none"
            autoCorrect={false}
          />
        </View>

        <View className="bg-[#1a1a1a] border-b border-[#303032]">
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ paddingHorizontal: 16 }}
          >
            <TouchableOpacity
              onPress={() => setSelectedCategory("all")}
              className={`px-4 py-3 mr-2 ${
                selectedCategory === "all" ? "border-b-2 border-green-500" : ""
              }`}
            >
              <Text
                className={`text-sm font-semibold ${
                  selectedCategory === "all"
                    ? "text-green-500"
                    : "text-gray-400"
                }`}
              >
                All
              </Text>
            </TouchableOpacity>
            {CATEGORIES.map((cat) => (
              <TouchableOpacity
                key={cat.id}
                onPress={() => setSelectedCategory(cat.id)}
                className={`px-4 py-3 mr-2 ${
                  selectedCategory === cat.id
                    ? "border-b-2 border-green-500"
                    : ""
                }`}
              >
                <Text
                  className={`text-sm font-semibold ${
                    selectedCategory === cat.id
                      ? "text-green-500"
                      : "text-gray-400"
                  }`}
                >
                  {cat.label}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        <ScrollView className="flex-1 px-4 py-4">
          {filteredKeys.length === 0 ? (
            <View className="py-8">
              <Text className="text-gray-400 text-center">
                {searchQuery
                  ? "No keys found matching your search"
                  : "No keys available"}
              </Text>
            </View>
          ) : (
            <View className="gap-2">
              {filteredKeys.map((key) => (
                <TouchableOpacity
                  key={key.id}
                  onPress={() => handleSelectKey(key)}
                  className="bg-[#1a1a1a] border border-[#303032] rounded-lg p-4 flex-row items-center justify-between"
                >
                  <View className="flex-1 mr-4">
                    <View className="flex-row items-center gap-2 mb-1">
                      <View className="bg-[#27272a] border border-[#3f3f46] rounded px-3 py-1.5">
                        <Text className="text-white text-sm font-mono">
                          {key.label}
                        </Text>
                      </View>
                      <Text className="text-gray-500 text-xs">
                        {key.category}
                      </Text>
                    </View>
                    {key.description && (
                      <Text className="text-gray-400 text-xs mt-1">
                        {key.description}
                      </Text>
                    )}
                  </View>
                  <View className="bg-green-600 rounded-lg px-4 py-2">
                    <Text className="text-white text-sm font-semibold">
                      Add
                    </Text>
                  </View>
                </TouchableOpacity>
              ))}
            </View>
          )}
        </ScrollView>
      </View>
    </Modal>
  );
}
