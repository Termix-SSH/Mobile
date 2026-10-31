import { useEffect, useState } from "react";
import { Pressable, View } from "react-native";
import { useTheme } from "@/contexts/ThemeContext";
import {
  ACCENT_PRESET_COLORS,
  THEMES,
  THEME_LABELS,
  THEME_SWATCHES,
} from "@/constants/theme";
import { DENSITIES, TEXT_SIZES, setUiPrefs, useUiPrefs } from "@/core/ui-prefs";
import { ChoiceRow, Input, Label, Text } from "@/ui";

export function ThemeControl() {
  const { theme, setTheme } = useTheme();
  return (
    <View className="gap-2 py-3">
      <Label>Theme</Label>
      <View className="flex-row flex-wrap gap-1.5">
        {THEMES.map((id) => {
          const active = theme === id;
          const swatches =
            id === "system"
              ? [THEME_SWATCHES.light, THEME_SWATCHES.dark]
              : [THEME_SWATCHES[id]];
          return (
            <Pressable
              key={id}
              onPress={() => setTheme(id)}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              className={`flex-row items-center gap-1.5 border px-2 py-1.5 ${active ? "border-accent-brand/50 bg-accent-brand/10" : "border-border"}`}
            >
              <View className="h-3.5 w-3.5 flex-row overflow-hidden border border-border">
                {swatches.map((sw, i) => (
                  <View
                    key={i}
                    style={{ backgroundColor: sw.background }}
                    className="flex-1 justify-end"
                  >
                    <View
                      style={{ backgroundColor: sw.panel }}
                      className="h-1"
                    />
                  </View>
                ))}
              </View>
              <Text
                className={`text-meta ${active ? "text-accent-text" : "text-muted-foreground"}`}
              >
                {THEME_LABELS[id]}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const HEX = /^#[0-9a-fA-F]{6}$/;

export function AccentControl() {
  const { accent, setAccent } = useTheme();
  const [draft, setDraft] = useState(accent);

  // Follow swatch taps.
  useEffect(() => {
    setDraft(accent);
  }, [accent]);

  return (
    <View className="gap-2 py-3">
      <Label>Accent color</Label>
      <View className="flex-row flex-wrap gap-2">
        {ACCENT_PRESET_COLORS.map(({ value }) => {
          const active = accent.toLowerCase() === value.toLowerCase();
          return (
            <Pressable
              key={value}
              onPress={() => setAccent(value)}
              accessibilityRole="button"
              accessibilityLabel={value}
              style={{ backgroundColor: value }}
              className={`h-8 w-8 border-2 ${active ? "border-foreground" : "border-transparent"}`}
            />
          );
        })}
      </View>
      <View className="mt-1 h-9 flex-row items-center gap-2 border border-border bg-card px-2.5">
        <View
          style={{ backgroundColor: accent }}
          className="h-4 w-4 border border-border/60"
        />
        <Input
          containerClassName="flex-1 h-9 border-0 bg-transparent px-0"
          value={draft}
          onChangeText={(v) => {
            setDraft(v);
            if (HEX.test(v.trim())) setAccent(v.trim());
          }}
          onBlur={() => {
            if (!HEX.test(draft.trim())) setDraft(accent);
          }}
          autoCapitalize="none"
          placeholder="#f59145"
        />
        <Text className="text-2xs text-muted-foreground">hex</Text>
      </View>
    </View>
  );
}

export function TextSizeControl() {
  const { textSize } = useUiPrefs();
  return (
    <View>
      <ChoiceRow
        label="Text size"
        description="Size of text across the app, not the terminal"
        value={textSize}
        options={TEXT_SIZES.map((s) => ({ value: s.id, label: s.label }))}
        onChange={(v) => void setUiPrefs({ textSize: v })}
        last
      />
    </View>
  );
}

export function DensityControl() {
  const { density } = useUiPrefs();
  return (
    <View>
      <ChoiceRow
        label="Density"
        description="How tall list rows and settings are"
        value={density}
        options={DENSITIES.map((d) => ({ value: d.id, label: d.label }))}
        onChange={(v) => void setUiPrefs({ density: v })}
        last
      />
    </View>
  );
}
