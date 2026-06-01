import React, { useState, useMemo } from "react";
import { View, ScrollView, Pressable } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  ArrowLeft,
  LayoutGrid,
  Rows3,
  Keyboard,
  SlidersHorizontal,
} from "lucide-react-native";
import { useKeyboardCustomization } from "@/app/contexts/KeyboardCustomizationContext";
import { PRESET_DEFINITIONS } from "@/app/tabs/sessions/terminal/keyboard/KeyDefinitions";
import { PresetType, KeyConfig } from "@/types/keyboard";
import { toast } from "@/app/utils/toast";
import { Text, Button, Label, FakeSwitch, Dialog } from "@/app/components/ui";
import { useThemeColor } from "@/app/contexts/ThemeContext";
import KeySelector from "./components/KeySelector";
import UnifiedDraggableList, {
  UnifiedListItem,
} from "./components/UnifiedDraggableList";
import { renderKeyItem } from "./components/DraggableKeyList";
import { renderRowItem, useRowExpansion } from "./components/DraggableRowList";

type TabType = "presets" | "topbar" | "fullKeyboard" | "settings";
type AddKeyMode = "pinned" | "topbar" | "row" | null;

const TABS: {
  id: TabType;
  label: string;
  icon: (c: string) => React.ReactNode;
}[] = [
  {
    id: "presets",
    label: "Presets",
    icon: (c) => <LayoutGrid size={14} color={c} />,
  },
  {
    id: "topbar",
    label: "Top Bar",
    icon: (c) => <Rows3 size={14} color={c} />,
  },
  {
    id: "fullKeyboard",
    label: "Full Keyboard",
    icon: (c) => <Keyboard size={14} color={c} />,
  },
  {
    id: "settings",
    label: "Settings",
    icon: (c) => <SlidersHorizontal size={14} color={c} />,
  },
];

export default function KeyboardCustomization() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const color = useThemeColor();
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

    items.push({ type: "spacer", id: "spacer-1", height: 16 });

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

    items.push({ type: "spacer", id: "spacer-2", height: 16 });

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

        items.push({ type: "spacer", id: `row-close-${row.id}`, height: 12 });
      }
    });

    items.push({ type: "spacer", id: "spacer-3", height: 16 });

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
      toast.success(
        `Switched to ${PRESET_DEFINITIONS.find((p) => p.id === presetId)?.name} preset`,
      );
    } catch {
      toast.error("Failed to switch preset");
    }
  };

  const handleKeySelected = async (key: KeyConfig) => {
    try {
      if (addKeyMode === "pinned") {
        await addPinnedKey(key);
        toast.success(`Added ${key.label} to pinned keys`);
      } else if (addKeyMode === "topbar") {
        await addTopBarKey(key);
        toast.success(`Added ${key.label} to top bar`);
      } else if (addKeyMode === "row" && selectedRowId) {
        await addKeyToRow(selectedRowId, key);
        toast.success(`Added ${key.label} to row`);
      }
    } catch {
      toast.error("Failed to add key");
    }
  };

  const openKeySelector = (mode: AddKeyMode, rowId?: string) => {
    setAddKeyMode(mode);
    setSelectedRowId(rowId || null);
    setShowKeySelector(true);
  };

  const getExcludedKeys = (): string[] => {
    if (addKeyMode === "pinned")
      return config.topBar.pinnedKeys.map((k) => k.id);
    if (addKeyMode === "topbar") return config.topBar.keys.map((k) => k.id);
    if (addKeyMode === "row" && selectedRowId) {
      const row = config.fullKeyboard.rows.find((r) => r.id === selectedRowId);
      return row ? row.keys.map((k) => k.id) : [];
    }
    return [];
  };

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
      if (newData[i].type === "draggable-key") return false;
    }
    for (let i = 0; i < newData.length; i++) {
      const item = newData[i];
      if (item.type === "draggable-key" && item.section === "pinned") {
        if (i <= pinnedHeaderIndex || i >= topbarHeaderIndex) return false;
      }
    }
    for (let i = 0; i < newData.length; i++) {
      const item = newData[i];
      if (item.type === "draggable-key" && item.section === "topbar") {
        if (i <= topbarHeaderIndex || i >= resetButtonIndex) return false;
      }
    }
    return true;
  };

  const validateFullKeyboardDrag = (newData: UnifiedListItem[]): boolean => {
    const mainHeaderIndex = newData.findIndex(
      (item) => item.type === "header" && item.id === "header-rows",
    );
    const resetButtonIndex = newData.findIndex(
      (item) => item.type === "button" && item.id === "reset-fullkeyboard",
    );

    for (let i = 0; i <= mainHeaderIndex; i++) {
      const item = newData[i];
      if (item.type === "draggable-key" || item.type === "draggable-row")
        return false;
    }
    for (let i = resetButtonIndex; i < newData.length; i++) {
      const item = newData[i];
      if (item.type === "draggable-key" || item.type === "draggable-row")
        return false;
    }

    if (!expandedRowId) return true;

    const rowKeysHeaderIndex = newData.findIndex(
      (item) =>
        item.type === "row-keys-header" &&
        (item as any).rowId === expandedRowId,
    );
    const rowCloseIndex = newData.findIndex(
      (item) =>
        item.type === "spacer" && item.id === `row-close-${expandedRowId}`,
    );

    if (rowKeysHeaderIndex === -1 || rowCloseIndex === -1) return true;

    for (let i = 0; i < newData.length; i++) {
      const item = newData[i];
      if (
        item.type === "draggable-key" &&
        (item as any).rowId === expandedRowId
      ) {
        if (i <= rowKeysHeaderIndex || i >= rowCloseIndex) return false;
      }
    }
    for (let i = rowKeysHeaderIndex + 1; i < rowCloseIndex; i++) {
      const item = newData[i];
      if (
        item.type === "draggable-key" &&
        (item as any).rowId !== expandedRowId
      )
        return false;
      if (item.type === "draggable-row") return false;
    }

    return true;
  };

  const renderPresets = () => (
    <ScrollView
      className="flex-1"
      contentContainerStyle={{ padding: 16, gap: 10, paddingBottom: 40 }}
    >
      <Label className="mb-1">Layout Presets</Label>
      <Text className="mb-2 text-[11px] text-muted-foreground">
        Choose a preset layout optimized for different use cases.
      </Text>

      {PRESET_DEFINITIONS.map((preset) => {
        const isActive = config.preset === preset.id;
        return (
          <Pressable
            key={preset.id}
            onPress={() => handlePresetSelect(preset.id)}
            className={`border bg-card px-3 py-3 active:opacity-80 ${isActive ? "border-accent-brand/50" : "border-border"}`}
          >
            <View className="mb-1 flex-row items-center justify-between">
              <Text
                weight="medium"
                className={`text-sm ${isActive ? "text-accent-brand" : "text-foreground"}`}
              >
                {preset.name}
              </Text>
              {isActive ? (
                <View className="border border-accent-brand/40 bg-accent-brand/10 px-1.5 py-0.5">
                  <Text
                    weight="bold"
                    className="text-[8px] uppercase tracking-wider text-accent-brand"
                  >
                    Active
                  </Text>
                </View>
              ) : null}
            </View>
            <Text className="text-[11px] text-muted-foreground">
              {preset.description}
            </Text>
          </Pressable>
        );
      })}

      {config.preset === "custom" ? (
        <View className="mt-1 border border-border bg-card px-3 py-3">
          <Text weight="medium" className="mb-0.5 text-xs text-accent-brand">
            Custom Layout
          </Text>
          <Text className="text-[10px] text-muted-foreground">
            You have made custom changes. Select a preset above to reset to a
            predefined layout.
          </Text>
        </View>
      ) : null}
    </ScrollView>
  );

  const renderTopBar = () => (
    <View className="flex-1 px-4 py-4">
      <UnifiedDraggableList
        key={`topbar-${listResetKey}`}
        data={topBarData}
        onDragEnd={(newData) => {
          if (!validateTopBarDrag(newData)) {
            toast.error("Cannot move items between sections");
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
          if (section === "pinned") removePinnedKey(keyId);
          else if (section === "topbar") removeTopBarKey(keyId);
        }}
      />
    </View>
  );

  const renderFullKeyboard = () => (
    <View className="flex-1 px-4 py-4">
      <UnifiedDraggableList
        key={`fullkeyboard-${listResetKey}-${expandedRowId || "none"}`}
        data={fullKeyboardData}
        onDragEnd={(newData) => {
          if (!validateFullKeyboardDrag(newData)) {
            toast.error("Cannot move items between sections");
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
              removeKeyFromRow(match[1], match[2]);
            }
          }
        }}
      />
    </View>
  );

  const renderSettings = () => (
    <ScrollView
      className="flex-1"
      contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 40 }}
    >
      {/* Key Size */}
      <View className="border border-border bg-card">
        <View className="border-b border-border px-3 py-3">
          <Label>Key Size</Label>
        </View>
        <View className="flex-row gap-2 px-3 pb-3 pt-2.5">
          {(["small", "medium", "large"] as const).map((size) => {
            const isActive = config.settings.keySize === size;
            return (
              <Pressable
                key={size}
                onPress={() => updateSettings({ keySize: size })}
                className={`flex-1 items-center border py-2.5 active:opacity-80 ${isActive ? "border-accent-brand/50 bg-accent-brand/10" : "border-border"}`}
              >
                <Text
                  weight="medium"
                  className={`text-xs ${isActive ? "text-accent-brand" : "text-muted-foreground"}`}
                >
                  {size.charAt(0).toUpperCase() + size.slice(1)}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      {/* Toggles */}
      <View className="border border-border bg-card">
        <View className="border-b border-border px-3 py-3">
          <Label>Behavior</Label>
        </View>
        <View className="px-3">
          <View className="flex-row items-center justify-between border-b border-border py-2.5">
            <View className="mr-3 min-w-0 flex-1">
              <Text weight="medium" className="text-xs text-foreground">
                Compact Mode
              </Text>
              <Text className="mt-0.5 text-[10px] text-muted-foreground">
                Tighter spacing for more keys on screen
              </Text>
            </View>
            <FakeSwitch
              checked={config.settings.compactMode}
              onChange={(v) => updateSettings({ compactMode: v })}
            />
          </View>

          <View className="flex-row items-center justify-between border-b border-border py-2.5">
            <View className="mr-3 min-w-0 flex-1">
              <Text weight="medium" className="text-xs text-foreground">
                Haptic Feedback
              </Text>
              <Text className="mt-0.5 text-[10px] text-muted-foreground">
                Vibrate on key press
              </Text>
            </View>
            <FakeSwitch
              checked={config.settings.hapticFeedback}
              onChange={(v) => updateSettings({ hapticFeedback: v })}
            />
          </View>

          <View className="flex-row items-center justify-between py-2.5">
            <View className="mr-3 min-w-0 flex-1">
              <Text weight="medium" className="text-xs text-foreground">
                Show Hints
              </Text>
              <Text className="mt-0.5 text-[10px] text-muted-foreground">
                Display the Customize in Settings hint
              </Text>
            </View>
            <FakeSwitch
              checked={config.settings.showHints}
              onChange={(v) => updateSettings({ showHints: v })}
            />
          </View>
        </View>
      </View>

      {/* Reset */}
      <Button
        variant="destructive"
        onPress={() => {
          setResetType("all");
          setShowResetConfirm(true);
        }}
      >
        Reset Everything to Default
      </Button>
    </ScrollView>
  );

  const resetMessage =
    resetType === "all"
      ? "This will reset all keyboard customizations to default settings."
      : resetType === "topbar"
        ? "This will reset the top bar to default keys."
        : "This will reset the full keyboard to default rows.";

  const handleReset = async () => {
    try {
      if (resetType === "all") {
        await resetToDefault();
        toast.success("Keyboard reset to default");
      } else if (resetType === "topbar") {
        await resetTopBar();
        toast.success("Top bar reset to default");
      } else {
        await resetFullKeyboard();
        toast.success("Full keyboard reset to default");
      }
      setShowResetConfirm(false);
    } catch {
      toast.error("Failed to reset");
    }
  };

  return (
    <View className="flex-1 bg-background" style={{ paddingTop: insets.top }}>
      {/* Header */}
      <View className="flex-row items-center gap-3 border-b border-border px-4 pb-3 pt-3">
        <Pressable
          onPress={() => router.back()}
          hitSlop={8}
          className="shrink-0"
        >
          <ArrowLeft size={18} color={color("foreground")} />
        </Pressable>
        <Text weight="bold" className="flex-1 text-xl text-foreground">
          Keyboard
        </Text>
      </View>

      {/* Tab bar */}
      <View className="flex-row border-b border-border bg-card">
        {TABS.map((tab) => {
          const isActive = activeTab === tab.id;
          const iconColor =
            color(isActive ? "accent-brand" : "muted-foreground") || "#71717a";
          return (
            <Pressable
              key={tab.id}
              onPress={() => setActiveTab(tab.id)}
              className={`flex-1 items-center gap-1 border-b-2 py-2.5 ${isActive ? "border-accent-brand" : "border-transparent"}`}
            >
              {tab.icon(iconColor)}
              <Text
                weight={isActive ? "medium" : "regular"}
                className={`text-[9px] ${isActive ? "text-accent-brand" : "text-muted-foreground"}`}
              >
                {tab.label}
              </Text>
            </Pressable>
          );
        })}
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

      <Dialog
        visible={showResetConfirm}
        onClose={() => setShowResetConfirm(false)}
        title="Confirm Reset"
        description={resetMessage}
        footer={
          <>
            <Button
              variant="ghost"
              size="sm"
              onPress={() => setShowResetConfirm(false)}
            >
              Cancel
            </Button>
            <Button variant="destructive" size="sm" onPress={handleReset}>
              Reset
            </Button>
          </>
        }
      />
    </View>
  );
}
