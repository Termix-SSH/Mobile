import { useMemo, useState } from "react";
import { Pressable, View } from "react-native";
import { ArrowDown, ArrowUp, Plus, X } from "lucide-react-native";
import { Button, Field, Input, Sheet, SheetBody, SheetRow, Text } from "@/ui";
import { useThemeColor } from "@/contexts/ThemeContext";
import type { SSHHost } from "@/types";
import { canJumpThrough } from "./model";
import { t } from "@/i18n";

export function moveItem<T>(list: T[], from: number, to: number): T[] {
  if (to < 0 || to >= list.length) return list;
  const next = [...list];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

function label(host: SSHHost | undefined, id: number) {
  if (!host) return t("hosts.editor.jumpHostsField.missingHost", { id });
  return host.name || `${host.username}@${host.ip}`;
}

export function JumpHostsField({
  value,
  onChange,
  selfId,
  hosts,
}: {
  value: number[];
  onChange: (next: number[]) => void;
  selfId?: number;
  hosts: SSHHost[];
}) {
  const color = useThemeColor();
  const [picking, setPicking] = useState(false);
  const [query, setQuery] = useState("");
  const byId = useMemo(() => new Map(hosts.map((h) => [h.id, h])), [hosts]);
  const choices = useMemo(() => {
    const q = query.trim().toLowerCase();
    return hosts
      .filter((h) => !value.includes(h.id))
      .filter((h) => canJumpThrough(h, selfId, byId))
      .filter(
        (h) =>
          !q ||
          (h.name ?? "").toLowerCase().includes(q) ||
          h.ip.toLowerCase().includes(q),
      );
  }, [hosts, value, selfId, byId, query]);
  const icon = color("foreground");

  return (
    <Field
      label={t("hosts.editor.jumpHostsField.jumpHosts")}
      hint={
        value.length > 0
          ? t("hosts.editor.jumpHostsField.connectsThroughTheseInOrder")
          : t("hosts.editor.jumpHostsField.reachThisHostThroughOther")
      }
    >
      {value.map((id, index) => (
        <View
          key={id}
          className="min-h-11 flex-row items-center gap-1 border border-border bg-card pl-3"
        >
          <Text className="w-5 text-meta text-muted-foreground">
            {index + 1}
          </Text>
          <Text className="flex-1 text-sm text-foreground" numberOfLines={1}>
            {label(byId.get(id), id)}
          </Text>
          <Pressable
            onPress={() => onChange(moveItem(value, index, index - 1))}
            disabled={index === 0}
            accessibilityRole="button"
            accessibilityLabel={t("hosts.editor.jumpHostsField.moveUp")}
            className={`h-11 w-11 items-center justify-center ${index === 0 ? "opacity-30" : "active:bg-muted"}`}
          >
            <ArrowUp size={15} color={icon} />
          </Pressable>
          <Pressable
            onPress={() => onChange(moveItem(value, index, index + 1))}
            disabled={index === value.length - 1}
            accessibilityRole="button"
            accessibilityLabel={t("hosts.editor.jumpHostsField.moveDown")}
            className={`h-11 w-11 items-center justify-center ${index === value.length - 1 ? "opacity-30" : "active:bg-muted"}`}
          >
            <ArrowDown size={15} color={icon} />
          </Pressable>
          <Pressable
            onPress={() => onChange(value.filter((v) => v !== id))}
            accessibilityRole="button"
            accessibilityLabel={t("hosts.editor.jumpHostsField.removeJumpHost")}
            className="h-11 w-11 items-center justify-center active:bg-muted"
          >
            <X size={15} color={color("destructive")} />
          </Pressable>
        </View>
      ))}
      <Button
        variant="muted"
        onPress={() => setPicking(true)}
        icon={<Plus size={14} color={icon} />}
      >
        {t("hosts.editor.jumpHostsField.addJumpHost")}
      </Button>

      <Sheet
        visible={picking}
        onClose={() => {
          setPicking(false);
          setQuery("");
        }}
        title={t("hosts.editor.jumpHostsField.addJumpHost")}
        description={t("hosts.editor.jumpHostsField.pickASavedHostTo")}
        scroll
      >
        <SheetBody>
          <Input
            value={query}
            onChangeText={setQuery}
            placeholder={t("hosts.editor.jumpHostsField.searchHosts")}
            autoCapitalize="none"
            autoCorrect={false}
          />
          {choices.length === 0 ? (
            <Text className="py-3 text-meta text-muted-foreground">
              {t("hosts.editor.jumpHostsField.noOtherHostsToPick")}
            </Text>
          ) : (
            choices.map((h) => (
              <SheetRow
                key={h.id}
                label={h.name || h.ip}
                description={`${h.username ? `${h.username}@` : ""}${h.ip}:${h.port}`}
                onPress={() => {
                  onChange([...value, h.id]);
                  setPicking(false);
                  setQuery("");
                }}
              />
            ))
          )}
        </SheetBody>
      </Sheet>
    </Field>
  );
}
