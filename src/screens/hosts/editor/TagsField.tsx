import { useState } from "react";
import { Pressable, View } from "react-native";
import { X } from "lucide-react-native";
import { Field, Input, Text } from "@/ui";
import { useThemeColor } from "@/contexts/ThemeContext";
import { t as tr } from "@/i18n";

/** Splits typed text on commas and spaces into new tags. */
export function addTags(current: string[], typed: string): string[] {
  const next = [...current];
  for (const part of typed.split(/[,\s]+/)) {
    const tag = part.trim();
    if (tag && !next.includes(tag)) next.push(tag);
  }
  return next;
}

export function TagsField({
  tags,
  onChange,
}: {
  tags: string[];
  onChange: (tags: string[]) => void;
}) {
  const color = useThemeColor();
  const [draft, setDraft] = useState("");
  const commit = () => {
    if (!draft.trim()) return;
    onChange(addTags(tags, draft));
    setDraft("");
  };
  return (
    <Field
      label={tr("hosts.editor.tagsField.tags")}
      hint={tr("hosts.editor.tagsField.typeATagAndPress")}
    >
      {tags.length > 0 ? (
        <View className="flex-row flex-wrap gap-1.5">
          {tags.map((tag) => (
            <Pressable
              key={tag}
              onPress={() => onChange(tags.filter((t) => t !== tag))}
              accessibilityRole="button"
              accessibilityLabel={tr("hosts.editor.tagsField.removeTag", {
                tag,
              })}
              className="min-h-9 flex-row items-center gap-1.5 border border-border bg-muted/30 px-2.5 active:bg-muted"
            >
              <Text className="text-xs text-foreground">{tag}</Text>
              <X size={12} color={color("muted-foreground")} />
            </Pressable>
          ))}
        </View>
      ) : null}
      <Input
        value={draft}
        onChangeText={(v) => {
          if (/[,\s]$/.test(v)) {
            onChange(addTags(tags, v));
            setDraft("");
          } else {
            setDraft(v);
          }
        }}
        onSubmitEditing={commit}
        onBlur={commit}
        submitBehavior="submit"
        returnKeyType="done"
        placeholder={tr("hosts.editor.tagsField.webProd")}
        autoCapitalize="none"
        autoCorrect={false}
      />
    </Field>
  );
}
