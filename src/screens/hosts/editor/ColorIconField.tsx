import { Pressable, View } from "react-native";
import { Check, Slash } from "lucide-react-native";
import { Field, LOOK_COLORS, LOOK_ICONS, Text } from "@/ui";
import { useThemeColor } from "@/contexts/ThemeContext";

const HOST_ICONS = [
  "server",
  "server-cog",
  "database",
  "cloud",
  "container",
  "box",
  "hard-drive",
  "router",
  "network",
  "wifi",
  "globe",
  "monitor",
  "terminal",
  "cpu",
  "shield",
  "lock",
  "home",
  "building",
  "code",
  "git-branch",
  "rocket",
  "flask",
  "zap",
  "smartphone",
];

export function ColorIconField({
  color: value,
  icon,
  onChange,
}: {
  color: string | null;
  icon: string | null;
  onChange: (patch: { color?: string | null; icon?: string | null }) => void;
}) {
  const color = useThemeColor();
  const muted = color("muted-foreground");
  const tint = value ?? color("foreground");
  return (
    <View className="gap-3">
      <Field label="Color">
        <View className="flex-row flex-wrap gap-2">
          <Pressable
            onPress={() => onChange({ color: null })}
            accessibilityRole="button"
            accessibilityLabel="No color"
            accessibilityState={{ selected: value === null }}
            className={`h-11 w-11 items-center justify-center border ${value === null ? "border-foreground" : "border-border"}`}
          >
            <Slash size={16} color={muted} />
          </Pressable>
          {LOOK_COLORS.map((c) => (
            <Pressable
              key={c}
              onPress={() => onChange({ color: c })}
              accessibilityRole="button"
              accessibilityLabel={`Color ${c}`}
              accessibilityState={{ selected: value === c }}
              className={`h-11 w-11 items-center justify-center border ${value === c ? "border-foreground" : "border-transparent"}`}
            >
              <View
                style={{ backgroundColor: c }}
                className="h-8 w-8 items-center justify-center"
              >
                {value === c ? <Check size={16} color="#ffffff" /> : null}
              </View>
            </Pressable>
          ))}
        </View>
      </Field>
      <Field label="Icon">
        <View className="flex-row flex-wrap gap-2">
          <Pressable
            onPress={() => onChange({ icon: null })}
            accessibilityRole="button"
            accessibilityLabel="No icon"
            accessibilityState={{ selected: icon === null }}
            className={`h-11 w-11 items-center justify-center border ${icon === null ? "border-foreground bg-muted/40" : "border-border"}`}
          >
            <Text className="text-[10px] text-muted-foreground">None</Text>
          </Pressable>
          {HOST_ICONS.map((name) => {
            const Icon = LOOK_ICONS[name];
            const selected = icon === name;
            return (
              <Pressable
                key={name}
                onPress={() => onChange({ icon: name })}
                accessibilityRole="button"
                accessibilityLabel={`Icon ${name}`}
                accessibilityState={{ selected }}
                className={`h-11 w-11 items-center justify-center border ${selected ? "border-foreground bg-muted/40" : "border-border"}`}
              >
                <Icon size={18} color={selected ? tint : muted} />
              </Pressable>
            );
          })}
        </View>
      </Field>
    </View>
  );
}
