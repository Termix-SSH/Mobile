import { useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { useRouter } from "expo-router";
import { Screen } from "@/components/Screen";
import { ChoiceRow, FakeSwitch, Label, SettingRow, Tabs, Text } from "@/ui";
import { shortcutSections, shortcutSheet } from "@/core/shortcuts";
import { KeyLayoutEditor } from "@/features/terminal/keys/KeyLayoutEditor";
import {
  useKeyPrefs,
  type KeySize,
} from "@/features/terminal/keys/KeyPrefsContext";

const SIZES: { value: KeySize; label: string }[] = [
  { value: "small", label: "Small" },
  { value: "medium", label: "Medium" },
  { value: "large", label: "Large" },
];
const DELAYS = [150, 250, 400, 600].map((v) => ({
  value: String(v),
  label: `${v} ms`,
}));
const INTERVALS = [50, 75, 100, 150].map((v) => ({
  value: String(v),
  label: `${v} ms`,
}));

/** The key rows every terminal uses, unless a host has its own. */
export default function KeyboardCustomization() {
  const router = useRouter();
  const { layout, setLayout, resetLayout, settings, updateSettings } =
    useKeyPrefs();
  const [tab, setTab] = useState<"layout" | "settings">("layout");

  return (
    <Screen
      title="Keyboard"
      subtitle="Key rows above the keyboard"
      onBack={() => router.back()}
    >
      <Tabs
        options={[
          { id: "layout", label: "Rows" },
          { id: "settings", label: "Keys" },
        ]}
        value={tab}
        onChange={setTab}
      />
      {tab === "layout" ? (
        <View className="flex-1">
          <Text className="border-b border-border px-3 py-2 text-meta text-muted-foreground">
            A host can have its own rows: tap its open tab in a session and pick
            Key rows for this host.
          </Text>
          <KeyLayoutEditor
            layout={layout}
            onChange={(next) => void setLayout(next).catch(() => {})}
            onReset={() => void resetLayout().catch(() => {})}
          />
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ paddingHorizontal: 12 }}>
          <ChoiceRow
            label="Key size"
            value={settings.keySize}
            options={SIZES}
            onChange={(keySize) => void updateSettings({ keySize })}
          />
          <SettingRow label="Vibrate on key press">
            <FakeSwitch
              checked={settings.hapticFeedback}
              onChange={(hapticFeedback) =>
                void updateSettings({ hapticFeedback })
              }
            />
          </SettingRow>
          <ChoiceRow
            label="Repeat after"
            description="How long to hold an arrow or Backspace"
            value={String(settings.keyRepeatInitialDelay)}
            options={DELAYS}
            onChange={(v) =>
              void updateSettings({ keyRepeatInitialDelay: Number(v) })
            }
          />
          <ChoiceRow
            label="Repeat every"
            value={String(settings.keyRepeatInterval)}
            options={INTERVALS}
            onChange={(v) =>
              void updateSettings({ keyRepeatInterval: Number(v) })
            }
            last
          />
          <View className="mt-6 gap-1 pb-6">
            <Label>Hardware keyboard</Label>
            <Pressable onPress={shortcutSheet.open} accessibilityRole="button">
              <SettingRow label="All shortcuts" last>
                <Text className="text-meta text-muted-foreground">Show</Text>
              </SettingRow>
            </Pressable>
            {shortcutSections()
              .flatMap((section) => section.rows)
              .map((row, i, all) => (
                <SettingRow
                  key={row.label}
                  label={row.label}
                  last={i === all.length - 1}
                >
                  <Text className="text-meta text-muted-foreground">
                    {row.keys}
                  </Text>
                </SettingRow>
              ))}
          </View>
        </ScrollView>
      )}
    </Screen>
  );
}
