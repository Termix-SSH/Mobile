import { useEffect, useMemo, useRef, useState } from "react";
import { Pressable, type TextInput, View } from "react-native";
import DraggableFlatList, {
  ScaleDecorator,
  type RenderItemParams,
} from "react-native-draggable-flatlist";
import {
  ArrowLeft,
  Check,
  ChevronRight,
  GripVertical,
  Pencil,
  Plus,
  Trash2,
  X,
} from "lucide-react-native";
import {
  Button,
  ChoiceRow,
  Input,
  Label,
  Sheet,
  SheetBody,
  Tabs,
  Text,
  useConfirm,
} from "@/ui";
import { useThemeColor } from "@/contexts/ThemeContext";
import {
  addGroup,
  addKey,
  addRow,
  customKey,
  describeAction,
  reorder,
  setRows,
  updateGroup,
  updateRow,
  type CustomKind,
} from "./edit";
import { KEY_PALETTE, paletteKey, type KeyDef, type KeyLayout } from "./model";

const PREFIXES = ["b", "a", "s", "q", "x", "space"].map((v) => ({
  value: v,
  label: `Ctrl+${v === "space" ? "Space" : v.toUpperCase()}`,
}));

function paletteSection(key: KeyDef): string {
  const { action, id } = key;
  if (action.type === "tmux" || id.startsWith("tmux")) return "tmux";
  if (action.type === "modifier") return "Modifiers";
  if (action.type === "ctrl") return "Ctrl";
  if (action.type === "command") return "Actions";
  if (action.type === "key" && /^F\d+$/.test(action.name)) return "Function";
  if (action.type === "key") return "Keys";
  if (action.type === "text") return "Symbols";
  return "Other";
}

type Level =
  | { kind: "rows" }
  | { kind: "groups"; rowId: string }
  | { kind: "keys"; rowId: string; groupId: string };

type Renaming = { kind: "row" | "group"; id: string; value: string } | null;

/** A name typed in place, instead of a sheet over the editor. */
function NameField({
  initial = "",
  placeholder,
  confirmLabel,
  onSubmit,
  onCancel,
}: {
  initial?: string;
  placeholder: string;
  confirmLabel: string;
  onSubmit: (value: string) => void;
  onCancel: () => void;
}) {
  const color = useThemeColor();
  const [value, setValue] = useState(initial);
  const input = useRef<TextInput>(null);
  useEffect(() => {
    const timer = setTimeout(() => input.current?.focus(), 50);
    return () => clearTimeout(timer);
  }, []);
  const submit = () => {
    if (value.trim()) onSubmit(value.trim());
  };
  return (
    <View className="flex-row items-center gap-2 border-b border-border bg-card px-3 py-2">
      <Input
        ref={input}
        containerClassName="flex-1"
        value={value}
        onChangeText={setValue}
        placeholder={placeholder}
        autoCorrect={false}
        returnKeyType="done"
        onSubmitEditing={submit}
      />
      <Button
        size="icon-field"
        accessibilityLabel={confirmLabel}
        disabled={!value.trim()}
        onPress={submit}
        icon={<Check size={16} />}
      />
      <Button
        size="icon-field"
        variant="muted"
        accessibilityLabel="Cancel"
        onPress={onCancel}
        icon={<X size={16} color={color("muted-foreground")} />}
      />
    </View>
  );
}

/**
 * Edits a layout: rows, the groups in a row, the keys in a group. Hold the
 * grip to drag. Changes go to `onChange` as they happen.
 */
export function KeyLayoutEditor({
  layout,
  onChange,
  onReset,
  resetLabel = "Reset to default",
}: {
  layout: KeyLayout;
  onChange: (layout: KeyLayout) => void;
  onReset: () => void;
  resetLabel?: string;
}) {
  const color = useThemeColor();
  const confirm = useConfirm();
  const [wanted, setLevel] = useState<Level>({ kind: "rows" });
  const [renaming, setRenaming] = useState<Renaming>(null);
  const [adding, setAdding] = useState<"row" | "group" | null>(null);
  const [picking, setPicking] = useState(false);

  const row =
    wanted.kind !== "rows"
      ? layout.rows.find((r) => r.id === wanted.rowId)
      : undefined;
  const group =
    wanted.kind === "keys"
      ? row?.groups.find((g) => g.id === wanted.groupId)
      : undefined;
  // A row or group removed under us goes back up a level.
  const level: Level = !row
    ? { kind: "rows" }
    : wanted.kind === "keys" && !group
      ? { kind: "groups", rowId: row.id }
      : wanted;

  const remove = async (what: string, run: () => void) => {
    const ok = await confirm({
      title: `Remove ${what}?`,
      confirmLabel: "Remove",
    });
    if (ok) run();
  };

  const Grip = ({ drag }: { drag: () => void }) => (
    <Pressable
      onLongPress={drag}
      delayLongPress={150}
      accessibilityLabel="Drag to reorder"
      className="h-11 w-10 items-center justify-center"
    >
      <GripVertical size={16} color={color("muted-foreground")} />
    </Pressable>
  );

  const IconButton = ({
    icon,
    label,
    onPress,
  }: {
    icon: React.ReactNode;
    label: string;
    onPress: () => void;
  }) => (
    <Pressable
      onPress={onPress}
      hitSlop={6}
      accessibilityRole="button"
      accessibilityLabel={label}
      className="h-11 w-10 items-center justify-center"
    >
      {icon}
    </Pressable>
  );

  const header =
    level.kind === "rows" ? null : (
      <Pressable
        onPress={() =>
          setLevel(
            level.kind === "keys"
              ? { kind: "groups", rowId: level.rowId }
              : { kind: "rows" },
          )
        }
        accessibilityRole="button"
        className="min-h-11 flex-row items-center gap-2 border-b border-border px-3"
      >
        <ArrowLeft size={16} color={color("foreground")} />
        <Text weight="medium" className="text-row text-foreground">
          {level.kind === "keys"
            ? `${row?.label} | ${group?.label}`
            : row?.label}
        </Text>
      </Pressable>
    );

  const addKind = level.kind === "rows" ? "row" : "group";
  const footer = (
    <View>
      {adding && level.kind !== "keys" ? (
        <NameField
          placeholder={adding === "row" ? "Row name" : "Group name"}
          confirmLabel="Add"
          onCancel={() => setAdding(null)}
          onSubmit={(value) => {
            onChange(
              adding === "row"
                ? addRow(layout, value)
                : addGroup(layout, row!.id, value),
            );
            setAdding(null);
          }}
        />
      ) : null}
      <View className="gap-3 p-3">
        {level.kind === "keys" ? (
          <Button
            variant="muted"
            icon={<Plus size={14} />}
            onPress={() => setPicking(true)}
          >
            Add key
          </Button>
        ) : !adding ? (
          <Button
            variant="muted"
            icon={<Plus size={14} />}
            onPress={() => setAdding(addKind)}
          >
            {level.kind === "rows" ? "Add row" : "Add group"}
          </Button>
        ) : null}
        {level.kind === "rows" ? (
          <>
            <View className="border-y border-border">
              <ChoiceRow
                label="tmux prefix"
                value={layout.tmuxPrefix === " " ? "space" : layout.tmuxPrefix}
                options={PREFIXES}
                onChange={(v) =>
                  onChange({ ...layout, tmuxPrefix: v === "space" ? " " : v })
                }
                last
              />
            </View>
            <Button variant="ghost" onPress={onReset}>
              {resetLabel}
            </Button>
          </>
        ) : null}
      </View>
    </View>
  );

  const rename = (value: string) => {
    if (!renaming) return;
    onChange(
      renaming.kind === "row"
        ? updateRow(layout, renaming.id, (r) => ({ ...r, label: value }))
        : updateGroup(layout, row!.id, renaming.id, (g) => ({
            ...g,
            label: value,
          })),
    );
    setRenaming(null);
  };

  const renameField = (kind: "row" | "group", id: string) =>
    renaming?.kind === kind && renaming.id === id ? (
      <NameField
        initial={renaming.value}
        placeholder="Name"
        confirmLabel="Rename"
        onCancel={() => setRenaming(null)}
        onSubmit={rename}
      />
    ) : null;

  const rowItem = ({
    item,
    drag,
    isActive,
  }: RenderItemParams<KeyLayout["rows"][number]>) =>
    renameField("row", item.id) ?? (
      <ScaleDecorator>
        <View
          className={`flex-row items-center border-b border-border ${isActive ? "bg-muted" : "bg-card"}`}
        >
          <Grip drag={drag} />
          <Pressable
            className="min-h-11 flex-1 justify-center"
            onPress={() => setLevel({ kind: "groups", rowId: item.id })}
          >
            <Text className="text-row text-foreground">{item.label}</Text>
            <Text className="text-meta text-muted-foreground">
              {item.groups.reduce((n, g) => n + g.keys.length, 0)} keys
            </Text>
          </Pressable>
          <IconButton
            label="Rename"
            icon={<Pencil size={14} color={color("muted-foreground")} />}
            onPress={() =>
              setRenaming({ kind: "row", id: item.id, value: item.label })
            }
          />
          <IconButton
            label="Remove"
            icon={<Trash2 size={14} color={color("destructive")} />}
            onPress={() =>
              remove(`the ${item.label} row`, () =>
                onChange(updateRow(layout, item.id, () => null)),
              )
            }
          />
          <ChevronRight size={14} color={color("muted-foreground")} />
          <View className="w-2" />
        </View>
      </ScaleDecorator>
    );

  const groupItem = ({
    item,
    drag,
    isActive,
  }: RenderItemParams<KeyLayout["rows"][number]["groups"][number]>) =>
    renameField("group", item.id) ?? (
      <ScaleDecorator>
        <View
          className={`flex-row items-center border-b border-border ${isActive ? "bg-muted" : "bg-card"}`}
        >
          <Grip drag={drag} />
          <Pressable
            className="min-h-11 flex-1 justify-center"
            onPress={() =>
              row && setLevel({ kind: "keys", rowId: row.id, groupId: item.id })
            }
          >
            <Text className="text-row text-foreground">{item.label}</Text>
            <Text className="text-meta text-muted-foreground" numberOfLines={1}>
              {item.keys.map((k) => k.label).join("  ") || "No keys"}
            </Text>
          </Pressable>
          <IconButton
            label="Rename"
            icon={<Pencil size={14} color={color("muted-foreground")} />}
            onPress={() =>
              setRenaming({ kind: "group", id: item.id, value: item.label })
            }
          />
          <IconButton
            label="Remove"
            icon={<Trash2 size={14} color={color("destructive")} />}
            onPress={() =>
              row &&
              remove(`the ${item.label} group`, () =>
                onChange(updateGroup(layout, row.id, item.id, () => null)),
              )
            }
          />
          <ChevronRight size={14} color={color("muted-foreground")} />
          <View className="w-2" />
        </View>
      </ScaleDecorator>
    );

  const keyItem = ({
    item,
    drag,
    isActive,
    getIndex,
  }: RenderItemParams<KeyDef>) => (
    <ScaleDecorator>
      <View
        className={`flex-row items-center border-b border-border ${isActive ? "bg-muted" : "bg-card"}`}
      >
        <Grip drag={drag} />
        <View className="min-h-11 flex-1 flex-row items-center gap-2.5">
          <View className="min-w-9 items-center border border-border bg-muted px-2 py-1">
            <Text weight="medium" className="text-xs text-foreground">
              {item.label}
            </Text>
          </View>
          <Text
            className="flex-1 text-meta text-muted-foreground"
            numberOfLines={1}
          >
            {describeAction(item.action)}
          </Text>
        </View>
        <IconButton
          label={`Remove ${item.label}`}
          icon={<Trash2 size={14} color={color("destructive")} />}
          onPress={() =>
            row &&
            group &&
            onChange(
              updateGroup(layout, row.id, group.id, (g) => ({
                ...g,
                keys: g.keys.filter((_, i) => i !== getIndex()),
              })),
            )
          }
        />
      </View>
    </ScaleDecorator>
  );

  const list =
    level.kind === "rows" ? (
      <DraggableFlatList
        data={layout.rows}
        keyExtractor={(r) => r.id}
        renderItem={rowItem}
        extraData={renaming}
        onDragEnd={({ from, to }) =>
          onChange(setRows(layout, reorder(layout.rows, from, to)))
        }
        ListFooterComponent={footer}
      />
    ) : level.kind === "groups" && row ? (
      <DraggableFlatList
        data={row.groups}
        keyExtractor={(g) => g.id}
        renderItem={groupItem}
        extraData={renaming}
        onDragEnd={({ from, to }) =>
          onChange(
            updateRow(layout, row.id, (r) => ({
              ...r,
              groups: reorder(r.groups, from, to),
            })),
          )
        }
        ListFooterComponent={footer}
      />
    ) : row && group ? (
      <DraggableFlatList
        data={group.keys}
        keyExtractor={(k, i) => `${k.id}-${i}`}
        renderItem={keyItem}
        onDragEnd={({ from, to }) =>
          onChange(
            updateGroup(layout, row.id, group.id, (g) => ({
              ...g,
              keys: reorder(g.keys, from, to),
            })),
          )
        }
        ListFooterComponent={footer}
      />
    ) : null;

  return (
    <View className="flex-1">
      {header}
      {list}
      <KeyPicker
        visible={picking}
        onClose={() => setPicking(false)}
        onPick={(key) => {
          if (row && group) onChange(addKey(layout, row.id, group.id, key));
        }}
      />
    </View>
  );
}

function KeyPicker({
  visible,
  onClose,
  onPick,
}: {
  visible: boolean;
  onClose: () => void;
  onPick: (key: KeyDef) => void;
}) {
  const [tab, setTab] = useState<"keys" | "custom">("keys");
  const [kind, setKind] = useState<CustomKind>("text");
  const [label, setLabel] = useState("");
  const [value, setValue] = useState("");
  const sections = useMemo(() => {
    const map = new Map<string, KeyDef[]>();
    for (const id of Object.keys(KEY_PALETTE)) {
      const key = paletteKey(id)!;
      const name = paletteSection(key);
      map.set(name, [...(map.get(name) ?? []), key]);
    }
    return [...map];
  }, []);
  const custom = customKey(label, kind, value);

  return (
    <Sheet visible={visible} onClose={onClose} title="Add key" scroll>
      <Tabs
        options={[
          { id: "keys", label: "Keys" },
          { id: "custom", label: "Custom" },
        ]}
        value={tab}
        onChange={setTab}
      />
      {tab === "keys" ? (
        <View className="gap-3 p-3">
          {sections.map(([name, keys]) => (
            <View key={name} className="gap-1.5">
              <Label>{name}</Label>
              <View className="flex-row flex-wrap gap-1.5">
                {keys.map((key) => (
                  <Pressable
                    key={key.id}
                    onPress={() => onPick(key)}
                    accessibilityRole="button"
                    accessibilityLabel={`Add ${key.label}`}
                    className="min-h-11 min-w-11 items-center justify-center border border-border bg-muted px-2 active:bg-accent-brand/20"
                  >
                    <Text className="text-xs text-foreground">{key.label}</Text>
                  </Pressable>
                ))}
              </View>
            </View>
          ))}
        </View>
      ) : (
        <SheetBody>
          <Tabs<CustomKind>
            options={[
              { id: "text", label: "Type text" },
              { id: "command", label: "Run command" },
              { id: "ctrl", label: "Ctrl key" },
            ]}
            value={kind}
            onChange={setKind}
          />
          <View className="gap-1.5">
            <Label>Label</Label>
            <Input
              value={label}
              onChangeText={setLabel}
              placeholder="Optional"
            />
          </View>
          <View className="gap-1.5">
            <Label>
              {kind === "ctrl"
                ? "Letter"
                : kind === "command"
                  ? "Command"
                  : "Text"}
            </Label>
            <Input
              value={value}
              onChangeText={setValue}
              autoCapitalize="none"
              autoCorrect={false}
              maxLength={kind === "ctrl" ? 1 : undefined}
              placeholder={
                kind === "ctrl" ? "c" : kind === "command" ? "htop" : "git "
              }
            />
          </View>
          <Button
            disabled={!custom}
            onPress={() => {
              if (!custom) return;
              onPick(custom);
              setLabel("");
              setValue("");
              onClose();
            }}
            icon={<Plus size={14} />}
          >
            Add key
          </Button>
        </SheetBody>
      )}
    </Sheet>
  );
}
