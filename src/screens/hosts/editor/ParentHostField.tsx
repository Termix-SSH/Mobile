import { useMemo, useState } from "react";
import { Pressable, View } from "react-native";
import { ChevronDown, X } from "lucide-react-native";
import { Field, Input, Sheet, SheetBody, SheetRow, Text } from "@/ui";
import { useThemeColor } from "@/contexts/ThemeContext";
import type { SSHHost } from "@/types";
import { parentChoices } from "./model";

const hostLabel = (host: SSHHost) =>
  host.name || `${host.username ? `${host.username}@` : ""}${host.ip}`;

/** Picks the host the `moving` hosts go under. */
export function ParentHostSheet({
  visible,
  hosts,
  moving,
  selected,
  title = "Parent host",
  onPick,
  onClose,
}: {
  visible: boolean;
  hosts: SSHHost[];
  /** Hosts being placed; they and their sub-hosts can't be picked. */
  moving: number[];
  selected?: number | null;
  title?: string;
  onPick: (hostId: number) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const choices = useMemo(() => {
    const q = query.trim().toLowerCase();
    return parentChoices(hosts, moving).filter(
      (h) =>
        !q ||
        (h.name ?? "").toLowerCase().includes(q) ||
        h.ip.toLowerCase().includes(q),
    );
  }, [hosts, moving, query]);
  const close = () => {
    setQuery("");
    onClose();
  };

  return (
    <Sheet
      visible={visible}
      onClose={close}
      title={title}
      description="The host shows nested under the one you pick"
      scroll
    >
      <SheetBody>
        <Input
          value={query}
          onChangeText={setQuery}
          placeholder="Search hosts"
          autoCapitalize="none"
          autoCorrect={false}
        />
        {choices.length === 0 ? (
          <Text className="py-3 text-meta text-muted-foreground">
            No hosts to pick. A host can{"'"}t go under itself, one of its own
            sub-hosts or a shared host.
          </Text>
        ) : (
          choices.map((h) => (
            <SheetRow
              key={h.id}
              label={hostLabel(h)}
              description={`${h.username ? `${h.username}@` : ""}${h.ip}:${h.port}`}
              selected={h.id === selected}
              onPress={() => {
                setQuery("");
                onPick(h.id);
              }}
            />
          ))
        )}
      </SheetBody>
    </Sheet>
  );
}

/** The host editor's parent host choice, in place of a folder. */
export function ParentHostField({
  value,
  onChange,
  selfId,
  hosts,
}: {
  value: number | null;
  onChange: (next: number | null) => void;
  selfId?: number;
  hosts: SSHHost[];
}) {
  const color = useThemeColor();
  const [picking, setPicking] = useState(false);
  const parent = value != null ? hosts.find((h) => h.id === value) : undefined;

  return (
    <Field
      label="Parent host"
      hint="Sub-hosts follow the folder of their parent"
    >
      <View className="min-h-11 flex-row items-center border border-border bg-card">
        <Pressable
          onPress={() => setPicking(true)}
          accessibilityRole="button"
          accessibilityLabel="Pick parent host"
          className="min-h-11 flex-1 flex-row items-center gap-2 px-3 active:bg-muted"
        >
          <Text
            className={`flex-1 text-sm ${parent ? "text-foreground" : "text-muted-foreground"}`}
            numberOfLines={1}
          >
            {parent
              ? hostLabel(parent)
              : value != null
                ? `Missing host #${value}`
                : "Pick a host"}
          </Text>
          <ChevronDown size={15} color={color("muted-foreground")} />
        </Pressable>
        {value != null ? (
          <Pressable
            onPress={() => onChange(null)}
            accessibilityRole="button"
            accessibilityLabel="Clear parent host"
            className="h-11 w-11 items-center justify-center active:bg-muted"
          >
            <X size={15} color={color("muted-foreground")} />
          </Pressable>
        ) : null}
      </View>
      <ParentHostSheet
        visible={picking}
        hosts={hosts}
        moving={selfId !== undefined ? [selfId] : []}
        selected={value}
        onPick={(id) => {
          setPicking(false);
          onChange(id);
        }}
        onClose={() => setPicking(false)}
      />
    </Field>
  );
}
