import { Pressable, View } from "react-native";
import type { SSHHost } from "@/types";
import { Button, Checkbox, Sheet, Text } from "@/ui";

/** Pick any number of hosts. The caller owns the selection. */
export function HostPicker({
  visible,
  title,
  hosts,
  selected,
  onChange,
  onClose,
}: {
  visible: boolean;
  title: string;
  hosts: SSHHost[];
  selected: Set<number>;
  onChange: (next: Set<number>) => void;
  onClose: () => void;
}) {
  const toggle = (id: number) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onChange(next);
  };
  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title={title}
      scroll
      footer={
        <View className="flex-row gap-2">
          <Button
            variant="muted"
            className="flex-1"
            onPress={() =>
              onChange(
                selected.size === hosts.length
                  ? new Set()
                  : new Set(hosts.map((h) => h.id)),
              )
            }
          >
            {selected.size === hosts.length ? "Select none" : "Select all"}
          </Button>
          <Button className="flex-1" onPress={onClose}>
            Done
          </Button>
        </View>
      }
    >
      {hosts.map((host) => (
        <Pressable
          key={host.id}
          onPress={() => toggle(host.id)}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: selected.has(host.id) }}
          className="min-h-12 flex-row items-center gap-3 border-b border-border/40 px-4 py-3"
        >
          <Checkbox
            checked={selected.has(host.id)}
            onChange={() => toggle(host.id)}
            accessibilityLabel={host.name || host.ip}
          />
          <View className="min-w-0 flex-1">
            <Text weight="medium" className="text-row text-foreground">
              {host.name || host.ip}
            </Text>
            <Text className="text-meta text-muted-foreground">
              {host.username ? `${host.username}@` : ""}
              {host.ip}:{host.port}
            </Text>
          </View>
        </Pressable>
      ))}
    </Sheet>
  );
}
