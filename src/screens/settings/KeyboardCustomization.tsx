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
import { t } from "@/i18n";

const SIZES: { value: KeySize; label: string }[] = [
  { value: "small", label: t("settings.keyboardCustomization.small") },
  { value: "medium", label: t("settings.keyboardCustomization.medium") },
  { value: "large", label: t("settings.keyboardCustomization.large") },
];
const DELAYS = [150, 250, 400, 600].map((v) => ({
  value: String(v),
  label: t("settings.keyboardCustomization.ms", { v }),
}));
const INTERVALS = [50, 75, 100, 150].map((v) => ({
  value: String(v),
  label: t("settings.keyboardCustomization.ms", { v }),
}));

/** The key rows every terminal uses, unless a host has its own. */
export default function KeyboardCustomization() {
  const router = useRouter();
  const { layout, setLayout, resetLayout, settings, updateSettings } =
    useKeyPrefs();
  const [tab, setTab] = useState<"layout" | "settings">("layout");

  return (
    <Screen
      title={t("settings.keyboardCustomization.keyboard")}
      subtitle={t("settings.keyboardCustomization.keyRowsAboveTheKeyboard")}
      onBack={() => router.back()}
    >
      <Tabs
        options={[
          { id: "layout", label: t("settings.keyboardCustomization.rows") },
          { id: "settings", label: t("settings.keyboardCustomization.keys") },
        ]}
        value={tab}
        onChange={setTab}
      />
      {tab === "layout" ? (
        <View className="flex-1">
          <Text className="border-b border-border px-3 py-2 text-meta text-muted-foreground">
            {t("settings.keyboardCustomization.aHostCanHaveIts")}
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
            label={t("settings.keyboardCustomization.keySize")}
            value={settings.keySize}
            options={SIZES}
            onChange={(keySize) => void updateSettings({ keySize })}
          />
          <SettingRow
            label={t("settings.keyboardCustomization.vibrateOnKeyPress")}
          >
            <FakeSwitch
              checked={settings.hapticFeedback}
              onChange={(hapticFeedback) =>
                void updateSettings({ hapticFeedback })
              }
            />
          </SettingRow>
          <ChoiceRow
            label={t("settings.keyboardCustomization.repeatAfter")}
            description={t("settings.keyboardCustomization.howLongToHoldAn")}
            value={String(settings.keyRepeatInitialDelay)}
            options={DELAYS}
            onChange={(v) =>
              void updateSettings({ keyRepeatInitialDelay: Number(v) })
            }
          />
          <ChoiceRow
            label={t("settings.keyboardCustomization.repeatEvery")}
            value={String(settings.keyRepeatInterval)}
            options={INTERVALS}
            onChange={(v) =>
              void updateSettings({ keyRepeatInterval: Number(v) })
            }
            last
          />
          <View className="mt-6 gap-1 pb-6">
            <Label>
              {t("settings.keyboardCustomization.hardwareKeyboard")}
            </Label>
            <Pressable onPress={shortcutSheet.open} accessibilityRole="button">
              <SettingRow
                label={t("settings.keyboardCustomization.allShortcuts")}
                last
              >
                <Text className="text-meta text-muted-foreground">
                  {t("settings.keyboardCustomization.show")}
                </Text>
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
