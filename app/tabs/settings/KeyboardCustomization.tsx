import React, { useState, useMemo } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  Switch,
  Modal,
  Pressable,
  ScrollView,
} from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useKeyboardCustomization } from "@/app/contexts/KeyboardCustomizationContext";
import { PRESET_DEFINITIONS } from "@/app/tabs/sessions/terminal/keyboard/KeyDefinitions";
import { PresetType, KeyConfig } from "@/types/keyboard";
import { showToast } from "@/app/utils/toast";
import KeySelector from "./components/KeySelector";
import UnifiedDraggableList, {
  UnifiedListItem,
} from "./components/UnifiedDraggableList";
import { renderKeyItem } from "./components/DraggableKeyList";
import { renderRowItem, useRowExpansion } from "./components/DraggableRowList";

type TabType = "presets" | "topbar" | "fullKeyboard" | "settings";
type AddKeyMode = "pinned" | "topbar" | "row" | null;

export default function KeyboardCustomization() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const {
    config,
    setPreset,
    updateSettings,
    resetToDefault,
    resetTopBar,
    resetFullKeyboard,
    addPinnedKey,
    removePinnedKey,
    reorderPinnedKeys,
    addTopBarKey,
    removeTopBarKey,
    reorderTopBarKeys,
    reorderRows,
    toggleRowVisibility,
    addKeyToRow,
    removeKeyFromRow,
    reorderKeysInRow,
  } = useKeyboardCustomization();

  const [activeTab, setActiveTab] = useState<TabType>("presets");
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [resetType, setResetType] = useState<"all" | "topbar" | "fullkeyboard">(
    "all",
  );
  const [showKeySelector, setShowKeySelector] = useState(false);
  const [addKeyMode, setAddKeyMode] = useState<AddKeyMode>(null);
  const [selectedRowId, setSelectedRowId] = useState<string | null>(null);
  const [listResetKey, setListResetKey] = useState(0);

  const { expandedRowId, toggleExpand } = useRowExpansion();

  const topBarData: UnifiedListItem[] = useMemo(() => {
    const items: UnifiedListItem[] = [];

    items.push({
      type: "header",
      id: "header-pinned",
      title: "Pinned Keys",
      subtitle: "Your frequently used keys",
      onAddPress: () => openKeySelector("pinned"),
      addButtonLabel: "+ Add",
    });

    config.topBar.pinnedKeys.forEach((key) => {
      items.push({
        type: "draggable-key",
        id: `pinned-${key.id}`,
        data: key,
        section: "pinned",
        renderItem: (item, onRemove, drag, isActive) =>
          renderKeyItem({ item, onRemove, drag, isActive }),
      });
    });

    items.push({ type: "spacer", id: "spacer-1", height: 20 });

    items.push({
      type: "header",
      id: "header-topbar",
      title: "Top Bar Keys",
      subtitle: "Keys shown in the top bar",
      onAddPress: () => openKeySelector("topbar"),
      addButtonLabel: "+ Add",
    });

    config.topBar.keys.forEach((key) => {
      items.push({
        type: "draggable-key",
        id: `topbar-${key.id}`,
        data: key,
        section: "topbar",
        renderItem: (item, onRemove, drag, isActive) =>
          renderKeyItem({ item, onRemove, drag, isActive }),
      });
    });

    items.push({ type: "spacer", id: "spacer-2", height: 20 });

    items.push({
      type: "button",
      id: "reset-topbar",
      label: "Reset Top Bar to Default",
      variant: "danger",
      onPress: () => {
        setResetType("topbar");
        setShowResetConfirm(true);
      },
    });

    return items;
  }, [config.topBar.pinnedKeys, config.topBar.keys]);

  const fullKeyboardData: UnifiedListItem[] = useMemo(() => {
    const items: UnifiedListItem[] = [];

    items.push({
      type: "header",
      id: "header-rows",
      title: "Keyboard Rows",
      subtitle: "Organize, reorder, and customize keyboard rows",
    });

    config.fullKeyboard.rows.forEach((row) => {
      items.push({
        type: "draggable-row",
        id: `row-${row.id}`,
        data: row,
        renderItem: (item, drag, isActive) =>
          renderRowItem({
            item,
            drag,
            isActive,
            onToggleVisibility: toggleRowVisibility,
            onRemoveKey: removeKeyFromRow,
            onReorderKeys: reorderKeysInRow,
            onAddKeyToRow: (rowId) => openKeySelector("row", rowId),
            expandedRowId,
            onToggleExpand: toggleExpand,
          }),
      });

      if (expandedRowId === row.id) {
        items.push({
          type: "row-keys-header",
          id: `keys-header-${row.id}`,
          rowId: row.id,
          onAddPress: () => openKeySelector("row", row.id),
        });

        row.keys.forEach((key) => {
          items.push({
            type: "draggable-key",
            id: `row-${row.id}-key-${key.id}`,
            data: key,
            section: "row",
            rowId: row.id,
            renderItem: (item, onRemove, drag, isActive) =>
              renderKeyItem({ item, onRemove, drag, isActive }),
          });
        });

        items.push({
          type: "spacer",
          id: `row-close-${row.id}`,
          height: 12,
        });
      }
    });

    items.push({ type: "spacer", id: "spacer-3", height: 20 });

    items.push({
      type: "button",
      id: "reset-fullkeyboard",
      label: "Reset Full Keyboard to Default",
      variant: "danger",
      onPress: () => {
        setResetType("fullkeyboard");
        setShowResetConfirm(true);
      },
    });

    return items;
  }, [config.fullKeyboard.rows, expandedRowId]);

  const handlePresetSelect = async (presetId: PresetType) => {
    try {
      await setPreset(presetId);
      showToast.success(
        `Switched to ${PRESET_DEFINITIONS.find((p) => p.id === presetId)?.name} preset`,
      );
    } catch (error) {
      showToast.error("Failed to switch preset");
    }
  };

  const handleKeySelected = async (key: KeyConfig) => {
    try {
      if (addKeyMode === "pinned") {
        await addPinnedKey(key);
        showToast.success(`Added ${key.label} to pinned keys`);
      } else if (addKeyMode === "topbar") {
        await addTopBarKey(key);
        showToast.success(`Added ${key.label} to top bar`);
      } else if (addKeyMode === "row" && selectedRowId) {
        await addKeyToRow(selectedRowId, key);
        showToast.success(`Added ${key.label} to row`);
      }
    } catch (error) {
      showToast.error("Failed to add key");
    }
  };

  const openKeySelector = (mode: AddKeyMode, rowId?: string) => {
    setAddKeyMode(mode);
    setSelectedRowId(rowId || null);
    setShowKeySelector(true);
  };

  const getExcludedKeys = (): string[] => {
    if (addKeyMode === "pinned") {
      return config.topBar.pinnedKeys.map((k) => k.id);
    } else if (addKeyMode === "topbar") {
      return config.topBar.keys.map((k) => k.id);
    } else if (addKeyMode === "row" && selectedRowId) {
      const row = config.fullKeyboard.rows.find((r) => r.id === selectedRowId);
      return row ? row.keys.map((k) => k.id) : [];
    }
    return [];
  };

  const handleKeySizeChange = async (size: "small" | "medium" | "large") => {
    await updateSettings({ keySize: size });
  };

  const handleCompactModeToggle = async (value: boolean) => {
    await updateSettings({ compactMode: value });
  };

  const handleHapticToggle = async (value: boolean) => {
    await updateSettings({ hapticFeedback: value });
  };

  const handleHintsToggle = async (value: boolean) => {
    await updateSettings({ showHints: value });
  };

  const handleReset = async () => {
    try {
      if (resetType === "all") {
        await resetToDefault();
        showToast.success("Keyboard reset to default");
      } else if (resetType === "topbar") {
        await resetTopBar();
        showToast.success("Top bar reset to default");
      } else if (resetType === "fullkeyboard") {
        await resetFullKeyboard();
        showToast.success("Full keyboard reset to default");
      }
      setShowResetConfirm(false);
    } catch (error) {
      showToast.error("Failed to reset");
    }
  };

  const renderPresets = () => (
    <ScrollView className="flex-1 px-4 py-4">
      <Text className="text-white text-lg font-semibold mb-2">
        Keyboard Presets
      </Text>
      <Text className="text-gray-400 text-sm mb-4">
        Choose a preset layout optimized for different use cases
      </Text>

      {PRESET_DEFINITIONS.map((preset) => (
        <TouchableOpacity
          key={preset.id}
          onPress={() => handlePresetSelect(preset.id)}
          className={`mb-3 p-4 rounded-lg border ${
            config.preset === preset.id
              ? "bg-green-900/20 border-green-500"
              : "bg-[#1a1a1a] border-[#303032]"
          }`}
        >
          <View className="flex-row items-center justify-between mb-1">
            <Text className="text-white text-base font-semibold">
              {preset.name}
            </Text>
            {config.preset === preset.id && (
              <View className="bg-green-500 rounded-full px-2 py-1">
                <Text className="text-white text-xs font-semibold">ACTIVE</Text>
              </View>
            )}
          </View>
          <Text className="text-gray-400 text-sm">{preset.description}</Text>
        </TouchableOpacity>
      ))}

      {config.preset === "custom" && (
        <View className="mt-2 p-4 bg-blue-900/20 border border-blue-500 rounded-lg">
          <Text className="text-blue-400 text-sm font-semibold mb-1">
            Custom Layout
          </Text>
          <Text className="text-gray-400 text-xs">
            You've made custom changes. Select a preset above to reset to a
            predefined layout.
          </Text>
        </View>
      )}
    </ScrollView>
  );

  const validateTopBarDrag = (newData: UnifiedListItem[]): boolean => {
    const pinnedHeaderIndex = newData.findIndex(
      (item) => item.type === "header" && item.id === "header-pinned",
    );
    const topbarHeaderIndex = newData.findIndex(
      (item) => item.type === "header" && item.id === "header-topbar",
    );
    const resetButtonIndex = newData.findIndex(
      (item) => item.type === "button" && item.id === "reset-topbar",
    );

    for (let i = 0; i <= pinnedHeaderIndex; i++) {
      const item = newData[i];
      if (item.type === "draggable-key") {
        return false;
      }
    }

    for (let i = 0; i < newData.length; i++) {
      const item = newData[i];
      if (item.type === "draggable-key" && item.section === "pinned") {
        if (i <= pinnedHeaderIndex || i >= topbarHeaderIndex) {
          return false;
        }
      }
    }

    for (let i = 0; i < newData.length; i++) {
      const item = newData[i];
      if (item.type === "draggable-key" && item.section === "topbar") {
        if (i <= topbarHeaderIndex || i >= resetButtonIndex) {
          return false;
        }
      }
    }

    return true;
  };

  const renderTopBar = () => (
    <View className="flex-1 px-4 py-4">
      <UnifiedDraggableList
        key={`topbar-${listResetKey}`}
        data={topBarData}
        onDragEnd={(newData) => {
          if (!validateTopBarDrag(newData)) {
            showToast.error("Cannot move items between sections");
            setListResetKey((prev) => prev + 1);
            return;
          }

          const pinnedKeys = newData
            .filter(
              (item) =>
                item.type === "draggable-key" && item.section === "pinned",
            )
            .map((item) => (item as any).data);

          const topBarKeys = newData
            .filter(
              (item) =>
                item.type === "draggable-key" && item.section === "topbar",
            )
            .map((item) => (item as any).data);

          reorderPinnedKeys(pinnedKeys);
          reorderTopBarKeys(topBarKeys);
        }}
        onRemoveKey={(itemId, section) => {
          const keyId = itemId.replace(`${section}-`, "");
          if (section === "pinned") {
            removePinnedKey(keyId);
          } else if (section === "topbar") {
            removeTopBarKey(keyId);
          }
        }}
      />
    </View>
  );

  const validateFullKeyboardDrag = (newData: UnifiedListItem[]): boolean => {
    const mainHeaderIndex = newData.findIndex(
      (item) => item.type === "header" && item.id === "header-rows",
    );

    const resetButtonIndex = newData.findIndex(
      (item) => item.type === "button" && item.id === "reset-fullkeyboard",
    );

    for (let i = 0; i <= mainHeaderIndex; i++) {
      const item = newData[i];
      if (item.type === "draggable-key" || item.type === "draggable-row") {
        return false;
      }
    }

    for (let i = resetButtonIndex; i < newData.length; i++) {
      const item = newData[i];
      if (item.type === "draggable-key" || item.type === "draggable-row") {
        return false;
      }
    }

    if (!expandedRowId) {
      return true;
    }

    const rowKeysHeaderIndex = newData.findIndex(
      (item) =>
        item.type === "row-keys-header" &&
        (item as any).rowId === expandedRowId,
    );

    const rowCloseIndex = newData.findIndex(
      (item) =>
        item.type === "spacer" && item.id === `row-close-${expandedRowId}`,
    );

    if (rowKeysHeaderIndex === -1 || rowCloseIndex === -1) {
      return true;
    }

    for (let i = 0; i < newData.length; i++) {
      const item = newData[i];
      if (
        item.type === "draggable-key" &&
        (item as any).rowId === expandedRowId
      ) {
        if (i <= rowKeysHeaderIndex || i >= rowCloseIndex) {
          return false;
        }
      }
    }

    for (let i = rowKeysHeaderIndex + 1; i < rowCloseIndex; i++) {
      const item = newData[i];
      if (
        item.type === "draggable-key" &&
        (item as any).rowId !== expandedRowId
      ) {
        return false;
      }
      if (item.type === "draggable-row") {
        return false;
      }
    }

    return true;
  };

  const renderFullKeyboard = () => (
    <View className="flex-1 px-4 py-4">
      <UnifiedDraggableList
        key={`fullkeyboard-${listResetKey}-${expandedRowId || "none"}`}
        data={fullKeyboardData}
        onDragEnd={(newData) => {
          if (!validateFullKeyboardDrag(newData)) {
            showToast.error("Cannot move items between sections");
            setListResetKey((prev) => prev + 1);
            return;
          }

          const rows = newData
            .filter((item) => item.type === "draggable-row")
            .map((item) => (item as any).data);

          reorderRows(rows);

          if (expandedRowId) {
            const rowKeys = newData
              .filter(
                (item) =>
                  item.type === "draggable-key" &&
                  (item as any).rowId === expandedRowId,
              )
              .map((item) => (item as any).data);

            reorderKeysInRow(expandedRowId, rowKeys);
          }
        }}
        onRemoveKey={(itemId, section) => {
          if (section === "row") {
            const match = itemId.match(/^row-(.+)-key-(.+)$/);
            if (match) {
              const rowId = match[1];
              const keyId = match[2];
              removeKeyFromRow(rowId, keyId);
            }
          }
        }}
      />
    </View>
  );

  const renderSettings = () => (
    <ScrollView className="flex-1 px-4 py-4">
      <Text className="text-white text-lg font-semibold mb-2">
        Keyboard Settings
      </Text>
      <Text className="text-gray-400 text-sm mb-4">
        Adjust keyboard appearance and behavior
      </Text>

      <View className="mb-6">
        <Text className="text-white text-base font-semibold mb-3">
          Key Size
        </Text>
        <View className="flex-row gap-2">
          {(["small", "medium", "large"] as const).map((size) => (
            <TouchableOpacity
              key={size}
              onPress={() => handleKeySizeChange(size)}
              className={`flex-1 p-3 rounded-lg border ${
                config.settings.keySize === size
                  ? "bg-green-900/20 border-green-500"
                  : "bg-[#1a1a1a] border-[#303032]"
              }`}
            >
              <Text
                className={`text-center font-semibold ${
                  config.settings.keySize === size
                    ? "text-green-400"
                    : "text-gray-400"
                }`}
              >
                {size.charAt(0).toUpperCase() + size.slice(1)}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <View className="flex-row items-center justify-between bg-[#1a1a1a] border border-[#303032] rounded-lg p-4 mb-3">
        <View className="flex-1 mr-4">
          <Text className="text-white text-sm font-semibold">Compact Mode</Text>
          <Text className="text-gray-400 text-xs mt-0.5">
            Tighter spacing for more keys on screen
          </Text>
        </View>
        <Switch
          value={config.settings.compactMode}
          onValueChange={handleCompactModeToggle}
          trackColor={{ false: "#3f3f46", true: "#22C55E" }}
          thumbColor={config.settings.compactMode ? "#ffffff" : "#9ca3af"}
        />
      </View>

      <View className="flex-row items-center justify-between bg-[#1a1a1a] border border-[#303032] rounded-lg p-4 mb-3">
        <View className="flex-1 mr-4">
          <Text className="text-white text-sm font-semibold">
            Haptic Feedback
          </Text>
          <Text className="text-gray-400 text-xs mt-0.5">
            Vibrate on key press
          </Text>
        </View>
        <Switch
          value={config.settings.hapticFeedback}
          onValueChange={handleHapticToggle}
          trackColor={{ false: "#3f3f46", true: "#22C55E" }}
          thumbColor={config.settings.hapticFeedback ? "#ffffff" : "#9ca3af"}
        />
      </View>

      <View className="flex-row items-center justify-between bg-[#1a1a1a] border border-[#303032] rounded-lg p-4 mb-6">
        <View className="flex-1 mr-4">
          <Text className="text-white text-sm font-semibold">Show Hints</Text>
          <Text className="text-gray-400 text-xs mt-0.5">
            Display "Customize in Settings" hint
          </Text>
        </View>
        <Switch
          value={config.settings.showHints}
          onValueChange={handleHintsToggle}
          trackColor={{ false: "#3f3f46", true: "#22C55E" }}
          thumbColor={config.settings.showHints ? "#ffffff" : "#9ca3af"}
        />
      </View>

      <TouchableOpacity
        onPress={() => {
          setResetType("all");
          setShowResetConfirm(true);
        }}
        className="bg-red-900/20 border border-red-700 rounded-lg p-3"
      >
        <Text className="text-red-400 text-center font-semibold">
          Reset Everything to Default
        </Text>
      </TouchableOpacity>
    </ScrollView>
  );

  return (
    <View className="flex-1 bg-[#18181b]">
      <View
        className="bg-[#1a1a1a] border-b border-[#303032] px-4"
        style={{ paddingTop: insets.top + 12, paddingBottom: 12 }}
      >
        <View className="flex-row items-center justify-between">
          <TouchableOpacity onPress={() => router.back()}>
            <Text className="text-green-500 text-base font-semibold">
              ← Back
            </Text>
          </TouchableOpacity>
          <Text className="text-white text-lg font-semibold">
            Keyboard Customization
          </Text>
          <View style={{ width: 60 }} />
        </View>
      </View>

      <View className="bg-[#1a1a1a] border-b border-[#303032]">
        <View className="flex-row px-4">
          {[
            { id: "presets", label: "Presets" },
            { id: "topbar", label: "Top Bar" },
            { id: "fullKeyboard", label: "Full Keyboard" },
            { id: "settings", label: "Settings" },
          ].map((tab) => (
            <TouchableOpacity
              key={tab.id}
              onPress={() => setActiveTab(tab.id as TabType)}
              className={`px-4 py-3 mr-2 ${
                activeTab === tab.id ? "border-b-2 border-green-500" : ""
              }`}
            >
              <Text
                className={`text-sm font-semibold ${
                  activeTab === tab.id ? "text-green-500" : "text-gray-400"
                }`}
              >
                {tab.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {activeTab === "presets" && renderPresets()}
      {activeTab === "topbar" && renderTopBar()}
      {activeTab === "fullKeyboard" && renderFullKeyboard()}
      {activeTab === "settings" && renderSettings()}

      <KeySelector
        visible={showKeySelector}
        onClose={() => setShowKeySelector(false)}
        onSelectKey={handleKeySelected}
        excludeKeys={getExcludedKeys()}
        title={
          addKeyMode === "pinned"
            ? "Pin Key"
            : addKeyMode === "topbar"
              ? "Add to Top Bar"
              : "Add Key to Row"
        }
      />

      <Modal
        visible={showResetConfirm}
        transparent
        animationType="fade"
        onRequestClose={() => setShowResetConfirm(false)}
      >
        <Pressable
          className="flex-1 bg-black/50 justify-center items-center"
          onPress={() => setShowResetConfirm(false)}
        >
          <Pressable className="bg-[#1a1a1a] rounded-lg p-6 mx-8 border border-[#303032]">
            <Text className="text-white text-lg font-semibold mb-2">
              Confirm Reset
            </Text>
            <Text className="text-gray-400 text-sm mb-6">
              {resetType === "all"
                ? "This will reset all keyboard customizations to default settings."
                : resetType === "topbar"
                  ? "This will reset the top bar to default keys."
                  : "This will reset the full keyboard to default rows."}
            </Text>
            <View className="flex-row gap-3">
              <TouchableOpacity
                onPress={() => setShowResetConfirm(false)}
                className="flex-1 bg-[#27272a] border border-[#3f3f46] rounded-lg p-3"
              >
                <Text className="text-white text-center font-semibold">
                  Cancel
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleReset}
                className="flex-1 bg-red-600 rounded-lg p-3"
              >
                <Text className="text-white text-center font-semibold">
                  Reset
                </Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}
